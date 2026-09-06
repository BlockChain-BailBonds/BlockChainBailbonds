import {invariant} from './utils.mjs';

export class RemoteApprovalService {
  constructor({transport}) {
    invariant(transport && typeof transport.requestApproval === 'function', 'approval transport is required');
    this.transport = transport;
  }

  async request(job, deadline) {
    invariant(job?.job_id, 'approval request requires job_id');
    const response = await this.transport.requestApproval(job, deadline);
    invariant(response && typeof response === 'object' && !Array.isArray(response), 'invalid approval response');
    invariant(response.job_id === job.job_id, 'approval job mismatch');
    invariant(typeof response.approved === 'boolean', 'approval decision missing');

    if (!response.approved) return false;

    invariant(/^[A-Za-z0-9._:-]{8,128}$/.test(response.approval_id ?? ''), 'approval ID missing or malformed');
    const expiresAt = Date.parse(response.expires_at ?? '');
    invariant(Number.isFinite(expiresAt), 'approval expiration missing');
    invariant(expiresAt > Date.now() && expiresAt <= deadline, 'approval lease is invalid');
    invariant(response.physical_owner === 's3-cam', 'approval was not issued by the S3-CAM authority');
    return true;
  }
}

// Backward-compatible export name while callers migrate. This is no longer a Deck service.
export const RemoteDeckApprovalService = RemoteApprovalService;
