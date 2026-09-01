// Gateway-side ADL compiler for Codex-generated M3rMa1d S1r3n runs.
// It emits bounded JobRequest objects; it never emits raw Flipper CLI.
const CAPS = Object.freeze({
  help:         {id:1, approval:false},
  device_info:  {id:2, approval:false},
  storage_info: {id:3, approval:false},
  loader_list:  {id:4, approval:false},
  ir_transmit:  {id:5, approval:true},
  gpio_read:    {id:6, approval:false},
});

function assertString(v, name, max) {
  if (typeof v !== 'string' || !v.length || v.length > max) throw new Error(`invalid ${name}`);
}

export function validateRun(run) {
  if (!run || typeof run !== 'object' || Array.isArray(run)) throw new Error('run must be object');
  if (run.adl_version !== '1.0' || run.target !== 'flipper') throw new Error('unsupported ADL target/version');
  assertString(run.run_id, 'run_id', 64);
  if (!Array.isArray(run.steps) || run.steps.length < 1 || run.steps.length > 32) throw new Error('invalid steps');
  const maxRun = run.max_run_ms ?? 10000;
  if (!Number.isInteger(maxRun) || maxRun < 100 || maxRun > 30000) throw new Error('invalid max_run_ms');
  for (const s of run.steps) {
    assertString(s.id, 'step.id', 48);
    const cap = CAPS[s.capability];
    if (!cap) throw new Error(`capability denied: ${s.capability}`);
    const t = s.timeout_ms ?? 2000;
    if (!Number.isInteger(t) || t < 100 || t > 5000) throw new Error(`invalid timeout: ${s.id}`);
    if (cap.approval && s.approval !== 'deck') throw new Error(`deck approval required: ${s.id}`);
    if (!cap.approval && s.approval && !['none','deck'].includes(s.approval)) throw new Error(`invalid approval: ${s.id}`);
    if (s.argument !== undefined && (typeof s.argument !== 'string' || s.argument.length > 64)) throw new Error(`invalid argument: ${s.id}`);
  }
  return run;
}

export function compileRun(run) {
  validateRun(run);
  return run.steps.map((s, index) => ({
    run_id: run.run_id,
    step_id: s.id,
    ordinal: index,
    target: 'flipper',
    job_id: `${run.run_id}:${index}`,
    capability: CAPS[s.capability].id,
    capability_name: s.capability,
    argument: s.argument ?? '',
    timeout_ms: s.timeout_ms ?? 2000,
    requires_approval: CAPS[s.capability].approval || s.approval === 'deck',
    stop_on_error: run.stop_on_error !== false,
  }));
}

export async function executeRun(run, transport, audit) {
  const jobs = compileRun(run);
  const deadline = Date.now() + (run.max_run_ms ?? 10000);
  const results = [];
  for (const job of jobs) {
    if (Date.now() >= deadline) throw new Error('ADL run lease expired');
    await audit({event:'requested', ...job});
    const result = await transport(job, deadline);
    results.push(result);
    await audit({event:'result', run_id:job.run_id, step_id:job.step_id, result});
    if (result?.code !== 0 && job.stop_on_error) break;
  }
  return results;
}
