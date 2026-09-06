import test from 'node:test';
import assert from 'node:assert/strict';

const base = process.env.S1R3N_CORE_URL ?? 'http://192.168.4.1';
const timeoutMs = Number(process.env.S1R3N_HARDWARE_TEST_TIMEOUT_MS ?? 8000);

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${base.replace(/\/$/, '')}${path}`, {...options, signal: controller.signal});
  } finally {
    clearTimeout(timer);
  }
}

async function health() {
  const response = await request('/health');
  assert.equal(response.status, 200, `GET /health returned ${response.status}`);
  const body = await response.json();
  assert.equal(body.name, 'M3rMa1d S1r3n');
  assert.equal(body.role, 'single-s3-cam');
  assert.equal(typeof body.stop, 'boolean');
  assert.equal(typeof body.camera, 'boolean');
  assert.equal(typeof body.flipper, 'boolean');
  return body;
}

test('actual reduced appliance reports the single-S3 role and real Flipper link', async () => {
  const state = await health();
  assert.equal(state.flipper, true, 'Flipper Expansion/RPC link is not online');
});

test('actual camera produces a JPEG snapshot when camera is ready', async () => {
  const state = await health();
  assert.equal(state.camera, true, 'camera is not ready');
  const response = await request('/snapshot.jpg');
  assert.equal(response.status, 200, `GET /snapshot.jpg returned ${response.status}`);
  assert.match(response.headers.get('content-type') ?? '', /^image\/jpeg/i);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.length > 128, `snapshot too small: ${bytes.length} bytes`);
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
  assert.equal(bytes.at(-2), 0xff);
  assert.equal(bytes.at(-1), 0xd9);
});

test('STOP is asserted over the real appliance and observable in health', async () => {
  const response = await request('/stop', {method: 'POST'});
  assert.equal(response.status, 200, `POST /stop returned ${response.status}`);
  assert.match(await response.text(), /STOPPED/i);
  const state = await health();
  assert.equal(state.stop, true, 'STOP did not remain asserted');
});

test('READY only clears STOP when both camera and Flipper are physically ready', async () => {
  const before = await health();
  const response = await request('/ready', {method: 'POST'});
  if (before.camera && before.flipper) {
    assert.equal(response.status, 200, `POST /ready returned ${response.status}`);
    assert.match(await response.text(), /READY/i);
    const after = await health();
    assert.equal(after.stop, false, 'READY did not clear STOP despite both dependencies being ready');
  } else {
    assert.equal(response.status, 409, 'READY must fail closed when camera or Flipper is unavailable');
  }
});

test('acceptance run leaves the appliance in fail-safe STOP', async () => {
  const response = await request('/stop', {method: 'POST'});
  assert.equal(response.status, 200);
  const state = await health();
  assert.equal(state.stop, true);
});
