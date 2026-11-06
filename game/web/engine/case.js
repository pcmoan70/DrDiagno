// Case generation and the actions a player can take. Pure functions over a db and a state object.
import { makeRng } from './rng.js';
import { rankDifferential } from './scoring.js';

export const TUNING = {
  horizon: { resident: 72, attending: 60, house: 48 }, // game hours until the patient is lost untreated
  presenting: { min: 2, max: 3 },
  minRealized: 6,
  drainScale: 1.0,
  contraPenalty: 20,
  treatHours: 4,
  treatCost: 150,
  scoreBase: 1000,
  costWeight: 0.05,
  maxPerTest: 3, // a single test shows at most this many findings; the rest need other tests or time
  chips: 10, // confidence chips the player spreads over the differential
  commitMinChips: 5, // chips needed on a disease before it can be diagnosed
  chipBonus: 20, // points per chip above the minimum when the diagnosis is right
  calibrationMax: 150, // points for having had chips on the truth over the whole case
  wrongHours: 6, // a hedged (5-9 chips) wrong diagnosis costs time and stability but the case goes on
  wrongStability: 20,
};

// Findings under these HPO roots never appear spontaneously; they need a test.
const TEST_ONLY_ROOTS = ['HP:0001939', 'HP:0001871', 'HP:0012443', 'HP:0002143', 'HP:0001627', 'HP:0002353',
  'HP:0003457', 'HP:0005561', 'HP:0004303', 'HP:0002921', 'HP:0012372', 'HP:0000818', 'HP:0002715', 'HP:0011675',
  'HP:0002088', 'HP:0001928', 'HP:0040129', 'HP:0001392', 'HP:0012211', 'HP:0003110', 'HP:0011024', 'HP:0030680'];

const ONSET_LABEL = { 'HP:0030674': 'antenatal', 'HP:0003577': 'congenital', 'HP:0003623': 'neonatal', 'HP:0003593': 'infantile',
  'HP:0011463': 'childhood', 'HP:0003621': 'juvenile', 'HP:0003581': 'adult', 'HP:0011462': 'young adult', 'HP:0003596': 'middle age', 'HP:0003584': 'late' };

// A deterministic persona: age bracket from the onset data, sex from inheritance where it matters.
export function patientFor(db, state) {
  const d = db.disease(state.id);
  const rng = makeRng(`patient:${state.seed}:${state.id}`);
  const classes = [...(d.oonset || []), ...d.onset.map((t) => ONSET_LABEL[t] || '')].map((x) => x.toLowerCase());
  const pick = (opts) => opts[Math.floor(rng() * opts.length)];
  let age;
  if (classes.some((c) => /antenatal|neonatal|congenital/.test(c))) age = `${1 + Math.floor(rng() * 20)}-day-old`;
  else if (classes.some((c) => /infan/.test(c))) age = `${2 + Math.floor(rng() * 16)}-month-old`;
  else if (classes.some((c) => /child|juvenile/.test(c))) age = `${2 + Math.floor(rng() * 10)}-year-old`;
  else if (classes.some((c) => /adolescen/.test(c))) age = `${12 + Math.floor(rng() * 6)}-year-old`;
  else if (classes.some((c) => /young adult|adult|middle/.test(c))) age = `${18 + Math.floor(rng() * 40)}-year-old`;
  else if (classes.some((c) => /elderly|late/.test(c))) age = `${65 + Math.floor(rng() * 20)}-year-old`;
  else age = `${4 + Math.floor(rng() * 56)}-year-old`;
  // X-linked recessive: mostly boys; X-linked dominant (e.g. Rett): mostly girls
  const xlr = d.inh.includes('HP:0001419') || d.inh.includes('HP:0001417');
  const xld = d.inh.includes('HP:0001423');
  const sex = xld ? (rng() < 0.9 ? 'female' : 'male') : xlr ? (rng() < 0.85 ? 'male' : 'female') : pick(['female', 'male']);
  return { age, sex, name: pick(['A.', 'B.', 'C.', 'D.', 'E.', 'F.', 'G.', 'H.', 'J.', 'K.', 'L.', 'M.', 'N.', 'P.', 'R.', 'S.', 'T.']) };
}

export function poolFor(db, tier) {
  return db.index.filter((e) => e.tiers.includes(tier)).map((e) => e.i);
}

export function pickDisease(db, { tier, seed }) {
  const rng = makeRng(`pick:${tier}:${seed}`);
  return rng.pick(poolFor(db, tier));
}

export function createCase(db, { tier, seed, id }) {
  const d = db.disease(id);
  const rng = makeRng(`case:${tier}:${seed}:${id}`);
  const H = TUNING.horizon[tier];
  // which annotated findings this particular patient actually has
  let realized = d.t.filter(([, p]) => rng() < p).map(([t, p]) => ({ t, p }));
  if (realized.length < TUNING.minRealized) {
    const have = new Set(realized.map((r) => r.t));
    for (const [t, p] of d.t) { if (realized.length >= TUNING.minRealized) break; if (!have.has(t)) realized.push({ t, p }); }
  }
  const visible = realized.filter((r) => !db.under(r.t, TEST_ONLY_ROOTS));
  const spec = (t) => db.specificity(t);
  // presenting complaints: common, non-specific, preferably things a patient would say
  const house = tier === 'house';
  const shared = new Set(d.shared || []);
  const weight = (r) => (house ? r.p * Math.pow(1 - spec(r.t), 2) + 0.03 : r.p * (1 - spec(r.t)) + 0.08) * (db.lay(r.t) ? 1.6 : 1) * (shared.has(r.t) ? (house ? 3 : 2) : 1);
  const k = TUNING.presenting.min + Math.floor(rng() * (TUNING.presenting.max - TUNING.presenting.min + 1));
  const presentPool = visible.length >= TUNING.presenting.min ? visible : realized;
  const presenting = rng.weightedSample(presentPool, weight, Math.min(k, presentPool.length));
  const pres = new Set(presenting.map((r) => r.t));
  // progression: the rest of the visible findings appear over time, non-specific first
  const rest = visible.filter((r) => !pres.has(r.t)).sort((a, b) => spec(a.t) - spec(b.t) + (rng() - 0.5) * 0.15);
  const timeline = rest.map((r, i) => ({ at: Math.round(((i + 1) / (rest.length + 1)) * H * 0.85 * 10) / 10, t: r.t }));
  const state = {
    seed, tier, id, H, clock: 0, stability: 100, drain: (100 / H) * TUNING.drainScale, spent: 0,
    realized, timeline, findings: [], negatives: [], tests: {}, differential: [], treatments: [],
    chips: {}, chipsManual: false, chipTrack: [], wrong: [],
    treated: false, status: 'open', score: null, log: [],
  };
  for (const r of presenting) addFinding(state, r.t, 'presenting');
  log(state, `Patient arrives. Presenting complaints: ${presenting.map((r) => db.label(r.t)).join(', ')}.`);
  return state;
}

function log(state, text) { state.log.push({ at: state.clock, text }); }

export function addFinding(state, t, src) {
  if (state.findings.some((f) => f.t === t)) return false;
  state.findings.push({ t, src, at: state.clock });
  return true;
}

function chipsOnTruth(db, state) {
  const d = db.disease(state.id);
  return Math.max(state.chips[state.id] || 0, ...d.twins.map((t) => state.chips[t] || 0));
}

export function advance(db, state, hours) {
  if (state.status !== 'open') return state;
  const end = state.clock + hours;
  state.chipTrack.push({ from: state.clock, to: end, c: chipsOnTruth(db, state) });
  for (const item of state.timeline) {
    if (!item.done && item.at <= end) {
      item.done = true;
      state.clock = item.at;
      if (addFinding(state, item.t, 'progression')) log(state, `New development: ${db.label(item.t)}.`);
    }
  }
  state.clock = end;
  if (!state.treated) state.stability = Math.max(0, state.stability - state.drain * hours);
  if (state.stability <= 0) { state.status = 'lost'; state.score = 0; log(state, 'The patient has deteriorated beyond rescue.'); }
  return state;
}

export function orderTest(db, state, testId) { return orderTests(db, state, [testId]); }

// Several tests run in parallel: the clock advances once, by the longest test; costs add up.
// Results are produced in catalog order so a batch is deterministic whatever the click order.
export function orderTests(db, state, ids) {
  if (state.status !== 'open') return state;
  const tests = db.tests.filter((t) => ids.includes(t.id) && !state.tests[t.id]);
  for (const id of ids) if (!db.testById.has(id)) throw new Error(`unknown test ${id}`);
  if (!tests.length) return state;
  state.spent += tests.reduce((a, t) => a + t.cost, 0);
  advance(db, state, Math.max(...tests.map((t) => t.hours)));
  for (const test of tests) runTest(db, state, test);
  return state;
}

function runTest(db, state, test) {
  const testId = test.id;
  const d = db.disease(state.id);
  const res = { at: state.clock, terms: [], negs: [], text: null };
  if (test.special === 'onset') {
    const parts = [...(d.oonset || []), ...d.onset.map((t) => ONSET_LABEL[t] || db.name(t))];
    res.text = parts.length ? `Onset: ${[...new Set(parts)].join(', ')}.` : 'Onset unclear from history.';
    if (d.course.length) res.text += ` Course: ${d.course.map((t) => db.name(t)).join(', ')}.`;
  } else if (test.special === 'inh') {
    res.text = d.inh.length ? `Family history suggests: ${d.inh.map((t) => db.name(t)).join(', ')}.` : 'No informative family history.';
  } else if (test.special === 'genetic') {
    if (d.inh.length) { res.text = `Pathogenic variant found. Consistent with: ${d.n}.`; res.confirms = d.id; }
    else res.text = 'No pathogenic variant identified.';
  } else {
    const covered = state.realized.filter((r) => db.under(r.t, test.reveals));
    const known = covered.filter((r) => state.findings.some((f) => f.t === r.t));
    const fresh = covered.filter((r) => !known.includes(r));
    const rng = makeRng(`test:${state.seed}:${testId}`);
    const shown = [...known, ...rng.weightedSample(fresh, (r) => r.p + 0.05, Math.max(0, TUNING.maxPerTest - Math.min(known.length, 1)))];
    for (const r of shown) { res.terms.push(r.t); addFinding(state, r.t, testId); }
    res.partial = fresh.length > shown.length - known.length;
    for (const n of d.neg) if (db.under(n, test.reveals)) { res.negs.push(n); if (!state.negatives.some((x) => x.t === n)) state.negatives.push({ t: n, src: testId }); }
    if (!res.terms.length && !res.negs.length) res.text = 'Unremarkable.';
  }
  if (state.status === 'open') {
    state.tests[testId] = res;
    log(state, `${test.name}: ${res.text ?? res.terms.map((t) => db.name(t)).join('; ') + (res.negs.length ? ' Absent: ' + res.negs.map((t) => db.name(t)).join('; ') : '')}`);
  }
}

export const CONSULT = { hours: 3, cost: 0, n: 6 };
// Ask the literature: rank every disease against the findings so far. Costs time, returns ids.
export function consult(db, state, suggestFn) {
  if (state.status !== 'open') return [];
  state.spent += CONSULT.cost;
  advance(db, state, CONSULT.hours);
  if (state.status !== 'open') return [];
  const ids = suggestFn(db, state, CONSULT.n).map((r) => r.id);
  state.consults = (state.consults || 0) + 1;
  log(state, `Literature review suggests: ${ids.map((i) => db.disease(i).n).join('; ')}.`);
  return ids;
}

export function addCandidate(state, id) { if (!state.differential.includes(id) && !state.wrong.includes(id)) state.differential.push(id); return state; }
export function removeCandidate(state, id) { state.differential = state.differential.filter((x) => x !== id); delete state.chips[id]; return state; }

// Confidence chips. Placing n chips on a disease takes them from the pool, then from the biggest other holders.
export function setChips(state, id, n) {
  n = Math.max(0, Math.min(TUNING.chips, Math.round(n)));
  state.chipsManual = true;
  const others = Object.entries(state.chips).filter(([k]) => k !== id).sort((a, b) => b[1] - a[1]);
  let used = others.reduce((sum, [, v]) => sum + v, 0);
  for (const [k, v] of others) {
    if (used + n <= TUNING.chips) break;
    const take = Math.min(v, used + n - TUNING.chips);
    state.chips[k] -= take; used -= take;
    if (!state.chips[k]) delete state.chips[k];
  }
  if (n) state.chips[id] = n; else delete state.chips[id];
  return state;
}
// Until the player moves a chip, chips follow the chart's fit (largest-remainder rounding).
export function autoChips(db, state) {
  if (state.chipsManual) return state;
  state.chips = {};
  const ranked = rankDifferential(db, state);
  const total = ranked.reduce((sum, r) => sum + r.score, 0);
  if (!ranked.length || total <= 0) return state;
  const raw = ranked.map((r) => { const x = (TUNING.chips * r.score) / total; return { id: r.id, x, n: Math.floor(x) }; });
  let left = TUNING.chips - raw.reduce((sum, r) => sum + r.n, 0);
  raw.sort((a, b) => (b.x - b.n) - (a.x - a.n));
  for (let i = 0; i < left; i++) raw[i % raw.length].n++;
  for (const r of raw) if (r.n) state.chips[r.id] = r.n;
  return state;
}
// Share of the case (time-weighted) during which chips sat on the truth, 0..1.
export function calibration(state) {
  const area = state.chipTrack.reduce((sum, x) => sum + x.c * (x.to - x.from), 0);
  return Math.min(1, area / (TUNING.chips * state.H));
}

export function treat(db, state, drugId) {
  if (state.status !== 'open') return state;
  const drug = db.drugs[drugId];
  if (!drug) throw new Error(`unknown drug ${drugId}`);
  const [ind = [], contra = []] = db.drugsByDisease[state.id] || [[], []];
  state.spent += TUNING.treatCost;
  advance(db, state, TUNING.treatHours);
  if (state.status !== 'open') return state;
  let effect;
  if (ind.includes(drugId)) {
    state.treated = true; state.stability = Math.min(100, state.stability + 10); effect = 'improved';
    log(state, `${drug[0]}: the patient stabilises.`);
  } else if (contra.includes(drugId)) {
    state.stability = Math.max(0, state.stability - TUNING.contraPenalty); effect = 'harm';
    log(state, `${drug[0]}: adverse reaction, the patient worsens.`);
    if (state.stability <= 0) { state.status = 'lost'; state.score = 0; }
  } else {
    const rng = makeRng(`drug:${state.seed}:${drugId}`);
    const options = drug[1].filter((t) => !state.realized.some((r) => r.t === t));
    const side = options.length ? rng.pick(options) : null;
    effect = 'none';
    if (side && addFinding(state, side, 'drug')) { effect = 'side-effect'; log(state, `${drug[0]}: no improvement. New finding: ${db.label(side)}.`); }
    else log(state, `${drug[0]}: no improvement.`);
  }
  state.treatments.push({ drug: drugId, at: state.clock, effect });
  return state;
}

// Diagnose. Needs >= commitMinChips on the disease. All-in and wrong ends the case; hedged and wrong
// costs time and stability, rules the disease out, and the case goes on.
export function commit(db, state, id) {
  if (state.status !== 'open') return state;
  const c = state.chips[id] || 0;
  if (c < TUNING.commitMinChips) return state;
  const d = db.disease(state.id);
  const correct = id === state.id || d.twins.includes(id);
  if (correct) {
    const timeFactor = 0.3 + 0.7 * Math.max(0, 1 - state.clock / state.H);
    state.bonus = { chips: TUNING.chipBonus * (c - TUNING.commitMinChips), calibration: Math.round(TUNING.calibrationMax * calibration(state)) };
    state.score = Math.max(50, Math.round(TUNING.scoreBase * timeFactor - TUNING.costWeight * state.spent + (state.stability > 50 ? 100 : 0) + state.bonus.chips + state.bonus.calibration));
    state.status = 'won';
    log(state, `Diagnosis confirmed: ${d.n}.`);
  } else if (c >= TUNING.chips) {
    state.status = 'lost'; state.score = 0;
    log(state, `Wrong diagnosis. The patient had ${d.n}.`);
  } else {
    const name = db.disease(id).n;
    advance(db, state, TUNING.wrongHours);
    state.wrong.push(id);
    removeCandidate(state, id);
    if (state.status !== 'open') return state;
    state.stability = Math.max(0, state.stability - TUNING.wrongStability);
    log(state, `Treated as ${name}: no response. ${name} is ruled out.`);
    if (state.stability <= 0) { state.status = 'lost'; state.score = 0; log(state, 'The patient has deteriorated beyond rescue.'); }
    return state;
  }
  state.committed = id;
  return state;
}
