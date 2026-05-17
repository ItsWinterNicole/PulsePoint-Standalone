import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { initDb, normalizeEntityName, upsertEntity } from '../db.js';

const importDir = path.resolve(process.cwd(), process.argv[2] || './data/imports');

function coerce(value) {
  if (value === undefined || value === null || value === '') return null;
  const v = String(value);
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  const t = v.trim();
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try { return JSON.parse(t); } catch {}
  }
  return value;
}

function importFile(file) {
  const match = path.basename(file).match(/^(.+)_export\.csv$/);
  if (!match) return { skipped: true };
  const entity = normalizeEntityName(match[1]);
  const content = fs.readFileSync(file, 'utf8');
  const records = parse(content, { columns: true, skip_empty_lines: true, bom: true, relax_quotes: true, relax_column_count: true });
  let count = 0;
  for (const rec of records) {
    const doc = {};
    for (const [k, v] of Object.entries(rec)) doc[k] = coerce(v);
    const id = doc.id || crypto.randomUUID();
    upsertEntity(entity, id, doc);
    count += 1;
  }
  return { entity, count };
}

initDb();
if (!fs.existsSync(importDir)) {
  console.error(`Import folder not found: ${importDir}`);
  process.exit(1);
}

const files = fs.readdirSync(importDir).filter((f) => f.endsWith('_export.csv')).map((f) => path.join(importDir, f));
if (!files.length) {
  console.error(`No *_export.csv files found in ${importDir}`);
  process.exit(1);
}

for (const file of files) {
  const result = importFile(file);
  if (!result.skipped) console.log(`Imported ${result.count} rows into ${result.entity}`);
}
console.log('CSV import complete.');
