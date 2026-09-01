import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {readJson, sanitizeId} from './utils.mjs';

export class CodexPlanner {
  constructor({client, packageRoot, validateRun}) {
    this.client = client;
    this.packageRoot = packageRoot;
    this.validateRun = validateRun;
  }

  async plan({task, authorization, inventory, catalog, resolution = {}, runId}) {
    const [instructions, schema] = await Promise.all([
      readFile(path.join(this.packageRoot, 'prompts', 'planner.md'), 'utf8'),
      readJson(path.resolve(this.packageRoot, '..', 'adl', 'flipper-run.schema.json')),
    ]);

    const input = JSON.stringify({
      operator_task: task,
      run_id_hint: sanitizeId(runId ?? task, 'run'),
      authorization,
      resolution: {
        source_policy: 'official_and_pinned',
        allow_install: true,
        allow_build: true,
        allow_generate_script: true,
        allow_generate_adapter: true,
        allow_fetch_libraries: true,
        allow_frequency_resolution: true,
        auto_apply_read_only: true,
        ...resolution,
      },
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
    return {...generated, run: generated.value};
  }
}
