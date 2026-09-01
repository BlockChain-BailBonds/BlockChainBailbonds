import http from 'node:http';
import {createService} from './factory.mjs';
import {constantTimeEqual} from './utils.mjs';

function json(response, status, body) {
  response.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
  response.end(`${JSON.stringify(body)}\n`);
}

async function readBody(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('request body too large'), {statusCode: 413});
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('invalid JSON body'), {statusCode: 400});
  }
}

function authorized(request, config) {
  if (!config.service.apiTokenRequired) return true;
  if (!config.service.apiToken) return false;
  const value = request.headers.authorization ?? '';
  const token = value.startsWith('Bearer ') ? value.slice(7) : '';
  return constantTimeEqual(token, config.service.apiToken);
}

const service = await createService();
if (service.config.service.apiTokenRequired && !service.config.service.apiToken) {
  throw new Error('S1R3N_API_TOKEN is required before starting the Codex HTTP service');
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET' && url.pathname === '/health') {
      return json(response, 200, {ok: true, service: service.config.service.name, dry_run: service.config.execution.dryRun});
    }
    if (!authorized(request, service.config)) return json(response, 401, {error: 'unauthorized'});

    if (request.method === 'GET' && url.pathname === '/v1/status') {
      const [stop, control] = await Promise.all([service.stop.snapshot(), service.transport.status()]);
      return json(response, 200, {stop, control, dry_run: service.config.execution.dryRun, active_runs: service.activeRuns});
    }
    if (request.method === 'GET' && url.pathname === '/v1/catalog') {
      return json(response, 200, await service.catalog.snapshot());
    }
    if (request.method === 'GET' && url.pathname === '/v1/audit/verify') {
      return json(response, 200, await service.audit.verify());
    }
    if (request.method === 'POST' && url.pathname === '/v1/inventory/refresh') {
      return json(response, 200, await service.inventory({refresh: true}));
    }

    const body = await readBody(request, service.config.service.requestBodyLimit);
    if (request.method === 'POST' && url.pathname === '/v1/plan') {
      return json(response, 200, await service.planTask(body));
    }
    if (request.method === 'POST' && url.pathname === '/v1/preview') {
      const adl = body.adl ?? await service.planTask(body);
      return json(response, 200, await service.previewAdl(adl));
    }
    if (request.method === 'POST' && url.pathname === '/v1/run') {
      const result = body.adl ? await service.runAdl(body.adl) : await service.runTask(body);
      return json(response, 200, result);
    }
    if (request.method === 'POST' && url.pathname === '/v1/stop') {
      return json(response, 200, await service.assertStop(body.reason ?? 'API stop'));
    }
    if (request.method === 'POST' && url.pathname === '/v1/resume') {
      return json(response, 200, await service.clearStop({authenticated: true, reason: body.reason ?? 'API resume'}));
    }
    if (request.method === 'POST' && url.pathname === '/v1/assets') {
      return json(response, 201, await service.frequencies.registerOwnedAsset(body));
    }
    return json(response, 404, {error: 'not found'});
  } catch (error) {
    const status = error.statusCode ?? 400;
    await service.audit.write({event: 'api.error', method: request.method, path: request.url, error: error.message}).catch(() => {});
    return json(response, status, {error: error.message});
  }
});

server.listen(service.config.service.bindPort, service.config.service.bindHost, () => {
  console.log(`${service.config.service.name} listening on http://${service.config.service.bindHost}:${service.config.service.bindPort}`);
  console.log(`dry_run=${service.config.execution.dryRun}; physical Flipper owner=deck-cyd`);
});
