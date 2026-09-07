import {createHash, createHmac, randomBytes} from 'node:crypto';
import {constantTimeEqual, invariant, nowIso, stableJson, withTimeout} from './utils.mjs';

const ROUTE = Object.freeze({
  logical_target: 'flipper',
  physical_owner: 's3-cam',
  fallback_physical_route: false,
});
const SHA256 = /^[a-f0-9]{64}$/;

function unsignedEnvelope(envelope) {
  const copy = {...envelope};
  delete copy.signature;
  return copy;
}

export function signEnvelope(envelope, key) {
  invariant(typeof key === 'string' && key.length >= 32, 'S1R3N_CONTROL_KEY must contain at least 32 characters');
  return createHmac('sha256', key).update(stableJson(unsignedEnvelope(envelope))).digest('hex');
}

export function createEnvelope(type, payload, key) {
  invariant(/^[A-Za-z0-9._:-]{1,64}$/.test(type), 'invalid envelope type');
  invariant(payload && typeof payload === 'object' && !Array.isArray(payload), 'envelope payload must be an object');
  const envelope = {
    version: 1,
    type,
    timestamp: nowIso(),
    nonce: randomBytes(16).toString('hex'),
    route: {...ROUTE},
    payload,
  };
  envelope.signature = signEnvelope(envelope, key);
  return envelope;
}

function isPrivateHost(hostname) {
  if (hostname === 'localhost' || hostname === '::1' || hostname.endsWith('.local')) return true;
  if (/^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname)) return true;
  const match = /^172\.(\d{1,2})\./.exec(hostname);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

function validateRoute(route) {
  invariant(route?.logical_target === ROUTE.logical_target, 'S3-CAM response logical route mismatch');
  invariant(route?.physical_owner === ROUTE.physical_owner, 'S3-CAM response physical owner mismatch');
  invariant(route?.fallback_physical_route === false, 'S3-CAM response attempted a fallback route');
}

export function verifyResponseEnvelope(envelope, requestEnvelope, key, clockSkewMs = 30000) {
  invariant(envelope && typeof envelope === 'object' && !Array.isArray(envelope), 'S3-CAM returned an invalid response envelope');
  invariant(envelope.version === 1, 'S3-CAM response version mismatch');
  invariant(typeof envelope.type === 'string' && envelope.type === `${requestEnvelope.type}.result`, 'S3-CAM response type mismatch');
  invariant(envelope.request_nonce === requestEnvelope.nonce, 'S3-CAM response nonce mismatch');
  validateRoute(envelope.route);
  const timestamp = Date.parse(envelope.timestamp);
  invariant(Number.isFinite(timestamp) && Math.abs(Date.now() - timestamp) <= clockSkewMs, 'S3-CAM response is stale');
  invariant(SHA256.test(envelope.signature ?? ''), 'S3-CAM response signature is malformed');
  invariant(constantTimeEqual(envelope.signature, signEnvelope(envelope, key)), 'S3-CAM response signature is invalid');
  invariant(envelope.payload && typeof envelope.payload === 'object' && !Array.isArray(envelope.payload), 'S3-CAM response payload is invalid');
  return envelope.payload;
}

export class HttpCoreTransport {
  constructor({
    coreUrl,
    controlKey,
    timeoutMs = 15000,
    clockSkewMs = 30000,
    allowInsecureLocalHttp = false,
    fetchImpl = globalThis.fetch,
  }) {
    invariant(typeof fetchImpl === 'function', 'fetch unavailable');
    invariant(typeof coreUrl === 'string' && coreUrl.length > 0, 'S1R3N_CORE_URL is required for hardware execution');
    invariant(typeof controlKey === 'string' && controlKey.length >= 32, 'S1R3N_CONTROL_KEY must contain at least 32 characters');
    const parsed = new URL(coreUrl);
    invariant(parsed.protocol === 'https:' || (parsed.protocol === 'http:' && allowInsecureLocalHttp && isPrivateHost(parsed.hostname)),
      'S3-CAM URL must use HTTPS, or explicit insecure-local HTTP on a private address');
    this.coreUrl = parsed.toString().replace(/\/$/, '');
    this.controlKey = controlKey;
    this.timeoutMs = timeoutMs;
    this.clockSkewMs = clockSkewMs;
    this.fetch = fetchImpl;
  }

  async send(path, type, payload, deadline = Date.now() + this.timeoutMs) {
    const remaining = Math.min(this.timeoutMs, deadline - Date.now());
    invariant(Number.isFinite(remaining) && remaining > 0, 'run deadline expired');
    const requestEnvelope = createEnvelope(type, payload, this.controlKey);

    return withTimeout(async (signal) => {
      const response = await this.fetch(`${this.coreUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept': 'application/json',
          'cache-control': 'no-store',
          'x-s1r3n-protocol': '1',
        },
        body: JSON.stringify(requestEnvelope),
        signal,
      });

      const text = await response.text();
      let body;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`S3-CAM returned non-JSON HTTP ${response.status}`);
      }

      // Success and operational error responses are both authenticated. This
      // prevents an intermediary from replacing a real signed S3 result with
      // an unsigned error body that the host would otherwise trust.
      const verifiedPayload = verifyResponseEnvelope(body, requestEnvelope, this.controlKey, this.clockSkewMs);
      if (!response.ok) {
        const message = verifiedPayload?.error ?? `S3-CAM HTTP ${response.status}`;
        throw Object.assign(new Error(message), {statusCode: response.status, payload: verifiedPayload});
      }
      return verifiedPayload;
    }, remaining, `S3-CAM ${type}`);
  }

  async execute(job, deadline) {
    invariant(job?.target === 'flipper-link', 'job target must be flipper-link');
    invariant(job?.route?.physical_owner === 's3-cam' && job.route?.fallback_physical_route === false,
      'job route must be S3-CAM-only');
    invariant(job?.flipper_program?.version === 1, 'materialized Flipper program is required');
    invariant(SHA256.test(job.flipper_program.sha256 ?? ''), 'Flipper program digest is missing');
    return this.send('/v1/jobs', 'job.execute', job, deadline);
  }

  async stageArtifact({id, kind, sha256, bytes}, deadline) {
    invariant(/^[A-Za-z0-9._:-]{1,64}$/.test(id), 'artifact transfer ID is invalid');
    invariant(typeof kind === 'string' && kind.length > 0, 'artifact transfer kind is invalid');
    invariant(SHA256.test(sha256 ?? ''), 'artifact transfer SHA-256 is invalid');
    invariant(Buffer.isBuffer(bytes) && bytes.length > 0, 'artifact transfer bytes are required');
    invariant(createHash('sha256').update(bytes).digest('hex') === sha256, 'artifact transfer bytes do not match SHA-256');

    const begin = await this.send('/v1/artifacts/begin', 'artifact.begin', {
      id, kind, sha256, size: bytes.length, requested_chunk_size: 4096,
    }, deadline);
    invariant(/^[A-Za-z0-9._:-]{8,128}$/.test(begin?.upload_id ?? ''), 'S3-CAM did not return a valid artifact upload ID');
    const chunkSize = Number.isInteger(begin.chunk_size) ? begin.chunk_size : 4096;
    invariant(chunkSize >= 256 && chunkSize <= 16384, 'S3-CAM returned an unsafe artifact chunk size');

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize));
      const chunkSha256 = createHash('sha256').update(chunk).digest('hex');
      const response = await this.send('/v1/artifacts/chunk', 'artifact.chunk', {
        upload_id: begin.upload_id,
        id,
        offset,
        data_base64: chunk.toString('base64'),
        chunk_sha256: chunkSha256,
      }, deadline);
      invariant(response?.upload_id === begin.upload_id && response?.next_offset === offset + chunk.length,
        `S3-CAM artifact upload offset mismatch for ${id}`);
    }

    const committed = await this.send('/v1/artifacts/commit', 'artifact.commit', {
      upload_id: begin.upload_id,
      id,
      sha256,
      size: bytes.length,
    }, deadline);
    invariant(committed?.id === id && committed?.sha256 === sha256 && committed?.staged === true,
      `S3-CAM did not confirm artifact integrity for ${id}`);
    return committed;
  }

  requestApproval(job, deadline) {
    return this.send('/v1/approvals', 'approval.request', job, deadline);
  }

  inventory(deadline = Date.now() + this.timeoutMs) {
    return this.send('/v1/inventory', 'inventory.request', {}, deadline);
  }

  status(deadline = Date.now() + this.timeoutMs) {
    return this.send('/v1/status', 'status.request', {}, deadline);
  }

  assertStop(reason, deadline = Date.now() + this.timeoutMs) {
    return this.send('/v1/stop', 'stop.assert', {reason}, deadline);
  }

  clearStop(reason, deadline = Date.now() + this.timeoutMs) {
    return this.send('/v1/resume', 'stop.clear', {reason}, deadline);
  }
}
