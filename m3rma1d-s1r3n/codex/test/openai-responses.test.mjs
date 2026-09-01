import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStructuredRequest, extractOutputText} from '../src/openai-responses.mjs';

const schema = {
  type: 'object',
  additionalProperties: false,
  required: ['run_id'],
  properties: {run_id: {type: 'string'}},
};

test('buildStructuredRequest creates a strict Responses API schema request without network access', () => {
  const body = buildStructuredRequest({
    model: 'gpt-5.6',
    store: false,
    reasoningEffort: 'high',
    instructions: 'Return one authorized ADL run.',
    input: '{"task":"read device information"}',
    schema,
    name: 'm3rma1d_adl',
    metadata: {component: 'contract-test'},
  });
  assert.equal(body.model, 'gpt-5.6');
  assert.equal(body.store, false);
  assert.equal(body.text.format.type, 'json_schema');
  assert.equal(body.text.format.strict, true);
  assert.deepEqual(body.text.format.schema, schema);
});

test('extractOutputText accepts structured output and rejects refusal', () => {
  assert.equal(extractOutputText({output:[{type:'message',content:[{type:'output_text',text:'{"run_id":"r1"}'}]}]}), '{"run_id":"r1"}');
  assert.throws(
    () => extractOutputText({output:[{type:'message',content:[{type:'refusal',refusal:'not permitted'}]}]}),
    /refused/,
  );
});
