import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {FrequencyResolver} from '../src/frequencies.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('transmit frequency resolves only from owned asset allowlist', async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 's1r3n-freq-'));
  const resolver = new FrequencyResolver({packageRoot:root, stateDir});
  assert.equal(await resolver.resolve({profile:'subghz.transmit.user_defined', region_profile:'US-LAB', asset_id:'gate-1', mode:'transmit'}), null);
  await resolver.registerOwnedAsset({
    assetId:'gate-1', source:'owner-maintained equipment record',
    frequencyProfiles:['subghz.transmit.user_defined'],
    frequencies:{'subghz.transmit.user_defined':315000000},
  });
  const resolved = await resolver.resolve({profile:'subghz.transmit.user_defined', region_profile:'US-LAB', asset_id:'gate-1', mode:'transmit'});
  assert.equal(resolved.frequency_hz, 315000000);
  assert.equal(resolved.approval, 'deck');
});
