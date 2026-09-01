// M3rMa1d S1r3n ADL v2 compiler/executor.
// Codex produces declarative intent. Only resolved, policy-approved jobs reach hardware.

const ID = /^[A-Za-z0-9._:-]{1,64}$/;
const SAFE_TEXT = /^[\x20-\x7E]*$/;
const DENIED_TOKENS = ["raw_cli", "shell", "exec", "jamming", "bruteforce", "credential_dump"];

export const Risk = Object.freeze({
  observe: 0,
  local_state: 1,
  physical_output: 2,
  transmit: 3,
  restricted: 99,
});

function fail(message) {
  throw new Error(message);
}

function id(value, name) {
  if (typeof value !== "string" || !ID.test(value)) fail(`invalid ${name}`);
  return value;
}

function text(value, name, max = 512, allowEmpty = true) {
  if (typeof value !== "string" || value.length > max || (!allowEmpty && !value.length) || !SAFE_TEXT.test(value)) {
    fail(`invalid ${name}`);
  }
  return value;
}

function plainObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${name} must be an object`);
  return value;
}

function assertNoDeniedToken(value, name) {
  const normalized = String(value ?? "").toLowerCase();
  if (DENIED_TOKENS.some((token) => normalized.includes(token))) fail(`${name} requests a prohibited primitive`);
}

export function validateRun(run) {
  plainObject(run, "run");
  if (run.adl_version !== "2.0" || run.target !== "flipper") fail("unsupported ADL target/version");
  id(run.run_id, "run_id");
  const auth = plainObject(run.authorization, "authorization");
  if (!["owned_asset", "isolated_lab"].includes(auth.scope)) fail("invalid authorization.scope");
  id(auth.asset_id, "authorization.asset_id");
  text(auth.purpose, "authorization.purpose", 256, false);
  id(auth.region_profile, "authorization.region_profile");
  if (auth.expires_at && Number.isNaN(Date.parse(auth.expires_at))) fail("invalid authorization.expires_at");
  if (auth.expires_at && Date.parse(auth.expires_at) <= Date.now()) fail("authorization expired");

  const resolution = plainObject(run.resolution, "resolution");
  if (!["local_only", "pinned_only", "official_and_pinned"].includes(resolution.source_policy)) {
    fail("invalid resolution.source_policy");
  }

  const maxRun = run.max_run_ms ?? 60000;
  if (!Number.isInteger(maxRun) || maxRun < 100 || maxRun > 600000) fail("invalid max_run_ms");
  if (!Array.isArray(run.steps) || run.steps.length < 1 || run.steps.length > 128) fail("invalid steps");

  const seen = new Set();
  for (const step of run.steps) {
    plainObject(step, "step");
    id(step.id, "step.id");
    if (seen.has(step.id)) fail(`duplicate step id: ${step.id}`);
    seen.add(step.id);
    if (!["capability", "app", "script"].includes(step.kind)) fail(`invalid step kind: ${step.id}`);
    if (step.kind === "capability") id(step.capability, `capability: ${step.id}`);
    if (step.kind === "app") {
      id(step.app_id, `app_id: ${step.id}`);
      id(step.function, `function: ${step.id}`);
      assertNoDeniedToken(step.function, `function: ${step.id}`);
    }
    if (step.kind === "script") {
      if (!step.script_id && !step.script_requirement) fail(`script id or requirement required: ${step.id}`);
      if (step.script_id) id(step.script_id, `script_id: ${step.id}`);
      if (step.script_requirement) {
        text(step.script_requirement, `script_requirement: ${step.id}`, 512, false);
        assertNoDeniedToken(step.script_requirement, `script_requirement: ${step.id}`);
      }
    }
    if (step.arguments !== undefined) {
      plainObject(step.arguments, `arguments: ${step.id}`);
      if (Object.keys(step.arguments).length > 32) fail(`too many arguments: ${step.id}`);
      const encoded = JSON.stringify(step.arguments);
      if (encoded.length > 2048 || !SAFE_TEXT.test(encoded)) fail(`invalid arguments: ${step.id}`);
      assertNoDeniedToken(encoded, `arguments: ${step.id}`);
    }
    if (step.library_refs !== undefined) {
      if (!Array.isArray(step.library_refs) || step.library_refs.length > 16) fail(`invalid library_refs: ${step.id}`);
      step.library_refs.forEach((value) => id(value, `library_ref: ${step.id}`));
    }
    if (step.frequency_profile) id(step.frequency_profile, `frequency_profile: ${step.id}`);
    if (step.signal_requirement) {
      plainObject(step.signal_requirement, `signal_requirement: ${step.id}`);
      if (!["receive", "transmit"].includes(step.signal_requirement.mode)) fail(`invalid signal mode: ${step.id}`);
      if (step.signal_requirement.source_artifact) {
        text(step.signal_requirement.source_artifact, `source_artifact: ${step.id}`, 160, false);
      }
    }
    if (step.approval && !["auto", "deck", "operator"].includes(step.approval)) fail(`invalid approval: ${step.id}`);
    const timeout = step.timeout_ms ?? 10000;
    if (!Number.isInteger(timeout) || timeout < 100 || timeout > 120000) fail(`invalid timeout: ${step.id}`);
  }
  return run;
}

function approvalRank(value) {
  return {auto: 0, deck: 1, operator: 2}[value ?? "auto"];
}

function requiredApproval(risk) {
  if (risk >= Risk.transmit) return "deck";
  if (risk >= Risk.physical_output) return "deck";
  return "auto";
}

function enforceAuthorization(run, step, resolved) {
  const risk = Risk[resolved.risk];
  if (risk === undefined) fail(`unknown risk class: ${step.id}`);
  if (risk >= Risk.restricted) fail(`restricted operation denied: ${step.id}`);
  if (resolved.raw_command || resolved.transport === "raw_cli") fail(`raw command transport denied: ${step.id}`);

  const needed = requiredApproval(risk);
  const chosen = step.approval ?? needed;
  if (approvalRank(chosen) < approvalRank(needed)) fail(`insufficient approval: ${step.id}`);

  if (risk >= Risk.transmit) {
    if (!step.frequency_profile && !resolved.frequency) fail(`transmit frequency unresolved: ${step.id}`);
    if (step.signal_requirement?.mode !== "transmit") fail(`transmit declaration required: ${step.id}`);
    if (!step.signal_requirement?.source_artifact && run.authorization.scope !== "isolated_lab") {
      fail(`owned-asset transmit requires a source artifact: ${step.id}`);
    }
  }
  return chosen;
}

export async function resolveRun(run, services) {
  validateRun(run);
  const {catalog, artifacts, frequencies, codex} = services;
  if (!catalog || !artifacts || !frequencies) fail("resolver services missing");
  const resolvedSteps = [];

  for (const step of run.steps) {
    let resolved;
    if (step.kind === "capability") {
      resolved = await catalog.resolveCapability(step.capability);
    } else if (step.kind === "app") {
      resolved = await catalog.resolveAppFunction(step.app_id, step.function);
      if (!resolved && run.resolution.allow_generate_adapter) {
        if (!codex?.generateAdapter) fail(`adapter missing: ${step.app_id}.${step.function}`);
        const candidate = await codex.generateAdapter({run, step});
        const verified = await artifacts.verifyAndStage(candidate, run.resolution.source_policy);
        await catalog.registerGeneratedAdapter(step.app_id, step.function, verified);
        resolved = await catalog.resolveAppFunction(step.app_id, step.function);
      }
    } else {
      resolved = step.script_id ? await catalog.resolveScript(step.script_id) : null;
      if (!resolved && run.resolution.allow_generate_script) {
        if (!codex?.generateScript) fail(`script missing: ${step.id}`);
        const candidate = await codex.generateScript({run, step});
        const verified = await artifacts.verifyAndStage(candidate, run.resolution.source_policy);
        await catalog.registerGeneratedScript(step.script_id ?? `${run.run_id}.${step.id}`, verified);
        resolved = await catalog.resolveScript(step.script_id ?? `${run.run_id}.${step.id}`);
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
      if (!run.resolution.allow_frequency_resolution) fail(`frequency resolution disabled: ${step.id}`);
      frequency = await frequencies.resolve({
        profile: step.frequency_profile,
        region_profile: run.authorization.region_profile,
        asset_id: run.authorization.asset_id,
        mode: step.signal_requirement?.mode ?? "receive",
      });
      if (!frequency) fail(`frequency profile unresolved: ${step.id}`);
    }

    const approval = enforceAuthorization(run, step, {...resolved, frequency});
    resolvedSteps.push({
      run_id: run.run_id,
      step_id: step.id,
      ordinal: resolvedSteps.length,
      target: "flipper-link",
      kind: step.kind,
      operation: resolved.operation,
      app_id: step.app_id ?? resolved.app_id ?? "",
      function: step.function ?? resolved.function ?? "",
      arguments: step.arguments ?? {},
      adapter_id: resolved.adapter_id ?? "",
      artifact_id: resolved.artifact_id ?? "",
      libraries,
      frequency,
      risk: resolved.risk,
      approval,
      timeout_ms: step.timeout_ms ?? 10000,
      on_error: step.on_error ?? (run.stop_on_error === false ? "continue" : "stop"),
    });
  }
  return {...run, resolved_steps: resolvedSteps};
}

export function compileRun(resolvedRun) {
  if (!Array.isArray(resolvedRun?.resolved_steps)) fail("run must be resolved before compilation");
  return resolvedRun.resolved_steps.map((step) => ({
    ...step,
    job_id: `${step.run_id}:${step.ordinal}`,
    requires_approval: step.approval !== "auto",
    payload: JSON.stringify({
      app_id: step.app_id,
      function: step.function,
      arguments: step.arguments,
      adapter_id: step.adapter_id,
      artifact_id: step.artifact_id,
      libraries: step.libraries.map((library) => ({id: library.id, sha256: library.sha256})),
      frequency: step.frequency,
    }),
  }));
}

export async function executeRun(run, services) {
  const resolved = await resolveRun(run, services);
  const jobs = compileRun(resolved);
  const deadline = Date.now() + (run.max_run_ms ?? 60000);
  const results = [];

  for (const job of jobs) {
    if (Date.now() >= deadline) fail("ADL run lease expired");
    if (await services.stop?.isAsserted()) fail("STOP asserted");
    await services.audit({event: "requested", job});
    if (job.requires_approval) {
      const approved = await services.approvals.request(job, deadline);
      await services.audit({event: approved ? "approved" : "denied", job});
      if (!approved) {
        const denied = {job_id: job.job_id, code: -12, text: "approval denied"};
        results.push(denied);
        if (job.on_error !== "continue") break;
        continue;
      }
    }
    const result = await services.transport(job, deadline);
    results.push(result);
    await services.audit({event: "result", job_id: job.job_id, result});
    if (result?.code !== 0 && job.on_error !== "continue") break;
  }
  return results;
}
