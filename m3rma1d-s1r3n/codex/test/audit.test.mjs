import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {mkdtemp} from 'node:fs/promises';
import {AuditLog} from '../src/audit.mjs';

test('audit log forms a verifiable hash chain', async () => {
  const stateDir = await mkdtemp(path.join(os.tmpdir(), 's1r3n-audit-'));
  const audit = new AuditLog({stateDir});
  await audit.write({event:'one'});
  await audit.write({event:'two'});
  const result = await audit.verify();
  assert.equal(result.valid, true);
  assert.equal(result.records, 2);
});
