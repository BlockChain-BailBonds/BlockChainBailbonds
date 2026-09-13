import assert from 'node:assert/strict';
import { buildCoreCatalogState, buildDefaultRegistry, publishCoreCatalog, summarizeCatalog } from './catalog-summary.mjs';

const registry = buildDefaultRegistry();
const state = buildCoreCatalogState(registry);

assert.equal(state.protocol, 'M3S1');
assert.equal(state.version, 2);
assert.equal(state.type, 'catalog_state');
assert.equal(state.summary.total, 8);
assert.equal(state.summary.ready, 8);
assert.equal(state.summary.needs_adapter, 0);
assert.equal(state.summary.blocked, 0);
assert.deepEqual(summarizeCatalog(state.catalog), state.summary);

const audit = [];
const link = {
  async request(request) {
    assert.equal(request.type, 'catalog_state');
    assert.equal(request.summary.ready, 8);
    return { protocol: 'M3S1', version: 2, type: 'catalog_ack' };
  },
};

const published = await publishCoreCatalog({
  registry,
  link,
  audit: async (entry) => audit.push(entry),
});

assert.equal(published.result.type, 'catalog_ack');
assert.equal(audit.length, 1);
assert.equal(audit[0].event, 'catalog.publish');

const discovered = buildDefaultRegistry({
  manifests: [{
    app_id: 'infrared',
    display_name: 'Infrared',
    functions: {
      open: { risk: 'local_state' },
      send_profile: { risk: 'transmit', adapter_id: 'ir.send_profile' },
    },
  }],
  adapters: [{
    adapter_id: 'ir.send_profile',
    app_id: 'infrared',
    function: 'send_profile',
    risk: 'transmit',
    origin: 'generated',
    verification_status: 'staged',
  }],
});

const mixed = buildCoreCatalogState(discovered).summary;
assert.equal(mixed.total, 10);
assert.equal(mixed.ready, 8);
assert.equal(mixed.needs_adapter, 1);
assert.equal(mixed.blocked, 1);

console.log('catalog-summary tests: PASS');
