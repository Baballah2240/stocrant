import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Read-only integrity check. Reports counts without printing personal records.
const root = resolve(process.env.STOCRANT_DATA_DIR || '.');
const data = JSON.parse(readFileSync(join(root, 'data', 'stocrant.json'), 'utf8'));
const errors = [];
const warnings = [];
const collections = { stores: data.stores, zones: data.zones, people: data.people, ...data.collections };
for (const [name, records] of Object.entries(collections)) {
  if (!Array.isArray(records)) { errors.push(`${name}: expected an array`); continue; }
  const ids = new Set();
  for (const record of records) {
    if (!record || typeof record !== 'object' || !record.id) { errors.push(`${name}: invalid record or missing ID`); continue; }
    if (ids.has(record.id)) errors.push(`${name}: duplicate ID`);
    ids.add(record.id);
  }
}
const ids = name => new Set((collections[name] || []).map(record => record.id));
for (const [source, field, target] of [['stores','companyId','companies'], ['zones','storeId','stores'], ['people','storeId','stores'], ['employees','organizationId','companies'], ['accessUsers','roleId','accessRoles'], ['accessUsers','employeeId','employees'], ['inventoryItems','organizationId','companies'], ['inventoryMovements','inventoryItemId','inventoryItems'], ['financeTransactions','accountId','financeAccounts']]) {
  for (const record of collections[source] || []) if (record[field] && !ids(target).has(record[field])) warnings.push(`${source}: unresolved ${field}`);
}
const accounts = collections.accessUsers || [];
if (accounts.length && !accounts.some(account => account.roleId === 'role-main-manager' && account.status === 'active')) errors.push('No active main admin');
const emails = new Set();
for (const account of accounts) {
  const email = String(account.email || '').toLowerCase();
  if (emails.has(email)) errors.push('Duplicate account email');
  emails.add(email);
  if (!String(account.passwordHash || '').startsWith('scrypt$')) errors.push('Account has an invalid password hash format');
}
const attendance = new Set();
for (const record of collections.attendance || []) {
  const owner = record.accountId || record.employeeId;
  if (!owner) continue;
  const key = `${owner}:${record.date}`;
  if (attendance.has(key)) warnings.push('Duplicate daily attendance');
  attendance.add(key);
}
console.log(JSON.stringify({ collections: Object.keys(collections).length, records: Object.values(collections).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0), errors, warnings }, null, 2));
if (errors.length) process.exitCode = 1;
