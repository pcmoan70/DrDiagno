// Balance bot: plays cases with a greedy strategy and prints win rate, actions and hours per tier.
import { loadTestDb } from './helpers.js';
import { pickDisease, createCase, orderTest, commit, addCandidate, consult } from '../engine/case.js';
import { rankDifferential, suggest } from '../engine/scoring.js';
import { makeRng } from '../engine/rng.js';

const db = loadTestDb();
const N = Number(process.argv[2] || 300);
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

function chooseTest(state) {
  const ranked = rankDifferential(db, state).slice(0, 6);
  const found = new Set(state.findings.map((f) => f.t));
  let best = null, bestV = -1;
  for (const test of db.tests) {
    if (state.tests[test.id] || test.special) continue;
    const cover = ranked.map((r) => db.disease(r.id).t.filter(([t]) => !found.has(t) && db.under(t, test.reveals)).reduce((s, [t, p]) => s + db.idf(t) * p, 0));
    const spread = Math.max(...cover) - Math.min(...cover);
    const v = (spread + 0.3 * cover.reduce((s, x) => s + x, 0) / cover.length) / (1 + test.hours / 12);
    if (v > bestV) { bestV = v; best = test; }
  }
  return best;
}

console.log(`Bot run at ${new Date().toISOString()} (${N} cases per tier)`);
for (const tier of ['resident', 'attending', 'house']) {
  const stats = { won: 0, lostTime: 0, lostWrong: 0, actions: [], hours: [], spent: [], score: [] };
  for (let i = 0; i < N; i++) {
    const seed = `bot${i}`;
    const id = pickDisease(db, { tier, seed });
    const s = createCase(db, { tier, seed, id });
    const rng = makeRng(seed);
    // honest start: a quick exam, then ask the literature for candidates
    orderTest(db, s, 'ex_vitals'); orderTest(db, s, 'hx_onset');
    for (const c of consult(db, s, suggest)) addCandidate(s, c);
    let steps = 2, truthSeen = s.differential.includes(id);
    while (s.status === 'open') {
      if (steps % 4 === 0) for (const c of consult(db, s, suggest)) addCandidate(s, c);
      if (!s.differential.length) { commit(db, s, rng.pick(db.index).i); break; }
      const ranked = rankDifferential(db, s);
      const [top, second] = ranked;
      if ((steps >= 3 && top.score >= 0.55 && top.score - (second?.score ?? 0) >= 0.15) || steps >= 14 || s.stability < 20) { commit(db, s, top.id); break; }
      const t = chooseTest(s);
      if (!t) { commit(db, s, top.id); break; }
      orderTest(db, s, t.id); steps++;
    }
    if (s.status === 'won') stats.won++; else if (s.committed) stats.lostWrong++; else stats.lostTime++;
    if (s.differential.includes(id)) stats.truth = (stats.truth || 0) + 1;
    stats.actions.push(steps); stats.hours.push(s.clock); stats.spent.push(s.spent); stats.score.push(s.score ?? 0);
  }
  console.log(`${tier.padEnd(10)} win ${(100 * stats.won / N).toFixed(0)}%  wrong ${(100 * stats.lostWrong / N).toFixed(0)}%  timeout ${(100 * stats.lostTime / N).toFixed(0)}%  median actions ${median(stats.actions)}  hours ${median(stats.hours).toFixed(1)}  spent $${median(stats.spent)}  score ${median(stats.score)}  truth in differential ${(100 * (stats.truth || 0) / N).toFixed(0)}%`);
}
