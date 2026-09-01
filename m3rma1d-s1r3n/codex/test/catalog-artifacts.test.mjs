import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {CatalogService, validateAdapter} from '../src/catalog.mjs';
import {ArtifactStore} from '../src/artifacts.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function safeAdapter() {
  return {
    adapter_version:'1.0', adapter_id:'clock.open', app_id:'clock', function:'open', risk:'local_state',
    operations:[{op:'loader_open', app_name:'Clock'}],
    test_plan:['Open Clock and close it'],
  };
}

test('catalog resolves built-in adapter and generated adapter persists', async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 's1r3n-catalog-'));
  const catalog = new CatalogService({packageRoot:root, stateDir});
  const artifacts = new ArtifactStore({packageRoot:root, stateDir});
  await catalog.load();
  assert.equal((await catalog.resolveCapability('device_info')).risk, 'observe');
  const staged = await artifacts.verifyAndStage({type:'adapter', value:safeAdapter()}, 'official_and_pinned');
  await catalog.registerGeneratedAdapter('clock', 'open', staged);
  const resolved = await catalog.resolveAppFunction('clock', 'open');
  assert.equal(resolved.adapter_id, 'clock.open');
  assert.equal(resolved.risk, 'local_state');
});

test('adapter validator rejects raw command and requires Deck confirmation for transmit', () => {
  assert.throws(() => validateAdapter({...safeAdapter(), operations:[{op:'loader_open', app_name:'Clock', command:'raw'}]}), /field denied/);
  assert.throws(() => validateAdapter({...safeAdapter(), adapter_id:'ir.tx', app_id:'infrared', function:'transmit', risk:'transmit'}), /deck_confirm/);
});
