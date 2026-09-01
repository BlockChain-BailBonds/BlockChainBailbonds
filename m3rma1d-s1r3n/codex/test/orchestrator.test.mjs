import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {CatalogService} from '../src/catalog.mjs';
import {ArtifactStore} from '../src/artifacts.mjs';
import {FrequencyResolver} from '../src/frequencies.mjs';
import {AuditLog} from '../src/audit.mjs';
import {StopState} from '../src/stop.mjs';
import {DryRunTransport} from '../src/transport.mjs';
import {DenyApprovalService} from '../src/approvals.mjs';
import {MermaidCodexService} from '../src/orchestrator.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readOnlyRun() {
  return {
    adl_version:'2.0', run_id:'inventory-1', target:'flipper', max_run_ms:5000, stop_on_error:true,
    authorization:{scope:'owned_asset', asset_id:'flipper-1', purpose:'read device inventory', region_profile:'US-LAB'},
    resolution:{source_policy:'official_and_pinned', allow_generate_adapter:false, allow_generate_script:false, allow_frequency_resolution:true},
    steps:[{id:'device', kind:'capability', capability:'device_info', approval:'auto', timeout_ms:1000}],
  };
}

test('end-to-end dry run resolves, materializes, and executes through Deck-only route', async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 's1r3n-run-'));
  let materialized;
  const transport = new DryRunTransport({onJob:(job) => { materialized = job; }});
  const service = new MermaidCodexService({
    config:{stateDir, execution:{dryRun:true,maxConcurrentRuns:1}},
    planner:{}, generator:{},
    catalog:new CatalogService({packageRoot:root,stateDir}),
    artifacts:new ArtifactStore({packageRoot:root,stateDir}),
    frequencies:new FrequencyResolver({packageRoot:root,stateDir}),
    audit:new AuditLog({stateDir}), approvals:new DenyApprovalService(), stop:new StopState({stateDir}), transport,
  });
  await service.init();
  const result = await service.runAdl(readOnlyRun());
  assert.equal(result.status, 'completed');
  assert.equal(result.results[0].dry_run, true);
  assert.equal(materialized.route.physical_owner, 'deck-cyd');
  assert.equal(materialized.execution.adapter_id, 'stock.device_info');
});
