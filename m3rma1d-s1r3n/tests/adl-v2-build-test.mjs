import assert from 'node:assert/strict';
import { AppRegistry, bundledAdapters, bundledManifestSet } from '../adl/app-registry.mjs';
import { JobIdMap, fnv1a32, FlipperTransport } from '../gateway/flipper-transport.mjs';
import { resolveRun, compileRun } from '../adl/codex-runner.mjs';

const registry = new AppRegistry({ manifests: bundledManifestSet, adapters: bundledAdapters });

assert.equal((await registry.resolveCapability('device_info')).adapter_id, 'system.device_info');
assert.equal((await registry.resolveAppFunction('loader', 'list')).adapter_id, 'loader.list');
assert.equal(await registry.resolveAppFunction('loader', 'missing'), null);

const discovered = registry.discoverInstalled(['Infrared', 'NFC', 'GPIO']);
assert.equal(discovered.length, 3);
assert.equal(registry.describeApp('infrared').discovered, true);
assert.equal(registry.describeApp('infrared').functions && Object.keys(registry.describeApp('infrared').functions).length, 0);

const ids = new JobIdMap();
const first = ids.assign('run-1', 'step-1', 0);
const second = ids.assign('run-1', 'step-1', 0);
assert.equal(first, second);
assert.notEqual(first, 0);
assert.equal(ids.describe(first), 'run-1:step-1:0');
assert.equal(fnv1a32('abc'), fnv1a32('abc'));

const run = {
  adl_version: '2.0',
  run_id: 'build-test-001',
  target: 'flipper',
  authorization: {
    scope: 'owned_asset',
    asset_id: 'bench-flipper-001',
    purpose: 'inventory and application discovery',
    region_profile: 'US',
    operator_id: 'operator-001'
  },
  resolution: {
    source_policy: 'local_only',
    allow_generate_adapter: false,
    allow_generate_script: false,
    allow_frequency_resolution: false
  },
  max_run_ms: 10000,
  stop_on_error: true,
  steps: [
    { id: 'device', kind: 'capability', capability: 'device_info', approval: 'auto' },
    { id: 'apps', kind: 'app', app_id: 'loader', function: 'list', approval: 'auto' }
  ]
};

const services = {
  catalog: registry,
  artifacts: {
    async resolveLibrary() { return null; },
    async verifyAndStage() { throw new Error('not expected'); }
  },
  frequencies: {
    async resolve() { return null; }
  }
};

const resolved = await resolveRun(run, services);
const jobs = compileRun(resolved);
assert.equal(jobs.length, 2);
assert.equal(jobs[0].adapter_id, 'system.device_info');
assert.equal(jobs[1].adapter_id, 'loader.list');
assert.equal(jobs[0].requires_approval, false);

let requestSeen = null;
const transport = new FlipperTransport({
  link: {
    async request(request) {
      requestSeen = request;
      return { job_id: request.job_id, code: 0, text: 'ok', data: { simulated: true } };
    }
  },
  stop: { async isAsserted() { return false; } }
});

const result = await transport.execute(jobs[0], Date.now() + 5000);
assert.equal(result.code, 0);
assert.equal(result.job_id, requestSeen.job_id);
assert.equal(requestSeen.adapter_id, 'system.device_info');
assert.equal(requestSeen.protocol, 'M3S1');

await assert.rejects(
  () => new FlipperTransport({
    link: { async request() { return { job_id: 123, code: 0, text: 'bad-correlation' }; } },
    stop: { async isAsserted() { return false; } }
  }).execute(jobs[0], Date.now() + 5000),
  /correlation/
);

await assert.rejects(
  () => new FlipperTransport({
    link: { async request() { throw new Error('must not execute'); } },
    stop: { async isAsserted() { return true; } }
  }).execute(jobs[0], Date.now() + 5000),
  /STOP asserted/
);

console.log('M3rMa1d S1r3n ADL v2 build tests: PASS');
