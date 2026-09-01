import {loadConfig} from './config.mjs';
import {OpenAIResponsesClient} from './openai-responses.mjs';
import {CodexPlanner} from './planner.mjs';
import {CodexGenerator} from './generator.mjs';
import {CatalogService} from './catalog.mjs';
import {ArtifactStore} from './artifacts.mjs';
import {FrequencyResolver} from './frequencies.mjs';
import {AuditLog} from './audit.mjs';
import {StopState} from './stop.mjs';
import {RemoteDeckApprovalService} from './approvals.mjs';
import {HttpCoreTransport} from './transport.mjs';
import {MermaidCodexService} from './orchestrator.mjs';
import {VisionClient} from './vision.mjs';
import {validateRun} from '../../adl/codex-runner.mjs';

export async function createService({env = process.env, fetchImpl = globalThis.fetch, approvalService = null, transport = null} = {}) {
  const config = await loadConfig(env);
  const catalog = new CatalogService({packageRoot: config.packageRoot, stateDir: config.stateDir});
  const artifacts = new ArtifactStore({
    packageRoot: config.packageRoot,
    stateDir: config.stateDir,
    allowNetwork: config.artifacts.allowNetwork,
    maxBytes: config.artifacts.maxBytes,
    allowedHosts: config.artifacts.allowedHosts,
    fetchImpl,
  });
  const frequencies = new FrequencyResolver({packageRoot: config.packageRoot, stateDir: config.stateDir});
  const audit = new AuditLog({stateDir: config.stateDir});
  const stop = new StopState({stateDir: config.stateDir});

  const selectedTransport = transport ?? new HttpCoreTransport({...config.transport, fetchImpl});
  const approvals = approvalService ?? new RemoteDeckApprovalService({transport: selectedTransport});
  const vision = config.vision.baseUrl
    ? new VisionClient({baseUrl: config.vision.baseUrl, controlKey: config.transport.controlKey, fetchImpl})
    : null;

  const client = new OpenAIResponsesClient(config.openai, {fetchImpl});
  const planner = new CodexPlanner({client, packageRoot: config.packageRoot, validateRun});
  const generator = new CodexGenerator({client, packageRoot: config.packageRoot, catalogSnapshot: () => catalog.snapshot()});
  const service = new MermaidCodexService({
    config,
    planner,
    generator,
    catalog,
    artifacts,
    frequencies,
    audit,
    approvals,
    stop,
    transport: selectedTransport,
    vision,
  });
  return service.init();
}
