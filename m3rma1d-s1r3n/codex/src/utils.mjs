import {createHash, randomUUID, timingSafeEqual} from 'node:crypto';
import {mkdir, readFile, writeFile, rename} from 'node:fs/promises';
import path from 'node:path';

export function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

export function sha256(value) {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return createHash('sha256').update(data).digest('hex');
}

export function stableJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

export function constantTimeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

export async function atomicWriteJson(filePath, value) {
  await mkdir(path.dirname(filePath), {recursive: true});
  const temp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, {mode: 0o600});
  await rename(temp, filePath);
}

export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`invalid boolean: ${value}`);
}

export function boundedInteger(value, fallback, min, max, name) {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value);
  invariant(Number.isInteger(parsed) && parsed >= min && parsed <= max, `invalid ${name}`);
  return parsed;
}

export function sanitizeId(value, fallback = 'run') {
  const normalized = String(value ?? '')
    .trim()
    .replace(/[^A-Za-z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return normalized || `${fallback}-${Date.now()}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export async function sleep(ms, signal) {
  if (ms <= 0) return;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason ?? new Error('aborted'));
    }, {once: true});
  });
}

export async function withTimeout(promiseFactory, timeoutMs, label = 'operation') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`${label} timed out`)), timeoutMs);
  try {
    return await promiseFactory(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
