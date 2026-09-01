import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {executeRun, resolveRun, compileRun, validateRun} from '../../adl/codex-runner.mjs';
import {atomicWriteJson, invariant, nowIso, sanitizeId} from './utils.mjs';
import {ExecutionMaterializer} from './materializer.mjs';

export class MermaidCodexService {
  constructor({config, planner, generator, catalog, artifacts, frequencies, audit, approvals, stop, transport, vision = null}) {
    this.config = config;
    this.planner = planner;
    this.generator = generator;
    this.catalog = catalog;
    this.artifacts = artifacts;
    this.frequencies = frequencies;
    this.audit = audit;
    this.approvals = approvals;
    this.stop = stop;
    this.transport = transport;
    this.vision = vision;
    this.materializer = new ExecutionMaterializer({catalog, artifacts, policy: config.policy});
    this.activeRuns = 0;
    this.runDir = path.join(config.stateDir, 'runs');
  }

  async init() {
    await Promise.all([
      mkdir(this.runDir, {recursive: true}),
      this.catalog.load(),
      this.artifacts.load(),
      this.frequencies.load(),
      this.audit.init(),
      this.stop.load(),
    ]);
    return this;
  }

  async readiness({requireStopCleared = false} = {}) {
    const [control, localStop] = await Promise.all([this.transport.status(), this.stop.snapshot()]);
    const reasons = [];
    if (control?.physical_owner !== 'deck-cyd') reasons.push('Core did not attest deck-cyd as physical owner');
    if (control?.fallback_physical_route !== false) reasons.push('Core did not attest fallback routing disabled');
    if (this.config.execution.requireDeckOnline && control?.deck_online !== true) reasons.push('CYD Deck offline');
    if (this.config.execution.requireFlipperOnline && control?.flipper_online !== true) reasons.push('Flipper offline');
    if (this.config.execution.requireSafetyQuorum) {
      if (control?.safety_healthy !== true) reasons.push('C5 safety mesh unhealthy');
      if (!Number.isInteger(control?.safety_nodes_online) || control.safety_nodes_online < this.config.execution.requiredSafetyNodes) {
        reasons.push(`C5 safety quorum below ${this.config.execution.requiredSafetyNodes}`);
      }
    }
    if (requireStopCleared) {
      if (localStop.asserted !== false) reasons.push('host STOP asserted');
      if (control?.stop_asserted !== false) reasons.push('Core/Deck STOP asserted');
    }
    return {
      ready: reasons.length === 0,
      reasons,
      production: true,
      physical_owner: 'deck-cyd',
      local_stop: localStop,
      control,
    };
  }

  async assertReady(options = {}) {
    const readiness = await this.readiness(options);
    if (!readiness.ready) {
      const error = new Error(`M3rMa1d hardware readiness failed: ${readiness.reasons.join('; ')}`);
      error.statusCode = 503;
      error.readiness = readiness;
      throw error;
    }
    return readiness;
  }

  async inventory({refresh = false} = {}) {
    if (refresh) {
      const inventory = await this.transport.inventory();
      invariant(inventory?.flipper?.physical_owner === 'deck-cyd', 'inventory route owner mismatch');
      invariant(inventory?.flipper?.online === true, 'Flipper is not online');
      invariant(Array.isArray(inventory.flipper.apps), 'Core returned invalid Flipper app inventory');
      await this.catalog.ingestInventory(inventory);
      await this.audit.write({event: 'inventory.refreshed', inventory});
      return inventory;
    }
    return {catalog: await this.catalog.snapshot()};
  }

  async planTask({task, authorization, resolution, runId}) {
    invariant(typeof task === 'string' && task.trim().length >= 3, 'task is required');
    const inventory = await this.inventory({refresh: true});
    const catalog = await this.catalog.snapshot();
    const planned = await this.planner.plan({task, authorization, resolution, inventory, catalog, runId});
    await this.audit.write({
      event: 'codex.plan',
      response_id: planned.responseId,
      run_id: planned.run.run_id,
      task,
      adl: planned.run,
    });
    return planned.run;
  }

  async resolveAdl(run) {
    validateRun(run);
    return resolveRun(run, {
      catalog: this.catalog,
      artifacts: this.artifacts,
      frequencies: this.frequencies,
      codex: this.generator,
    });
  }

  async previewAdl(run) {
    const resolved = await this.resolveAdl(run);
    const jobs = compileRun(resolved);
    const materialized = [];
    for (const job of jobs) materialized.push(await this.materializer.materialize(job));
    return {run: resolved, jobs: materialized, execution_performed: false};
  }

  async runTask(input) {
    const run = await this.planTask(input);
    return this.runAdl(run);
  }

  async runAdl(run) {
    invariant(this.activeRuns < this.config.execution.maxConcurrentRuns, 'another run is already active');
    validateRun(run);
    const readiness = await this.assertReady({requireStopCleared: true});

    this.activeRuns += 1;
    const runId = sanitizeId(run.run_id, 'run');
    const statePath = path.join(this.runDir, `${runId}.json`);
    const state = {
      run_id: runId,
      status: 'resolving',
      production: true,
      started_at: nowIso(),
      readiness,
      adl: run,
      results: [],
    };
    await atomicWriteJson(statePath, state);
    await this.audit.write({event: 'run.started', run_id: runId, readiness, adl: run});

    try {
      const services = {
        catalog: this.catalog,
        artifacts: this.artifacts,
        frequencies: this.frequencies,
        codex: this.generator,
        approvals: this.approvals,
        stop: this.stop,
        audit: (event) => this.audit.write(event),
        transport: async (job, deadline) => {
          await this.assertReady({requireStopCleared: true});
          const materialized = await this.materializer.materialize(job);
          state.status = 'executing';
          state.current_job = materialized.job_id;
          await atomicWriteJson(statePath, state);

          let result = await this.transport.execute(materialized, deadline);
          invariant(result?.job_id === materialized.job_id, 'Core result job mismatch');
          invariant(Number.isInteger(result?.code), 'Core result code missing');

          const visionOps = materialized.flipper_program.operations.filter(
            (operation) => operation.op === 'capture_vision' || operation.op === 'expect',
          );
          if (visionOps.length) {
            invariant(this.vision, `Vision verification required but S1R3N_VISION_URL is not configured: ${job.step_id}`);
            const imageDataUrl = await this.vision.capture();
            const expectation = visionOps.find((operation) => operation.op === 'expect')?.expectation
              ?? 'Verify the approved operation completed safely';
            const decision = await this.generator.decideFromVision({
              imageDataUrl,
              expectation,
              lastResult: result,
              catalog: await this.catalog.snapshot(),
            });
            await this.audit.write({event: 'vision.decision', job_id: job.job_id, decision});
            result = {...result, vision: decision};
            if (decision.decision === 'abort') return {...result, code: -31, text: `Vision aborted: ${decision.reason}`};
            if (decision.decision === 'request_operator') return {...result, code: -32, text: `Operator verification required: ${decision.reason}`};
            if (decision.decision === 'retry') {
              invariant(Date.now() < deadline, 'Vision requested retry after the ADL lease expired');
              const retry = await this.transport.execute({...materialized, retry_of: materialized.job_id}, deadline);
              invariant(retry?.job_id === materialized.job_id, 'Core retry result job mismatch');
              return {...retry, vision: decision, retried: true};
            }
          }
          return result;
        },
      };

      state.results = await executeRun(run, services);
      state.status = state.results.some((result) => result.code !== 0) ? 'completed_with_errors' : 'completed';
      state.completed_at = nowIso();
      delete state.current_job;
      await atomicWriteJson(statePath, state);
      await this.audit.write({event: 'run.completed', run_id: runId, status: state.status, results: state.results});
      return structuredClone(state);
    } catch (error) {
      state.status = 'failed';
      state.error = error.message;
      state.completed_at = nowIso();
      delete state.current_job;
      await atomicWriteJson(statePath, state);
      await this.audit.write({event: 'run.failed', run_id: runId, error: error.message});
      throw error;
    } finally {
      this.activeRuns -= 1;
    }
  }

  async assertStop(reason = 'operator stop') {
    const local = await this.stop.assert(reason);
    try {
      const remote = await this.transport.assertStop(reason);
      invariant(remote?.asserted === true, 'Core did not confirm STOP assertion');
      await this.audit.write({event: 'stop.asserted', reason, remote});
      return {local, remote};
    } catch (error) {
      await this.audit.write({event: 'stop.remote_failed', reason, error: error.message});
      throw error;
    }
  }

  async clearStop({authenticated = false, reason = 'operator resume'} = {}) {
    invariant(authenticated, 'STOP clear requires authenticated operator intent');
    const readiness = await this.assertReady({requireStopCleared: false});
    const remote = await this.transport.clearStop(reason);
    invariant(remote?.asserted === false, 'Core did not confirm STOP clear');
    const local = await this.stop.clear({
      authenticated: true,
      deckOnline: readiness.control.deck_online === true,
      safetyHealthy: readiness.control.safety_healthy === true,
      reason,
    });
    await this.audit.write({event: 'stop.cleared', reason, remote});
    return {local, remote};
  }
}
