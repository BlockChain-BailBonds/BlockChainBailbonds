#!/usr/bin/env node
import http from 'node:http';
import {signEnvelope} from './transport.mjs';
import {constantTimeEqual} from './utils.mjs';

const host = process.env.S1R3N_MOCK_CORE_HOST ?? '127.0.0.1';
const port = Number(process.env.S1R3N_MOCK_CORE_PORT ?? 9184);
const key = process.env.S1R3N_CONTROL_KEY ?? '';
if (key.length < 32) throw new Error('S1R3N_CONTROL_KEY must be at least 32 characters');

const seenNonces = new Set();
let stopAsserted = true;
const state = {deck_online: true, safety_healthy: true, flipper_online: true};

function reply(response, status, value) {
  response.writeHead(status, {'content-type':'application/json', 'cache-control':'no-store'});
  response.end(`${JSON.stringify(value)}\n`);
}

async function body(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 262144) throw new Error('body too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function verify(envelope) {
  if (!envelope || envelope.version !== 1) throw new Error('invalid envelope version');
  if (envelope.route?.physical_owner !== 'deck-cyd' || envelope.route?.fallback_physical_route !== false) throw new Error('invalid physical route');
  if (!/^[a-f0-9]{32}$/.test(envelope.nonce) || seenNonces.has(envelope.nonce)) throw new Error('invalid or replayed nonce');
  const timestamp = Date.parse(envelope.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 30000) throw new Error('stale envelope');
  if (!constantTimeEqual(envelope.signature ?? '', signEnvelope(envelope, key))) throw new Error('invalid signature');
  seenNonces.add(envelope.nonce);
  if (seenNonces.size > 4096) seenNonces.delete(seenNonces.values().next().value);
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method !== 'POST') return reply(response, 405, {error:'method not allowed'});
    const envelope = await body(request);
    verify(envelope);
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/v1/status') return reply(response, 200, {...state, stop_asserted:stopAsserted, mock:true});
    if (url.pathname === '/v1/inventory') return reply(response, 200, {
      inventory_version:'1.0', nodes:[],
      flipper:{online:state.flipper_online, physical_owner:'deck-cyd', apps:['Loader','Infrared','NFC','Sub-GHz','125 kHz RFID']},
      mock:true,
    });
    if (url.pathname === '/v1/stop') { stopAsserted = true; return reply(response, 200, {asserted:true, mock:true}); }
    if (url.pathname === '/v1/resume') {
      if (!state.deck_online || !state.safety_healthy) return reply(response, 409, {error:'mesh unhealthy'});
      stopAsserted = false;
      return reply(response, 200, {asserted:false, mock:true});
    }
    if (url.pathname === '/v1/approvals') return reply(response, 200, {approved:false, reason:'mock denies physical output'});
    if (url.pathname === '/v1/jobs') {
      if (stopAsserted) return reply(response, 409, {error:'STOP asserted'});
      if (!state.deck_online || !state.safety_healthy || !state.flipper_online) return reply(response, 503, {error:'device mesh unavailable'});
      return reply(response, 200, {job_id:envelope.payload?.job_id, code:0, text:'MOCK CORE: routed to deck-cyd', mock:true});
    }
    return reply(response, 404, {error:'not found'});
  } catch (error) {
    return reply(response, 400, {error:error.message});
  }
});

server.listen(port, host, () => console.log(`M3rMa1d mock Core listening on http://${host}:${port}; STOP asserted`));
