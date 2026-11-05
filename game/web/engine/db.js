// In-memory view over the JSON bundles. Synchronous once the needed shards are loaded.
export function createDb({ terms, index, tests, drugs }) {
  const t = terms.t;
  const byId = new Map(index.d.map((e) => [e.i, e]));
  const diseases = new Map();
  const ancCache = new Map();
  let maxIdf = 0;
  for (const k in t) if (t[k][3] > maxIdf) maxIdf = t[k][3];

  const db = {
    terms: t,
    N: terms.N,
    maxIdf,
    index: index.d,
    shards: index.shards,
    tests,
    testById: new Map(tests.map((x) => [x.id, x])),
    drugs: drugs.d,
    drugsByDisease: drugs.i,
    entry: (id) => byId.get(id),
    has: (id) => diseases.has(id),
    disease: (id) => {
      const d = diseases.get(id);
      if (!d) throw new Error(`disease ${id} not loaded`);
      return d;
    },
    addShard(obj) {
      for (const id in obj) diseases.set(id, { id, ...obj[id] });
    },
    shardOf: (id) => byId.get(id)?.h,
    name: (tid) => t[tid]?.[0] ?? tid,
    lay: (tid) => t[tid]?.[1] ?? null,
    label: (tid) => t[tid]?.[1] ?? t[tid]?.[0] ?? tid,
    idf: (tid) => t[tid]?.[3] ?? maxIdf,
    specificity: (tid) => (t[tid]?.[3] ?? maxIdf) / maxIdf,
    ancestors(tid) {
      let s = ancCache.get(tid);
      if (s) return s;
      s = new Set([tid]);
      const stack = [tid];
      while (stack.length) {
        const x = stack.pop();
        for (const p of t[x]?.[2] ?? []) if (!s.has(p)) { s.add(p); stack.push(p); }
      }
      ancCache.set(tid, s);
      return s;
    },
    under(tid, roots) {
      const a = this.ancestors(tid);
      for (const r of roots) if (a.has(r)) return true;
      return false;
    },
  };
  return db;
}

// Browser loader. baseUrl points at the folder holding data/ and content/.
export async function loadDb(baseUrl = '.') {
  const get = async (p) => {
    const r = await fetch(`${baseUrl}/${p}`);
    if (!r.ok) throw new Error(`${p}: ${r.status}`);
    return r.json();
  };
  const [terms, index, tests, drugs] = await Promise.all([
    get('data/terms.json'), get('data/diseases/index.json'), get('content/tests.json'), get('data/drugs.json'),
  ]);
  const db = createDb({ terms, index, tests, drugs });
  const pending = new Map();
  db.ensure = async (ids) => {
    const need = new Set();
    for (const id of ids) if (!db.has(id)) need.add(db.shardOf(id));
    await Promise.all([...need].filter((h) => h !== undefined).map((h) => {
      if (!pending.has(h)) pending.set(h, get(`data/diseases/shard-${String(h).padStart(2, '0')}.json`).then((o) => db.addShard(o)));
      return pending.get(h);
    }));
  };
  db.loadAll = async (onProgress) => {
    let done = 0;
    await Promise.all(Array.from({ length: db.shards }, (_, h) => get(`data/diseases/shard-${String(h).padStart(2, '0')}.json`).then((o) => { db.addShard(o); onProgress?.(++done, db.shards); })));
  };
  return db;
}
