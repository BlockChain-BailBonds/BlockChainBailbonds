import readline from 'node:readline/promises';
import {stdin as input, stdout as output} from 'node:process';

export class DenyApprovalService {
  async request() {
    return false;
  }
}

export class ConsoleApprovalService {
  constructor({timeoutMs = 60000} = {}) {
    this.timeoutMs = timeoutMs;
  }

  async request(job, deadline) {
    const remaining = Math.max(1, Math.min(this.timeoutMs, deadline - Date.now()));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    const rl = readline.createInterface({input, output});
    try {
      const answer = await rl.question(
        `Approve ${job.app_id || job.kind}.${job.function || job.operation} ` +
        `[risk=${job.risk}, asset=${job.frequency?.asset_id ?? 'n/a'}]? type YES: `,
        {signal: controller.signal},
      );
      return answer.trim() === 'YES';
    } catch (error) {
      if (error.name === 'AbortError') return false;
      throw error;
    } finally {
      clearTimeout(timer);
      rl.close();
    }
  }
}

export class RemoteDeckApprovalService {
  constructor({transport}) {
    this.transport = transport;
  }

  async request(job, deadline) {
    const result = await this.transport.requestApproval(job, deadline);
    return result?.approved === true;
  }
}
