import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb } from '../engine/db.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));

export function loadTestDb() {
  const db = createDb({ terms: read('data/terms.json'), index: read('data/diseases/index.json'), tests: read('content/tests.json'), drugs: read('data/drugs.json') });
  for (let h = 0; h < db.shards; h++) db.addShard(read(`data/diseases/shard-${String(h).padStart(2, '0')}.json`));
  return db;
}
