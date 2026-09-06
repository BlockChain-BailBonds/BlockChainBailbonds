import http from 'node:http';
import {createService} from './factory.mjs';
import {constantTimeEqual} from './utils.mjs';

function corsHeaders(request, config) {
  const origin = String(request.headers.origin ?? '');
  if (!origin || !config.service.corsOrigins.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'access-control-max-age': '600',
    'vary': 'Origin',
  };
}

function json(request, response, config, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...corsHeaders(request, config),
  });
  response.end(`${JSON.stringify(body)}\n`);
}

async function readBody(request, limit) {
  if (!String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
    throw Object.assign(new Error('content-type must be application/json'), {statusCode: 415});
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('request body too large'), {statusCode: 413});
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('body must be an object');
    return parsed;
  } catch (error) {
    throw Object.assign(new Error(`invalid JSON body: ${error.message}`), {statusCode: 400});
  }
}

function authorized(request, config) {
  const value = request.headers.authorization ?? '';
  const token = value.startsWith('Bearer ') ? value.slice(7) : '';
  return constantTimeEqual(token, config.service.apiToken);
}

function requestErrorStatus(error) {
  if (Number.isInteger(error.statusCode)) return error.statusCode;
  if (/timeout|unavailable|offline|failed|stale|signature|connection|network|fetch/i.test(error.message)) return 503;
  return 422;
}

const service = await createService();

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'OPTIONS') {
      const origin = String(request.headers.origin ?? '');
      if (!origin || !service.config.service.corsOrigins.includes(origin)) {
        return json(request, response, service.config, 403, {error: 'origin not allowed'});
      }
      response.writeHead(204, corsHeaders(request, service.config));
      return response.end();
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return json(request, response, service.config, 200, {
        ok: true,
        service: service.config.service.name,
        version: service.config.service.version,
        production: true,
      });
    }

    if (!authorized(request, service.config)) return json(request, response, service.config, 401, {error: 'unauthorized'});

    if (request.method === 'GET' && url.pathname === '/ready') {
      const readiness = await service.readiness({requireStopCleared: false});
      return json(request, response, service.config, readiness.ready ? 200 : 503, readiness);
    }
    if (request.method === 'GET' && url.pathname === '/v1/status') {
      const readiness = await service.readiness({requireStopCleared: false});
      return json(request, response, service.config, 200, {...readiness, active_runs: service.activeRuns});
    }
    if (request.method === 'GET' && url.pathname === '/v1/catalog') {
      return json(request, response, service.config, 200, await service.catalog.snapshot());
    }
    if (request.method === 'GET' && url.pathname === '/v1/audit/verify') {
      return json(request, response, service.config, 200, await service.audit.verify());
    }
    if (request.method === 'GET' && url.pathname === '/v1/approvals/pending') {
      return json(request, response, service.config, 200, {pending: service.approvals.list()});
    }

    if (request.method !== 'POST') return json(request, response, service.config, 404, {error: 'not found'});
    const body = await readBody(request, service.config.service.requestBodyLimit);

    if (url.pathname === '/v1/inventory/refresh') {
      return json(request, response, service.config, 200, await service.inventory({refresh: true}));
    }
    if (url.pathname === '/v1/plan') {
      return json(request, response, service.config, 200, await service.planTask(body));
    }
    if (url.pathname === '/v1/preview') {
      const adl = body.adl ?? await service.planTask(body);
      return json(request, response, service.config, 200, await service.previewAdl(adl));
    }
    if (url.pathname === '/v1/run') {
      const result = body.adl ? await service.runAdl(body.adl) : await service.runTask(body);
      return json(request, response, service.config, 200, result);
    }
    if (url.pathname === '/v1/approvals/decision') {
      const decision = service.approvals.decide(body);
      await service.audit.write({event: 'approval.decided', ...decision});
      return json(request, response, service.config, 200, decision);
    }
    if (url.pathname === '/v1/stop') {
      return json(request, response, service.config, 200, await service.assertStop(body.reason ?? 'API stop'));
    }
    if (url.pathname === '/v1/resume') {
      if (body.confirm !== 'RESUME') throw Object.assign(new Error('resume requires confirm=RESUME'), {statusCode: 400});
      return json(request, response, service.config, 200, await service.clearStop({authenticated: true, reason: body.reason ?? 'API resume'}));
    }
    if (url.pathname === '/v1/assets') {
      return json(request, response, service.config, 201, await service.frequencies.registerOwnedAsset(body));
    }
    if (url.pathname === '/v1/adapters/promote') {
      const promoted = await service.catalog.promoteGeneratedAdapter(body);
      await service.audit.write({
        event: 'adapter.promoted',
        adapter_id: promoted.adapter_id,
        sha256: promoted.sha256,
        verified_by: promoted.verified_by,
        test_evidence_sha256: promoted.test_evidence_sha256,
      });
      return json(request, response, service.config, 200, promoted);
    }
    if (url.pathname === '/v1/scripts/promote') {
      const promoted = await service.catalog.promoteGeneratedScript(body);
      await service.audit.write({
        event: 'script.promoted',
        script_id: promoted.script_id,
        sha256: promoted.sha256,
        verified_by: promoted.verified_by,
        test_evidence_sha256: promoted.test_evidence_sha256,
      });
      return json(request, response, service.config, 200, promoted);
    }
    return json(request, response, service.config, 404, {error: 'not found'});
  } catch (error) {
    const status = requestErrorStatus(error);
    await service.audit.write({event: 'api.error', method: request.method, path: request.url, error: error.message, status}).catch(() => {});
    return json(request, response, service.config, status, {error: error.message, ...(error.readiness ? {readiness: error.readiness} : {})});
  }
});

server.requestTimeout = 130000;
server.headersTimeout = 15000;
server.keepAliveTimeout = 5000;
server.maxRequestsPerSocket = 100;

server.listen(service.config.service.bindPort, service.config.service.bindHost, () => {
  console.log(`${service.config.service.name} ${service.config.service.version} listening on http://${service.config.service.bindHost}:${service.config.service.bindPort}`);
  console.log('production=true; physical Flipper owner=s3-cam; fallback route=false');
});

async function shutdown(signal) {
  console.log(`${signal}: asserting STOP and closing service`);
  service.appWatcher?.stop?.();
  await service.assertStop(`host shutdown: ${signal}`).catch((error) => console.error(`remote STOP failed: ${error.message}`));
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
