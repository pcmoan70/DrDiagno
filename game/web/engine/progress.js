// Progress over finished cases kept in the browser (localStorage). Pure functions over the history
// array so they can be tested in node. Entry: {at, tier, seed, id, name, status, score, hours, spent, systems: [names]}.
export const HISTORY_MAX = 500;

export function addEntry(history, entry) {
  const h = history.filter((e) => !(e.tier === entry.tier && e.seed === entry.seed)); // a replayed code replaces its old result
  h.push(entry);
  return h.slice(-HISTORY_MAX);
}

const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

// Per-tier summary with a trend: average of the last 5 cases against the 5 before.
export function tierStats(history, tier) {
  const es = history.filter((e) => e.tier === tier);
  const won = es.filter((e) => e.status === 'won');
  const scores = es.map((e) => (e.status === 'won' ? e.score : 0));
  const last = scores.slice(-5), prev = scores.slice(-10, -5);
  return { tier, played: es.length, won: won.length, winRate: es.length ? won.length / es.length : 0, best: Math.max(0, ...won.map((e) => e.score)),
    recentAvg: avg(last), trend: prev.length ? avg(last) - avg(prev) : null, hoursAvg: won.length ? Math.round(avg(won.map((e) => e.hours)) * 10) / 10 : null };
}

// Organ systems ranked from hardest: lowest win rate first, then most played. Needs at least `min` cases.
export function topicStats(history, min = 1) {
  const m = new Map();
  for (const e of history) for (const s of e.systems || []) { const x = m.get(s) || { system: s, played: 0, won: 0 }; x.played++; if (e.status === 'won') x.won++; m.set(s, x); }
  return [...m.values()].filter((x) => x.played >= min).map((x) => ({ ...x, winRate: x.won / x.played })).sort((a, b) => a.winRate - b.winRate || b.played - a.played);
}

// Diseases not solved, most recent attempt first; solved later attempts remove a disease from the list.
export function missedDiseases(history) {
  const m = new Map();
  for (const e of history) {
    if (e.status === 'won') { m.delete(e.id); continue; }
    const x = m.get(e.id) || { id: e.id, name: e.name, misses: 0 };
    x.misses++; x.tier = e.tier; x.seed = e.seed; x.at = e.at; m.set(e.id, x);
  }
  return [...m.values()].sort((a, b) => b.at - a.at);
}
