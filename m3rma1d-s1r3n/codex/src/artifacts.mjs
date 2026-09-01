import path from 'node:path';
import {mkdir, readFile, writeFile, stat} from 'node:fs/promises';
import {atomicWriteJson, invariant, readJson, sha256, stableJson} from './utils.mjs';
import {validateAdapter} from './catalog.mjs';

const ALLOWED_ARTIFACT_KINDS = new Set(['adapter', 'script', 'infrared', 'subghz', 'nfc', 'rfid', 'config', 'library']);
const DENIED_EXTENSIONS = new Set(['.exe', '.dll', '.so', '.dylib', '.ps1', '.bat', '.cmd']);

export class ArtifactStore {
  constructor({packageRoot, stateDir, allowNetwork = false, maxBytes = 1048576, allowedHosts = []}) {
    this.packageRoot = packageRoot;
    this.stateDir = stateDir;
    this.allowNetwork = allowNetwork;
    this.maxBytes = maxBytes;
    this.allowedHosts = new Set(allowedHosts);
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
      this.manifest = {artifacts: {}};
    }
    this.libraries = (await readJson(this.libraryCatalogPath)).libraries;
    this.loaded = true;
  }

  async verifyAndStage(candidate, sourcePolicy = 'official_and_pinned') {
    await this.load();
    invariant(candidate && ['adapter', 'script'].includes(candidate.type), 'unsupported generated artifact type');
    invariant(candidate.value && typeof candidate.value === 'object', 'generated artifact value required');
    if (candidate.type === 'adapter') validateAdapter(candidate.value);
    if (candidate.type === 'script') this.#validateScript(candidate.value);
    invariant(['local_only', 'pinned_only', 'official_and_pinned'].includes(sourcePolicy), 'invalid source policy');

    const canonical = `${stableJson(candidate.value)}\n`;
    const digest = sha256(canonical);
    const id = candidate.type === 'adapter' ? candidate.value.adapter_id : candidate.value.script_id;
    const artifactId = `${candidate.type}:${id}:${digest.slice(0, 16)}`;
    const destination = path.join(this.artifactDir, `${artifactId.replace(/:/g, '_')}.json`);
    await writeFile(destination, canonical, {mode: 0o600});
    this.manifest.artifacts[artifactId] = {
      id: artifactId,
      kind: candidate.type,
      path: destination,
      sha256: digest,
      source_policy: sourcePolicy,
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
    invariant(info.isFile() && info.size <= this.maxBytes, 'artifact file exceeds limit');
    const content = await readFile(filePath);
    const digest = sha256(content);
    if (expectedSha256) invariant(digest === expectedSha256.toLowerCase(), 'artifact SHA-256 mismatch');
    const destination = path.join(this.artifactDir, `${id.replace(/:/g, '_')}${extension || '.bin'}`);
    await writeFile(destination, content, {mode: 0o600});
    this.manifest.artifacts[id] = {id, kind, path: destination, sha256: digest, size: content.length, source_policy: 'local_only', created_at: new Date().toISOString()};
    await atomicWriteJson(this.manifestPath, this.manifest);
    return structuredClone(this.manifest.artifacts[id]);
  }

  async fetchPinned({id, kind, url, expectedSha256}) {
    await this.load();
    invariant(this.allowNetwork, 'network artifact fetching is disabled');
    invariant(/^[a-f0-9]{64}$/i.test(expectedSha256), 'network artifact requires full SHA-256');
    const parsed = new URL(url);
    invariant(parsed.protocol === 'https:' && this.allowedHosts.has(parsed.hostname), 'artifact source host denied');
    const response = await fetch(parsed, {redirect: 'error'});
    invariant(response.ok, `artifact fetch failed: HTTP ${response.status}`);
    const length = Number(response.headers.get('content-length') ?? 0);
    invariant(!length || length <= this.maxBytes, 'artifact content-length exceeds limit');
    const content = Buffer.from(await response.arrayBuffer());
    invariant(content.length <= this.maxBytes, 'artifact exceeds limit');
    invariant(sha256(content) === expectedSha256.toLowerCase(), 'artifact SHA-256 mismatch');
    const tempPath = path.join(this.artifactDir, `${id.replace(/:/g, '_')}.download`);
    await writeFile(tempPath, content, {mode: 0o600});
    return this.stageLocalFile({id, kind, filePath: tempPath, expectedSha256});
  }

  async resolveArtifact(id) {
    await this.load();
    const entry = this.manifest.artifacts[id];
    if (!entry) return null;
    const content = await readFile(entry.path);
    invariant(sha256(content) === entry.sha256, `artifact integrity failure: ${id}`);
    return structuredClone(entry);
  }

  async resolveLibrary(id, sourcePolicy = 'official_and_pinned') {
    await this.load();
    const library = this.libraries[id];
    if (!library) return null;
    if (sourcePolicy === 'local_only') return this.resolveArtifact(id);
    invariant(library.trusted === true, `untrusted library denied: ${id}`);
    invariant(typeof library.sha256 === 'string' && library.sha256.length > 0, `unpinned library denied: ${id}`);
    if (sourcePolicy === 'official_and_pinned') {
      const host = new URL(library.url).hostname;
      invariant(host === 'github.com' && library.url.includes('/flipperdevices/'), `non-official library denied: ${id}`);
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
