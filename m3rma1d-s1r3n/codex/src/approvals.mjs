import {invariant} from './utils.mjs';

export class PointClickApprovalService {
  constructor({timeoutMs = 60000} = {}) {
    this.timeoutMs = timeoutMs;
    this.pending = new Map();
  }

  async request(job, deadline) {
    invariant(job?.job_id, 'approval request requires job_id');
    const expiresAt = Math.min(deadline, Date.now() + this.timeoutMs);
    invariant(expiresAt > Date.now(), 'approval lease expired');
    invariant(!this.pending.has(job.job_id), `duplicate pending approval: ${job.job_id}`);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(job.job_id);
        resolve(false);
      }, Math.max(1, expiresAt - Date.now()));
      timer.unref?.();
      this.pending.set(job.job_id, {
        job_id: job.job_id,
        run_id: job.run_id,
        step_id: job.step_id,
        app_id: job.app_id,
        function: job.function,
        risk: job.risk,
        expires_at: new Date(expiresAt).toISOString(),
        resolve: (approved) => {
          clearTimeout(timer);
          this.pending.delete(job.job_id);
          resolve(Boolean(approved));
        },
      });
    });
  }

  list() {
    const now = Date.now();
    return [...this.pending.values()]
      .filter((item) => Date.parse(item.expires_at) > now)
      .map(({resolve, ...item}) => ({...item}));
  }

  decide({job_id, approved, operator_id}) {
    invariant(typeof job_id === 'string' && job_id.length > 0, 'job_id is required');
    invariant(typeof approved === 'boolean', 'approved must be boolean');
    invariant(typeof operator_id === 'string' && operator_id.length > 0, 'operator_id is required');
    const item = this.pending.get(job_id);
    invariant(item, `pending approval not found: ${job_id}`);
    invariant(Date.parse(item.expires_at) > Date.now(), 'approval lease expired');
    item.resolve(approved);
    return {job_id, approved, operator_id, decided_at: new Date().toISOString()};
  }
}

export class RemoteApprovalService {
  constructor({transport}) {
    invariant(transport && typeof transport.requestApproval === 'function', 'approval transport is required');
    this.transport = transport;
  }
  async request(job, deadline) {
    const response = await this.transport.requestApproval(job, deadline);
    invariant(response?.job_id === job.job_id && typeof response.approved === 'boolean', 'invalid approval response');
    return response.approved;
  }
}

export const RemoteDeckApprovalService = RemoteApprovalService;
