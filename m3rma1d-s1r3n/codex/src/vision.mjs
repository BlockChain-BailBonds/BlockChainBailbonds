import {invariant, withTimeout} from './utils.mjs';

export class VisionClient {
  constructor({baseUrl, controlKey, timeoutMs = 10000, fetchImpl = globalThis.fetch}) {
    this.baseUrl = baseUrl?.replace(/\/$/, '');
    this.controlKey = controlKey;
    this.timeoutMs = timeoutMs;
    this.fetch = fetchImpl;
  }

  async capture() {
    invariant(this.baseUrl, 'Vision URL is not configured');
    return withTimeout(async (signal) => {
      const response = await this.fetch(`${this.baseUrl}/v1/capture`, {
        headers: this.controlKey ? {'x-s1r3n-key': this.controlKey} : {},
        signal,
      });
      if (!response.ok) throw new Error(`Vision HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') ?? 'image/jpeg';
      invariant(contentType.startsWith('image/'), 'Vision endpoint did not return an image');
      const bytes = Buffer.from(await response.arrayBuffer());
      invariant(bytes.length > 0 && bytes.length <= 4 * 1024 * 1024, 'Vision frame size invalid');
      return `data:${contentType};base64,${bytes.toString('base64')}`;
    }, this.timeoutMs, 'Vision capture');
  }
}
