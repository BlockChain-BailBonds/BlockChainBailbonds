import {invariant, sha256, stableJson} from './utils.mjs';

function validatePrimitive(value, schema, name) {
  if (!schema) return;
  if (schema.type === 'string') {
    invariant(typeof value === 'string', `${name} must be string`);
    if (schema.minLength !== undefined) invariant(value.length >= schema.minLength, `${name} below minLength`);
    if (schema.maxLength !== undefined) invariant(value.length <= schema.maxLength, `${name} exceeds maxLength`);
    if (schema.pattern) invariant(new RegExp(schema.pattern).test(value), `${name} does not match pattern`);
    if (schema.enum) invariant(schema.enum.includes(value), `${name} is not allowed`);
  } else if (schema.type === 'integer') {
    invariant(Number.isInteger(value), `${name} must be integer`);
    if (schema.minimum !== undefined) invariant(value >= schema.minimum, `${name} below minimum`);
    if (schema.maximum !== undefined) invariant(value <= schema.maximum, `${name} above maximum`);
  } else if (schema.type === 'boolean') {
    invariant(typeof value === 'boolean', `${name} must be boolean`);
  }
}

function validateArguments(args, schema = {}) {
  invariant(args && typeof args === 'object' && !Array.isArray(args), 'arguments must be object');
  for (const required of schema.required ?? []) invariant(Object.hasOwn(args, required), `missing argument: ${required}`);
  if (schema.additionalProperties === false) {
    for (const key of Object.keys(args)) invariant(Object.hasOwn(schema.properties ?? {}, key), `unknown argument: ${key}`);
  }
  for (const [key, value] of Object.entries(args)) validatePrimitive(value, schema.properties?.[key], `argument ${key}`);
}

function interpolate(value, args) {
  if (typeof value !== 'string') return value;
  const match = /^\$\{([A-Za-z0-9_]+)\}$/.exec(value);
  if (!match) {
    invariant(!value.includes('${'), 'partial or unresolved interpolation is denied');
    return value;
  }
  invariant(Object.hasOwn(args, match[1]), `missing interpolation argument: ${match[1]}`);
  const replacement = args[match[1]];
  invariant(['string', 'number', 'boolean'].includes(typeof replacement), 'interpolation value must be primitive');
  return replacement;
}

function renderValue(value, args) {
  if (Array.isArray(value)) return value.map((item) => renderValue(item, args));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, renderValue(child, args)]));
  }
  return interpolate(value, args);
}

function validateRenderedOperations(operations) {
  invariant(Array.isArray(operations) && operations.length > 0 && operations.length <= 128, 'invalid materialized operations');
  for (const operation of operations) {
    invariant(operation && typeof operation === 'object' && !Array.isArray(operation), 'invalid materialized operation');
    invariant(typeof operation.op === 'string' && operation.op.length > 0, 'operation type missing');
    invariant(!Object.hasOwn(operation, 'command') && !Object.hasOwn(operation, 'raw_command'), 'raw command field denied');
  }
}

export class ExecutionMaterializer {
  constructor({catalog, artifacts, policy}) {
    this.catalog = catalog;
    this.artifacts = artifacts;
    this.policy = policy;
  }

  async materialize(job) {
    invariant(job?.target === 'flipper-link', 'job target must be flipper-link');
    invariant(job?.adapter_id, `explicit adapter required for ${job?.step_id ?? 'job'}`);
    invariant(job.operation !== 'script', 'script must be expanded into concrete adapter jobs before materialization');

    const args = job.arguments ?? {};
    const adapter = await this.catalog.getAdapter(job.adapter_id);
    invariant(adapter, `adapter unavailable: ${job.adapter_id}`);
    invariant(/^[a-f0-9]{64}$/.test(adapter.sha256 ?? ''), `adapter is not content-addressed: ${job.adapter_id}`);
    invariant(adapter.verification_status === 'bundled_verified' || adapter.verification_status === 'operator_verified',
      `adapter is not approved for execution: ${job.adapter_id}`);

    if (adapter.origin === 'generated') {
      invariant(this.policy.allowGeneratedAdapterExecution === true, `generated adapter execution disabled: ${job.adapter_id}`);
      invariant(job.approval === 'operator', `generated adapter requires operator approval: ${job.adapter_id}`);
      if (this.policy.requireVisionForGeneratedAdapters) {
        invariant(adapter.requires?.vision === true, `generated adapter requires Vision verification: ${job.adapter_id}`);
      }
    }

    validateArguments(args, adapter.arguments_schema ?? {});
    const operations = adapter.operations.map((operation) => renderValue(operation, args));
    validateRenderedOperations(operations);

    const artifactEntries = new Map();
    const requestedArtifactIds = new Set([
      ...(job.artifact_id ? [job.artifact_id] : []),
      ...(adapter.requires?.artifacts ?? []),
      ...operations.filter((operation) => operation.op === 'artifact_stage').map((operation) => String(operation.artifact_id)),
    ]);

    for (const artifactId of requestedArtifactIds) {
      const artifact = await this.artifacts.resolveArtifact(artifactId);
      invariant(artifact, `artifact unavailable: ${artifactId}`);
      invariant(/^[a-f0-9]{64}$/.test(artifact.sha256 ?? ''), `artifact is not content-addressed: ${artifactId}`);
      artifactEntries.set(artifact.id, {
        id: artifact.id,
        kind: artifact.kind,
        sha256: artifact.sha256,
        size: artifact.size ?? null,
      });
    }

    if (job.requires_approval) {
      invariant(operations.some((operation) => operation.op === 'deck_confirm'),
        `approved job lacks an explicit deck_confirm operation: ${job.job_id}`);
    }

    const route = {logical_target: 'flipper', physical_owner: 'deck-cyd', fallback_physical_route: false};
    const flipperProgram = {
      version: 1,
      program_id: job.job_id,
      adapter: {
        id: adapter.adapter_id,
        sha256: adapter.sha256,
        origin: adapter.origin,
        verification_status: adapter.verification_status,
      },
      route,
      risk: job.risk,
      approval: job.approval,
      timeout_ms: job.timeout_ms,
      operations,
      artifacts: [...artifactEntries.values()],
    };
    flipperProgram.sha256 = sha256(stableJson(flipperProgram));

    return {
      ...job,
      route,
      flipper_program: flipperProgram,
      payload: undefined,
    };
  }
}
