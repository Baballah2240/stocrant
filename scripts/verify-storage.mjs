import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const testRoot = mkdtempSync(join(tmpdir(), 'stocrant-storage-check-'));
const moduleUrl = pathToFileURL(resolve('dist/storage.js')).href;
const run = (root, script) => spawnSync(process.execPath, ['--input-type=module', '-e', `import { getStore, saveStore } from ${JSON.stringify(moduleUrl)}; ${script}`], { env: { ...process.env, NODE_ENV: 'production', STOCRANT_DATA_DIR: root }, encoding: 'utf8' });
try {
  const corruptRoot = join(testRoot, 'corrupt');
  mkdirSync(join(corruptRoot, 'data'), { recursive: true });
  const file = join(corruptRoot, 'data/stocrant.json');
  writeFileSync(file, '{invalid business data');
  const corrupt = run(corruptRoot, 'getStore();');
  assert.notEqual(corrupt.status, 0);
  assert.match(corrupt.stderr, /existing data has not been replaced/);
  assert.equal(readFileSync(file, 'utf8'), '{invalid business data');
  const freshRoot = join(testRoot, 'fresh');
  const fresh = run(freshRoot, 'const data = getStore(); if (data.stores.length || data.people.length || data.collections.employees.length || data.collections.companies.length || data.collections.financeAccounts.length) throw new Error("Production demo data must be empty"); saveStore(data);');
  assert.equal(fresh.status, 0, fresh.stderr);
  assert.ok(existsSync(join(freshRoot, 'data/backups', `stocrant-${new Date().toISOString().slice(0, 10)}.json`)));
  console.log('Storage verification passed: corrupt data preserved, fresh production empty, daily backup created.');
} finally {
  if (dirname(testRoot) !== resolve(tmpdir()) || !testRoot.includes('stocrant-storage-check-')) throw new Error('Unexpected storage test directory');
  rmSync(testRoot, { recursive: true, force: true });
}
