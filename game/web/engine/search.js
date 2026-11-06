// Term search for the watch-along mode: HPO phenotypic abnormalities by name or lay name.
const ROOT = 'HP:0000118';
let cache = null;

function list(db) {
  if (cache) return cache;
  cache = [];
  for (const id in db.terms) {
    if (!db.ancestors(id).has(ROOT)) continue;
    const [name, lay] = db.terms[id];
    cache.push({ id, name, lay, key: (name + '\n' + (lay || '')).toLowerCase() });
  }
  return cache;
}

// Best n matches: exact-prefix matches first, then shorter names, then names used by more diseases.
export function searchTerms(db, query, n = 10, exclude = new Set()) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out = [];
  for (const e of list(db)) {
    if (exclude.has(e.id) || !e.key.includes(q)) continue;
    const prefix = e.name.toLowerCase().startsWith(q) || (e.lay || '').toLowerCase().startsWith(q) ? 0 : 1;
    out.push({ e, rank: prefix * 1000 + Math.min(e.name.length, 60) + db.specificity(e.id) * 20 });
  }
  return out.sort((a, b) => a.rank - b.rank).slice(0, n).map((x) => x.e);
}
