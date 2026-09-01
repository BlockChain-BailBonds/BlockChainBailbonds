import path from 'node:path';
import {mkdir, readFile} from 'node:fs/promises';
import {atomicWriteJson, invariant, readJson, sha256, stableJson} from './utils.mjs';

const ALLOWED_ADAPTER_OPS = new Set([
  'system_device_info', 'system_power_info',
  'storage_info', 'storage_list', 'storage_stat', 'storage_write',
  'app_start', 'app_exit', 'app_load_file', 'app_button',
  'gui_input', 'gpio_read', 'property_get',
  'wait_ms', 'artifact_stage', 'expect', 'capture_vision', 'deck_confirm',
]);
const DENIED_KEYS = new Set(['raw_command', 'command', 'shell', 'exec', 'code', 'payload_bytes', 'template']);
const DENIED_TEXT = /(raw[_ -]?cli|shell|exec\s*\(|jamm|brute.?force|credential.?dump|access.?bypass)/i;
const ID = /^[A-Za-z0-9._:-]{1,64}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function walk(value, visitor, key = '') {
  visitor(value, key);
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, visitor, `${key}[${index}]`));
  else if (value && typeof value === 'object') {
    for (const [childKey, child] of Object.entries(value)) walk(child, visitor, childKey);
  }
}

function requireString(value, name, max = 256) {
  invariant(typeof value === 'string' && value.length > 0 && value.length <= max, `${name} is invalid`);
}

function validateOperation(operation) {
  invariant(operation && typeof operation === 'object' && !Array.isArray(operation), 'invalid adapter operation');
  invariant(ALLOWED_ADAPTER_OPS.has(operation.op), `adapter operation denied: ${operation.op}`);
  switch (operation.op) {
    case 'storage_info':
    case 'storage_list':
    case 'storage_stat':
    case 'app_load_file':
      requireString(operation.path, `${operation.op}.path`, 255);
      break;
    case 'storage_write':
    case 'artifact_stage':
      requireString(operation.artifact_id, `${operation.op}.artifact_id`, 96);
      requireString(operation.destination_path, `${operation.op}.destination_path`, 255);
      break;
    case 'app_start':
      requireString(operation.app_name, 'app_start.app_name', 64);
      if (operation.args !== undefined) invariant(typeof operation.args === 'string' && operation.args.length <= 256, 'app_start.args is invalid');
      break;
    case 'app_button':
      invariant((Number.isInteger(operation.index) && operation.index >= 0) ||
        (typeof operation.args === 'string' && operation.args.length > 0 && operation.args.length <= 128),
      'app_button requires a non-negative index or bounded args');
      break;
    case 'gui_input':
      invariant(['up', 'down', 'right', 'left', 'ok', 'back'].includes(operation.key), 'invalid gui_input key');
      invariant(['press', 'release', 'short', 'long'].includes(operation.press), 'invalid gui_input press type');
      break;
    case 'gpio_read':
      invariant(['PC0', 'PC1', 'PC3', 'PB2', 'PB3', 'PA4', 'PA6', 'PA7'].includes(operation.pin), 'invalid Flipper GPIO pin');
      break;
    case 'property_get':
      requireString(operation.property_key, 'property_get.property_key', 128);
      break;
    case 'wait_ms':
      invariant(Number.isInteger(operation.ms) && operation.ms > 0 && operation.ms <= 10000, 'invalid wait_ms');
      break;
    case 'expect':
      requireString(operation.expectation, 'expect.expectation', 256);
      break;
    default:
      break;
  }
}

export function validateAdapter(adapter) {
  invariant(adapter?.adapter_version === '1.0', 'unsupported adapter version');
  invariant(ID.test(adapter.adapter_id ?? ''), 'invalid adapter_id');
  invariant(ID.test(adapter.app_id ?? ''), 'invalid app_id');
  invariant(ID.test(adapter.function ?? ''), 'invalid function');
  invariant(['observe', 'local_state', 'physical_output', 'transmit', 'restricted'].includes(adapter.risk), 'invalid adapter risk');
  invariant(Array.isArray(adapter.operations) && adapter.operations.length > 0 && adapter.operations.length <= 128, 'invalid adapter operations');
  invariant(Array.isArray(adapter.test_plan) && adapter.test_plan.length > 0 && adapter.test_plan.length <= 16, 'adapter test plan required');
  adapter.operations.forEach(validateOperation);

  walk(adapter, (value, key) => {
    invariant(!DENIED_KEYS.has(key), `adapter field denied: ${key}`);
    if (typeof value === 'string') invariant(!DENIED_TEXT.test(value), `adapter text denied at ${key}`);
  });

  if (['physical_output', 'transmit'].includes(adapter.risk)) {
    invariant(adapter.operations.some((operation) => operation.op === 'deck_confirm'),
      `${adapter.risk} adapter requires deck_confirm`);
  }
  if (adapter.risk === 'transmit') {
    invariant(adapter.requires?.frequency_profile, 'transmit adapter requires a frequency profile');
  }
  return adapter;
}

function baseAdapter(adapter) {
  const copy = structuredClone(adapter);
  for (const key of ['origin', 'verification_status', 'sha256', 'artifact_id', 'verified_by', 'verified_at', 'test_evidence_sha256']) {
    delete copy[key];
  }
  return copy;
}

function normalizeAdapter(adapter, metadata) {
  const base = validateAdapter(baseAdapter(adapter));
  const digest = sha256(`${stableJson(base)}\n`);
  if (metadata.sha256) invariant(metadata.sha256 === digest, `adapter integrity failure: ${base.adapter_id}`);
  return {...base, ...metadata, sha256: digest};
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
    const [catalog, bundled] = await Promise.all([readJson(this.catalogPath), readJson(this.adaptersPath)]);
    let generated = {adapters: {}, scripts: {}};
    try {
      generated = JSON.parse(await readFile(this.generatedPath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    this.catalog = catalog;
    this.adapters = {};
    for (const [adapterId, adapter] of Object.entries(bundled.adapters ?? {})) {
      invariant(adapter.adapter_id === adapterId, `bundled adapter key mismatch: ${adapterId}`);
      this.adapters[adapterId] = normalizeAdapter(adapter, {
        origin: 'bundled',
        verification_status: 'bundled_verified',
      });
    }

    this.generated = generated;
    for (const [adapterId, adapter] of Object.entries(generated.adapters ?? {})) {
      invariant(adapter.adapter_id === adapterId, `generated adapter key mismatch: ${adapterId}`);
      this.adapters[adapterId] = normalizeAdapter(adapter, {
        origin: 'generated',
        verification_status: adapter.verification_status ?? 'staged_pending_review',
        artifact_id: adapter.artifact_id,
        verified_by: adapter.verified_by,
        verified_at: adapter.verified_at,
        test_evidence_sha256: adapter.test_evidence_sha256,
        sha256: adapter.sha256,
      });
      this.catalog.apps[adapter.app_id] ??= {display_name: adapter.app_id, discovered: true, functions: {}};
      this.catalog.apps[adapter.app_id].functions[adapter.function] = {
        operation: 'adapter',
        adapter_id: adapter.adapter_id,
        risk: adapter.risk,
        libraries: adapter.requires?.libraries ?? [],
        generated: true,
        verification_status: this.adapters[adapterId].verification_status,
      };
    }

    this.scripts = {...(catalog.scripts ?? {}), ...(generated.scripts ?? {})};
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
      installed_apps: inventory?.flipper?.apps ?? [],
      adapters: Object.fromEntries(Object.entries(this.adapters).map(([id, adapter]) => [id, {
        sha256: adapter.sha256,
        origin: adapter.origin,
        verification_status: adapter.verification_status,
      }])),
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
    const functionEntry = this.catalog.apps[appId]?.functions?.[functionName];
    if (!functionEntry?.adapter_id) return null;
    const adapter = this.adapters[functionEntry.adapter_id];
    if (!adapter) return null;
    return {
      app_id: appId,
      function: functionName,
      ...structuredClone(functionEntry),
      adapter: structuredClone(adapter),
      libraries: [...new Set([...(functionEntry.libraries ?? []), ...(adapter.requires?.libraries ?? [])])],
      frequency: functionEntry.frequency ?? null,
    };
  }

  async resolveScript(scriptId) {
    await this.load();
    const entry = this.scripts[scriptId];
    if (!entry) return null;
    const script = entry.script ?? entry;
    invariant(script.script_version === '1.0' && Array.isArray(script.steps), `invalid script: ${scriptId}`);
    return {
      operation: 'script',
      artifact_id: entry.artifact_id ?? '',
      risk: entry.risk ?? script.risk,
      libraries: entry.libraries ?? [],
      script: structuredClone(script),
      verification_status: entry.verification_status ?? 'bundled_verified',
    };
  }

  async getAdapter(adapterId) {
    await this.load();
    const adapter = this.adapters[adapterId];
    return adapter ? structuredClone(adapter) : null;
  }

  async registerGeneratedAdapter(appId, functionName, staged) {
    await this.load();
    invariant(staged?.type === 'adapter' && staged.value, 'staged adapter required');
    const adapter = validateAdapter(staged.value);
    invariant(adapter.app_id === appId && adapter.function === functionName, 'generated adapter target mismatch');
    const normalized = normalizeAdapter(adapter, {
      origin: 'generated',
      verification_status: 'staged_pending_review',
      artifact_id: staged.artifact_id,
      sha256: staged.sha256,
    });
    this.generated.adapters ??= {};
    this.generated.adapters[adapter.adapter_id] = normalized;
    this.adapters[adapter.adapter_id] = normalized;
    this.catalog.apps[appId] ??= {display_name: appId, discovered: true, functions: {}};
    this.catalog.apps[appId].functions[functionName] = {
      operation: 'adapter', adapter_id: adapter.adapter_id, risk: adapter.risk,
      libraries: adapter.requires?.libraries ?? [], generated: true,
      verification_status: 'staged_pending_review',
    };
    await this.#persistGenerated();
  }

  async promoteGeneratedAdapter({adapterId, operatorId, testEvidenceSha256}) {
    await this.load();
    invariant(ID.test(operatorId ?? ''), 'operator ID is required');
    invariant(SHA256.test(testEvidenceSha256 ?? ''), 'test evidence SHA-256 is required');
    const adapter = this.generated.adapters?.[adapterId];
    invariant(adapter, `generated adapter not found: ${adapterId}`);
    adapter.verification_status = 'operator_verified';
    adapter.verified_by = operatorId;
    adapter.verified_at = new Date().toISOString();
    adapter.test_evidence_sha256 = testEvidenceSha256;
    this.adapters[adapterId] = normalizeAdapter(adapter, {
      origin: 'generated',
      verification_status: adapter.verification_status,
      artifact_id: adapter.artifact_id,
      verified_by: adapter.verified_by,
      verified_at: adapter.verified_at,
      test_evidence_sha256: adapter.test_evidence_sha256,
      sha256: adapter.sha256,
    });
    await this.#persistGenerated();
    return structuredClone(this.adapters[adapterId]);
  }

  async registerGeneratedScript(scriptId, staged) {
    await this.load();
    invariant(staged?.type === 'script' && staged.value, 'staged script required');
    const script = staged.value;
    invariant(script.script_version === '1.0' && ID.test(scriptId), 'invalid generated script');
    this.generated.scripts ??= {};
    this.generated.scripts[scriptId] = {
      artifact_id: staged.artifact_id,
      sha256: staged.sha256,
      risk: script.risk,
      libraries: [],
      verification_status: 'staged_pending_review',
      script,
    };
    this.scripts[scriptId] = this.generated.scripts[scriptId];
    await this.#persistGenerated();
  }

  async ingestInventory(inventory) {
    invariant(inventory?.flipper?.online === true, 'Flipper inventory reports offline');
    invariant(inventory.flipper.physical_owner === 'deck-cyd', 'invalid inventory physical owner');
    invariant(Array.isArray(inventory.flipper.apps), 'invalid inventory app list');
    await mkdir(this.stateDir, {recursive: true});
    await atomicWriteJson(this.inventoryPath, inventory);
    return {sha256: sha256(stableJson(inventory)), appCount: inventory.flipper.apps.length};
  }

  async #persistGenerated() {
    await mkdir(this.stateDir, {recursive: true});
    await atomicWriteJson(this.generatedPath, this.generated);
  }
}
