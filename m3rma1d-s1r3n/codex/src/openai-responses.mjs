import {randomUUID} from 'node:crypto';
import {invariant, sleep, withTimeout} from './utils.mjs';

export function extractOutputText(response) {
  if (typeof response?.output_text === 'string' && response.output_text.length) return response.output_text;
  const chunks = [];
  for (const item of response?.output ?? []) {
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if (content.type === 'refusal') throw new Error(`OpenAI refused the request: ${content.refusal ?? 'unspecified reason'}`);
      if ((content.type === 'output_text' || content.type === 'text') && typeof content.text === 'string') chunks.push(content.text);
    }
  }
  return chunks.join('');
}

export function buildStructuredRequest({model, store, reasoningEffort, instructions, input, schema, name, images = [], metadata = {}}) {
  invariant(typeof model === 'string' && model.length > 0, 'OpenAI model is required');
  invariant(typeof instructions === 'string' && instructions.length > 0, 'OpenAI instructions are required');
  invariant(typeof input === 'string' && input.length > 0, 'OpenAI input is required');
  invariant(schema && typeof schema === 'object' && !Array.isArray(schema), 'JSON schema is required');
  invariant(/^[A-Za-z0-9_-]{1,64}$/.test(name), 'structured output schema name is invalid');
  invariant(Array.isArray(images) && images.length <= 8, 'at most eight images are allowed');

  const content = [{type: 'input_text', text: input}];
  for (const image of images) {
    invariant(typeof image === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(image), 'images must be PNG, JPEG, or WebP data URLs');
    content.push({type: 'input_image', image_url: image});
  }

  return {
    model,
    store: store === true,
    reasoning: {effort: reasoningEffort},
    metadata,
    input: [
      {role: 'system', content: [{type: 'input_text', text: instructions}]},
      {role: 'user', content},
    ],
    text: {format: {type: 'json_schema', name, strict: true, schema}},
  };
}

export class OpenAIResponsesClient {
  constructor(config, {fetchImpl = globalThis.fetch} = {}) {
    invariant(typeof fetchImpl === 'function', 'fetch is unavailable; Node 20 or newer is required');
    invariant(typeof config.apiKey === 'string' && config.apiKey.length >= 20, 'OPENAI_API_KEY is required');
    invariant(typeof config.baseUrl === 'string' && config.baseUrl.startsWith('https://'), 'OpenAI base URL must use HTTPS');
    this.fetch = fetchImpl;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
    this.store = config.store ?? false;
    this.reasoningEffort = config.reasoningEffort ?? 'high';
    this.timeoutMs = config.timeoutMs ?? 120000;
  }

  async structured({instructions, input, schema, name, images = [], metadata = {}}) {
    const body = buildStructuredRequest({
      model: this.model,
      store: this.store,
      reasoningEffort: this.reasoningEffort,
      instructions,
      input,
      schema,
      name,
      images,
      metadata,
    });

    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await withTimeout(async (signal) => {
          const result = await this.fetch(`${this.baseUrl}/responses`, {
            method: 'POST',
            headers: {
              authorization: `Bearer ${this.apiKey}`,
              'content-type': 'application/json',
              accept: 'application/json',
              'x-client-request-id': randomUUID(),
            },
            body: JSON.stringify(body),
            signal,
          });
          const raw = await result.text();
          let parsed;
          try {
            parsed = raw ? JSON.parse(raw) : {};
          } catch {
            throw Object.assign(new Error(`OpenAI returned non-JSON HTTP ${result.status}`), {retryable: result.status >= 500});
          }
          if (!result.ok) {
            const message = parsed?.error?.message ?? `OpenAI HTTP ${result.status}`;
            throw Object.assign(new Error(message), {retryable: result.status === 429 || result.status >= 500});
          }
          return parsed;
        }, this.timeoutMs, 'OpenAI response');

        const outputText = extractOutputText(response);
        invariant(outputText, 'OpenAI response contained no structured output');
        try {
          return {value: JSON.parse(outputText), responseId: response.id ?? null, raw: response};
        } catch (error) {
          throw new Error(`OpenAI structured output was invalid JSON: ${error.message}`);
        }
      } catch (error) {
        lastError = error;
        if (!error.retryable || attempt === 2) throw error;
        await sleep(500 * (2 ** attempt));
      }
    }
    throw lastError;
  }
}
