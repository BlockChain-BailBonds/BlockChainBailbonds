import path from 'node:path';
import {atomicWriteJson, readJson, nowIso} from './utils.mjs';

export class StopState {
  constructor({stateDir}) {
    this.filePath = path.join(stateDir, 'stop.json');
    this.state = {asserted: true, reason: 'startup fail-closed', updated_at: nowIso()};
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    try {
      this.state = await readJson(this.filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await atomicWriteJson(this.filePath, this.state);
    }
    this.loaded = true;
  }

  async isAsserted() {
    await this.load();
    return this.state.asserted !== false;
  }

  async assert(reason = 'operator stop') {
    await this.load();
    this.state = {asserted: true, reason, updated_at: nowIso()};
    await atomicWriteJson(this.filePath, this.state);
    return structuredClone(this.state);
  }

  async clear({authenticated, deckOnline, safetyHealthy, reason = 'authorized resume'} = {}) {
    await this.load();
    if (!authenticated || !deckOnline || !safetyHealthy) {
      throw new Error('STOP clear requires authentication, Deck online, and healthy safety mesh');
    }
    this.state = {asserted: false, reason, updated_at: nowIso()};
    await atomicWriteJson(this.filePath, this.state);
    return structuredClone(this.state);
  }

  async snapshot() {
    await this.load();
    return structuredClone(this.state);
  }
}
