import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile, readdir} from 'node:fs/promises';
import {validateAdapter} from './catalog.mjs';
import {readJson, sha256, stableJson} from './utils.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(root, '..');
const required = [
  'config/default.json',
  'catalog/catalog.json',
  'catalog/adapters.json',
  'catalog/frequencies.json',
  'catalog/libraries.json',
  'schemas/adapter.schema.json',
  'schemas/app-capability-plan.schema.json',
  'schemas/script.schema.json',
  'prompts/planner.md',
  'prompts/adapter-generator.md',
  'prompts/app-capability-discovery.md',
];
for (const relative of required) await readFile(path.join(root, relative));

const defaults = await readJson(path.join(root, 'config', 'default.json'));
if (Object.hasOwn(defaults.execution, 'dry_run')) throw new Error('production defaults must not contain dry_run');
if (defaults.execution.physical_owner !== 's3-cam' || defaults.execution.allow_fallback_physical_route !== false) {
  throw new Error('production route must be S3-CAM-only with no fallback');
}
if (defaults.execution.require_flipper_online !== true) throw new Error('production defaults must require the Flipper online');
for (const obsolete of ['require_safety_quorum', 'required_safety_nodes', 'require_deck_online']) {
  if (Object.hasOwn(defaults.execution, obsolete)) throw new Error(`obsolete multi-board execution setting remains: ${obsolete}`);
}
if (defaults.transport.core_url !== '') throw new Error('production S3-CAM URL must be supplied by environment, not embedded defaults');
if (defaults.transport.allow_insecure_local_http !== false) throw new Error('insecure local HTTP must default to false');

const adapterCatalog = await readJson(path.join(root, 'catalog', 'adapters.json'));
const adapters = adapterCatalog.adapters ?? {};
for (const [adapterId, adapter] of Object.entries(adapters)) {
  if (adapter.adapter_id !== adapterId) throw new Error(`adapter key mismatch: ${adapterId}`);
  validateAdapter(adapter);
}

const catalog = await readJson(path.join(root, 'catalog', 'catalog.json'));
for (const [name, capability] of Object.entries(catalog.capabilities ?? {})) {
  if (capability.operation !== 'adapter') throw new Error(`capability is not adapter-backed: ${name}`);
  if (!adapters[capability.adapter_id]) throw new Error(`capability adapter missing: ${name} -> ${capability.adapter_id}`);
}
for (const [appId, app] of Object.entries(catalog.apps ?? {})) {
  for (const [functionName, fn] of Object.entries(app.functions ?? {})) {
    if (fn.operation !== 'adapter') throw new Error(`app function is not adapter-backed: ${appId}.${functionName}`);
    if (!adapters[fn.adapter_id]) throw new Error(`app adapter missing: ${appId}.${functionName} -> ${fn.adapter_id}`);
  }
}

const libraries = (await readJson(path.join(root, 'catalog', 'libraries.json'))).libraries ?? {};
for (const [libraryId, library] of Object.entries(libraries)) {
  if (library.id !== libraryId) throw new Error(`library key mismatch: ${libraryId}`);
  if (library.source_type !== 'git' || !/^[a-f0-9]{40}$/.test(library.revision ?? '')) {
    throw new Error(`library is not pinned to an immutable Git revision: ${libraryId}`);
  }
  const descriptor = {
    id: library.id,
    source_type: library.source_type,
    url: library.url,
    revision: library.revision,
    ...(library.path ? {path: library.path} : {}),
  };
  if (library.hash_scope !== 'source_descriptor' || library.sha256 !== sha256(stableJson(descriptor))) {
    throw new Error(`library descriptor hash mismatch: ${libraryId}`);
  }
}

const sourceDir = path.join(root, 'src');
const sourceFiles = (await readdir(sourceDir)).filter((name) => name.endsWith('.mjs') && name !== 'check.mjs');
const forbiddenRuntime = /\b(DryRunTransport|DenyApprovalService|ConsoleApprovalService|MockCore|dryRun)\b|S1R3N_DRY_RUN|mock-core\.mjs/i;
const obsoleteTopology = /physical_owner\s*[:=]\s*['"]deck-cyd['"]|requireDeckOnline|requireSafetyQuorum|requiredSafetyNodes/;
for (const name of sourceFiles) {
  const text = await readFile(path.join(sourceDir, name), 'utf8');
  if (forbiddenRuntime.test(text)) throw new Error(`development substitute remains in production source: src/${name}`);
  if (obsoleteTopology.test(text)) throw new Error(`obsolete Deck/C5 topology remains in production source: src/${name}`);
}

const packageJson = await readJson(path.join(root, 'package.json'));
for (const [name, command] of Object.entries(packageJson.scripts ?? {})) {
  if (/mock|dry.?run/i.test(`${name} ${command}`)) throw new Error(`development script remains: ${name}`);
}

const route = await readJson(path.join(projectRoot, 'adl', 'hardware-routing.json'));
if (route.physical_owner !== 's3-cam' || route.fallback_physical_route !== false) {
  throw new Error('ADL hardware routing is not locked to the S3-CAM');
}
if (JSON.stringify(route.topology) !== JSON.stringify(['s3-cam', 'flipper-zero'])) {
  throw new Error('ADL topology must contain exactly s3-cam and flipper-zero');
}
if (route.bridge?.s3_rx_gpio !== 1 || route.bridge?.s3_tx_gpio !== 2 ||
    route.bridge?.flipper_tx_pin !== 13 || route.bridge?.flipper_rx_pin !== 14 ||
    route.bridge?.power_connection !== false || route.bridge?.common_ground_required !== true) {
  throw new Error('ADL hardware routing does not match the approved S3-CAM-to-Flipper wiring');
}
if (route.codex?.shell !== false || route.codex?.raw_cli !== false || route.codex?.stop_preempts_all !== true) {
  throw new Error('ADL Codex policy must deny shell/raw CLI and make STOP preemptive');
}

const obsoleteFirmwareFiles = [
  path.join(projectRoot, 'firmware', 'c5-guardian', 'main', 'CMakeLists.txt'),
  path.join(projectRoot, 'firmware', 'deck-cyd', 'platformio.ini'),
  path.join(projectRoot, 'firmware', 'deck-cyd', 'src', 'main.cpp'),
  path.join(projectRoot, 'firmware', 'vision-s3-ov3660', 'platformio.ini'),
  path.join(projectRoot, 'firmware', 'vision-s3-ov3660', 'src', 'main.cpp'),
];
for (const file of obsoleteFirmwareFiles) {
  try {
    await readFile(file);
    throw new Error(`obsolete multi-board firmware file remains: ${path.relative(projectRoot, file)}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

console.log(`M3rMa1d S1r3n production static checks passed: ${Object.keys(adapters).length} verified bundled adapters, ${Object.keys(libraries).length} pinned libraries; S3-CAM-only route enforced`);
