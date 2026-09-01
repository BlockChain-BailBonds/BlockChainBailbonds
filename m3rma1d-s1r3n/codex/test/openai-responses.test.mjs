import test from 'node:test';
import assert from 'node:assert/strict';
import {OpenAIResponsesClient} from '../src/openai-responses.mjs';

const run = {
  adl_version:'2.0', run_id:'test-1', target:'flipper',
  authorization:{scope:'owned_asset', asset_id:'remote-1', purpose:'inventory', region_profile:'US-LAB'},
  resolution:{source_policy:'official_and_pinned'},
  steps:[{id:'info', kind:'capability', capability:'device_info'}],
};

test('structured response sends Responses API JSON schema format and parses output', async () => {
  let requestBody;
  const client = new OpenAIResponsesClient({apiKey:'test-key', baseUrl:'https://example.invalid/v1', model:'gpt-test', store:false, reasoningEffort:'high', timeoutMs:1000}, {
    fetchImpl: async (_url, init) => {
      requestBody = JSON.parse(init.body);
      return new Response(JSON.stringify({id:'resp_1', output:[{type:'message', content:[{type:'output_text', text:JSON.stringify(run)}]}]}), {status:200, headers:{'content-type':'application/json'}});
    },
  });
  const result = await client.structured({instructions:'plan safely', input:'inventory', schema:{type:'object'}, name:'test_schema'});
  assert.deepEqual(result.value, run);
  assert.equal(requestBody.text.format.type, 'json_schema');
  assert.equal(requestBody.text.format.strict, true);
  assert.equal(requestBody.store, false);
  assert.equal(requestBody.model, 'gpt-test');
});
