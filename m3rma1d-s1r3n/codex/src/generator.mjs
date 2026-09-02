import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {readJson} from './utils.mjs';

export class CodexGenerator {
  constructor({client, packageRoot, catalogSnapshot}) {
    this.client = client;
    this.packageRoot = packageRoot;
    this.catalogSnapshot = catalogSnapshot;
  }

  async generateAdapter({run, step}) {
    const [instructions, schema] = await Promise.all([
      readFile(path.join(this.packageRoot, 'prompts', 'adapter-generator.md'), 'utf8'),
      readJson(path.join(this.packageRoot, 'schemas', 'adapter.schema.json')),
    ]);
    const result = await this.client.structured({
      instructions,
      input: JSON.stringify({authorization: run.authorization, resolution: run.resolution, step, catalog: await this.catalogSnapshot()}, null, 2),
      schema,
      name: 'm3rma1d_flipper_adapter',
      metadata: {component: 'adapter-generator', app_id: step.app_id ?? 'unknown'},
    });
    return {type: 'adapter', value: result.value, response_id: result.responseId};
  }

  async generateScript({run, step}) {
    const [instructions, schema] = await Promise.all([
      readFile(path.join(this.packageRoot, 'prompts', 'script-generator.md'), 'utf8'),
      readJson(path.join(this.packageRoot, 'schemas', 'script.schema.json')),
    ]);
    const result = await this.client.structured({
      instructions,
      input: JSON.stringify({authorization: run.authorization, requirement: step.script_requirement, catalog: await this.catalogSnapshot()}, null, 2),
      schema,
      name: 'm3rma1d_declarative_script',
      metadata: {component: 'script-generator'},
    });
    return {type: 'script', value: result.value, response_id: result.responseId};
  }

  async decideFromVision({imageDataUrl, expectation, lastResult, catalog}) {
    const [instructions, schema] = await Promise.all([
      readFile(path.join(this.packageRoot, 'prompts', 'vision-controller.md'), 'utf8'),
      readJson(path.join(this.packageRoot, 'schemas', 'vision-decision.schema.json')),
    ]);
    const result = await this.client.structured({
      instructions,
      input: JSON.stringify({expectation, last_result: lastResult, catalog}, null, 2),
      images: [imageDataUrl],
      schema,
      name: 'm3rma1d_vision_decision',
      metadata: {component: 'vision-controller'},
    });
    return result.value;
  }
}
