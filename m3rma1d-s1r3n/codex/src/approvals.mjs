import {invariant} from './utils.mjs';

export class RemoteDeckApprovalService {
  constructor({transport}) {
    invariant(transport && typeof transport.requestApproval === 'function', 'Deck approval transport is required');
    this.transport = transport;
  }

  async request(job, deadline) {
    invariant(job?.job_id, 'approval request requires job_id');
    const response = await this.transport.requestApproval(job, deadline);
    invariant(response && typeof response === 'object' && !Array.isArray(response), 'invalid Deck approval response');
    invariant(response.job_id === job.job_id, 'Deck approval job mismatch');
    invariant(typeof response.approved === 'boolean', 'Deck approval decision missing');

    if (!response.approved) return false;

    invariant(/^[A-Za-z0-9._:-]{8,128}$/.test(response.approval_id ?? ''), 'Deck approval ID missing or malformed');
    const expiresAt = Date.parse(response.expires_at ?? '');
    invariant(Number.isFinite(expiresAt), 'Deck approval expiration missing');
    invariant(expiresAt > Date.now() && expiresAt <= deadline, 'Deck approval lease is invalid');
    invariant(response.physical_owner === 'deck-cyd', 'approval was not issued by the CYD Deck');
    return true;
  }
}
