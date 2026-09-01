import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {validateAdapter} from './catalog.mjs';
import {readJson} from './utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'config/default.json',
  'catalog/catalog.json',
  'catalog/adapters.json',
  'catalog/frequencies.json',
  'catalog/libraries.json',
  'schemas/adapter.schema.json',
  'schemas/script.schema.json',
  'prompts/planner.md',
];
for (const relative of required) await readFile(path.join(root, relative));
const adapters = await readJson(path.join(root, 'catalog', 'adapters.json'));
for (const adapter of Object.values(adapters.adapters)) validateAdapter(adapter);
const catalog = await readJson(path.join(root, 'catalog', 'catalog.json'));
for (const [appId, app] of Object.entries(catalog.apps)) {
  for (const [functionName, fn] of Object.entries(app.functions ?? {})) {
    if (fn.adapter_id && fn.operation === 'adapter' && !adapters.adapters[fn.adapter_id]) {
      console.warn(`catalog adapter is intentionally unresolved for generation: ${appId}.${functionName} -> ${fn.adapter_id}`);
    }
  }
}
console.log('M3rMa1d S1r3n Codex static checks passed');
