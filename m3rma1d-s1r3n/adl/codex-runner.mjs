// Deterministic M3rMa1d S1r3n ADL 2.0 authority layer.
// It resolves only typed, verified adapters. It never accepts raw Flipper commands.

const ID = /^[A-Za-z0-9._:-]{1,64}$/;
const SAFE_TEXT = /^[\x20-\x7E]*$/;
const DENIED = /(raw[_ -]?cli|shell|jamm|brute.?force|credential.?dump|access.?bypass)/i;

export const Risk = Object.freeze({observe: 0, local_state: 1, physical_output: 2, transmit: 3, restricted: 99});
const Approval = Object.freeze({auto: 0, deck: 1, operator: 2});

function fail(message) { throw new Error(message); }
function object(value, name) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} must be an object`); return value; }
function id(value, name) { if (typeof value !== 'string' || !ID.test(value)) fail(`invalid ${name}`); return value; }
function text(value, name, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.length) || !SAFE_TEXT.test(value) || DENIED.test(value)) fail(`invalid ${name}`);
  return value;
}
function bool(value, name) { if (typeof value !== 'boolean') fail(`${name} must be boolean`); return value; }

function validateSignalRequirement(value, name) {
  object(value, name);
  if (!['receive', 'transmit'].includes(value.mode)) fail(`invalid ${name}.mode`);
  if (value.source_artifact) id(value.source_artifact, `${name}.source_artifact`);
  if (value.description) text(value.description, `${name}.description`, 256);
}

function validateStep(step, seen, name = 'step') {
  object(step, name);
  id(step.id, `${name}.id`);
  if (seen.has(step.id)) fail(`duplicate step id: ${step.id}`);
  seen.add(step.id);
  if (!['capability', 'app', 'script'].includes(step.kind)) fail(`invalid ${name}.kind`);
  if (step.kind === 'capability') id(step.capability, `${name}.capability`);
  if (step.kind === 'app') {
    id(step.app_id, `${name}.app_id`);
    id(step.function, `${name}.function`);
  }
  if (step.kind === 'script') {
    if (!step.script_id && !step.script_requirement) fail(`${name} requires script_id or script_requirement`);
    if (step.script_id) id(step.script_id, `${name}.script_id`);
    if (step.script_requirement) text(step.script_requirement, `${name}.script_requirement`, 512, true);
  }
  if (step.arguments !== undefined) {
    object(step.arguments, `${name}.arguments`);
    if (Object.keys(step.arguments).length > 32) fail(`too many ${name}.arguments`);
    const encoded = JSON.stringify(step.arguments);
    if (encoded.length > 2048 || !SAFE_TEXT.test(encoded) || DENIED.test(encoded)) fail(`invalid ${name}.arguments`);
  }
  if (step.library_refs !== undefined) {
    if (!Array.isArray(step.library_refs) || step.library_refs.length > 16) fail(`invalid ${name}.library_refs`);
    step.library_refs.forEach((entry) => id(entry, `${name}.library_ref`));
  }
  if (step.frequency_profile) id(step.frequency_profile, `${name}.frequency_profile`);
  if (step.signal_requirement) validateSignalRequirement(step.signal_requirement, `${name}.signal_requirement`);
  if (step.approval && !Object.hasOwn(Approval, step.approval)) fail(`invalid ${name}.approval`);
  const timeout = step.timeout_ms ?? 10000;
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 120000) fail(`invalid ${name}.timeout_ms`);
  if (step.on_error && !['stop', 'continue'].includes(step.on_error)) fail(`invalid ${name}.on_error`);
}

export function validateRun(run) {
  object(run, 'run');
  if (run.adl_version !== '2.0' || run.target !== 'flipper') fail('unsupported ADL target/version');
  id(run.run_id, 'run_id');
  if (run.description) text(run.description, 'description', 512);

  const authorization = object(run.authorization, 'authorization');
  if (!['owned_asset', 'isolated_lab'].includes(authorization.scope)) fail('invalid authorization.scope');
  id(authorization.asset_id, 'authorization.asset_id');
  text(authorization.purpose, 'authorization.purpose', 256, true);
  id(authorization.region_profile, 'authorization.region_profile');
  id(authorization.operator_id, 'authorization.operator_id');
  if (authorization.expires_at) {
    const expires = Date.parse(authorization.expires_at);
    if (!Number.isFinite(expires) || expires <= Date.now()) fail('authorization expired or invalid');
  }

  const resolution = object(run.resolution, 'resolution');
  if (!['local_only', 'pinned_only', 'official_and_pinned'].includes(resolution.source_policy)) fail('invalid resolution.source_policy');
  bool(resolution.allow_generate_adapter, 'resolution.allow_generate_adapter');
  bool(resolution.allow_generate_script, 'resolution.allow_generate_script');
  bool(resolution.allow_frequency_resolution, 'resolution.allow_frequency_resolution');

  const maxRunMs = run.max_run_ms ?? 60000;
  if (!Number.isInteger(maxRunMs) || maxRunMs < 100 || maxRunMs > 600000) fail('invalid max_run_ms');
  if (!Array.isArray(run.steps) || run.steps.length < 1 || run.steps.length > 128) fail('invalid steps');
  const seen = new Set();
  run.steps.forEach((step, index) => validateStep(step, seen, `steps[${index}]`));
  return run;
}

function approvalRequired(risk, adapter) {
  let required = risk >= Risk.physical_output ? 'deck' : 'auto';
  if (adapter.origin === 'generated') required = 'operator';
  return required;
}

function selectApproval(requested, required, stepId) {
  const chosen = requested ?? required;
  if (Approval[chosen] < Approval[required]) fail(`insufficient approval for ${stepId}: ${required} required`);
  return chosen;
}

function renderScriptValue(value, inputs) {
  if (Array.isArray(value)) return value.map((entry) => renderScriptValue(entry, inputs));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, renderScriptValue(child, inputs)]));
  }
  if (typeof value !== 'string') return value;
  const match = /^\$\{([A-Za-z0-9_]+)\}$/.exec(value);
  if (!match) {
    if (value.includes('${')) fail('partial script interpolation is denied');
    return value;
  }
  if (!Object.hasOwn(inputs, match[1])) fail(`missing script input: ${match[1]}`);
  return inputs[match[1]];
}

async function resolveAdapterStep(run, step, services, ordinal) {
  const {catalog, artifacts, frequencies, codex} = services;
  let resolved = null;
  if (step.kind === 'capability') {
    resolved = await catalog.resolveCapability(step.capability);
  } else {
    resolved = await catalog.resolveAppFunction(step.app_id, step.function);
    if (!resolved && run.resolution.allow_generate_adapter) {
      if (!codex?.generateAdapter) fail(`adapter generator unavailable: ${step.app_id}.${step.function}`);
      const candidate = await codex.generateAdapter({run, step});
      const staged = await artifacts.verifyAndStage(candidate, run.resolution.source_policy);
      await catalog.registerGeneratedAdapter(step.app_id, step.function, staged);
      resolved = await catalog.resolveAppFunction(step.app_id, step.function);
    }
  }
  if (!resolved?.adapter_id) fail(`verified adapter unavailable: ${step.id}`);
  const adapter = resolved.adapter ?? await catalog.getAdapter(resolved.adapter_id);
  if (!adapter) fail(`adapter unavailable: ${resolved.adapter_id}`);

  const riskName = resolved.risk ?? adapter.risk;
  const risk = Risk[riskName];
  if (risk === undefined || risk >= Risk.restricted) fail(`restricted or unknown risk for ${step.id}`);
  if (adapter.risk !== riskName) fail(`catalog/adapter risk mismatch for ${step.id}`);

  const requiredApproval = approvalRequired(risk, adapter);
  const approval = selectApproval(step.approval, requiredApproval, step.id);
  const frequencyProfile = step.frequency_profile ?? adapter.requires?.frequency_profile ?? null;
  let frequency = resolved.frequency ?? null;
  if (frequencyProfile) {
    if (!run.resolution.allow_frequency_resolution) fail(`frequency resolution disabled: ${step.id}`);
    frequency = await frequencies.resolve({
      profile: frequencyProfile,
      region_profile: run.authorization.region_profile,
      asset_id: run.authorization.asset_id,
      mode: step.signal_requirement?.mode ?? 'receive',
    });
    if (!frequency) fail(`frequency profile unresolved: ${step.id}`);
  }

  if (risk >= Risk.transmit) {
    if (step.signal_requirement?.mode !== 'transmit') fail(`transmit declaration required: ${step.id}`);
    if (!frequency) fail(`transmit frequency unresolved: ${step.id}`);
    if (run.authorization.scope !== 'isolated_lab' && !step.signal_requirement.source_artifact) {
      fail(`owned-asset transmit requires a source artifact: ${step.id}`);
    }
  }

  const libraryIds = [...new Set([
    ...(resolved.libraries ?? []),
    ...(adapter.requires?.libraries ?? []),
    ...(step.library_refs ?? []),
  ])];
  const libraries = [];
  for (const libraryId of libraryIds) {
    const library = await artifacts.resolveLibrary(libraryId, run.resolution.source_policy);
    if (!library?.sha256) fail(`pinned library unavailable: ${libraryId}`);
    libraries.push(library);
  }

  return {
    run_id: run.run_id,
    step_id: step.id,
    ordinal,
    target: 'flipper-link',
    kind: step.kind,
    operation: 'adapter',
    adapter_id: adapter.adapter_id,
    adapter_origin: adapter.origin,
    adapter_verification_status: adapter.verification_status,
    app_id: step.app_id ?? adapter.app_id,
    function: step.function ?? adapter.function,
    arguments: step.arguments ?? {},
    artifact_id: step.signal_requirement?.source_artifact ?? '',
    libraries,
    frequency,
    risk: riskName,
    approval,
    timeout_ms: step.timeout_ms ?? 10000,
    on_error: step.on_error ?? (run.stop_on_error === false ? 'continue' : 'stop'),
  };
}

async function resolveScriptStep(run, step, services, ordinalStart) {
  const {catalog, artifacts, codex} = services;
  const scriptId = step.script_id ?? `${run.run_id}.${step.id}`;
  let resolved = step.script_id ? await catalog.resolveScript(step.script_id) : null;
  if (!resolved && run.resolution.allow_generate_script) {
    if (!codex?.generateScript) fail(`script generator unavailable: ${step.id}`);
    const candidate = await codex.generateScript({run, step});
    const staged = await artifacts.verifyAndStage(candidate, run.resolution.source_policy);
    await catalog.registerGeneratedScript(scriptId, staged);
    resolved = await catalog.resolveScript(scriptId);
  }
  if (!resolved?.script) fail(`script unavailable: ${scriptId}`);
  if (!['bundled_verified', 'operator_verified'].includes(resolved.verification_status)) {
    fail(`script is staged but not operator-verified: ${scriptId}`);
  }
  if (Risk[resolved.script.risk] >= Risk.restricted) fail(`restricted script denied: ${scriptId}`);

  const inputs = step.arguments ?? {};
  const jobs = [];
  let maxRisk = Risk.observe;
  for (const child of resolved.script.steps) {
    const childId = `${step.id}.${child.id}`;
    id(childId, `expanded script step id for ${scriptId}`);
    const inheritedApproval = Approval[step.approval ?? 'auto'] > Approval[child.approval ?? 'auto']
      ? step.approval
      : child.approval;
    const concrete = {
      id: childId,
      kind: 'app',
      app_id: child.app_id,
      function: child.function,
      arguments: renderScriptValue(child.arguments ?? {}, inputs),
      approval: inheritedApproval,
      frequency_profile: child.frequency_profile,
      signal_requirement: child.signal_requirement,
      library_refs: child.library_refs,
      timeout_ms: child.timeout_ms ?? step.timeout_ms,
      on_error: child.on_error ?? step.on_error,
    };
    const job = await resolveAdapterStep(run, concrete, services, ordinalStart + jobs.length);
    maxRisk = Math.max(maxRisk, Risk[job.risk]);
    jobs.push(job);
  }
  if (Risk[resolved.script.risk] < maxRisk) fail(`script understates resolved risk: ${scriptId}`);
  return jobs;
}

export async function resolveRun(run, services) {
  validateRun(run);
  if (!services.catalog || !services.artifacts || !services.frequencies) fail('resolver services missing');
  const resolvedSteps = [];
  for (const step of run.steps) {
    if (step.kind === 'script') {
      resolvedSteps.push(...await resolveScriptStep(run, step, services, resolvedSteps.length));
    } else {
      resolvedSteps.push(await resolveAdapterStep(run, step, services, resolvedSteps.length));
    }
    if (resolvedSteps.length > 128) fail('expanded run exceeds 128 concrete jobs');
  }
  return {...run, resolved_steps: resolvedSteps};
}

export function compileRun(resolvedRun) {
  if (!Array.isArray(resolvedRun?.resolved_steps) || resolvedRun.resolved_steps.length === 0) fail('run must be resolved before compilation');
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
