// M3rMa1d S1r3n ADL v2 validation, resolution, compilation, and execution.
// This module has no OpenAI dependency. It is the deterministic authority layer.

const ID = /^[A-Za-z0-9._:-]{1,64}$/;
const SAFE_TEXT = /^[\x20-\x7E]*$/;
const DENIED = /(raw[_ -]?cli|shell|jamm|brute.?force|credential.?dump|access.?bypass)/i;

export const Risk = Object.freeze({observe: 0, local_state: 1, physical_output: 2, transmit: 3, restricted: 99});

function fail(message) { throw new Error(message); }
function id(value, name) { if (typeof value !== 'string' || !ID.test(value)) fail(`invalid ${name}`); return value; }
function text(value, name, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.length) || !SAFE_TEXT.test(value) || DENIED.test(value)) fail(`invalid ${name}`);
  return value;
}
function object(value, name) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be object`); return value; }

export function validateRun(run) {
  object(run, 'run');
  if (run.adl_version !== '2.0' || run.target !== 'flipper') fail('unsupported ADL target/version');
  id(run.run_id, 'run_id');
  const authorization = object(run.authorization, 'authorization');
  if (!['owned_asset', 'isolated_lab'].includes(authorization.scope)) fail('invalid authorization.scope');
  id(authorization.asset_id, 'authorization.asset_id');
  text(authorization.purpose, 'authorization.purpose', 256, true);
  id(authorization.region_profile, 'authorization.region_profile');
  if (authorization.operator_id) id(authorization.operator_id, 'authorization.operator_id');
  if (authorization.expires_at) {
    const expires = Date.parse(authorization.expires_at);
    if (!Number.isFinite(expires) || expires <= Date.now()) fail('authorization expired or invalid');
  }

  const resolution = object(run.resolution, 'resolution');
  if (!['local_only', 'pinned_only', 'official_and_pinned'].includes(resolution.source_policy)) fail('invalid source policy');
  const maxRunMs = run.max_run_ms ?? 60000;
  if (!Number.isInteger(maxRunMs) || maxRunMs < 100 || maxRunMs > 600000) fail('invalid max_run_ms');
  if (!Array.isArray(run.steps) || run.steps.length < 1 || run.steps.length > 128) fail('invalid steps');

  const seen = new Set();
  for (const step of run.steps) {
    object(step, 'step');
    id(step.id, 'step.id');
    if (seen.has(step.id)) fail(`duplicate step id: ${step.id}`);
    seen.add(step.id);
    if (!['capability', 'app', 'script'].includes(step.kind)) fail(`invalid step kind: ${step.id}`);
    if (step.kind === 'capability') id(step.capability, `capability: ${step.id}`);
    if (step.kind === 'app') { id(step.app_id, `app_id: ${step.id}`); id(step.function, `function: ${step.id}`); }
    if (step.kind === 'script') {
      if (!step.script_id && !step.script_requirement) fail(`script id or requirement required: ${step.id}`);
      if (step.script_id) id(step.script_id, `script_id: ${step.id}`);
      if (step.script_requirement) text(step.script_requirement, `script_requirement: ${step.id}`, 512, true);
    }
    if (step.arguments !== undefined) {
      object(step.arguments, `arguments: ${step.id}`);
      if (Object.keys(step.arguments).length > 32) fail(`too many arguments: ${step.id}`);
      const encoded = JSON.stringify(step.arguments);
      if (encoded.length > 2048 || !SAFE_TEXT.test(encoded) || DENIED.test(encoded)) fail(`invalid arguments: ${step.id}`);
    }
    if (step.library_refs !== undefined) {
      if (!Array.isArray(step.library_refs) || step.library_refs.length > 16) fail(`invalid library_refs: ${step.id}`);
      step.library_refs.forEach((entry) => id(entry, `library_ref: ${step.id}`));
    }
    if (step.frequency_profile) id(step.frequency_profile, `frequency_profile: ${step.id}`);
    if (step.signal_requirement) {
      object(step.signal_requirement, `signal_requirement: ${step.id}`);
      if (!['receive', 'transmit'].includes(step.signal_requirement.mode)) fail(`invalid signal mode: ${step.id}`);
      if (step.signal_requirement.source_artifact) text(step.signal_requirement.source_artifact, `source_artifact: ${step.id}`, 160, true);
    }
    if (step.approval && !['auto', 'deck', 'operator'].includes(step.approval)) fail(`invalid approval: ${step.id}`);
    const timeout = step.timeout_ms ?? 10000;
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 120000) fail(`invalid timeout: ${step.id}`);
    if (step.on_error && !['stop', 'continue', 'rollback'].includes(step.on_error)) fail(`invalid on_error: ${step.id}`);
  }
  return run;
}

function approvalRank(value) { return {auto: 0, deck: 1, operator: 2}[value ?? 'auto']; }
function requiredApproval(risk) { return risk >= Risk.physical_output ? 'deck' : 'auto'; }

function authorizeResolved(run, step, resolved) {
  const risk = Risk[resolved.risk];
  if (risk === undefined) fail(`unknown risk class: ${step.id}`);
  if (risk >= Risk.restricted) fail(`restricted operation denied: ${step.id}`);
  if (resolved.raw_command || resolved.transport === 'raw_cli') fail(`raw command transport denied: ${step.id}`);
  const needed = requiredApproval(risk);
  const chosen = step.approval ?? needed;
  if (approvalRank(chosen) < approvalRank(needed)) fail(`insufficient approval: ${step.id}`);

  if (risk >= Risk.transmit) {
    if (!step.frequency_profile && !resolved.frequency) fail(`transmit frequency unresolved: ${step.id}`);
    if (step.signal_requirement?.mode !== 'transmit') fail(`transmit declaration required: ${step.id}`);
    if (!step.signal_requirement?.source_artifact && run.authorization.scope !== 'isolated_lab') fail(`owned-asset transmit requires a source artifact: ${step.id}`);
  }
  return chosen;
}

export async function resolveRun(run, services) {
  validateRun(run);
  const {catalog, artifacts, frequencies, codex} = services;
  if (!catalog || !artifacts || !frequencies) fail('resolver services missing');
  const resolvedSteps = [];

  for (const step of run.steps) {
    let resolved = null;
    if (step.kind === 'capability') {
      resolved = await catalog.resolveCapability(step.capability);
    } else if (step.kind === 'app') {
      resolved = await catalog.resolveAppFunction(step.app_id, step.function);
      if (!resolved && run.resolution.allow_generate_adapter === true) {
        if (!codex?.generateAdapter) fail(`adapter generator unavailable: ${step.app_id}.${step.function}`);
        const candidate = await codex.generateAdapter({run, step});
        const staged = await artifacts.verifyAndStage(candidate, run.resolution.source_policy);
        await catalog.registerGeneratedAdapter(step.app_id, step.function, staged);
        resolved = await catalog.resolveAppFunction(step.app_id, step.function);
      }
    } else {
      const scriptId = step.script_id ?? `${run.run_id}.${step.id}`;
      resolved = step.script_id ? await catalog.resolveScript(step.script_id) : null;
      if (!resolved && run.resolution.allow_generate_script === true) {
        if (!codex?.generateScript) fail(`script generator unavailable: ${step.id}`);
        const candidate = await codex.generateScript({run, step});
        const staged = await artifacts.verifyAndStage(candidate, run.resolution.source_policy);
        await catalog.registerGeneratedScript(scriptId, staged);
        resolved = await catalog.resolveScript(scriptId);
      }
    }
    if (!resolved) fail(`unresolved step: ${step.id}`);

    const libraryIds = [...new Set([...(resolved.libraries ?? []), ...(step.library_refs ?? [])])];
    const libraries = [];
    for (const libraryId of libraryIds) {
      const library = await artifacts.resolveLibrary(libraryId, run.resolution.source_policy);
      if (!library?.sha256) fail(`unpinned library denied: ${libraryId}`);
      libraries.push(library);
    }

    let frequency = resolved.frequency ?? null;
    if (step.frequency_profile) {
      if (run.resolution.allow_frequency_resolution !== true) fail(`frequency resolution disabled: ${step.id}`);
      frequency = await frequencies.resolve({
        profile: step.frequency_profile,
        region_profile: run.authorization.region_profile,
        asset_id: run.authorization.asset_id,
        mode: step.signal_requirement?.mode ?? 'receive',
      });
      if (!frequency) fail(`frequency profile unresolved: ${step.id}`);
    }

    const approval = authorizeResolved(run, step, {...resolved, frequency});
    resolvedSteps.push({
      run_id: run.run_id,
      step_id: step.id,
      ordinal: resolvedSteps.length,
      target: 'flipper-link',
      kind: step.kind,
      operation: resolved.operation,
      command_id: resolved.command_id ?? '',
      app_id: step.app_id ?? resolved.app_id ?? '',
      function: step.function ?? resolved.function ?? '',
      arguments: step.arguments ?? {},
      adapter_id: resolved.adapter_id ?? '',
      artifact_id: resolved.artifact_id ?? '',
      libraries,
      frequency,
      risk: resolved.risk,
      approval,
      timeout_ms: step.timeout_ms ?? 10000,
      on_error: step.on_error ?? (run.stop_on_error === false ? 'continue' : 'stop'),
    });
  }
  return {...run, resolved_steps: resolvedSteps};
}

export function compileRun(resolvedRun) {
  if (!Array.isArray(resolvedRun?.resolved_steps)) fail('run must be resolved before compilation');
  return resolvedRun.resolved_steps.map((step) => ({
    ...step,
    job_id: `${step.run_id}:${step.ordinal}`,
    requires_approval: step.approval !== 'auto',
  }));
}

export async function executeRun(run, services) {
  const resolved = await resolveRun(run, services);
  const jobs = compileRun(resolved);
  const deadline = Date.now() + (run.max_run_ms ?? 60000);
  const results = [];
  for (const job of jobs) {
    if (Date.now() >= deadline) fail('ADL run lease expired');
    if (await services.stop?.isAsserted()) fail('STOP asserted');
    await services.audit({event: 'requested', job});
    if (job.requires_approval) {
      const approved = await services.approvals.request(job, deadline);
      await services.audit({event: approved ? 'approved' : 'denied', job});
      if (!approved) {
        const denied = {job_id: job.job_id, code: -12, text: 'approval denied'};
        results.push(denied);
        if (job.on_error !== 'continue') break;
        continue;
      }
    }
    const result = await services.transport(job, deadline);
    results.push(result);
    await services.audit({event: 'result', job_id: job.job_id, result});
    if (result?.code !== 0 && job.on_error !== 'continue') break;
  }
  return results;
}
