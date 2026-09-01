import {createHmac, randomBytes} from 'node:crypto';
import {invariant, stableJson, withTimeout, nowIso} from './utils.mjs';

export function signEnvelope(envelope, key) {
  invariant(typeof key === 'string' && key.length >= 32, 'S1R3N_CONTROL_KEY must contain at least 32 characters');
  const unsigned = {...envelope};
  delete unsigned.signature;
  return createHmac('sha256', key).update(stableJson(unsigned)).digest('hex');
}

export function createEnvelope(type, payload, key) {
  const envelope = {
    version: 1,
    type,
    timestamp: nowIso(),
    nonce: randomBytes(16).toString('hex'),
    route: {logical_target: 'flipper', physical_owner: 'deck-cyd', fallback_physical_route: false},
    payload,
  };
  envelope.signature = signEnvelope(envelope, key);
  return envelope;
}

export class HttpCoreTransport {
  constructor({coreUrl, controlKey, timeoutMs = 15000, fetchImpl = globalThis.fetch}) {
    invariant(typeof fetchImpl === 'function', 'fetch unavailable');
    this.coreUrl = coreUrl.replace(/\/$/, '');
    this.controlKey = controlKey;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async send(path, type, payload, deadline) {
    const remaining = Math.max(1, Math.min(this.timeoutMs, deadline - Date.now()));
    invariant(remaining > 0, 'run deadline expired');
    const envelope = createEnvelope(type, payload, this.controlKey);
    return withTimeout(async (signal) => {
      const response = await this.fetch(`${this.coreUrl}${path}`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(envelope),
        signal,
      });
      const text = await response.text();
      let body = {};
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Core returned non-JSON HTTP ${response.status}`);
      }
      if (!response.ok) throw new Error(body.error ?? `Core HTTP ${response.status}`);
      return body;
    }, remaining, `Core ${type}`);
  }

  async execute(job, deadline) {
    invariant(job.target === 'flipper-link', 'job target must be flipper-link');
    return this.send('/v1/jobs', 'job.execute', job, deadline);
  }

  async requestApproval(job, deadline) {
    return this.send('/v1/approvals', 'approval.request', job, deadline);
  }

  async inventory(deadline = Date.now() + this.timeoutMs) {
    return this.send('/v1/inventory', 'inventory.request', {}, deadline);
  }

  async status(deadline = Date.now() + this.timeoutMs) {
    return this.send('/v1/status', 'status.request', {}, deadline);
  }

  async assertStop(reason, deadline = Date.now() + this.timeoutMs) {
    return this.send('/v1/stop', 'stop.assert', {reason}, deadline);
  }

  async clearStop(reason, deadline = Date.now() + this.timeoutMs) {
    return this.send('/v1/resume', 'stop.clear', {reason}, deadline);
  }
}

export class DryRunTransport {
  constructor({onJob = null} = {}) {
    this.onJob = onJob;
  }

  async execute(job) {
    await this.onJob?.(job);
    return {job_id: job.job_id, code: 0, text: 'DRY RUN: not sent to hardware', dry_run: true};
  }

  async requestApproval() {
    return {approved: false, reason: 'dry-run approval not granted'};
  }

  async inventory() {
    return {flipper: {online: false, physical_owner: 'deck-cyd', apps: []}, nodes: []};
  }

  async status() {
    return {deck_online: false, safety_healthy: false, stop_asserted: true, dry_run: true};
  }
}
