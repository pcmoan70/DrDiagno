// How well a candidate disease explains the findings collected so far.
export function fit(db, candidate, state) {
  const cand = candidate.t; // [[term, prob], ...]
  if (!candidate._anc) { candidate._anc = cand.map(([ct]) => db.ancestors(ct)); candidate._set = new Map(cand); }
  const anc = candidate._anc;
  let got = 0, total = 0;
  const unexplained = [];
  for (const f of state.findings) {
    const w = db.idf(f.t);
    total += w;
    const fAnc = db.ancestors(f.t);
    let best = 0;
    // candidate term is the finding itself or a more specific child of it
    for (let i = 0; i < cand.length; i++) if (anc[i].has(f.t) && cand[i][1] > best) best = cand[i][1];
    // or a more general parent of it (worth less)
    if (best === 0) for (const a of fAnc) { const p = candidate._set.get(a); if (p !== undefined && a !== f.t && 0.6 * p > best) best = 0.6 * p; }
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
