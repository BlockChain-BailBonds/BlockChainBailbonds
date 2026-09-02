import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {boundedInteger, parseBoolean, readJson} from './utils.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');

function requiredValue(value, name, minimumLength = 1) {
  const text = String(value ?? '').trim();
  if (text.length < minimumLength || /^(replace|change|example|test|changeme)/i.test(text)) {
    throw new Error(`${name} is required and must not contain a placeholder value`);
  }
  return text;
}

export async function loadConfig(env = process.env) {
  const defaults = await readJson(path.join(packageRoot, 'config', 'default.json'));
  const stateDir = path.resolve(packageRoot, env.S1R3N_STATE_DIR ?? 'state');
  const apiToken = requiredValue(env.S1R3N_API_TOKEN, 'S1R3N_API_TOKEN', 32);
  const controlKey = requiredValue(env.S1R3N_CONTROL_KEY, 'S1R3N_CONTROL_KEY', 32);
  const openAiKey = requiredValue(env.OPENAI_API_KEY, 'OPENAI_API_KEY', 20);
  const coreUrl = requiredValue(env.S1R3N_CORE_URL, 'S1R3N_CORE_URL');

  return {
    packageRoot,
    stateDir,
    production: true,
    service: {
      name: defaults.service.name,
      version: defaults.service.version,
      bindHost: env.S1R3N_BIND_HOST ?? defaults.service.bind_host,
      bindPort: boundedInteger(env.S1R3N_BIND_PORT, defaults.service.bind_port, 1, 65535, 'bind port'),
      requestBodyLimit: defaults.service.request_body_limit,
      apiToken,
    },
    openai: {
      apiKey: openAiKey,
      baseUrl: (env.OPENAI_BASE_URL ?? defaults.openai.base_url).replace(/\/$/, ''),
      model: env.OPENAI_MODEL ?? defaults.openai.model,
      store: defaults.openai.store,
      reasoningEffort: env.OPENAI_REASONING_EFFORT ?? defaults.openai.reasoning_effort,
      timeoutMs: boundedInteger(env.OPENAI_TIMEOUT_MS, defaults.openai.timeout_ms, 1000, 600000, 'OpenAI timeout'),
    },
    execution: {
      maxConcurrentRuns: defaults.execution.max_concurrent_runs,
      maxRunMs: defaults.execution.max_run_ms,
      physicalOwner: 'deck-cyd',
      allowFallbackPhysicalRoute: false,
      requireSafetyQuorum: defaults.execution.require_safety_quorum,
      requiredSafetyNodes: defaults.execution.required_safety_nodes,
      requireFlipperOnline: true,
      requireDeckOnline: true,
    },
    policy: {
      allowGeneratedAdapterExecution: parseBoolean(
        env.S1R3N_ALLOW_GENERATED_ADAPTER_EXECUTION,
        defaults.policy.allow_generated_adapter_execution,
      ),
      requireVisionForGeneratedAdapters: defaults.policy.require_vision_for_generated_adapters,
    },
    artifacts: {
      allowNetwork: parseBoolean(env.S1R3N_ALLOW_NETWORK_ARTIFACTS, defaults.artifacts.allow_network),
      maxBytes: defaults.artifacts.max_bytes,
      allowedHosts: defaults.artifacts.allowed_hosts,
    },
    transport: {
      coreUrl,
      controlKey,
      timeoutMs: defaults.transport.timeout_ms,
      clockSkewMs: defaults.transport.clock_skew_ms,
      allowInsecureLocalHttp: parseBoolean(
        env.S1R3N_ALLOW_INSECURE_LOCAL_HTTP,
        defaults.transport.allow_insecure_local_http,
      ),
    },
    approvals: {
      timeoutMs: defaults.approvals.timeout_ms,
    },
    vision: {
      baseUrl: String(env.S1R3N_VISION_URL ?? '').trim(),
    },
    regionProfile: env.S1R3N_REGION_PROFILE ?? defaults.region_profile,
  };
}
