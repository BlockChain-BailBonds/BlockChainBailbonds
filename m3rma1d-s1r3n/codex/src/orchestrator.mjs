import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {executeRun, resolveRun, compileRun, validateRun} from '../../adl/codex-runner.mjs';
import {atomicWriteJson, nowIso, invariant, sanitizeId} from './utils.mjs';
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
    this.materializer = new ExecutionMaterializer({catalog, artifacts});
    this.activeRuns = 0;
    this.runDir = path.join(config.stateDir, 'runs');
  }

  async init() {
    await Promise.all([mkdir(this.runDir, {recursive: true}), this.catalog.load(), this.artifacts.load(), this.frequencies.load(), this.audit.init(), this.stop.load()]);
    return this;
  }

  async inventory({refresh = false} = {}) {
    if (refresh && !this.config.execution.dryRun) {
      const inventory = await this.transport.inventory();
      await this.catalog.ingestInventory(inventory);
      await this.audit.write({event: 'inventory.refreshed', inventory});
      return inventory;
    }
    const snapshot = await this.catalog.snapshot();
    return {catalog: snapshot};
  }

  async planTask({task, authorization, resolution, runId}) {
    invariant(typeof task === 'string' && task.trim().length >= 3, 'task is required');
    const inventory = await this.inventory({refresh: false});
    const catalog = await this.catalog.snapshot();
    const planned = await this.planner.plan({task, authorization, resolution, inventory, catalog, runId});
    await this.audit.write({event: 'codex.plan', response_id: planned.responseId, run_id: planned.run.run_id, task, adl: planned.run});
    return planned.run;
  }

  async resolveAdl(run) {
    validateRun(run);
    return resolveRun(run, {catalog: this.catalog, artifacts: this.artifacts, frequencies: this.frequencies, codex: this.generator});
  }

  async previewAdl(run) {
    const resolved = await this.resolveAdl(run);
    const jobs = compileRun(resolved);
    const materialized = [];
    for (const job of jobs) materialized.push(await this.materializer.materialize(job));
    return {run: resolved, jobs: materialized};
  }

  async runTask(input) {
    const run = await this.planTask(input);
    return this.runAdl(run);
  }

  async runAdl(run) {
    invariant(this.activeRuns < this.config.execution.maxConcurrentRuns, 'another run is already active');
    this.activeRuns += 1;
    const runId = sanitizeId(run.run_id, 'run');
    const statePath = path.join(this.runDir, `${runId}.json`);
    const state = {run_id: runId, status: 'resolving', started_at: nowIso(), adl: run, results: []};
    await atomicWriteJson(statePath, state);
    await this.audit.write({event: 'run.started', run_id: runId, adl: run});

    try {
      const services = {
        catalog: this.catalog,
        artifacts: this.artifacts,
        frequencies: this.frequencies,
        codex: this.generator,
        approvals: this.approvals,
        stop: this.config.execution.dryRun ? {isAsserted: async () => false} : this.stop,
        audit: (event) => this.audit.write(event),
        transport: async (job, deadline) => {
          const materialized = await this.materializer.materialize(job);
          state.status = 'executing';
          state.current_job = materialized.job_id;
          await atomicWriteJson(statePath, state);
          let result = await this.transport.execute(materialized, deadline);
          const visionOps = materialized.execution?.operations?.filter((operation) => operation.op === 'capture_vision' || operation.op === 'expect');
          if (visionOps?.length) {
            if (!this.vision) throw new Error(`Vision verification required but Vision URL is not configured: ${job.step_id}`);
            const imageDataUrl = await this.vision.capture();
            const expectation = visionOps.find((operation) => operation.op === 'expect')?.expectation ?? 'Verify the operation completed safely';
            const decision = await this.generator.decideFromVision({imageDataUrl, expectation, lastResult: result, catalog: await this.catalog.snapshot()});
            await this.audit.write({event: 'vision.decision', job_id: job.job_id, decision});
            result = {...result, vision: decision};
            if (decision.decision === 'abort') return {...result, code: -31, text: `Vision aborted: ${decision.reason}`};
            if (decision.decision === 'request_operator') return {...result, code: -32, text: `Operator verification required: ${decision.reason}`};
            if (decision.decision === 'retry') {
              if (Date.now() >= deadline) return {...result, code: -33, text: 'Vision requested retry after deadline'};
              const retry = await this.transport.execute({...materialized, retry_of: materialized.job_id}, deadline);
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
    if (!this.config.execution.dryRun) await this.transport.assertStop(reason);
    await this.audit.write({event: 'stop.asserted', reason});
    return local;
  }

  async clearStop({authenticated = false, reason = 'operator resume'} = {}) {
    const status = await this.transport.status();
    const local = await this.stop.clear({authenticated, deckOnline: status.deck_online === true, safetyHealthy: status.safety_healthy === true, reason});
    if (!this.config.execution.dryRun) await this.transport.clearStop(reason);
    await this.audit.write({event: 'stop.cleared', reason});
    return local;
  }
}
