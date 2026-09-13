import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {executeRun, resolveRun, compileRun, validateRun} from '../../adl/codex-runner.mjs';
import {atomicWriteJson, invariant, nowIso, sanitizeId, sha256, stableJson} from './utils.mjs';
import {ExecutionMaterializer} from './materializer.mjs';

const ROUTE = Object.freeze({logical_target: 'flipper', physical_owner: 's3-cam', fallback_physical_route: false});
const SHA256 = /^[a-f0-9]{64}$/;
const RISK = Object.freeze({observe: 0, local_state: 1, physical_output: 2, transmit: 3, restricted: 99});

function normalizeInstalledApp(raw) {
  if (typeof raw === 'string') return {name: raw, id: raw.trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, '_').slice(0, 64)};
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.display_name ?? raw.name ?? raw.app_name ?? raw.id ?? '').trim();
  const id = String(raw.app_id ?? raw.id ?? name).trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, '_').slice(0, 64);
  return name && id ? {...raw, name, id} : null;
}

function candidateCanSelfTest(staged) {
  const adapter = staged?.value;
  if (!adapter || !['observe', 'local_state'].includes(adapter.risk)) return false;
  if ((adapter.arguments_schema?.required ?? []).length) return false;
  if ((adapter.requires?.artifacts ?? []).length) return false;
  if ((adapter.requires?.libraries ?? []).length) return false;
  if (adapter.requires?.frequency_profile) return false;
  if (adapter.operations.some((op) => op.op === 'deck_confirm' || op.op === 'artifact_stage' || op.op === 'storage_write')) return false;
  return !JSON.stringify(adapter.operations).includes('${');
}

function validationJob(staged, appId, functionName) {
  const adapter = staged.value;
  const programId = `verify:${adapter.adapter_id}:${staged.sha256.slice(0, 12)}`;
  const flipperProgram = {
    version: 1,
    program_id: programId,
    adapter: {
      id: adapter.adapter_id,
      sha256: staged.sha256,
      origin: 'generated',
      verification_status: 'device_testing',
    },
    route: {...ROUTE},
    risk: adapter.risk,
    approval: 'auto',
    timeout_ms: 15000,
    operations: structuredClone(adapter.operations),
    artifacts: [],
    validation: {
      mode: 'closed_loop_adapter_test',
      app_id: appId,
      function: functionName,
      require_observed_success: true,
    },
  };
  flipperProgram.sha256 = sha256(stableJson(flipperProgram));
  return {
    target: 'flipper-link',
    job_id: programId,
    route: {...ROUTE},
    risk: adapter.risk,
    approval: 'auto',
    flipper_program: flipperProgram,
  };
}

function validateDeviceProof(result, jobId) {
  invariant(result?.job_id === jobId, 'device-test result correlation mismatch');
  invariant(result?.code === 0, `device-test failed with code ${result?.code ?? 'missing'}`);
  invariant(result?.observed_success === true, 'device-test did not report observed success');
  invariant(SHA256.test(result?.evidence_sha256 ?? ''), 'device-test evidence SHA-256 missing');
  invariant(result?.before_state && typeof result.before_state === 'object', 'device-test before_state missing');
  invariant(result?.after_state && typeof result.after_state === 'object', 'device-test after_state missing');
  return result;
}

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
    try {
      await this.reconcileInstalledApps();
    } catch (error) {
      await this.audit.write({event: 'app.reconcile.failed', error: error.message});
    }
    return this;
  }

  async readiness({requireStopCleared = false} = {}) {
    const [control, localStop] = await Promise.all([this.transport.status(), this.stop.snapshot()]);
    const reasons = [];
    if (control?.physical_owner !== 's3-cam') reasons.push('S3-CAM is not the attested physical owner');
    if (control?.fallback_physical_route !== false) reasons.push('S3-CAM did not attest fallback routing disabled');
    if (this.config.execution.requireFlipperOnline && control?.flipper_online !== true) reasons.push('Flipper offline');
    if (requireStopCleared) {
      if (localStop.asserted !== false) reasons.push('host STOP asserted');
      if (control?.stop_asserted !== false) reasons.push('S3-CAM/Flipper STOP asserted');
    }
    return {
      ready: reasons.length === 0,
      reasons,
      production: true,
      physical_owner: 's3-cam',
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

  async #selfTestGeneratedAdapter({app, capability, staged}) {
    if (!candidateCanSelfTest(staged)) {
      return {tested: false, passed: false, reason: 'candidate requires arguments, artifacts, libraries, frequency, write, or approval'};
    }
    const readiness = await this.readiness({requireStopCleared: true});
    if (!readiness.ready) {
      return {tested: false, passed: false, reason: `hardware not ready: ${readiness.reasons.join('; ')}`};
    }
    const job = validationJob(staged, app.id, capability.name);
    await this.audit.write({event: 'app.adapter.device_test.started', app_id: app.id, function: capability.name, job_id: job.job_id, adapter_sha256: staged.sha256});
    try {
      const result = validateDeviceProof(await this.transport.execute(job, Date.now() + 15000), job.job_id);
      await this.audit.write({
        event: 'app.adapter.device_test.passed',
        app_id: app.id,
        function: capability.name,
        job_id: job.job_id,
        evidence_sha256: result.evidence_sha256,
        before_state: result.before_state,
        after_state: result.after_state,
      });
      return {tested: true, passed: true, result};
    } catch (error) {
      await this.audit.write({event: 'app.adapter.device_test.failed', app_id: app.id, function: capability.name, job_id: job.job_id, error: error.message});
      return {tested: true, passed: false, reason: error.message};
    }
  }

  async reconcileInstalledApps({inventory = null} = {}) {
    const current = inventory ?? await this.transport.inventory();
    invariant(current?.flipper?.physical_owner === 's3-cam', 'inventory route owner mismatch');
    invariant(current?.flipper?.online === true, 'Flipper is not online');
    invariant(Array.isArray(current.flipper.apps), 'S3-CAM returned invalid Flipper app inventory');

    const before = await this.catalog.snapshot();
    const previousIds = new Set((before.installed_apps ?? []).map(normalizeInstalledApp).filter(Boolean).map((app) => app.id));
    const installed = current.flipper.apps.map(normalizeInstalledApp).filter(Boolean);
    const integrated = [];
    const staged = [];
    const failed = [];
    const discovered = [];

    for (const app of installed) {
      if (previousIds.has(app.id)) continue;
      await this.audit.write({event: 'app.discovered', app});

      let plan;
      try {
        const discovery = await this.generator.discoverAppCapabilities({app, inventory: current});
        plan = discovery.value;
        invariant(plan?.app_id === app.id, `capability plan app mismatch for ${app.id}`);
        invariant(Array.isArray(plan.functions) && plan.functions.length > 0, `no capability functions discovered for ${app.id}`);
        await this.audit.write({event: 'app.capabilities.discovered', app_id: app.id, response_id: discovery.response_id, functions: plan.functions});
      } catch (error) {
        failed.push({app_id: app.id, phase: 'discovery', error: error.message});
        await this.audit.write({event: 'app.capabilities.failed', app_id: app.id, error: error.message});
        continue;
      }

      discovered.push({app_id: app.id, functions: plan.functions.map((fn) => fn.name)});
      const seenFunctions = new Set();
      for (const capability of plan.functions) {
        if (!capability?.name || seenFunctions.has(capability.name)) continue;
        seenFunctions.add(capability.name);
        if (capability.confidence === 'unknown' || capability.risk === 'restricted') {
          staged.push({app_id: app.id, function: capability.name, risk: capability.risk, status: 'not_executable', reason: capability.confidence});
          continue;
        }

        const step = {
          id: `auto_${app.id}_${capability.name}`.slice(0, 64),
          kind: 'app',
          app_id: app.id,
          function: capability.name,
          arguments: {},
          capability_description: capability.description,
          capability_evidence: capability.evidence,
          capability_risk_hint: capability.risk,
          capability_arguments_hint: capability.arguments_hint ?? {},
        };
        try {
          const candidate = await this.generator.generateAdapter({
            run: {
              adl_version: '2.0',
              run_id: `auto-integrate-${app.id}`,
              target: 'flipper',
              authorization: {
                scope: 'owned_asset',
                asset_id: 'local-flipper',
                purpose: `integrate newly installed app ${app.name}`,
                region_profile: this.config?.policy?.defaultRegionProfile ?? 'US',
                operator_id: 'codex-auto-integrator',
              },
              resolution: {
                source_policy: 'local_only',
                allow_generate_adapter: true,
                allow_generate_script: true,
                allow_frequency_resolution: true,
              },
            },
            step,
          });
          const stagedArtifact = await this.artifacts.verifyAndStage(candidate, 'local_only');
          const risk = stagedArtifact.value?.risk;
          invariant(RISK[risk] !== undefined, `generated adapter has unknown risk: ${risk}`);
          invariant(RISK[risk] >= RISK[capability.risk], `generated adapter understates discovered risk for ${app.id}.${capability.name}`);

          await this.catalog.registerGeneratedAdapter(app.id, capability.name, stagedArtifact);
          await this.audit.write({event: 'app.adapter.schema_verified', app_id: app.id, function: capability.name, adapter_id: stagedArtifact.value.adapter_id, risk, sha256: stagedArtifact.sha256});

          if (risk === 'observe' || risk === 'local_state') {
            const deviceTest = await this.#selfTestGeneratedAdapter({app, capability, staged: stagedArtifact});
            if (deviceTest.passed) {
              const adapter = await this.catalog.registerAutoGeneratedAdapter(app.id, capability.name, stagedArtifact);
              integrated.push({
                app_id: app.id,
                function: capability.name,
                adapter_id: adapter.adapter_id,
                risk: adapter.risk,
                verification_status: 'machine_verified',
                evidence_sha256: deviceTest.result.evidence_sha256,
              });
              await this.audit.write({
                event: 'app.adapter.machine_verified',
                app_id: app.id,
                function: capability.name,
                adapter_id: adapter.adapter_id,
                risk: adapter.risk,
                evidence_sha256: deviceTest.result.evidence_sha256,
              });
            } else {
              staged.push({
                app_id: app.id,
                function: capability.name,
                adapter_id: stagedArtifact.value.adapter_id,
                risk,
                status: deviceTest.tested ? 'quarantined_after_test_failure' : 'pending_device_test',
                reason: deviceTest.reason,
              });
            }
          } else {
            staged.push({
              app_id: app.id,
              function: capability.name,
              adapter_id: stagedArtifact.value.adapter_id,
              risk,
              status: 'approval_required',
            });
          }
        } catch (error) {
          failed.push({app_id: app.id, function: capability.name, phase: 'adapter', error: error.message});
          await this.audit.write({event: 'app.adapter.failed', app_id: app.id, function: capability.name, error: error.message});
        }
      }
    }

    await this.catalog.ingestInventory(current);
    return {
      installed: installed.length,
      new_apps: discovered.length,
      discovered,
      integrated,
      staged,
      failed,
    };
  }

  async inventory({refresh = false} = {}) {
    if (refresh) {
      const inventory = await this.transport.inventory();
      const reconciliation = await this.reconcileInstalledApps({inventory});
      await this.audit.write({event: 'inventory.refreshed', inventory, reconciliation});
      return {...inventory, reconciliation};
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
          state.status = 'staging';
          state.current_job = materialized.job_id;
          await atomicWriteJson(statePath, state);

          for (const artifact of materialized.flipper_program.artifacts) {
            const {metadata, bytes} = await this.artifacts.readArtifactBytes(artifact.id);
            invariant(metadata.sha256 === artifact.sha256 && metadata.size === artifact.size,
              `materialized artifact changed before transfer: ${artifact.id}`);
            await this.audit.write({
              event: 'artifact.transfer.started',
              job_id: materialized.job_id,
              artifact: {id: metadata.id, kind: metadata.kind, sha256: metadata.sha256, size: metadata.size},
            });
            const staged = await this.transport.stageArtifact({
              id: metadata.id,
              kind: metadata.kind,
              sha256: metadata.sha256,
              bytes,
            }, deadline);
            await this.audit.write({event: 'artifact.transfer.completed', job_id: materialized.job_id, artifact: staged});
          }

          state.status = 'executing';
          await atomicWriteJson(statePath, state);
          let result = await this.transport.execute(materialized, deadline);
          invariant(result?.job_id === materialized.job_id, 'S3-CAM result job mismatch');
          invariant(Number.isInteger(result?.code), 'S3-CAM result code missing');

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
              invariant(retry?.job_id === materialized.job_id, 'S3-CAM retry result job mismatch');
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
      invariant(remote?.asserted === true, 'S3-CAM did not confirm STOP assertion');
      await this.audit.write({event: 'stop.asserted', reason, remote});
      return {local, remote};
    } catch (error) {
      await this.audit.write({event: 'stop.remote_failed', reason, error: error.message});
      throw error;
    }
  }

  async clearStop({authenticated = false, reason = 'operator resume'} = {}) {
    invariant(authenticated, 'STOP clear requires authenticated operator intent');
    await this.assertReady({requireStopCleared: false});
    const remote = await this.transport.clearStop(reason);
    invariant(remote?.asserted === false, 'S3-CAM did not confirm STOP clear');
    const local = await this.stop.clear({authenticated: true, deckOnline: true, safetyHealthy: true, reason});
    await this.audit.write({event: 'stop.cleared', reason, remote});
    return {local, remote};
  }
}
