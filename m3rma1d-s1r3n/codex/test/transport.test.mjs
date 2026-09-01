import test from 'node:test';
import assert from 'node:assert/strict';
import {HttpCoreTransport, signEnvelope} from '../src/transport.mjs';

test('transport signs a Deck-only route and sends no fallback path', async () => {
  let envelope;
  const key = '0123456789abcdef0123456789abcdef';
  const transport = new HttpCoreTransport({
    coreUrl:'http://core.test', controlKey:key, timeoutMs:1000,
    fetchImpl: async (url, init) => {
      assert.equal(url, 'http://core.test/v1/jobs');
      envelope = JSON.parse(init.body);
      return new Response(JSON.stringify({job_id:'r:0', code:0, text:'ok'}), {status:200});
    },
  });
  const result = await transport.execute({job_id:'r:0', target:'flipper-link'}, Date.now()+1000);
  assert.equal(result.code, 0);
  assert.equal(envelope.route.physical_owner, 'deck-cyd');
  assert.equal(envelope.route.fallback_physical_route, false);
  assert.equal(envelope.signature, signEnvelope(envelope, key));
});
