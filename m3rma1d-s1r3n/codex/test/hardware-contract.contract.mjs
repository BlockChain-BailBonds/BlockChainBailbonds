import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {HttpCoreTransport} from '../src/transport.mjs';
import {CatalogService} from '../src/catalog.mjs';
import {sha256, stableJson} from '../src/utils.mjs';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const coreUrl = process.env.S1R3N_CORE_URL;
const controlKey = process.env.S1R3N_CONTROL_KEY;
if (!coreUrl) throw new Error('S1R3N_CORE_URL is required for the real hardware contract test');
if (!controlKey || controlKey.length < 32) throw new Error('S1R3N_CONTROL_KEY must contain at least 32 characters');

const transport = new HttpCoreTransport({
  coreUrl,
  controlKey,
  timeoutMs: Number(process.env.S1R3N_HARDWARE_TEST_TIMEOUT_MS ?? 15000),
  allowInsecureLocalHttp: process.env.S1R3N_ALLOW_INSECURE_LOCAL_HTTP === 'true',
});

test('real Core attests the fixed topology and all required hardware nodes', async () => {
  const status = await transport.status();
  assert.equal(status.physical_owner, 'deck-cyd');
  assert.equal(status.fallback_physical_route, false);
  assert.equal(status.deck_online, true);
  assert.equal(status.flipper_online, true);
  assert.equal(status.safety_healthy, true);
  assert.ok(Number.isInteger(status.safety_nodes_online));
  assert.ok(status.safety_nodes_online >= 3, `expected 3 C5 nodes, received ${status.safety_nodes_online}`);
});

test('real Core returns a Flipper inventory from the CYD bridge', async () => {
  const inventory = await transport.inventory();
  assert.equal(inventory.flipper.online, true);
  assert.equal(inventory.flipper.physical_owner, 'deck-cyd');
  assert.ok(Array.isArray(inventory.flipper.apps));
  assert.ok(inventory.flipper.apps.length > 0, 'Flipper app inventory is empty');
});

test('optional real read-only device-info operation executes through the CYD', async (context) => {
  if (process.env.S1R3N_HARDWARE_TEST_EXECUTE_READONLY !== 'true') {
    context.skip('set S1R3N_HARDWARE_TEST_EXECUTE_READONLY=true after STOP is intentionally cleared');
    return;
  }
  const status = await transport.status();
  assert.equal(status.stop_asserted, false, 'Core/Deck STOP must be intentionally cleared before execution');

  const stateDir = await mkdtemp(path.join(os.tmpdir(), 's1r3n-hardware-contract-'));
  const catalog = new CatalogService({packageRoot, stateDir});
  await catalog.load();
  const adapter = await catalog.getAdapter('stock.system.device_info');
  assert.equal(adapter.verification_status, 'bundled_verified');

  const route = {logical_target:'flipper', physical_owner:'deck-cyd', fallback_physical_route:false};
  const program = {
    version: 1,
    program_id: `hardware-contract-${Date.now()}`,
    adapter: {id:adapter.adapter_id, sha256:adapter.sha256, origin:adapter.origin, verification_status:adapter.verification_status},
    route,
    risk: 'observe',
    approval: 'auto',
    timeout_ms: 5000,
    operations: [{op:'system_device_info'}],
    artifacts: [],
  };
  program.sha256 = sha256(stableJson(program));
  const job = {
    job_id: program.program_id,
    run_id: program.program_id,
    step_id: 'device-info',
    target: 'flipper-link',
    route,
    risk: 'observe',
    approval: 'auto',
    requires_approval: false,
    timeout_ms: 5000,
    flipper_program: program,
  };
  const result = await transport.execute(job, Date.now() + 10000);
  assert.equal(result.job_id, job.job_id);
  assert.equal(result.code, 0, result.text);
  assert.ok(result.data && typeof result.data === 'object', 'device information payload missing');
});
