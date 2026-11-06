// How strongly a candidate explains one finding term: the probability of the candidate's matching
// term (the finding itself or a more specific child), 0.6 of a more general parent's, or 0.
export function explainStrength(db, candidate, t) {
  const cand = candidate.t; // [[term, prob], ...]
  if (!candidate._anc) { candidate._anc = cand.map(([ct]) => db.ancestors(ct)); candidate._set = new Map(cand); }
  const anc = candidate._anc;
  let best = 0;
  for (let i = 0; i < cand.length; i++) if (anc[i].has(t) && cand[i][1] > best) best = cand[i][1];
  if (best === 0) for (const a of db.ancestors(t)) { const p = candidate._set.get(a); if (p !== undefined && a !== t && 0.6 * p > best) best = 0.6 * p; }
  return best;
}

// How well a candidate disease explains the findings collected so far.
export function fit(db, candidate, state) {
  const cand = candidate.t;
  if (!candidate._anc) { candidate._anc = cand.map(([ct]) => db.ancestors(ct)); candidate._set = new Map(cand); }
  const anc = candidate._anc;
  let got = 0, total = 0;
  const unexplained = [];
  for (const f of state.findings) {
    const w = db.idf(f.t);
    total += w;
    const best = explainStrength(db, candidate, f.t);
    if (best > 0) got += w * (0.5 + 0.5 * best); else unexplained.push(f.t);
  }
  // pertinent negatives: a test said the finding is absent but the candidate usually has it
  let penalty = 0;
  for (const n of state.negatives) {
    for (let i = 0; i < cand.length; i++) if (cand[i][1] >= 0.55 && anc[i].has(n.t)) { penalty += db.idf(n.t) * cand[i][1]; break; }
  }
  const score = total > 0 ? Math.max(0, (got - penalty) / total) : 0;
  return { id: candidate.id, score, explained: state.findings.length - unexplained.length, total: state.findings.length, unexplained };
}

// Venn view (Student tier): which of the patient's findings each of up to three candidates explains.
// Regions are keyed by a bitmask of the candidates (bit i set = ids[i] explains the finding); 0 = none.
export function vennSets(db, state, ids) {
  const ds = ids.map((id) => db.disease(id));
  const regions = new Map();
  for (const f of state.findings) {
    let mask = 0;
    ds.forEach((d, i) => { if (explainStrength(db, d, f.t) > 0) mask |= 1 << i; });
    if (!regions.has(mask)) regions.set(mask, []);
    regions.get(mask).push(f);
  }
  return regions;
}

export function rankDifferential(db, state) {
  return state.differential.filter((id) => db.has(id)).map((id) => fit(db, db.disease(id), state)).sort((a, b) => b.score - a.score);
}

// Top-n diseases over every loaded disease, by fit. Used by the consult action.
export function suggest(db, state, n = 6, pool = null) {
  const ids = pool || db.index.map((e) => e.i);
  const out = [];
  for (const id of ids) {
    if (!db.has(id)) continue;
    const r = fit(db, db.disease(id), state);
    if (r.score <= 0) continue;
    if (out.length < n) { out.push(r); out.sort((a, b) => b.score - a.score); }
    else if (r.score > out[n - 1].score) { out[n - 1] = r; out.sort((a, b) => b.score - a.score); }
  }
  return out;
}

// ---- Differential map: anonymised view of how much of the library still fits.
const PHENO_ROOT = 'HP:0000118';
let systemRoots = null; // the organ-system level of the HPO: direct children of "Phenotypic abnormality"
export function organSystems(db) {
  if (!systemRoots) systemRoots = Object.keys(db.terms).filter((id) => db.terms[id][2].includes(PHENO_ROOT));
  return systemRoots;
}
export function systemsOf(db, d) {
  if (!d._sys) { d._sys = new Set(); const roots = organSystems(db); for (const [t, p] of d.t) if (p >= 0.5) for (const r of roots) if (db.ancestors(t).has(r)) d._sys.add(r); }
  return d._sys;
}
// Hard exclusion: a present finding the disease is annotated as never having, or an absent finding
// the disease nearly always has.
export function isCut(db, d, state) {
  for (const n of d.neg) for (const f of state.findings) if (db.ancestors(f.t).has(n)) return true;
  for (const n of state.negatives) for (const [ct, p] of d.t) if (p >= 0.9 && db.ancestors(ct).has(n.t)) return true;
  return false;
}
export const MAP_MIN_FIT = 0.5;
// Diseases in the pool that still fit: not cut, and explaining at least half the weighted evidence.
// Findings caused by treatment are left out, so the true disease always stays compatible.
export function compatibleIds(db, state, pool) {
  const s = { findings: state.findings.filter((f) => f.src !== 'drug'), negatives: state.negatives };
  return pool.filter((id) => { const d = db.disease(id); return !(isCut(db, d, s) || (s.findings.length && fit(db, d, s).score < MAP_MIN_FIT)); });
}
export function differentialMap(db, state, pool) {
  const counts = new Map(organSystems(db).map((r) => [r, 0]));
  const ids = compatibleIds(db, state, pool);
  for (const id of ids) for (const r of systemsOf(db, db.disease(id))) counts.set(r, counts.get(r) + 1);
  const systems = [...counts].map(([id, count]) => ({ id, name: db.name(id).replace(/^Abnormality of (the )?/, ''), count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { total: pool.length, compatible: ids.length, systems };
}

// Coach (Student tier): unordered studies that best split the diseases still fitting. A study "probes" a
// disease when it can reveal one of the disease's frequent findings; the most useful study is the one
// whose probed / not-probed split is closest to even, so either outcome rules out the most.
export function suggestTests(db, state, pool, n = 3) {
  const ids = compatibleIds(db, state, pool);
  if (!ids.length) return [];
  const out = [];
  for (const test of db.tests) {
    if (state.tests[test.id] || !test.reveals?.length) continue;
    let probes = 0;
    for (const id of ids) { const d = db.disease(id); if (d.t.some(([t, p]) => p >= 0.5 && db.under(t, test.reveals))) probes++; }
    if (probes === 0 || probes === ids.length) continue;
    out.push({ id: test.id, probes, total: ids.length, gain: Math.min(probes, ids.length - probes) });
  }
  return out.sort((a, b) => b.gain - a.gain || db.testById.get(a.id).hours - db.testById.get(b.id).hours).slice(0, n);
}
