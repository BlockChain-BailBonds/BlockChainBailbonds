// Manifest-driven Flipper application/function registry for M3rMa1d S1r3n.
// Discovery may expose any installed app, but execution requires a verified adapter.

const ID = /^[A-Za-z0-9._:-]{1,64}$/;
const RISKS = new Set(['observe', 'local_state', 'physical_output', 'transmit', 'restricted']);
const VERIFIED = new Set(['verified', 'operator_verified', 'machine_verified']);

function assertId(value, name) {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error(`invalid ${name}`);
}

export class AppRegistry {
  constructor({ manifests = [], adapters = [], scripts = [] } = {}) {
    this.apps = new Map();
    this.adapters = new Map();
    this.scripts = new Map();
    for (const adapter of adapters) this.registerAdapter(adapter);
    for (const manifest of manifests) this.registerManifest(manifest);
    for (const script of scripts) this.registerScript(script);
  }

  registerAdapter(adapter) {
    if (!adapter || typeof adapter !== 'object') throw new Error('adapter object required');
    assertId(adapter.adapter_id, 'adapter_id');
    assertId(adapter.app_id, 'adapter.app_id');
    assertId(adapter.function, 'adapter.function');
    if (!RISKS.has(adapter.risk)) throw new Error(`invalid adapter risk: ${adapter.adapter_id}`);
    if (!['bundled', 'pinned', 'generated'].includes(adapter.origin)) throw new Error(`invalid adapter origin: ${adapter.adapter_id}`);
    if (![...VERIFIED, 'staged'].includes(adapter.verification_status)) throw new Error(`invalid adapter verification: ${adapter.adapter_id}`);
    if (adapter.autonomous_safe !== undefined && typeof adapter.autonomous_safe !== 'boolean') throw new Error(`invalid autonomous_safe: ${adapter.adapter_id}`);
    this.adapters.set(adapter.adapter_id, structuredClone(adapter));
  }

  registerManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') throw new Error('manifest object required');
    assertId(manifest.app_id, 'app_id');
    if (!manifest.functions || typeof manifest.functions !== 'object' || Array.isArray(manifest.functions)) {
      throw new Error(`functions required: ${manifest.app_id}`);
    }
    const functions = {};
    for (const [name, fn] of Object.entries(manifest.functions)) {
      assertId(name, `function ${manifest.app_id}`);
      if (!fn || typeof fn !== 'object') throw new Error(`invalid function ${manifest.app_id}.${name}`);
      if (!RISKS.has(fn.risk)) throw new Error(`invalid risk ${manifest.app_id}.${name}`);
      if (fn.adapter_id) assertId(fn.adapter_id, `adapter ${manifest.app_id}.${name}`);
      functions[name] = structuredClone(fn);
    }
    this.apps.set(manifest.app_id, {
      app_id: manifest.app_id,
      display_name: manifest.display_name ?? manifest.app_id,
      launch: manifest.launch ?? null,
      discovered: Boolean(manifest.discovered),
      functions,
    });
  }

  registerScript(script) {
    if (!script || typeof script !== 'object') throw new Error('script object required');
    assertId(script.script_id, 'script_id');
    if (!Array.isArray(script.steps) || script.steps.length === 0) throw new Error(`script steps required: ${script.script_id}`);
    if (!RISKS.has(script.risk)) throw new Error(`invalid script risk: ${script.script_id}`);
    this.scripts.set(script.script_id, structuredClone(script));
  }

  discoverInstalled(appNames = []) {
    const discovered = [];
    for (const raw of appNames) {
      if (typeof raw !== 'string' || !raw.trim()) continue;
      const normalized = raw.trim().toLowerCase().replace(/[^a-z0-9._:-]+/g, '_').slice(0, 64);
      if (!normalized || !ID.test(normalized)) continue;
      let app = this.apps.get(normalized);
      if (!app) {
        app = { app_id: normalized, display_name: raw.trim(), launch: { type: 'loader', name: raw.trim() }, discovered: true, functions: {} };
        this.apps.set(normalized, app);
      } else {
        app.discovered = true;
      }
      discovered.push(this.describeApp(app.app_id));
    }
    return discovered;
  }

  describeApp(appId) {
    const app = this.apps.get(appId);
    if (!app) return null;
    const functions = Object.fromEntries(Object.entries(app.functions).map(([name, fn]) => {
      const adapter = fn.adapter_id ? this.adapters.get(fn.adapter_id) : null;
      return [name, {
        risk: fn.risk,
        status: !fn.adapter_id ? 'needs_adapter' : VERIFIED.has(adapter?.verification_status) ? 'ready' : 'blocked',
        adapter_id: fn.adapter_id ?? null,
        autonomous_safe: Boolean(adapter?.autonomous_safe),
      }];
    }));
    return { app_id: app.app_id, display_name: app.display_name, launch: app.launch, discovered: app.discovered, functions };
  }

  catalog() {
    return [...this.apps.keys()].sort().map((id) => this.describeApp(id));
  }

  async resolveCapability(capability) {
    assertId(capability, 'capability');
    return this.resolveAppFunction('system', capability);
  }

  async resolveAppFunction(appId, functionName) {
    const app = this.apps.get(appId);
    const fn = app?.functions?.[functionName];
    if (!fn?.adapter_id) return null;
    const adapter = this.adapters.get(fn.adapter_id);
    if (!adapter || !VERIFIED.has(adapter.verification_status)) return null;
    return {
      app_id: appId,
      function: functionName,
      adapter_id: fn.adapter_id,
      adapter,
      risk: fn.risk,
      libraries: fn.libraries ?? [],
      frequency: fn.frequency ?? null,
    };
  }

  async getAdapter(adapterId) {
    return this.adapters.get(adapterId) ?? null;
  }

  async registerGeneratedAdapter(appId, functionName, staged) {
    if (!['operator_verified', 'machine_verified'].includes(staged?.verification_status)) {
      throw new Error('generated adapter must be machine-verified or operator-verified before registration');
    }
    const adapter = staged.adapter;
    this.registerAdapter({
      ...adapter,
      app_id: appId,
      function: functionName,
      origin: 'generated',
      verification_status: staged.verification_status,
      autonomous_safe: Boolean(staged.autonomous_safe ?? adapter.autonomous_safe),
    });
    const app = this.apps.get(appId) ?? { app_id: appId, display_name: appId, launch: null, discovered: false, functions: {} };
    app.functions[functionName] = { ...(app.functions[functionName] ?? {}), risk: adapter.risk, adapter_id: adapter.adapter_id };
    this.apps.set(appId, app);
  }

  async resolveScript(scriptId) {
    const script = this.scripts.get(scriptId);
    if (!script) return null;
    return { script, verification_status: script.verification_status ?? 'bundled_verified' };
  }

  async registerGeneratedScript(scriptId, staged) {
    if (!['operator_verified', 'machine_verified'].includes(staged?.verification_status)) {
      throw new Error('generated script must be machine-verified or operator-verified before registration');
    }
    this.registerScript({ ...staged.script, script_id: scriptId, verification_status: staged.verification_status });
  }
}

export const bundledManifestSet = [
  {
    app_id: 'system',
    display_name: 'System',
    functions: {
      help: { risk: 'observe', adapter_id: 'system.help' },
      device_info: { risk: 'observe', adapter_id: 'system.device_info' },
      storage_info: { risk: 'observe', adapter_id: 'system.storage_info' },
      loader_list: { risk: 'observe', adapter_id: 'system.loader_list' },
    },
  },
  {
    app_id: 'loader',
    display_name: 'App Loader',
    functions: {
      list: { risk: 'observe', adapter_id: 'loader.list' },
      info: { risk: 'observe', adapter_id: 'loader.info' },
      open_registered: { risk: 'local_state', adapter_id: 'loader.open_registered' },
      close: { risk: 'local_state', adapter_id: 'loader.close' },
    },
  },
];

export const bundledAdapters = [
  { adapter_id: 'system.help', app_id: 'system', function: 'help', risk: 'observe', origin: 'bundled', verification_status: 'verified', autonomous_safe: true },
  { adapter_id: 'system.device_info', app_id: 'system', function: 'device_info', risk: 'observe', origin: 'bundled', verification_status: 'verified', autonomous_safe: true },
  { adapter_id: 'system.storage_info', app_id: 'system', function: 'storage_info', risk: 'observe', origin: 'bundled', verification_status: 'verified', autonomous_safe: true },
  { adapter_id: 'system.loader_list', app_id: 'system', function: 'loader_list', risk: 'observe', origin: 'bundled', verification_status: 'verified', autonomous_safe: true },
  { adapter_id: 'loader.list', app_id: 'loader', function: 'list', risk: 'observe', origin: 'bundled', verification_status: 'verified', autonomous_safe: true },
  { adapter_id: 'loader.info', app_id: 'loader', function: 'info', risk: 'observe', origin: 'bundled', verification_status: 'verified', autonomous_safe: true },
  { adapter_id: 'loader.open_registered', app_id: 'loader', function: 'open_registered', risk: 'local_state', origin: 'bundled', verification_status: 'verified', autonomous_safe: true },
  { adapter_id: 'loader.close', app_id: 'loader', function: 'close', risk: 'local_state', origin: 'bundled', verification_status: 'verified', autonomous_safe: true },
];
