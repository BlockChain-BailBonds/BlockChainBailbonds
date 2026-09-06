// M3rMa1d S1r3n Gateway -> Core transport.
// Converts ADL jobs to bounded numeric firmware job identifiers and keeps
// human-readable run/step identifiers only in Gateway audit metadata.

const UINT32_MAX = 0xffffffff;

export function fnv1a32(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export class JobIdMap {
  constructor() {
    this.byHuman = new Map();
    this.byNumeric = new Map();
  }

  assign(runId, stepId, ordinal) {
    const human = `${runId}:${stepId}:${ordinal}`;
    if (this.byHuman.has(human)) return this.byHuman.get(human);

    let numeric = fnv1a32(human);
    if (numeric === 0) numeric = 1;
    const start = numeric;
    while (this.byNumeric.has(numeric) && this.byNumeric.get(numeric) !== human) {
      numeric = numeric === UINT32_MAX ? 1 : numeric + 1;
      if (numeric === start) throw new Error('numeric job id space exhausted');
    }

    this.byHuman.set(human, numeric);
    this.byNumeric.set(numeric, human);
    return numeric;
  }

  describe(numeric) {
    return this.byNumeric.get(numeric) ?? null;
  }
}

export class FlipperTransport {
  constructor({ link, stop, audit, now = () => Date.now() }) {
    if (!link?.request) throw new Error('link.request is required');
    this.link = link;
    this.stop = stop;
    this.audit = audit ?? (async () => {});
    this.now = now;
    this.ids = new JobIdMap();
    this.inflight = new Map();
  }

  async execute(job, deadline) {
    if (!job || typeof job !== 'object') throw new Error('job required');
    if (this.now() >= deadline) throw new Error('run lease expired');
    if (await this.stop?.isAsserted?.()) throw new Error('STOP asserted');

    const numericJobId = this.ids.assign(job.run_id, job.step_id, job.ordinal);
    if (this.inflight.has(numericJobId)) throw new Error(`duplicate in-flight job ${numericJobId}`);

    const timeoutMs = Math.max(100, Math.min(job.timeout_ms ?? 10000, deadline - this.now(), 120000));
    if (timeoutMs <= 0) throw new Error('job deadline expired');

    const request = {
      protocol: 'M3S1',
      version: 2,
      type: 'job_request',
      job_id: numericJobId,
      run_id: job.run_id,
      step_id: job.step_id,
      adapter_id: job.adapter_id,
      app_id: job.app_id ?? '',
      function: job.function ?? '',
      arguments: job.arguments ?? {},
      artifact_id: job.artifact_id ?? '',
      frequency: job.frequency ?? null,
      requires_approval: Boolean(job.requires_approval),
      timeout_ms: timeoutMs,
    };

    this.inflight.set(numericJobId, request);
    await this.audit({ event: 'transport.request', numeric_job_id: numericJobId, run_id: job.run_id, step_id: job.step_id });

    try {
      const result = await this.link.request(request, { timeoutMs, deadline });
      if (!result || result.job_id !== numericJobId) throw new Error('job result correlation failure');
      const normalized = {
        job_id: numericJobId,
        human_job_id: `${job.run_id}:${job.step_id}:${job.ordinal}`,
        code: Number.isInteger(result.code) ? result.code : -90,
        text: typeof result.text === 'string' ? result.text.slice(0, 512) : '',
        data: result.data ?? null,
      };
      await this.audit({ event: 'transport.result', numeric_job_id: numericJobId, result: normalized });
      return normalized;
    } finally {
      this.inflight.delete(numericJobId);
    }
  }

  async cancelAll(reason = 'STOP asserted') {
    const active = [...this.inflight.keys()];
    if (this.link.cancel) {
      for (const jobId of active) {
        await this.link.cancel({ protocol: 'M3S1', version: 2, type: 'stop', job_id: jobId, reason });
      }
    }
    await this.audit({ event: 'transport.cancel_all', count: active.length, reason });
  }
}
