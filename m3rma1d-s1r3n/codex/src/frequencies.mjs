import path from 'node:path';
import {readJson, invariant, atomicWriteJson} from './utils.mjs';

export class FrequencyResolver {
  constructor({packageRoot, stateDir}) {
    this.catalogPath = path.join(packageRoot, 'catalog', 'frequencies.json');
    this.statePath = path.join(stateDir, 'frequencies.local.json');
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return;
    this.catalog = await readJson(this.catalogPath);
    try {
      const local = await readJson(this.statePath);
      this.catalog.assets = {...this.catalog.assets, ...(local.assets ?? {})};
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    this.loaded = true;
  }

  async resolve({profile, region_profile: regionProfile, asset_id: assetId, mode}) {
    await this.load();
    const region = this.catalog.regions[regionProfile];
    if (!region) return null;
    const definition = region.profiles[profile];
    if (!definition || !definition.modes.includes(mode)) return null;
    const asset = this.catalog.assets[assetId] ?? null;

    if (definition.requires_asset_allowlist && !asset?.frequency_profiles?.includes(profile)) return null;
    let frequencyHz = definition.frequency_hz ?? null;
    if (definition.requires_frequency_hz) {
      const configured = asset?.frequencies?.[profile];
      if (!Number.isInteger(configured) || configured <= 0) return null;
      frequencyHz = configured;
    }
    return {
      profile,
      region_profile: regionProfile,
      asset_id: assetId,
      medium: definition.medium,
      mode,
      frequency_hz: frequencyHz,
      carrier_hz: definition.carrier_hz ?? null,
      approval: definition.approval,
      source: asset?.source ?? 'catalog',
    };
  }

  async registerOwnedAsset({assetId, source, frequencyProfiles = [], frequencies = {}}) {
    await this.load();
    invariant(/^[A-Za-z0-9._:-]{1,64}$/.test(assetId), 'invalid asset id');
    invariant(typeof source === 'string' && source.length >= 3 && source.length <= 256, 'asset source required');
    for (const [profile, frequency] of Object.entries(frequencies)) {
      invariant(Number.isInteger(frequency) && frequency > 0, `invalid frequency for ${profile}`);
    }
    this.catalog.assets[assetId] = {
      source,
      frequency_profiles: [...new Set(frequencyProfiles)],
      frequencies,
      updated_at: new Date().toISOString(),
    };
    await atomicWriteJson(this.statePath, {assets: this.catalog.assets});
    return structuredClone(this.catalog.assets[assetId]);
  }
}
