import path from 'node:path';
import {mkdir, readFile} from 'node:fs/promises';
import {atomicWriteJson, readJson, stableJson, sha256, invariant} from './utils.mjs';

const ALLOWED_ADAPTER_OPS = new Set([
  'loader_list', 'loader_info', 'loader_open', 'loader_close', 'named_cli',
  'input_key', 'wait_ms', 'artifact_stage', 'expect', 'capture_vision', 'deck_confirm',
]);
const DENIED_KEYS = new Set(['raw_command', 'command', 'shell', 'exec', 'code', 'payload_bytes']);
const DENIED_TEXT = /(raw[_ -]?cli|shell|exec\s*\(|jamm|brute.?force|credential.?dump|access.?bypass)/i;

function walk(value, visitor, key = '') {
  visitor(value, key);
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, visitor, `${key}[${index}]`));
  else if (value && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) walk(child, visitor, childKey);
  }
}

export function validateAdapter(adapter) {
  invariant(adapter?.adapter_version === '1.0', 'unsupported adapter version');
  invariant(typeof adapter.adapter_id === 'string' && adapter.adapter_id.length <= 64, 'invalid adapter_id');
  invariant(typeof adapter.app_id === 'string' && adapter.app_id.length <= 64, 'invalid app_id');
  invariant(typeof adapter.function === 'string' && adapter.function.length <= 64, 'invalid function');
  invariant(['observe', 'local_state', 'physical_output', 'transmit', 'restricted'].includes(adapter.risk), 'invalid adapter risk');
  invariant(Array.isArray(adapter.operations) && adapter.operations.length > 0 && adapter.operations.length <= 128, 'invalid adapter operations');
  for (const operation of adapter.operations) {
    invariant(operation && typeof operation === 'object' && !Array.isArray(operation), 'invalid adapter operation');
    invariant(ALLOWED_ADAPTER_OPS.has(operation.op), `adapter operation denied: ${operation.op}`);
    if (operation.op === 'named_cli') invariant(typeof operation.command_id === 'string', 'named_cli requires command_id');
    if (operation.op === 'input_key') {
      invariant(['up', 'down', 'left', 'right', 'ok', 'back'].includes(operation.key), 'invalid input key');
      invariant(['short', 'long', 'press', 'release'].includes(operation.press ?? 'short'), 'invalid input press');
    }
    if (operation.op === 'wait_ms') invariant(Number.isInteger(operation.ms) && operation.ms > 0 && operation.ms <= 10000, 'invalid wait');
  }
  walk(adapter, (value, key) => {
    invariant(!DENIED_KEYS.has(key), `adapter field denied: ${key}`);
    if (typeof value === 'string') invariant(!DENIED_TEXT.test(value), `adapter text denied at ${key}`);
  });
  if (adapter.risk === 'transmit') {
    invariant(adapter.operations.some((operation) => operation.op === 'deck_confirm'), 'transmit adapter requires deck_confirm');
  }
  return adapter;
}

export class CatalogService {
  constructor({packageRoot, stateDir}) {
    this.packageRoot = packageRoot;
    this.stateDir = stateDir;
    this.catalogPath = path.join(packageRoot, 'catalog', 'catalog.json');
    this.adaptersPath = path.join(packageRoot, 'catalog', 'adapters.json');
    this.generatedPath = path.join(stateDir, 'catalog.generated.json');
    this.inventoryPath = path.join(stateDir, 'inventory.json');
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    const [catalog, adapters] = await Promise.all([readJson(this.catalogPath), readJson(this.adaptersPath)]);
    let generated = {adapters: {}, scripts: {}};
    try {
      generated = JSON.parse(await readFile(this.generatedPath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    this.catalog = catalog;
    this.adapters = {...adapters.adapters, ...(generated.adapters ?? {})};
    this.scripts = {...(catalog.scripts ?? {}), ...(generated.scripts ?? {})};
    this.generated = generated;
    for (const adapter of Object.values(generated.adapters ?? {})) {
      validateAdapter(adapter);
      this.catalog.apps[adapter.app_id] ??= {display_name: adapter.app_id, discovered: true, functions: {}};
      this.catalog.apps[adapter.app_id].functions[adapter.function] = {
        operation: 'adapter', adapter_id: adapter.adapter_id, risk: adapter.risk,
        libraries: adapter.requires?.libraries ?? [], generated: true,
      };
    }
    this.loaded = true;
  }

  async snapshot() {
    await this.load();
    let inventory = null;
    try {
      inventory = JSON.parse(await readFile(this.inventoryPath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    return {
      catalog_version: this.catalog.catalog_version,
      capabilities: this.catalog.capabilities,
      apps: this.catalog.apps,
      named_commands: this.catalog.named_commands,
      installed_apps: inventory?.flipper?.apps ?? [],
      generated_adapters: Object.keys(this.generated.adapters ?? {}),
      generated_scripts: Object.keys(this.generated.scripts ?? {}),
    };
  }

  async resolveCapability(name) {
    await this.load();
    const entry = this.catalog.capabilities[name];
    return entry ? structuredClone(entry) : null;
  }

  async resolveAppFunction(appId, functionName) {
    await this.load();
    const app = this.catalog.apps[appId];
    const functionEntry = app?.functions?.[functionName];
    if (!functionEntry) return null;
    const adapter = functionEntry.adapter_id ? this.adapters[functionEntry.adapter_id] : null;
    if (functionEntry.operation === 'adapter' && !adapter) return null;
    if (adapter) validateAdapter(adapter);
    return {
      app_id: appId,
      function: functionName,
      ...structuredClone(functionEntry),
      adapter: adapter ? structuredClone(adapter) : undefined,
      libraries: [...new Set([...(functionEntry.libraries ?? []), ...(adapter?.requires?.libraries ?? [])])],
      frequency: functionEntry.frequency ?? null,
    };
  }

  async resolveScript(scriptId) {
    await this.load();
    const script = this.scripts[scriptId];
    if (!script) return null;
    return {
      operation: 'script',
      artifact_id: script.artifact_id,
      adapter_id: script.adapter_id ?? '',
      risk: script.risk,
      libraries: script.libraries ?? [],
      script: structuredClone(script),
    };
  }

  async getAdapter(adapterId) {
    await this.load();
    const adapter = this.adapters[adapterId];
    return adapter ? structuredClone(validateAdapter(adapter)) : null;
  }

  async getNamedCommand(commandId) {
    await this.load();
    const command = this.catalog.named_commands[commandId];
    return command ? structuredClone(command) : null;
  }

  async registerGeneratedAdapter(appId, functionName, staged) {
    await this.load();
    invariant(staged?.type === 'adapter' && staged.value, 'staged adapter required');
    const adapter = validateAdapter(staged.value);
    invariant(adapter.app_id === appId && adapter.function === functionName, 'generated adapter target mismatch');
    this.generated.adapters ??= {};
    this.generated.adapters[adapter.adapter_id] = {...adapter, artifact_id: staged.artifact_id, sha256: staged.sha256};
    this.adapters[adapter.adapter_id] = this.generated.adapters[adapter.adapter_id];
    this.catalog.apps[appId] ??= {display_name: appId, discovered: true, functions: {}};
    this.catalog.apps[appId].functions[functionName] = {
      operation: 'adapter',
      adapter_id: adapter.adapter_id,
      risk: adapter.risk,
      libraries: adapter.requires?.libraries ?? [],
      generated: true,
    };
    await this.#persistGenerated();
  }

  async registerGeneratedScript(scriptId, staged) {
    await this.load();
    invariant(staged?.type === 'script' && staged.value, 'staged script required');
    const script = staged.value;
    invariant(script.script_version === '1.0', 'unsupported script version');
    this.generated.scripts ??= {};
    this.generated.scripts[scriptId] = {
      artifact_id: staged.artifact_id,
      sha256: staged.sha256,
      risk: script.risk,
      libraries: [],
      script,
    };
    this.scripts[scriptId] = this.generated.scripts[scriptId];
    await this.#persistGenerated();
  }

  async ingestInventory(inventory) {
    invariant(inventory?.flipper && Array.isArray(inventory.flipper.apps), 'invalid inventory');
    await mkdir(this.stateDir, {recursive: true});
    await atomicWriteJson(this.inventoryPath, inventory);
    return {sha256: sha256(stableJson(inventory)), appCount: inventory.flipper.apps.length};
  }

  async #persistGenerated() {
    await mkdir(this.stateDir, {recursive: true});
    await atomicWriteJson(this.generatedPath, this.generated);
  }
}
