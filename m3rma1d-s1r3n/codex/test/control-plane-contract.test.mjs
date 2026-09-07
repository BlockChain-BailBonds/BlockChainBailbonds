import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {HttpCoreTransport, signEnvelope} from '../src/transport.mjs';

const key = '0123456789abcdef0123456789abcdef';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(root, '..');
const route = {logical_target: 'flipper', physical_owner: 's3-cam', fallback_physical_route: false};

function signedResult(request, payload, mutate = null) {
  const response = {
    version: 1,
    type: `${request.type}.result`,
    timestamp: request.timestamp,
    request_nonce: request.nonce,
    route: {...route},
    payload,
  };
  if (mutate) mutate(response);
  response.signature = signEnvelope(response, key);
  return response;
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(body); },
  };
}

test('HttpCoreTransport binds every production operation to the signed S3-CAM route', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['x-s1r3n-protocol'], '1');
    const request = JSON.parse(init.body);
    assert.equal(request.signature, signEnvelope(request, key));
    assert.deepEqual(request.route, route);
    const pathname = new URL(url).pathname;
    seen.push([pathname, request.type]);

    let payload = {};
    if (request.type === 'status.request') payload = {physical_owner: 's3-cam', fallback_physical_route: false};
    else if (request.type === 'inventory.request') payload = {flipper: {online: true, physical_owner: 's3-cam', apps: []}};
    else if (request.type === 'job.execute') payload = {job_id: request.payload.job_id, code: 0, text: 'ok'};
    else if (request.type === 'approval.request') payload = {job_id: request.payload.job_id, accepted: true, approved: false};
    else if (request.type === 'stop.assert') payload = {asserted: true};
    else if (request.type === 'stop.clear') payload = {asserted: false};
    else if (request.type === 'artifact.begin') payload = {upload_id: 'upload-test-0001', chunk_size: 256};
    else if (request.type === 'artifact.chunk') {
      payload = {
        upload_id: request.payload.upload_id,
        next_offset: request.payload.offset + Buffer.from(request.payload.data_base64, 'base64').length,
      };
    } else if (request.type === 'artifact.commit') {
      payload = {id: request.payload.id, sha256: request.payload.sha256, staged: true};
    }
    return response(200, signedResult(request, payload));
  };

  const transport = new HttpCoreTransport({
    coreUrl: 'http://192.168.4.1',
    controlKey: key,
    allowInsecureLocalHttp: true,
    fetchImpl,
  });

  await transport.status();
  await transport.inventory();
  await transport.assertStop('test');
  await transport.clearStop('test');
  await transport.requestApproval({job_id: 'job-1'});
  await transport.execute({
    job_id: 'job-1',
    target: 'flipper-link',
    route,
    flipper_program: {version: 1, sha256: 'a'.repeat(64)},
  }, Date.now() + 5000);
  const bytes = Buffer.from('signed-artifact-contract');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  await transport.stageArtifact({id: 'artifact-1', kind: 'test', sha256, bytes}, Date.now() + 5000);

  assert.deepEqual(seen, [
    ['/v1/status', 'status.request'],
    ['/v1/inventory', 'inventory.request'],
    ['/v1/stop', 'stop.assert'],
    ['/v1/resume', 'stop.clear'],
    ['/v1/approvals', 'approval.request'],
    ['/v1/jobs', 'job.execute'],
    ['/v1/artifacts/begin', 'artifact.begin'],
    ['/v1/artifacts/chunk', 'artifact.chunk'],
    ['/v1/artifacts/commit', 'artifact.commit'],
  ]);
});

test('non-2xx S3 responses must still carry a valid correlated signature', async () => {
  const signedErrorTransport = new HttpCoreTransport({
    coreUrl: 'http://192.168.4.1',
    controlKey: key,
    allowInsecureLocalHttp: true,
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(init.body);
      return response(503, signedResult(request, {error: 'typed Flipper RPC inventory not implemented'}));
    },
  });
  await assert.rejects(() => signedErrorTransport.inventory(), (error) => {
    assert.equal(error.statusCode, 503);
    assert.match(error.message, /typed Flipper RPC inventory/);
    return true;
  });

  const tamperedErrorTransport = new HttpCoreTransport({
    coreUrl: 'http://192.168.4.1',
    controlKey: key,
    allowInsecureLocalHttp: true,
    fetchImpl: async (_url, init) => {
      const request = JSON.parse(init.body);
      const body = signedResult(request, {error: 'real error'});
      body.payload.error = 'forged error';
      return response(503, body);
    },
  });
  await assert.rejects(() => tamperedErrorTransport.inventory(), /signature is invalid/);
});

test('firmware and schema expose only the active signed S3-CAM contract', async () => {
  const [schemaText, firmware] = await Promise.all([
    readFile(path.join(root, 'schemas', 'core-envelope.schema.json'), 'utf8'),
    readFile(path.join(projectRoot, 'src', 'control_plane.cpp'), 'utf8'),
  ]);
  const schema = JSON.parse(schemaText);
  assert.equal(schema.properties.route.properties.physical_owner.const, 's3-cam');
  assert.equal(schema.properties.route.properties.logical_target.const, 'flipper');
  assert.equal(schema.properties.route.properties.fallback_physical_route.const, false);

  const required = [
    ['/v1/status', 'status.request'],
    ['/v1/inventory', 'inventory.request'],
    ['/v1/jobs', 'job.execute'],
    ['/v1/approvals', 'approval.request'],
    ['/v1/stop', 'stop.assert'],
    ['/v1/resume', 'stop.clear'],
    ['/v1/artifacts/begin', 'artifact.begin'],
    ['/v1/artifacts/chunk', 'artifact.chunk'],
    ['/v1/artifacts/commit', 'artifact.commit'],
  ];
  for (const [endpoint, type] of required) {
    assert.match(firmware, new RegExp(endpoint.replaceAll('/', '\\/')));
    assert.ok(firmware.includes(type), `firmware missing ${type}`);
  }
  for (const guard of ['mbedtls_md_hmac', 'replayed nonce', 'CONTROL_CLOCK_SKEW_MS', 'persisted replay watermark']) {
    assert.ok(firmware.includes(guard), `firmware missing ${guard}`);
  }
  assert.ok(!firmware.includes('deck-cyd'));
  assert.ok(!firmware.includes('c5-guardian'));
});
