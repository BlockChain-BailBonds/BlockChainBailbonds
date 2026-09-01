import {invariant} from './utils.mjs';

function validatePrimitive(value, schema, name) {
  if (!schema) return;
  if (schema.type === 'string') {
    invariant(typeof value === 'string', `${name} must be string`);
    if (schema.maxLength) invariant(value.length <= schema.maxLength, `${name} exceeds maxLength`);
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
    invariant(!value.includes('${'), 'partial interpolation is denied');
    return value;
  }
  invariant(Object.hasOwn(args, match[1]), `missing interpolation argument: ${match[1]}`);
  const replacement = args[match[1]];
  invariant(['string', 'number', 'boolean'].includes(typeof replacement), 'interpolation value must be primitive');
  return replacement;
}

function renderOperation(operation, args) {
  const rendered = {};
  for (const [key, value] of Object.entries(operation)) {
    if (Array.isArray(value)) rendered[key] = value.map((item) => interpolate(item, args));
    else if (value && typeof value === 'object') rendered[key] = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, interpolate(v, args)]));
    else rendered[key] = interpolate(value, args);
  }
  return rendered;
}

export class ExecutionMaterializer {
  constructor({catalog, artifacts}) {
    this.catalog = catalog;
    this.artifacts = artifacts;
  }

  async materialize(job) {
    const args = job.arguments ?? {};
    let adapter = null;
    if (job.adapter_id) adapter = await this.catalog.getAdapter(job.adapter_id);

    if (!adapter && ['loader_list', 'loader_info', 'loader_open', 'loader_close', 'named_cli'].includes(job.operation)) {
      adapter = {
        adapter_version: '1.0',
        adapter_id: job.adapter_id || `implicit.${job.operation}`,
        app_id: job.app_id || 'system',
        function: job.function || job.operation,
        risk: job.risk,
        operations: [{op: job.operation, ...(job.operation === 'named_cli' ? {command_id: job.command_id} : {})],
        test_plan: ['Implicit catalog operation'],
      };
    }
    invariant(adapter || job.operation === 'script', `adapter unavailable: ${job.adapter_id}`);

    const artifactEntries = [];
    if (job.artifact_id) {
      const artifact = await this.artifacts.resolveArtifact(job.artifact_id);
      invariant(artifact, `artifact unavailable: ${job.artifact_id}`);
      artifactEntries.push({id: artifact.id, kind: artifact.kind, sha256: artifact.sha256, size: artifact.size ?? null});
    }

    if (adapter) {
      validateArguments(args, adapter.arguments_schema ?? {});
      for (const operation of adapter.operations) {
        if (operation.op === 'named_cli') {
          const command = await this.catalog.getNamedCommand(operation.command_id);
          invariant(command, `named command unavailable: ${operation.command_id}`);
          invariant(command.risk === 'observe' || job.approval !== 'auto', 'state-changing named command requires approval');
        }
        if (operation.op === 'artifact_stage') {
          const renderedId = interpolate(operation.artifact_id, args);
          const artifact = await this.artifacts.resolveArtifact(String(renderedId));
          invariant(artifact, `artifact unavailable: ${renderedId}`);
          artifactEntries.push({id: artifact.id, kind: artifact.kind, sha256: artifact.sha256, size: artifact.size ?? null});
        }
      }
    }

    return {
      ...job,
      route: {logical_target: 'flipper', physical_owner: 'deck-cyd', fallback_physical_route: false},
      execution: adapter ? {
        adapter_id: adapter.adapter_id,
        adapter_sha256: adapter.sha256 ?? null,
        operations: adapter.operations.map((operation) => renderOperation(operation, args)),
      } : {
        script_artifact_id: job.artifact_id,
      },
      artifacts: [...new Map(artifactEntries.map((entry) => [entry.id, entry])).values()],
      payload: undefined,
    };
  }
}
