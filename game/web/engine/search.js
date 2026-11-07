// Fuzzy search shared by the finding box (watch-along) and the disease box (differential).
// A query matches an entry when every query token matches one of the entry's words: as a prefix
// (cost 0), as a substring (0.5), or within a small edit distance (1 per edit; 1 edit from 5 letters,
// 2 from 8). The whole query as a phrase inside the text beats everything (-1). Ties go to the
// caller's rank. Word order does not matter: "pain chest" finds Chest pain.
const ROOT = 'HP:0000118';

const strip = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const tokens = (s) => strip(s).split(/[^a-z0-9]+/).filter(Boolean);
const edits = (len) => (len >= 8 ? 2 : len >= 5 ? 1 : 0);

// Levenshtein distance of a and b if it is at most k, else Infinity (rows abandoned early).
function within(a, b, k) {
  if (Math.abs(a.length - b.length) > k) return Infinity;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v); if (v < rowMin) rowMin = v;
    }
    if (rowMin > k) return Infinity;
    prev = cur;
  }
  return prev[b.length] <= k ? prev[b.length] : Infinity;
}

// items: anything; textOf(item) -> all searchable text (name, synonyms, lay name).
export function makeIndex(items, textOf) {
  const vocab = new Set();
  const entries = items.map((item) => { const text = strip(textOf(item)); const words = [...new Set(tokens(text))]; for (const w of words) vocab.add(w); return { item, text, words }; });
  return { entries, words: [...vocab] };
}

// Cost of each vocabulary word for one query token, or absent when it does not match.
function wordCosts(words, t) {
  const m = new Map(), k = edits(t.length);
  for (const w of words) {
    if (w.startsWith(t)) m.set(w, 0);
    else if (t.length >= 4 && w.includes(t)) m.set(w, 0.5);
    else if (k) {
      let d = within(t, w, k);
      if (d === Infinity && w.length > t.length) { d = within(t, w.slice(0, t.length), k); if (d !== Infinity) d += 0.25; } // typo in the start of a longer word
      if (d !== Infinity) m.set(w, d);
    }
  }
  return m;
}

export function fuzzySearch(index, query, n, rank = () => 0, exclude = null) {
  const q = strip(query.trim()), qt = tokens(q);
  if (q.length < 2 || !qt.length) return [];
  const costs = qt.map((t) => wordCosts(index.words, t));
  const out = [];
  for (const e of index.entries) {
    if (exclude && exclude(e.item)) continue;
    let cost = -1;
    if (!e.text.includes(q)) {
      cost = 0;
      for (const m of costs) {
        let best = Infinity;
        for (const w of e.words) { const c = m.get(w); if (c !== undefined && c < best) best = c; }
        if (best === Infinity) { cost = Infinity; break; }
        cost += best;
      }
      if (cost === Infinity) continue;
    }
    out.push({ item: e.item, cost, r: rank(e.item) });
  }
  return out.sort((a, b) => a.cost - b.cost || a.r - b.r).slice(0, n).map((x) => x.item);
}

// ---- findings: HPO phenotypic abnormalities by name or lay name
let termIndex = null;
function terms(db) {
  if (termIndex) return termIndex;
  const items = [];
  for (const id in db.terms) {
    if (!db.ancestors(id).has(ROOT)) continue;
    const [name, lay] = db.terms[id];
    items.push({ id, name, lay });
  }
  return (termIndex = makeIndex(items, (e) => e.name + ' ' + (e.lay || '')));
}

// Best n matches: exact-prefix matches first, then shorter names, then names used by more diseases.
export function searchTerms(db, query, n = 10, exclude = new Set()) {
  const q = strip(query.trim());
  const rank = (e) => (strip(e.name).startsWith(q) || strip(e.lay || '').startsWith(q) ? 0 : 1000) + Math.min(e.name.length, 60) + db.specificity(e.id) * 20;
  return fuzzySearch(terms(db), query, n, rank, (e) => exclude.has(e.id));
}

// ---- diseases: index entries by name or synonym
let diseaseIndex = null;
export function searchDiseases(db, query, n = 8, exclude = new Set()) {
  diseaseIndex ||= makeIndex(db.index, (e) => e.n + ' ' + e.s.join(' '));
  const q = strip(query.trim());
  const rank = (e) => (strip(e.n).startsWith(q) ? 0 : e.s.some((s) => strip(s).startsWith(q)) ? 500 : 1000) + Math.min(e.n.length, 60) - Math.min(e.k, 40) / 10;
  return fuzzySearch(diseaseIndex, query, n, rank, (e) => exclude.has(e.i));
}
