import {createHmac, randomBytes} from 'node:crypto';
import {constantTimeEqual, invariant, nowIso, stableJson, withTimeout} from './utils.mjs';

const ROUTE = Object.freeze({
  logical_target: 'flipper',
  physical_owner: 'deck-cyd',
  fallback_physical_route: false,
});

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
  invariant(route?.logical_target === ROUTE.logical_target, 'Core response logical route mismatch');
  invariant(route?.physical_owner === ROUTE.physical_owner, 'Core response physical owner mismatch');
  invariant(route?.fallback_physical_route === false, 'Core response attempted a fallback route');
}

export function verifyResponseEnvelope(envelope, requestEnvelope, key, clockSkewMs = 30000) {
  invariant(envelope && typeof envelope === 'object' && !Array.isArray(envelope), 'Core returned an invalid response envelope');
  invariant(envelope.version === 1, 'Core response version mismatch');
  invariant(typeof envelope.type === 'string' && envelope.type === `${requestEnvelope.type}.result`, 'Core response type mismatch');
  invariant(envelope.request_nonce === requestEnvelope.nonce, 'Core response nonce mismatch');
  validateRoute(envelope.route);
  const timestamp = Date.parse(envelope.timestamp);
  invariant(Number.isFinite(timestamp) && Math.abs(Date.now() - timestamp) <= clockSkewMs, 'Core response is stale');
  invariant(/^[a-f0-9]{64}$/.test(envelope.signature ?? ''), 'Core response signature is malformed');
  invariant(constantTimeEqual(envelope.signature, signEnvelope(envelope, key)), 'Core response signature is invalid');
  invariant(envelope.payload && typeof envelope.payload === 'object' && !Array.isArray(envelope.payload), 'Core response payload is invalid');
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
      'Core URL must use HTTPS, or explicit insecure-local HTTP on a private address');
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
        throw new Error(`Core returned non-JSON HTTP ${response.status}`);
      }
      if (!response.ok) {
        const message = body?.payload?.error ?? body?.error ?? `Core HTTP ${response.status}`;
        throw Object.assign(new Error(message), {statusCode: response.status});
      }
      return verifyResponseEnvelope(body, requestEnvelope, this.controlKey, this.clockSkewMs);
    }, remaining, `Core ${type}`);
  }

  async execute(job, deadline) {
    invariant(job?.target === 'flipper-link', 'job target must be flipper-link');
    invariant(job?.route?.physical_owner === 'deck-cyd' && job.route?.fallback_physical_route === false,
      'job route must be Deck-only');
    invariant(job?.flipper_program?.version === 1, 'materialized Flipper program is required');
    return this.send('/v1/jobs', 'job.execute', job, deadline);
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
