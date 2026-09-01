import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {CatalogService, validateAdapter} from '../src/catalog.mjs';
import {ArtifactStore} from '../src/artifacts.mjs';
import {ExecutionMaterializer} from '../src/materializer.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceSha256 = 'a'.repeat(64);

function generatedAdapter() {
  return {
    adapter_version: '1.0',
    adapter_id: 'clock.open',
    app_id: 'clock',
    function: 'open',
    risk: 'local_state',
    requires: {vision: true},
    arguments_schema: {type:'object', additionalProperties:false, required:[], properties:{}},
    operations: [
      {op: 'deck_confirm'},
      {op: 'app_start', app_name: 'Clock', args: ''},
      {op: 'capture_vision'},
      {op: 'expect', expectation: 'Clock application is visible'},
    ],
    test_plan: ['Approve the exact adapter hash on the Deck, open Clock, and verify the display before promotion.'],
  };
}

test('generated adapters remain non-executable until operator evidence promotes their exact hash', async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 's1r3n-catalog-'));
  const catalog = new CatalogService({packageRoot: root, stateDir});
  const artifacts = new ArtifactStore({packageRoot: root, stateDir});
  await Promise.all([catalog.load(), artifacts.load()]);

  const staged = await artifacts.verifyAndStage({type: 'adapter', value: generatedAdapter()}, 'official_and_pinned');
  await catalog.registerGeneratedAdapter('clock', 'open', staged);
  const pending = await catalog.getAdapter('clock.open');
  assert.equal(pending.verification_status, 'staged_pending_review');

  const job = {
    target: 'flipper-link', job_id: 'r:0', step_id: 'open-clock', adapter_id: 'clock.open',
    operation: 'adapter', risk: 'local_state', approval: 'operator', requires_approval: true,
    timeout_ms: 5000, arguments: {},
  };
  const disabled = new ExecutionMaterializer({catalog, artifacts, policy:{allowGeneratedAdapterExecution:false, requireVisionForGeneratedAdapters:true}});
  await assert.rejects(() => disabled.materialize(job), /not approved for execution|generated adapter execution disabled/);

  await catalog.promoteGeneratedAdapter({adapterId: 'clock.open', operatorId: 'operator-1', testEvidenceSha256: evidenceSha256});
  const enabled = new ExecutionMaterializer({catalog, artifacts, policy:{allowGeneratedAdapterExecution:true, requireVisionForGeneratedAdapters:true}});
  const materialized = await enabled.materialize(job);
  assert.equal(materialized.flipper_program.adapter.verification_status, 'operator_verified');
  assert.match(materialized.flipper_program.sha256, /^[a-f0-9]{64}$/);
  assert.equal(materialized.flipper_program.operations[0].op, 'deck_confirm');
});

test('adapter validator rejects raw commands and incomplete transmit adapters', () => {
  const base = generatedAdapter();
  assert.throws(
    () => validateAdapter({...base, operations:[{op:'app_start', app_name:'Clock', args:'', command:'raw'}]}),
    /field denied/,
  );
  assert.throws(
    () => validateAdapter({...base, adapter_id:'ir.tx', app_id:'infrared', function:'transmit', risk:'transmit'}),
    /frequency profile/,
  );
});
