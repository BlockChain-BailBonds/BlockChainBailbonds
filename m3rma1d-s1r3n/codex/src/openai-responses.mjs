import {invariant, withTimeout} from './utils.mjs';

function extractOutputText(response) {
  if (typeof response?.output_text === 'string' && response.output_text.length) return response.output_text;
  const chunks = [];
  for (const item of response?.output ?? []) {
    if (item.type !== 'message') continue;
    for (const content of item.content ?? []) {
      if ((content.type === 'output_text' || content.type === 'text') && typeof content.text === 'string') {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join('');
}

export class OpenAIResponsesClient {
  constructor(config, {fetchImpl = globalThis.fetch} = {}) {
    invariant(typeof fetchImpl === 'function', 'fetch is unavailable; Node 20 or newer is required');
    this.fetch = fetchImpl;
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
    this.model = config.model;
    this.store = config.store ?? false;
    this.reasoningEffort = config.reasoningEffort ?? 'high';
    this.timeoutMs = config.timeoutMs ?? 120000;
  }

  async structured({instructions, input, schema, name, images = [], metadata = {}}) {
    invariant(this.apiKey, 'OPENAI_API_KEY is required for Codex planning');
    const content = [{type: 'input_text', text: input}];
    for (const image of images) {
      invariant(typeof image === 'string' && image.startsWith('data:image/'), 'images must be data URLs');
      content.push({type: 'input_image', image_url: image});
    }

    const body = {
      model: this.model,
      store: this.store,
      reasoning: {effort: this.reasoningEffort},
      metadata,
      input: [
        {role: 'system', content: [{type: 'input_text', text: instructions}]},
        {role: 'user', content},
      ],
      text: {
        format: {
          type: 'json_schema',
          name,
          strict: true,
          schema,
        },
      },
    };

    const response = await withTimeout(async (signal) => {
      const result = await this.fetch(`${this.baseUrl}/responses`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      });
      const raw = await result.text();
      let parsed;
      try {
        parsed = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(`OpenAI returned non-JSON HTTP ${result.status}`);
      }
      if (!result.ok) {
        const message = parsed?.error?.message ?? `OpenAI HTTP ${result.status}`;
        throw new Error(message);
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
  }
}

export {extractOutputText};
