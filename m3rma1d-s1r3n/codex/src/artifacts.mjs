import path from 'node:path';
import {mkdir, readFile, writeFile, stat, unlink} from 'node:fs/promises';
import {atomicWriteJson, invariant, readJson, sha256, stableJson} from './utils.mjs';
import {validateAdapter} from './catalog.mjs';

const ALLOWED_ARTIFACT_KINDS = new Set(['adapter', 'script', 'infrared', 'subghz', 'nfc', 'rfid', 'config', 'library', 'flipper_app']);
const DENIED_EXTENSIONS = new Set(['.exe', '.dll', '.so', '.dylib', '.ps1', '.bat', '.cmd']);
const SHA256 = /^[a-f0-9]{64}$/;
const GIT_REVISION = /^[a-f0-9]{40}$/;

export class ArtifactStore {
  constructor({packageRoot, stateDir, allowNetwork = false, maxBytes = 1048576, allowedHosts = [], fetchImpl = globalThis.fetch}) {
    this.packageRoot = packageRoot;
    this.stateDir = stateDir;
    this.allowNetwork = allowNetwork;
    this.maxBytes = maxBytes;
    this.allowedHosts = new Set(allowedHosts);
    this.fetch = fetchImpl;
    this.artifactDir = path.join(stateDir, 'artifacts');
    this.manifestPath = path.join(stateDir, 'artifacts.json');
    this.libraryCatalogPath = path.join(packageRoot, 'catalog', 'libraries.json');
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    await mkdir(this.artifactDir, {recursive: true});
    try {
      this.manifest = JSON.parse(await readFile(this.manifestPath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      this.manifest = {manifest_version: '1.0', artifacts: {}};
      await atomicWriteJson(this.manifestPath, this.manifest);
    }
    this.libraries = (await readJson(this.libraryCatalogPath)).libraries;
    this.loaded = true;
  }

  async verifyAndStage(candidate, requestedSourcePolicy = 'official_and_pinned') {
    await this.load();
    invariant(candidate && ['adapter', 'script'].includes(candidate.type), 'unsupported generated artifact type');
    invariant(candidate.value && typeof candidate.value === 'object', 'generated artifact value required');
    if (candidate.type === 'adapter') validateAdapter(candidate.value);
    if (candidate.type === 'script') this.#validateScript(candidate.value);
    invariant(['local_only', 'pinned_only', 'official_and_pinned'].includes(requestedSourcePolicy), 'invalid requested source policy');

    const canonical = `${stableJson(candidate.value)}\n`;
    const digest = sha256(canonical);
    const id = candidate.type === 'adapter' ? candidate.value.adapter_id : candidate.value.script_id;
    const artifactId = `${candidate.type}:${id}:${digest.slice(0, 16)}`;
    const destination = path.join(this.artifactDir, `${artifactId.replace(/:/g, '_')}.json`);
    await writeFile(destination, canonical, {mode: 0o600, flag: 'wx'}).catch(async (error) => {
      if (error.code !== 'EEXIST') throw error;
      const existing = await readFile(destination);
      invariant(sha256(existing) === digest, `generated artifact collision: ${artifactId}`);
    });
    this.manifest.artifacts[artifactId] = {
      id: artifactId,
      kind: candidate.type,
      path: destination,
      sha256: digest,
      size: Buffer.byteLength(canonical),
      source_policy: 'generated_local',
      requested_source_policy: requestedSourcePolicy,
      response_id: candidate.response_id ?? null,
      created_at: new Date().toISOString(),
    };
    await atomicWriteJson(this.manifestPath, this.manifest);
    return {type: candidate.type, value: candidate.value, artifact_id: artifactId, sha256: digest, path: destination};
  }

  async stageLocalFile({id, kind, filePath, expectedSha256}) {
    await this.load();
    invariant(/^[A-Za-z0-9._:-]{1,64}$/.test(id), 'invalid artifact id');
    invariant(ALLOWED_ARTIFACT_KINDS.has(kind), 'invalid artifact kind');
    const extension = path.extname(filePath).toLowerCase();
    invariant(!DENIED_EXTENSIONS.has(extension), `artifact extension denied: ${extension}`);
    const info = await stat(filePath);
    invariant(info.isFile() && info.size > 0 && info.size <= this.maxBytes, 'artifact file size is outside the configured limit');
    const content = await readFile(filePath);
    const digest = sha256(content);
    if (expectedSha256) invariant(SHA256.test(expectedSha256) && digest === expectedSha256.toLowerCase(), 'artifact SHA-256 mismatch');
    const destination = path.join(this.artifactDir, `${id.replace(/:/g, '_')}${extension || '.bin'}`);
    await writeFile(destination, content, {mode: 0o600});
    this.manifest.artifacts[id] = {
      id,
      kind,
      path: destination,
      sha256: digest,
      size: content.length,
      source_policy: 'local_only',
      created_at: new Date().toISOString(),
    };
    await atomicWriteJson(this.manifestPath, this.manifest);
    return structuredClone(this.manifest.artifacts[id]);
  }

  async fetchPinned({id, kind, url, expectedSha256}) {
    await this.load();
    invariant(this.allowNetwork, 'network artifact fetching is disabled');
    invariant(SHA256.test(expectedSha256 ?? ''), 'network artifact requires a full SHA-256');
    invariant(typeof this.fetch === 'function', 'network fetch is unavailable');
    const parsed = new URL(url);
    invariant(parsed.protocol === 'https:' && this.allowedHosts.has(parsed.hostname), 'artifact source host denied');
    const response = await this.fetch(parsed, {redirect: 'error', headers: {'accept': 'application/octet-stream'}});
    invariant(response.ok, `artifact fetch failed: HTTP ${response.status}`);
    const length = Number(response.headers.get('content-length') ?? 0);
    invariant(!length || length <= this.maxBytes, 'artifact content-length exceeds limit');
    const content = Buffer.from(await response.arrayBuffer());
    invariant(content.length > 0 && content.length <= this.maxBytes, 'artifact size is outside the configured limit');
    invariant(sha256(content) === expectedSha256.toLowerCase(), 'artifact SHA-256 mismatch');
    const tempPath = path.join(this.artifactDir, `${id.replace(/:/g, '_')}.${process.pid}.download`);
    await writeFile(tempPath, content, {mode: 0o600, flag: 'wx'});
    try {
      return await this.stageLocalFile({id, kind, filePath: tempPath, expectedSha256});
    } finally {
      await unlink(tempPath).catch(() => {});
    }
  }

  async resolveArtifact(id) {
    await this.load();
    const entry = this.manifest.artifacts[id];
    if (!entry) return null;
    invariant(SHA256.test(entry.sha256 ?? ''), `artifact digest is malformed: ${id}`);
    const content = await readFile(entry.path);
    invariant(content.length === entry.size, `artifact size mismatch: ${id}`);
    invariant(sha256(content) === entry.sha256, `artifact integrity failure: ${id}`);
    return structuredClone(entry);
  }

  async readArtifactBytes(id) {
    const entry = await this.resolveArtifact(id);
    invariant(entry, `artifact unavailable: ${id}`);
    const bytes = await readFile(entry.path);
    invariant(bytes.length <= this.maxBytes, `artifact exceeds configured transfer limit: ${id}`);
    return {metadata: entry, bytes};
  }

  async resolveLibrary(id, sourcePolicy = 'official_and_pinned') {
    await this.load();
    if (sourcePolicy === 'local_only') return this.resolveArtifact(id);
    const library = this.libraries[id];
    if (!library) return null;
    invariant(library.trusted === true, `untrusted library denied: ${id}`);
    invariant(library.source_type === 'git' && GIT_REVISION.test(library.revision ?? ''), `library revision is not immutable: ${id}`);
    invariant(library.hash_scope === 'source_descriptor' && SHA256.test(library.sha256 ?? ''), `library descriptor digest missing: ${id}`);
    const descriptor = {
      id: library.id,
      source_type: library.source_type,
      url: library.url,
      revision: library.revision,
      ...(library.path ? {path: library.path} : {}),
    };
    invariant(sha256(stableJson(descriptor)) === library.sha256, `library descriptor integrity failure: ${id}`);
    if (sourcePolicy === 'official_and_pinned') {
      const parsed = new URL(library.url);
      invariant(parsed.protocol === 'https:' && parsed.hostname === 'github.com' && parsed.pathname.startsWith('/flipperdevices/'),
        `non-official library denied: ${id}`);
    }
    return structuredClone(library);
  }

  #validateScript(script) {
    invariant(script?.script_version === '1.0', 'unsupported script version');
    invariant(/^[A-Za-z0-9._:-]{1,64}$/.test(script.script_id), 'invalid script_id');
    invariant(['observe', 'local_state', 'physical_output', 'transmit', 'restricted'].includes(script.risk), 'invalid script risk');
    invariant(Array.isArray(script.steps) && script.steps.length > 0 && script.steps.length <= 128, 'invalid script steps');
    const encoded = stableJson(script);
    invariant(encoded.length <= 65536, 'script too large');
    invariant(!/(raw[_ -]?cli|shell|jamm|brute.?force|credential.?dump|access.?bypass)/i.test(encoded), 'script contains prohibited primitive');
  }
}
