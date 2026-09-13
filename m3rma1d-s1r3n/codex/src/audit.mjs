import path from 'node:path';
import {appendFile, mkdir, readFile} from 'node:fs/promises';
import {sha256, stableJson, invariant, nowIso} from './utils.mjs';

export class AuditLog {
  constructor({stateDir}) {
    this.filePath = path.join(stateDir, 'audit.jsonl');
    this.lastHash = '0'.repeat(64);
    this.ready = false;
    this.queue = Promise.resolve();
  }

  async init() {
    if (this.ready) return;
    await mkdir(path.dirname(this.filePath), {recursive: true});
    try {
      const text = await readFile(this.filePath, 'utf8');
      const lines = text.trim().split('\n').filter(Boolean);
      if (lines.length) this.lastHash = JSON.parse(lines.at(-1)).hash;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    this.ready = true;
  }

  async write(event) {
    await this.init();
    this.queue = this.queue.then(async () => {
      const record = {timestamp: nowIso(), previous_hash: this.lastHash, ...event};
      record.hash = sha256(`${record.previous_hash}:${stableJson(record)}`);
      await appendFile(this.filePath, `${JSON.stringify(record)}\n`, {mode: 0o600});
      this.lastHash = record.hash;
      return record;
    });
    return this.queue;
  }

  async verify() {
    await this.init();
    let text;
    try {
      text = await readFile(this.filePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return {valid: true, records: 0, lastHash: '0'.repeat(64)};
      throw error;
    }
    let previous = '0'.repeat(64);
    let count = 0;
    for (const line of text.split('\n').filter(Boolean)) {
      const record = JSON.parse(line);
      invariant(record.previous_hash === previous, `audit chain broken at record ${count}`);
      const {hash, ...withoutHash} = record;
      const expected = sha256(`${previous}:${stableJson(withoutHash)}`);
      invariant(hash === expected, `audit hash mismatch at record ${count}`);
      previous = hash;
      count += 1;
    }
    return {valid: true, records: count, lastHash: previous};
  }
}
