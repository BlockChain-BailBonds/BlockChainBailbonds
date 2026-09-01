import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readJson, parseBoolean, boundedInteger} from './utils.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');

export async function loadConfig(env = process.env) {
  const defaults = await readJson(path.join(packageRoot, 'config', 'default.json'));
  const stateDir = path.resolve(packageRoot, env.S1R3N_STATE_DIR ?? 'state');
  return {
    packageRoot,
    stateDir,
    service: {
      name: defaults.service.name,
      bindHost: env.S1R3N_BIND_HOST ?? defaults.service.bind_host,
      bindPort: boundedInteger(env.S1R3N_BIND_PORT, defaults.service.bind_port, 1, 65535, 'bind port'),
      requestBodyLimit: defaults.service.request_body_limit,
      apiToken: env.S1R3N_API_TOKEN ?? '',
      apiTokenRequired: defaults.service.api_token_required !== false,
    },
    openai: {
      apiKey: env.OPENAI_API_KEY ?? '',
      baseUrl: (env.OPENAI_BASE_URL ?? defaults.openai.base_url).replace(/\/$/, ''),
      model: env.OPENAI_MODEL ?? defaults.openai.model,
      store: defaults.openai.store,
      reasoningEffort: env.OPENAI_REASONING_EFFORT ?? defaults.openai.reasoning_effort,
      timeoutMs: boundedInteger(env.OPENAI_TIMEOUT_MS, defaults.openai.timeout_ms, 1000, 600000, 'OpenAI timeout'),
    },
    execution: {
      dryRun: parseBoolean(env.S1R3N_DRY_RUN, defaults.execution.dry_run),
      maxConcurrentRuns: defaults.execution.max_concurrent_runs,
      maxRunMs: defaults.execution.max_run_ms,
      physicalOwner: defaults.execution.physical_owner,
      allowFallbackPhysicalRoute: defaults.execution.allow_fallback_physical_route,
    },
    artifacts: {
      allowNetwork: parseBoolean(env.S1R3N_ALLOW_NETWORK_ARTIFACTS, defaults.artifacts.allow_network),
      maxBytes: defaults.artifacts.max_bytes,
      allowedHosts: defaults.artifacts.allowed_hosts,
    },
    transport: {
      coreUrl: env.S1R3N_CORE_URL ?? defaults.transport.core_url,
      controlKey: env.S1R3N_CONTROL_KEY ?? '',
      timeoutMs: defaults.transport.timeout_ms,
      clockSkewMs: defaults.transport.clock_skew_ms,
    },
    approvals: {
      mode: env.S1R3N_APPROVAL_MODE ?? defaults.approvals.mode,
      timeoutMs: defaults.approvals.timeout_ms,
    },
    vision: {
      baseUrl: env.S1R3N_VISION_URL ?? '',
    },
    regionProfile: env.S1R3N_REGION_PROFILE ?? 'US-LAB',
  };
}
