import { loadDb } from './engine/db.js';
import { pickDisease, createCase, orderTest, orderTests, consult, addCandidate, removeCandidate, treat, commit, patientFor, poolFor, CONSULT, setChips, autoChips, TUNING } from './engine/case.js';
import { rankDifferential, suggest, differentialMap, fit, suggestTests, systemsOf } from './engine/scoring.js';
import { addEntry, tierStats, topicStats, missedDiseases } from './engine/progress.js';
import { randomCode } from './engine/rng.js';
import { searchTerms } from './engine/search.js';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined) e.setAttribute(k, v); }
  for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
};
const TIERS = [
  { id: 'student', name: 'Student', blurb: 'Learn with a coach: free consults, suggested studies, the map open, and no sudden death. Resident cases, a long clock.', clock: '96 h' },
  { id: 'resident', name: 'Resident', blurb: 'Well-described diseases with plenty of findings. Learn the ropes.', clock: '72 h' },
  { id: 'attending', name: 'Attending', blurb: 'The full library. Decoys share most of the picture.', clock: '60 h' },
  { id: 'house', name: 'House', blurb: 'Rare diseases, misleading openers, a fast clock. Everybody lies.', clock: '48 h' },
];
const KIND_NAMES = { history: 'History', exam: 'Examination', lab: 'Laboratory', imaging: 'Imaging', special: 'Specialist studies' };
const SRC = { presenting: 'presenting', progression: 'developed', drug: 'after treatment' };

let db, state, tier, seed, mapPrev; // mapPrev: compatible count at the last render, for the 'ruled out' toast
let suggestions = null; // last literature consult: [{id, score, ...}] until the pane is closed
const openKinds = new Set(['history']); // expanded workup sections, kept across re-renders
const selected = new Set(); // tests ticked to run together
const PARALLEL = new Set(['lab', 'imaging', 'special']); // studies that can run at the same time
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } } };

function show(id) { for (const s of document.querySelectorAll('main.screen')) s.hidden = s.id !== id; $('hud').hidden = id !== 'screen-play'; }
function clockText(h) { const day = Math.floor((h + 8) / 24) + 1; const hh = Math.floor((h + 8) % 24); const mm = Math.round(((h + 8) % 1) * 60); return `Day ${day}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }

async function boot() {
  try {
    db = await loadDb('.');
    await db.loadAll((done, total) => { $('load-progress').textContent = `${Math.round(100 * done / total)}%`; });
  } catch (e) {
    $('load-msg').textContent = `Could not load the disease library (${e.message}). The data bundles must be built into web/data/ and the folder served over HTTP.`;
    throw e;
  }
  loadDefs(); loadMedia(); // definitions and image links for balloons and profiles arrive in the background
  window.addEventListener('hashchange', route);
  route();
}

function route() {
  const m = location.hash.match(/^#(student|resident|attending|house)-([a-z0-9]+)$/);
  if (m) startCase(m[1], m[2]);
  else if (location.hash.startsWith('#watch')) startWatch(location.hash.slice(7));
  else if (location.hash === '#progress') { renderProgress(); show('screen-progress'); }
  else { renderTitle(); show('screen-title'); }
}

function renderTitle() {
  const tiers = $('tiers'); tiers.replaceChildren();
  for (const t of TIERS) {
    const n = poolFor(db, t.id).length;
    tiers.append(el('div', { class: 'tier' }, el('h3', {}, t.name), el('p', {}, t.blurb), el('span', { class: 'meta' }, `${n.toLocaleString()} diseases · ${t.clock} to diagnose`),
      el('button', { class: 'btn primary', onclick: () => { location.hash = `#${t.id}-${randomCode()}`; } }, 'New case')));
  }
  $('code-form').onsubmit = (ev) => { ev.preventDefault(); const v = $('code-input').value.trim().toLowerCase().replace(/^#/, ''); if (/^(student|resident|attending|house)-[a-z0-9]+$/.test(v)) location.hash = '#' + v; };
  const best = store.get('best') || {};
  $('best').textContent = Object.keys(best).length ? 'Best scores: ' + TIERS.filter((t) => best[t.id]).map((t) => `${t.name} ${best[t.id]}`).join(' · ') : '';
  const h = history();
  const won = h.filter((e) => e.status === 'won').length;
  $('progress-brief').textContent = h.length ? `${h.length} ${h.length === 1 ? 'case' : 'cases'} played, ${Math.round(100 * won / h.length)}% solved` : 'Finished cases are kept in this browser.';
}

// ---- progress: finished cases live in localStorage; aggregation is in engine/progress.js
const history = () => store.get('history') || [];
function recordCase() {
  if (state.recorded) return;
  state.recorded = true;
  const d = db.disease(state.id);
  const systems = [...systemsOf(db, d)].map((id) => db.name(id).replace(/^Abnormality of (the )?/, ''));
  store.set('history', addEntry(history(), { at: Date.now(), tier, seed, id: d.id, name: d.n, status: state.status === 'won' ? 'won' : state.committed ? 'wrong' : 'timeout',
    score: state.score || 0, hours: Math.round(state.clock * 10) / 10, spent: state.spent, tests: Object.keys(state.tests).length, systems }));
}
const tierName = (id) => TIERS.find((t) => t.id === id)?.name || id;
const dateText = (ms) => new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
function renderProgress() {
  const h = history();
  const row = (...cells) => el('tr', {}, cells.map((c, i) => el(i ? 'td' : 'th', { scope: i ? null : 'row' }, c)));
  const head = (...cells) => el('thead', {}, el('tr', {}, cells.map((c) => el('th', {}, c))));
  $('pg-tiers').replaceChildren(head('Tier', 'Played', 'Solved', 'Best', 'Last 5 avg', 'Trend'),
    el('tbody', {}, TIERS.map((t) => tierStats(h, t.id)).filter((x) => x.played).map((x) => row(tierName(x.tier), x.played, `${x.won} (${Math.round(100 * x.winRate)}%)`, x.best || '–', x.recentAvg,
      x.trend === null ? '–' : el('span', { class: x.trend > 0 ? 'up' : x.trend < 0 ? 'down' : '' }, x.trend > 0 ? `▲ ${x.trend}` : x.trend < 0 ? `▼ ${-x.trend}` : '=')))));
  $('pg-tiers').hidden = !h.length;
  $('pg-chart').replaceChildren(scoreChart(h) || el('p', { class: 'hint' }, 'Finish two or more cases to see a trend.'));
  $('pg-chart-hint').hidden = h.length < 2;
  const topics = topicStats(h); const max = Math.max(1, ...topics.map((x) => x.played));
  $('pg-topics').replaceChildren(...topics.slice(0, 12).map((x) => el('li', { class: x.winRate < 0.5 && x.played >= 2 ? 'weak' : '', title: `${x.won} of ${x.played} solved` },
    el('span', { class: 'sys' }, x.system), el('span', { class: 'fit-track' }, el('span', { class: 'fit-bar', style: `width:${Math.round(100 * x.played / max)}%` })), el('span', { class: 'n' }, `${Math.round(100 * x.winRate)}%`))));
  if (!topics.length) $('pg-topics').replaceChildren(el('li', { class: 'hint' }, 'Nothing yet.'));
  const missed = missedDiseases(h);
  $('pg-missed').replaceChildren(...missed.slice(0, 20).map((m) => el('li', { class: 'dx' }, el('span', { class: 'head' }, nameLink(db.disease(m.id), null), el('span', { class: 'meta' }, `${m.misses} ${m.misses === 1 ? 'miss' : 'misses'} · ${tierName(m.tier)}`)),
    el('a', { class: 'btn small', href: `#${m.tier}-${m.seed}` }, 'Retry'))));
  if (!missed.length) $('pg-missed').replaceChildren(el('li', { class: 'hint' }, h.length ? 'None outstanding. Every disease you met has been solved.' : 'Nothing yet.'));
  $('pg-recent').replaceChildren(head('When', 'Tier', 'Disease', 'Result', 'Score', 'Case'),
    el('tbody', {}, h.slice(-15).reverse().map((e) => row(dateText(e.at), tierName(e.tier), nameLink(db.disease(e.id), null), e.status === 'won' ? 'Solved' : e.status === 'wrong' ? 'Wrong' : 'Too late', e.status === 'won' ? e.score : 0, el('a', { href: `#${e.tier}-${e.seed}` }, `${e.tier}-${e.seed}`)))));
  $('pg-recent').hidden = !h.length;
  $('pg-clear').onclick = () => confirmThen('Clear history', 'Delete every recorded case from this browser? Best scores stay.', () => { store.set('history', []); renderProgress(); });
}
function scoreChart(h) {
  const pts = h.slice(-40).map((e) => (e.status === 'won' ? e.score : 0));
  if (pts.length < 2) return null;
  const W = 480, Hh = 90, pad = 6, max = Math.max(1000, ...pts);
  const x = (i) => pad + ((W - 2 * pad) * i) / (pts.length - 1), y = (v) => Hh - pad - ((Hh - 2 * pad) * v) / max;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`); svg.setAttribute('class', 'chip-chart'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Scores of recent cases');
  svg.innerHTML = `<line x1="${pad}" y1="${y(0)}" x2="${W - pad}" y2="${y(0)}" class="axis"/><line x1="${pad}" y1="${y(max)}" x2="${W - pad}" y2="${y(max)}" class="axis faint"/>` +
    `<polyline points="${pts.map((v, i) => `${x(i)},${y(v)}`).join(' ')}" class="line"/>` + pts.map((v, i) => `<circle cx="${x(i)}" cy="${y(v)}" r="2.5" class="${v ? 'dot' : 'dot lost'}"/>`).join('');
  return el('div', { class: 'chart-wrap' }, svg);
}

function startCase(t, s) {
  tier = t; seed = s;
  const id = pickDisease(db, { tier, seed });
  state = createCase(db, { tier, seed, id });
  state.patient = patientFor(db, state);
  $('hud-code').textContent = `${tier}-${seed}`;
  $('dx-search').value = ''; selected.clear(); suggestions = null;
  mapPrev = null; $('map').hidden = tier === 'house'; $('map').open = tier === 'resident' || tier === 'student';
  $('coach').hidden = tier !== 'student';
  $('btn-consult').textContent = tier === 'student' ? 'Consult the literature (free)' : 'Consult the literature (3 h)';
  show('screen-play');
  renderAll();
}

const fitVisible = () => tier === 'resident' || tier === 'student' || (state.consults || 0) > 0 || state.status !== 'open'; // the chart's own ranking is earned by a consult outside Resident
// A disease name that opens the profile table. obs: {findings, negatives} to mark against, or null.
const nameLink = (d, obs) => el('button', { class: 'name link', title: 'Show findings and how often they occur', onclick: () => showDisease(d.id, obs) }, d.n);

// Frequency label for an annotation probability (HPO frequency classes).
function freqClass(p) { return p >= 0.995 ? 'Obligate' : p >= 0.8 ? 'Very frequent' : p >= 0.3 ? 'Frequent' : p >= 0.05 ? 'Occasional' : 'Very rare'; }
// Disease profile: every annotated finding with its likelihood, optionally marked against observed findings.
function showDisease(id, obs) {
  const d = db.disease(id);
  const related = (a, b) => db.ancestors(a).has(b) || db.ancestors(b).has(a);
  const mark = (t) => !obs ? null : obs.findings.some((f) => related(f.t, t)) ? 'present' : obs.negatives.some((n) => related(n.t, t)) ? 'absent' : null;
  $('ds-title').textContent = d.n;
  const meta = [d.prev ? `${d.prev[0]} ${d.prev[1]}` : null, d.oonset?.length ? `Onset: ${d.oonset.join(', ')}` : null, d.inh?.length ? `Inheritance: ${d.inh.map((x) => db.name(x)).join(', ')}` : null, `${d.t.length} findings`].filter(Boolean).join(' · ');
  $('ds-meta').replaceChildren(el('span', {}, meta, wikiLink(id) ? [' · ', wikiLink(id)] : null));
  $('ds-media').replaceChildren(figure(id, true) || '');
  $('ds-def').textContent = d.def || '';
  const rows = d.t.slice().sort((a, b) => b[1] - a[1] || db.name(a[0]).localeCompare(db.name(b[0]))).map(([t, p]) => ({ t, p, cls: freqClass(p) }))
    .concat(d.neg.map((t) => ({ t, p: 0, cls: 'Excluded' })));
  const tbl = $('ds-table'); tbl.replaceChildren(
    el('thead', {}, el('tr', {}, el('th', {}, 'Finding'), el('th', {}, 'Likelihood'), obs ? el('th', {}, obs.label) : null)),
    el('tbody', {}, rows.map((r) => {
      const m = mark(r.t);
      return el('tr', { class: r.cls === 'Excluded' ? 'excluded' : '' },
        el('td', { 'data-term': r.t }, db.label(r.t), db.label(r.t) !== db.name(r.t) ? el('span', { class: 'syn' }, db.name(r.t)) : null),
        el('td', { class: 'freq' }, el('span', { class: 'fit-track' }, el('span', { class: 'fit-bar', style: `width:${Math.round(100 * r.p)}%` })), el('span', {}, `${Math.round(100 * r.p)}%`), el('span', { class: 'syn' }, r.cls)),
        obs ? el('td', { class: 'obs ' + (m || '') }, m === 'present' ? '✓ present' : m === 'absent' ? '✗ absent' : '') : null);
    })));
  $('ds-note').textContent = 'Likelihood: share of patients with this disease who show the finding, from HPO annotations (Orphanet, OMIM). Excluded findings argue against the disease.' + (obs ? '' : ' The patient column appears after a literature consult (always in Resident).');
  $('ds-close').onclick = () => { $('disease').hidden = true; };
  $('disease').hidden = false;
}
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') $('disease').hidden = true; });

// ---- term balloons: hovering or focusing any element with data-term shows the lay name, the HPO name and definition.
let defs = null, defsLoading = null;
function loadDefs() { return defsLoading ||= fetch('data/defs.json').then((r) => r.json()).then((d) => { defs = d; }).catch(() => { defs = {}; }); }
let media = null, mediaLoading = null; // {img: {id: {u, p, a, l}}, wiki: {MONDO: url}} from Wikidata / Commons
function loadMedia() { return mediaLoading ||= fetch('data/images.json').then((r) => r.json()).then((d) => { media = d; }).catch(() => { media = { img: {}, wiki: {} }; }); }
// Commons image for a finding or disease with its credit; the credit links to the file page unless inside a balloon.
function figure(id, link) {
  const m = media?.img[id];
  if (!m) return null;
  const credit = `${m.a} · ${m.l} · Wikimedia Commons`;
  return el('figure', { class: 'media' }, el('img', { src: m.u, alt: '', loading: 'lazy' }), el('figcaption', {}, link ? el('a', { href: m.p, target: '_blank', rel: 'noopener' }, credit) : credit));
}
const wikiLink = (id, text = 'Wikipedia') => (media?.wiki[id] ? el('a', { href: media.wiki[id], target: '_blank', rel: 'noopener' }, text) : null);
const term = (t) => el('span', { class: 'term', 'data-term': t }, db.label(t));
const termList = (ids) => ids.flatMap((t, i) => [i ? ', ' : null, term(t)]);
function showTip(target) {
  const t = target.dataset.term;
  if (!db.terms[t]) return;
  const tip = $('tip'), lay = db.lay(t), name = db.name(t);
  tip.replaceChildren(el('div', {}, el('strong', {}, lay || name), lay ? el('span', { class: 'syn' }, ` ${name}`) : null,
    el('p', {}, defs ? defs[t] || 'No definition in the HPO.' : 'Loading definition…'), target.dataset.extra ? el('p', { class: 'syn' }, target.dataset.extra) : null, figure(t, false)));
  tip.hidden = false; tip._for = target;
  const r = target.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = `${Math.min(Math.max(8, r.left), window.innerWidth - w - 8)}px`;
  tip.style.top = `${r.bottom + h + 14 > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6}px`;
  if (!defs) loadDefs().then(() => { if (tip._for === target) showTip(target); });
}
function hideTip() { const tip = $('tip'); tip.hidden = true; tip._for = null; }
for (const evName of ['mouseover', 'focusin']) document.addEventListener(evName, (ev) => { const x = ev.target.closest?.('[data-term]'); if (x) showTip(x); else hideTip(); });
document.addEventListener('focusout', hideTip);
window.addEventListener('scroll', hideTip, true);

function renderAll() { const y = window.scrollY; renderHud(); renderPatient(); renderDifferential(); renderMap(); renderTests(); renderCoach(); window.scrollTo(0, y); if (state.status !== 'open') renderDebrief(); }

// Student tier: which studies would split the still-fitting diseases best.
function renderCoach() {
  if (tier !== 'student') return;
  const list = $('coach-list'); list.replaceChildren();
  const tips = state.status === 'open' ? suggestTests(db, state, poolFor(db, tier)) : [];
  $('coach-empty').hidden = tips.length > 0;
  for (const x of tips) {
    const t = db.testById.get(x.id);
    list.append(el('li', {}, el('span', {}, t.name, el('div', { class: 'meta' }, `probes ${x.probes} of the ${x.total} diseases still fitting · ${hoursText(t.hours)} · $${t.cost}`)),
      el('button', { class: 'btn small', onclick: () => act(() => orderTest(db, state, x.id)) }, 'Order')));
  }
}

function toast(text) { const t = el('div', { class: 'toast', role: 'status' }, text); document.body.append(t); setTimeout(() => t.remove(), 2700); }

function renderMap() {
  if (tier === 'house') return;
  const m = differentialMap(db, state, poolFor(db, tier));
  $('map-count').textContent = `${m.compatible.toLocaleString()} of ${m.total.toLocaleString()} still fit`;
  if (mapPrev !== null && m.compatible < mapPrev && state.status === 'open') toast(`Ruled out ${(mapPrev - m.compatible).toLocaleString()} ${mapPrev - m.compatible === 1 ? 'disease' : 'diseases'}. ${m.compatible.toLocaleString()} still fit.`);
  mapPrev = m.compatible;
  const max = Math.max(1, ...m.systems.map((x) => x.count));
  const list = $('map-list'); list.replaceChildren();
  for (const x of m.systems) {
    const probes = db.tests.filter((t) => t.reveals?.some((r) => db.ancestors(r).has(x.id))).map((t) => t.name);
    list.append(el('li', { class: x.count ? '' : 'cut' },
      el('span', { class: 'sys', 'data-term': x.id, 'data-extra': probes.length ? `Probed by: ${probes.join(', ')}` : 'No test targets this system directly.' }, x.name), el('span', { class: 'fit-track' }, el('span', { class: 'fit-bar', style: `width:${Math.round(100 * x.count / max)}%` })), el('span', { class: 'n' }, x.count)));
  }
}

const pctBadge = (score) => el('span', { class: 'pct', title: 'Share of the evidence this disease explains' }, `${Math.round(100 * score)}%`);
function renderHud() {
  $('hud-clock').textContent = clockText(state.clock);

  $('hud-spent').textContent = `$${state.spent.toLocaleString()}`;
  const bar = $('hud-stab'); bar.style.width = `${state.stability}%`;
  bar.className = 'stab-bar' + (state.stability < 25 ? ' bad' : state.stability < 50 ? ' warn' : '');
  bar.parentElement.title = `${Math.round(state.stability)}% ${state.treated ? '(stable on treatment)' : ''}`;
}

function renderPatient() {
  const p = state.patient;
  $('persona').textContent = `${p.name}, ${p.age} ${p.sex}. ${TIERS.find((t) => t.id === tier).name} case.`;
  const list = $('findings'); list.replaceChildren();
  for (const f of state.findings) list.append(el('li', { class: 'chip', 'data-term': f.t }, db.label(f.t), el('span', { class: 'src' }, SRC[f.src] || db.testById.get(f.src)?.name || f.src)));
  for (const n of state.negatives) list.append(el('li', { class: 'chip neg', 'data-term': n.t, 'data-extra': 'Absent in this patient.' }, db.label(n.t)));
  const log = $('log'); log.replaceChildren();
  for (const l of state.log.slice().reverse()) log.append(el('li', {}, el('span', { class: 'at' }, clockText(l.at)), el('span', {}, l.text)));
}

function renderDifferential() {
  const list = $('dx-list'); list.replaceChildren();
  const ranked = rankDifferential(db, state);
  $('dx-hint').hidden = ranked.length > 0;
  const top = (tier === 'student' || tier === 'resident') ? ranked[0] : null; // learning tiers show the match openly in the top bar
  $('hud-match').hidden = !top;
  if (top) $('hud-match-v').textContent = `${Math.round(100 * top.score)}% ${db.disease(top.id).n}`;
  $('btn-consult').disabled = state.status !== 'open';
  const showFit = fitVisible();
  const placed = Object.values(state.chips).reduce((a, b) => a + b, 0);
  $('chips-pool').textContent = ranked.length ? `${TUNING.chips - placed} of ${TUNING.chips} chips unplaced · ${state.chipsManual ? 'your call' : 'following the chart'}` : '';
  $('chips-auto').hidden = !state.chipsManual || !ranked.length;
  $('dx-fit-note').hidden = showFit || !ranked.length;
  renderConsult(showFit);
  for (const r of ranked) {
    const d = db.disease(r.id);
    const drugs = (db.drugsByDisease[r.id] || [[]])[0];
    const c = state.chips[r.id] || 0;
    const canCommit = c >= TUNING.commitMinChips;
    const allIn = c >= TUNING.chips && tier !== 'student'; // students never face sudden death
    const ops = el('div', { class: 'ops' },
      drugs.length ? el('button', { class: 'btn small', title: `Treat as ${d.n} with ${db.drugs[drugs[0]][0]} (4 h, $150)`, onclick: () => confirmThen('Treat', `Start ${db.drugs[drugs[0]][0]} for ${d.n}? If this is the wrong disease it may cause harm or side effects.`, () => act(() => treat(db, state, drugs[0]))) }, 'Treat') : null,
      el('button', { class: 'btn small primary', disabled: canCommit ? null : 'disabled', title: canCommit ? (allIn ? 'All in: wrong ends the case' : `Hedged: wrong costs ${TUNING.wrongHours} h and ${TUNING.wrongStability} stability, the case goes on`) : `Needs ${TUNING.commitMinChips} chips`,
        onclick: () => confirmThen('Diagnose', allIn ? `All ${TUNING.chips} chips on ${d.n}. If you are wrong the case ends. Diagnose?` : `${c} chips on ${d.n}. If you are wrong it costs ${TUNING.wrongHours} hours and ${TUNING.wrongStability} stability and ${d.n} is ruled out. Diagnose?`, () => act(() => commit(db, state, r.id))) }, 'Diagnose'),
      el('button', { class: 'btn small', title: 'Remove from differential', onclick: () => act(() => removeCandidate(state, r.id)) }, '×'));
    const chips = el('div', { class: 'chips', role: 'group', 'aria-label': `Confidence chips on ${d.n}: ${c}` },
      Array.from({ length: TUNING.chips }, (_, i) => el('button', { class: 'chip-dot' + (i < c ? ' on' : ''), title: `${i + 1} chip${i ? 's' : ''}`, disabled: state.status !== 'open' ? 'disabled' : null,
        onclick: () => { setChips(state, r.id, i + 1 === c ? i : i + 1); renderDifferential(); } })),
      el('span', { class: 'meta' }, `${c}/${TUNING.chips}`));
    list.append(el('li', { class: 'dx' }, el('span', { class: 'head' }, nameLink(d, showFit ? { ...state, label: 'This patient' } : null), showFit ? pctBadge(r.score) : null), ops, chips,
      showFit ? el('div', { class: 'fit' }, el('span', { class: 'fit-track' }, el('span', { class: 'fit-bar', style: `width:${Math.round(100 * r.score)}%` })), el('span', {}, `explains ${r.explained} of ${r.total}`)) : null,
      showFit && r.unexplained.length ? el('div', { class: 'why' }, 'Does not explain: ', termList(r.unexplained.slice(0, 4)), r.unexplained.length > 4 ? '…' : null) : null));
  }
}

function renderConsult(showFit) {
  $('consult-pane').hidden = !suggestions;
  if (!suggestions) return;
  const list = $('consult-list'); list.replaceChildren();
  for (const r of suggestions) {
    const d = db.disease(r.id);
    const added = state.differential.includes(r.id), out = state.wrong.includes(r.id);
    list.append(el('li', { class: 'dx' }, el('span', { class: 'head' }, nameLink(d, showFit ? { ...state, label: 'This patient' } : null), pctBadge(r.score)),
      el('button', { class: 'btn small', disabled: added || out || state.status !== 'open' ? 'disabled' : null, onclick: () => { addCandidate(state, r.id); autoChips(db, state); renderDifferential(); } }, out ? 'Ruled out' : added ? 'Added' : 'Add'),
      el('div', { class: 'fit' }, el('span', { class: 'fit-track' }, el('span', { class: 'fit-bar', style: `width:${Math.round(100 * r.score)}%` })), el('span', {}, `explains ${r.explained} of ${r.total}`))));
  }
}
$('consult-close').onclick = () => { suggestions = null; renderDifferential(); };
$('consult-add-all').onclick = () => { if (state.status !== 'open') return; for (const r of suggestions || []) addCandidate(state, r.id); autoChips(db, state); renderDifferential(); };

function renderTests() {
  const root = $('tests'); root.replaceChildren();
  const groups = new Map();
  for (const t of db.tests) { if (!groups.has(t.kind)) groups.set(t.kind, []); groups.get(t.kind).push(t); }
  for (const [kind, tests] of groups) {
    const ul = el('ul', { class: 'test-list' });
    for (const t of tests) {
      const res = state.tests[t.id];
      const inBatch = selected.has(t.id);
      const order = el('button', { class: 'btn small' + (inBatch ? ' primary' : ''), disabled: state.status !== 'open' || res ? 'disabled' : null, title: inBatch ? 'Runs all ticked studies together' : null,
        onclick: () => (selected.has(t.id) ? runBatch() : act(() => orderTest(db, state, t.id))) }, inBatch ? 'Order batch' : 'Order');
      const tick = PARALLEL.has(t.kind) && !res && state.status === 'open' ? el('input', { type: 'checkbox', class: 'tick', title: 'Run together with other ticked studies', 'aria-label': `Select ${t.name}`, checked: inBatch ? '' : null,
        onchange: (ev) => { if (ev.target.checked) selected.add(t.id); else selected.delete(t.id); order.classList.toggle('primary', ev.target.checked); order.textContent = ev.target.checked ? 'Order batch' : 'Order'; order.title = ev.target.checked ? 'Runs all ticked studies together' : ''; renderBatch(); } }) : null;
      const li = el('li', { class: 'test' + (res ? ' done' : '') + (tick ? ' tickable' : '') }, tick, el('span', {}, t.name, el('div', { class: 'meta' }, `${hoursText(t.hours)} · $${t.cost}`)), order);
      if (res) {
        const body = res.text != null ? [res.text] : [termList(res.terms), res.terms.length && res.negs.length ? '. ' : null, res.negs.length ? ['Absent: ', termList(res.negs)] : null];
        li.append(el('div', { class: 'result ' + (res.terms.length || res.confirms ? 'pos' : 'neg') }, body, res.partial ? ' (more may emerge)' : null));
      }
      ul.append(li);
    }
    const done = tests.filter((t) => state.tests[t.id]).length;
    const sec = el('details', { class: 'test-group', open: openKinds.has(kind) ? '' : null, ontoggle: (ev) => { if (ev.target.open) openKinds.add(kind); else openKinds.delete(kind); } },
      el('summary', {}, el('h3', {}, KIND_NAMES[kind] || kind), el('span', { class: 'meta' }, done ? `${done} of ${tests.length} ordered` : `${tests.length} tests`)), ul);
    root.append(sec);
  }
  renderBatch();
}

const hoursText = (h) => (h < 1 ? Math.round(h * 60) + ' min' : h + ' h');
function renderBatch() {
  for (const id of selected) if (state.tests[id]) selected.delete(id);
  const tests = db.tests.filter((t) => selected.has(t.id));
  $('batch').hidden = tests.length === 0;
  if (tests.length) $('batch-sum').textContent = `${tests.length} ${tests.length === 1 ? 'study' : 'studies'} · ${hoursText(Math.max(...tests.map((t) => t.hours)))} · $${tests.reduce((a, t) => a + t.cost, 0).toLocaleString()}`;
}
function runBatch() { const ids = [...selected]; selected.clear(); act(() => orderTests(db, state, ids)); }
$('batch-run').onclick = runBatch;
$('batch-clear').onclick = () => { selected.clear(); renderTests(); };

function act(fn) { if (state.status !== 'open') return; fn(); autoChips(db, state); renderAll(); }

function confirmThen(title, text, fn) {
  $('cf-title').textContent = title; $('cf-text').textContent = text; $('confirm').hidden = false;
  $('cf-yes').onclick = () => { $('confirm').hidden = true; fn(); };
  $('cf-no').onclick = () => { $('confirm').hidden = true; };
}

function renderDebrief() {
  const d = db.disease(state.id);
  const won = state.status === 'won';
  recordCase();
  $('db-title').replaceChildren(won ? 'Correct: ' : state.committed ? 'Wrong. It was ' : 'Too late. It was ', nameLink(d, { ...state, label: 'This patient' }));
  const sc = $('db-score'); sc.textContent = won ? `${state.score} points · ${clockText(state.clock)} · $${state.spent.toLocaleString()}` : '0 points'; sc.className = 'score ' + (won ? 'won' : 'lost');
  if (won) { const best = store.get('best') || {}; if (!best[tier] || state.score > best[tier]) { best[tier] = state.score; store.set('best', best); } }
  const found = new Set(state.findings.map((f) => f.t));
  const body = $('db-body'); body.replaceChildren(
    won && state.bonus ? el('p', { class: 'def' }, `Chips bonus +${state.bonus.chips} · calibration bonus +${state.bonus.calibration} (chips on the answer over the whole case)`) : null,
    chipChart(),
    figure(d.id, true),
    el('p', { class: 'def' }, d.def || ''),
    d.prev ? el('p', { class: 'def' }, `${d.prev[0]}: ${d.prev[1]}.`) : null,
    wikiLink(d.id) ? el('p', { class: 'def' }, wikiLink(d.id, `Read about ${d.n} on Wikipedia`)) : null,
    el('h3', {}, 'Typical findings (highlighted = found in this patient)'),
    el('ul', { class: 'profile' }, d.t.slice(0, 40).map(([t, p]) => el('li', { class: 'chip' + (found.has(t) ? ' found' : ''), title: `${db.name(t)}, ${Math.round(p * 100)}% of patients` }, db.label(t)))),
    d.mayo ? el('p', { class: 'def' }, d.mayo) : null,
    el('p', { class: 'def' }, `Case ${tier}-${seed}. Source ids: ${d.src.join(', ')}. Mondo ${d.id}.`));
  $('btn-again').onclick = () => { $('debrief').hidden = true; location.hash = `#${tier}-${randomCode()}`; };
  $('btn-title').onclick = () => { $('debrief').hidden = true; };
  $('btn-copy').onclick = async () => { const url = location.href; try { await navigator.clipboard.writeText(url); $('btn-copy').textContent = 'Copied'; } catch { prompt('Case link', url); } };
  $('debrief').hidden = false;
}

// Debrief chart: chips on the true disease over the case clock (step line).
function chipChart() {
  const track = state.chipTrack;
  if (!track.length) return null;
  const W = 320, Hh = 60, pad = 4, end = Math.max(state.clock, state.H);
  const x = (h) => pad + ((W - 2 * pad) * h) / end, y = (c) => Hh - pad - ((Hh - 2 * pad) * c) / TUNING.chips;
  let dpath = `M${x(0)},${y(track[0].c)}`;
  for (const seg of track) dpath += ` L${x(seg.from)},${y(seg.c)} L${x(seg.to)},${y(seg.c)}`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${Hh}`); svg.setAttribute('class', 'chip-chart'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Chips on the true disease over time');
  svg.innerHTML = `<line x1="${pad}" y1="${y(0)}" x2="${W - pad}" y2="${y(0)}" class="axis"/><line x1="${pad}" y1="${y(TUNING.chips)}" x2="${W - pad}" y2="${y(TUNING.chips)}" class="axis faint"/><path d="${dpath}" class="line"/>`;
  return el('div', { class: 'chart-wrap' }, el('h3', {}, 'Your chips on the answer, over the case'), svg);
}

// search boxes with a suggestion list and keyboard navigation. find(q) -> [{key, node}], pick(key)
function wireSearch(inputId, boxId, find, pick) {
  const input = $(inputId), box = $(boxId);
  let selIdx = -1, matches = [];
  const choose = (m) => { box.hidden = true; input.value = ''; pick(m.key); };
  input.addEventListener('input', () => {
    box.replaceChildren(); selIdx = -1; matches = find(input.value.trim().toLowerCase());
    for (const m of matches) box.append(el('li', { role: 'option', onclick: () => choose(m) }, m.node));
    box.hidden = matches.length === 0;
  });
  input.addEventListener('keydown', (ev) => {
    const items = [...box.children];
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); selIdx = Math.max(0, Math.min(items.length - 1, selIdx + (ev.key === 'ArrowDown' ? 1 : -1))); items.forEach((li, i) => li.setAttribute('aria-selected', i === selIdx)); }
    else if (ev.key === 'Enter') { ev.preventDefault(); const m = matches[selIdx >= 0 ? selIdx : 0]; if (m) choose(m); }
    else if (ev.key === 'Escape') { box.hidden = true; }
  });
}
document.addEventListener('click', (ev) => { if (!ev.target.closest('.search')) for (const b of document.querySelectorAll('.suggest')) b.hidden = true; });

wireSearch('dx-search', 'dx-suggest', (q) => {
  const out = [];
  if (q.length < 2) return out;
  for (const e of db.index) {
    if (state.differential.includes(e.i)) continue;
    const syn = e.s.find((x) => x.toLowerCase().includes(q));
    if (e.n.toLowerCase().includes(q) || syn) out.push({ key: e.i, node: [e.n, syn && !e.n.toLowerCase().includes(q) ? el('span', { class: 'syn' }, ` (${syn})`) : null] });
    if (out.length >= 8) break;
  }
  return out;
}, (id) => { addCandidate(state, id); autoChips(db, state); renderDifferential(); });

// ---- watch-along mode: free findings, no patient, no clock. State lives in the URL hash.
const watch = { findings: [], negatives: [] };
function startWatch(spec) {
  const ids = (spec.replace(/^\//, '') || '').split(',').filter(Boolean);
  watch.findings = ids.filter((x) => !x.startsWith('-')).filter((t) => db.terms[t]).map((t) => ({ t }));
  watch.negatives = ids.filter((x) => x.startsWith('-')).map((x) => x.slice(1)).filter((t) => db.terms[t]).map((t) => ({ t }));
  show('screen-watch');
  renderWatch();
}
function watchChanged() {
  const spec = [...watch.findings.map((f) => f.t), ...watch.negatives.map((n) => '-' + n.t)].join(',');
  history.replaceState(null, '', '#watch' + (spec ? '/' + spec : ''));
  renderWatch();
}
function renderWatch() {
  const list = $('w-findings'); list.replaceChildren();
  const chip = (t, neg) => el('li', { class: 'chip click' + (neg ? ' neg' : ''), 'data-term': t, 'data-extra': `Click to mark ${neg ? 'present' : 'absent'}.`,
    onclick: () => { if (neg) { watch.negatives = watch.negatives.filter((n) => n.t !== t); watch.findings.push({ t }); } else { watch.findings = watch.findings.filter((f) => f.t !== t); watch.negatives.push({ t }); } watchChanged(); } },
    db.label(t), el('span', { class: 'rm', title: 'Remove', onclick: (ev) => { ev.stopPropagation(); watch.findings = watch.findings.filter((f) => f.t !== t); watch.negatives = watch.negatives.filter((n) => n.t !== t); watchChanged(); } }, '×'));
  for (const f of watch.findings) list.append(chip(f.t, false));
  for (const n of watch.negatives) list.append(chip(n.t, true));
  const out = $('w-list'); out.replaceChildren();
  const ranked = watch.findings.length >= 2 ? suggest(db, watch, 12) : [];
  $('w-hint').hidden = ranked.length > 0;
  for (const r of ranked) {
    const d = db.disease(r.id);
    out.append(el('li', { class: 'dx' }, nameLink(d, { ...watch, label: 'Entered' }), el('span', { class: 'meta' }, d.prev ? d.prev[1] : ''),
      el('div', { class: 'fit' }, el('span', { class: 'fit-track' }, el('span', { class: 'fit-bar', style: `width:${Math.round(100 * r.score)}%` })), el('span', {}, `explains ${r.explained} of ${r.total}`)),
      r.unexplained.length ? el('div', { class: 'why' }, 'Does not explain: ', termList(r.unexplained.slice(0, 4)), r.unexplained.length > 4 ? '…' : null) : null,
      d.def ? el('p', { class: 'def' }, d.def.length > 220 ? d.def.slice(0, 220) + '…' : d.def) : null));
  }
}
wireSearch('w-search', 'w-suggest', (q) => searchTerms(db, q, 10, new Set([...watch.findings, ...watch.negatives].map((x) => x.t))).map((e) => ({ key: e.id, node: [e.lay || e.name, e.lay ? el('span', { class: 'syn' }, ` (${e.name})`) : null] })),
  (id) => { watch.findings.push({ t: id }); watchChanged(); });
$('w-clear').onclick = () => { watch.findings = []; watch.negatives = []; watchChanged(); };
$('w-copy').onclick = async () => { try { await navigator.clipboard.writeText(location.href); $('w-copy').textContent = 'Copied'; setTimeout(() => { $('w-copy').textContent = 'Copy link'; }, 1500); } catch { prompt('Link', location.href); } };
$('btn-consult').onclick = () => act(() => { const ids = consult(db, state, suggest); if (ids.length) suggestions = ids.map((id) => fit(db, db.disease(id), state)); });
$('chips-auto').onclick = () => { state.chipsManual = false; autoChips(db, state); renderDifferential(); };

boot().catch((e) => { $('screen-loading').innerHTML = `<p class="loading">Could not load the game data (${e.message}). The data bundles in <code>data/</code> are built with <code>game/build</code>.</p>`; });
