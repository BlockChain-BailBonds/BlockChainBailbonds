import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnvelope, signEnvelope, verifyResponseEnvelope} from '../src/transport.mjs';

const key = '0123456789abcdef0123456789abcdef';

test('execution envelopes are signed and permanently constrained to the CYD route', () => {
  const request = createEnvelope('status.request', {}, key);
  assert.equal(request.route.logical_target, 'flipper');
  assert.equal(request.route.physical_owner, 'deck-cyd');
  assert.equal(request.route.fallback_physical_route, false);
  assert.equal(request.signature, signEnvelope(request, key));

  const response = {
    version: 1,
    type: 'status.request.result',
    timestamp: new Date().toISOString(),
    request_nonce: request.nonce,
    route: {...request.route},
    payload: {deck_online: true},
  };
  response.signature = signEnvelope(response, key);
  assert.deepEqual(verifyResponseEnvelope(response, request, key), {deck_online: true});
});

test('response verification rejects a fallback physical route', () => {
  const request = createEnvelope('status.request', {}, key);
  const response = {
    version: 1,
    type: 'status.request.result',
    timestamp: new Date().toISOString(),
    request_nonce: request.nonce,
    route: {...request.route, fallback_physical_route: true},
    payload: {},
  };
  response.signature = signEnvelope(response, key);
  assert.throws(() => verifyResponseEnvelope(response, request, key), /fallback route/);
});
