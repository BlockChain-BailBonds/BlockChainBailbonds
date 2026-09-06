import { AppRegistry, bundledAdapters, bundledManifestSet } from '../adl/app-registry.mjs';

export function summarizeCatalog(entries = []) {
  let ready = 0;
  let needsAdapter = 0;
  let blocked = 0;
  let total = 0;

  for (const app of entries) {
    for (const fn of Object.values(app?.functions ?? {})) {
      total++;
      if (fn.status === 'ready') ready++;
      else if (fn.status === 'needs_adapter') needsAdapter++;
      else blocked++;
    }
  }

  return {
    total,
    ready,
    needs_adapter: needsAdapter,
    blocked,
  };
}

export function buildDefaultRegistry({ manifests = [], adapters = [], scripts = [] } = {}) {
  return new AppRegistry({
    manifests: [...bundledManifestSet, ...manifests],
    adapters: [...bundledAdapters, ...adapters],
    scripts,
  });
}

export function buildCoreCatalogState(registry) {
  if (!registry?.catalog) throw new Error('registry.catalog is required');
  const catalog = registry.catalog();
  return {
    protocol: 'M3S1',
    version: 2,
    type: 'catalog_state',
    catalog,
    summary: summarizeCatalog(catalog),
  };
}

export async function publishCoreCatalog({ registry, link, audit = async () => {} }) {
  if (!link?.request) throw new Error('link.request is required');
  const state = buildCoreCatalogState(registry);
  const result = await link.request(state, { timeoutMs: 5000 });
  if (!result || result.type !== 'catalog_ack') throw new Error('catalog acknowledgement required');
  if (result.version !== 2) throw new Error('catalog acknowledgement version mismatch');
  await audit({ event: 'catalog.publish', summary: state.summary });
  return { state, result };
}
