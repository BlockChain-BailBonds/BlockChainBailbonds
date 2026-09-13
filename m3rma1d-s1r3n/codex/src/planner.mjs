import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {invariant, readJson, sanitizeId, stableJson} from './utils.mjs';

export class CodexPlanner {
  constructor({client, packageRoot, validateRun}) {
    this.client = client;
    this.packageRoot = packageRoot;
    this.validateRun = validateRun;
  }

  async plan({task, authorization, inventory, catalog, resolution = {}, runId}) {
    invariant(typeof task === 'string' && task.trim().length >= 3, 'operator task is required');
    invariant(authorization && typeof authorization === 'object' && !Array.isArray(authorization), 'authorization is required');
    for (const field of ['scope', 'asset_id', 'purpose', 'region_profile', 'operator_id']) {
      invariant(typeof authorization[field] === 'string' && authorization[field].length > 0, `authorization.${field} is required`);
    }

    const [instructions, schema] = await Promise.all([
      readFile(path.join(this.packageRoot, 'prompts', 'planner.md'), 'utf8'),
      readJson(path.resolve(this.packageRoot, '..', 'adl', 'flipper-run.schema.json')),
    ]);

    const requestedResolution = {
      source_policy: resolution.source_policy ?? 'official_and_pinned',
      allow_generate_adapter: resolution.allow_generate_adapter ?? true,
      allow_generate_script: resolution.allow_generate_script ?? true,
      allow_frequency_resolution: resolution.allow_frequency_resolution ?? true,
    };
    const runIdHint = sanitizeId(runId ?? `${authorization.asset_id}-${Date.now()}`, 'run');
    const input = JSON.stringify({
      operator_task: task,
      run_id_hint: runIdHint,
      authorization,
      resolution: requestedResolution,
      inventory,
      catalog,
    }, null, 2);

    const generated = await this.client.structured({
      instructions,
      input,
      schema,
      name: 'm3rma1d_s1r3n_adl_run',
      metadata: {component: 'planner'},
    });
    this.validateRun(generated.value);
    invariant(stableJson(generated.value.authorization) === stableJson(authorization), 'Codex altered the operator authorization envelope');
    invariant(stableJson(generated.value.resolution) === stableJson(requestedResolution), 'Codex altered the requested resolution policy');
    return {...generated, run: generated.value};
  }
}
