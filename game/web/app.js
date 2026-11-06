import { loadDb } from './engine/db.js';
import { pickDisease, createCase, orderTest, consult, addCandidate, removeCandidate, treat, commit, patientFor, poolFor, CONSULT } from './engine/case.js';
import { rankDifferential, suggest, differentialMap } from './engine/scoring.js';
import { randomCode } from './engine/rng.js';
import { searchTerms } from './engine/search.js';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== null && v !== undefined) e.setAttribute(k, v); }
  for (const k of kids.flat()) if (k !== null && k !== undefined) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
};
const TIERS = [
  { id: 'resident', name: 'Resident', blurb: 'Well-described diseases with plenty of findings. Learn the ropes.', clock: '72 h' },
  { id: 'attending', name: 'Attending', blurb: 'The full library. Decoys share most of the picture.', clock: '60 h' },
  { id: 'house', name: 'House', blurb: 'Rare diseases, misleading openers, a fast clock. Everybody lies.', clock: '48 h' },
];
const KIND_NAMES = { history: 'History', exam: 'Examination', lab: 'Laboratory', imaging: 'Imaging', special: 'Specialist studies' };
const SRC = { presenting: 'presenting', progression: 'developed', drug: 'after treatment' };

let db, state, tier, seed, mapPrev; // mapPrev: compatible count at the last render, for the 'ruled out' toast
const openKinds = new Set(['history']); // expanded workup sections, kept across re-renders
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
  renderTitle();
  window.addEventListener('hashchange', route);
  route();
}

function route() {
  const m = location.hash.match(/^#(resident|attending|house)-([a-z0-9]+)$/);
  if (m) startCase(m[1], m[2]);
  else if (location.hash.startsWith('#watch')) startWatch(location.hash.slice(7));
  else show('screen-title');
}

function renderTitle() {
  const tiers = $('tiers'); tiers.replaceChildren();
  for (const t of TIERS) {
    const n = poolFor(db, t.id).length;
    tiers.append(el('div', { class: 'tier' }, el('h3', {}, t.name), el('p', {}, t.blurb), el('span', { class: 'meta' }, `${n.toLocaleString()} diseases · ${t.clock} to diagnose`),
      el('button', { class: 'btn primary', onclick: () => { location.hash = `#${t.id}-${randomCode()}`; } }, 'New case')));
  }
  $('code-form').onsubmit = (ev) => { ev.preventDefault(); const v = $('code-input').value.trim().toLowerCase().replace(/^#/, ''); if (/^(resident|attending|house)-[a-z0-9]+$/.test(v)) location.hash = '#' + v; };
  const best = store.get('best') || {};
  $('best').textContent = Object.keys(best).length ? 'Best scores: ' + TIERS.filter((t) => best[t.id]).map((t) => `${t.name} ${best[t.id]}`).join(' · ') : '';
  show('screen-title');
}

function startCase(t, s) {
  tier = t; seed = s;
  const id = pickDisease(db, { tier, seed });
  state = createCase(db, { tier, seed, id });
  state.patient = patientFor(db, state);
  $('hud-code').textContent = `${tier}-${seed}`;
  $('dx-search').value = '';
  mapPrev = null; $('map').hidden = tier === 'house'; $('map').open = tier === 'resident';
  show('screen-play');
  renderAll();
}

function renderAll() { const y = window.scrollY; renderHud(); renderPatient(); renderDifferential(); renderMap(); renderTests(); window.scrollTo(0, y); if (state.status !== 'open') renderDebrief(); }

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
    list.append(el('li', { class: x.count ? '' : 'cut', title: probes.length ? `Probed by: ${probes.join(', ')}` : 'No test targets this system directly' },
      el('span', { class: 'sys' }, x.name), el('span', { class: 'fit-track' }, el('span', { class: 'fit-bar', style: `width:${Math.round(100 * x.count / max)}%` })), el('span', { class: 'n' }, x.count)));
  }
}

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
  for (const f of state.findings) list.append(el('li', { class: 'chip', title: db.name(f.t) + ' (' + f.t + ')' }, db.label(f.t), el('span', { class: 'src' }, SRC[f.src] || db.testById.get(f.src)?.name || f.src)));
  for (const n of state.negatives) list.append(el('li', { class: 'chip neg', title: 'Absent: ' + db.name(n.t) }, db.label(n.t)));
  const log = $('log'); log.replaceChildren();
  for (const l of state.log.slice().reverse()) log.append(el('li', {}, el('span', { class: 'at' }, clockText(l.at)), el('span', {}, l.text)));
}

function renderDifferential() {
  const list = $('dx-list'); list.replaceChildren();
  const ranked = rankDifferential(db, state);
  $('dx-hint').hidden = ranked.length > 0;
  $('btn-consult').disabled = state.status !== 'open';
  for (const r of ranked) {
    const d = db.disease(r.id);
    const drugs = (db.drugsByDisease[r.id] || [[]])[0];
    const ops = el('div', { class: 'ops' },
      drugs.length ? el('button', { class: 'btn small', title: `Treat as ${d.n} with ${db.drugs[drugs[0]][0]} (4 h, $150)`, onclick: () => confirmThen('Treat', `Start ${db.drugs[drugs[0]][0]} for ${d.n}? If this is the wrong disease it may cause harm or side effects.`, () => act(() => treat(db, state, drugs[0]))) }, 'Treat') : null,
      el('button', { class: 'btn small primary', onclick: () => confirmThen('Commit', `Commit to the diagnosis ${d.n}? The case ends.`, () => act(() => commit(db, state, r.id))) }, 'Diagnose'),
      el('button', { class: 'btn small', title: 'Remove from differential', onclick: () => act(() => removeCandidate(state, r.id)) }, '×'));
    list.append(el('li', { class: 'dx' }, el('span', { class: 'name' }, d.n), ops,
      el('div', { class: 'fit' }, el('span', { class: 'fit-track' }, el('span', { class: 'fit-bar', style: `width:${Math.round(100 * r.score)}%` })), el('span', {}, `explains ${r.explained} of ${r.total}`)),
      r.unexplained.length ? el('div', { class: 'why' }, 'Does not explain: ' + r.unexplained.slice(0, 4).map((t) => db.label(t)).join(', ') + (r.unexplained.length > 4 ? '…' : '')) : null));
  }
}

function renderTests() {
  const root = $('tests'); root.replaceChildren();
  const groups = new Map();
  for (const t of db.tests) { if (!groups.has(t.kind)) groups.set(t.kind, []); groups.get(t.kind).push(t); }
  for (const [kind, tests] of groups) {
    const ul = el('ul', { class: 'test-list' });
    for (const t of tests) {
      const res = state.tests[t.id];
      const li = el('li', { class: 'test' + (res ? ' done' : '') }, el('span', {}, t.name, el('div', { class: 'meta' }, `${t.hours < 1 ? Math.round(t.hours * 60) + ' min' : t.hours + ' h'} · $${t.cost}`)),
        el('button', { class: 'btn small', disabled: state.status !== 'open' || res ? 'disabled' : null, onclick: () => act(() => orderTest(db, state, t.id)) }, 'Order'));
      if (res) {
        const text = (res.text ?? [res.terms.map((x) => db.name(x)).join('; '), res.negs.length ? 'Absent: ' + res.negs.map((x) => db.name(x)).join('; ') : ''].filter(Boolean).join('. ')) + (res.partial ? ' (more may emerge)' : '');
        li.append(el('div', { class: 'result ' + (res.terms.length || res.confirms ? 'pos' : 'neg') }, text));
      }
      ul.append(li);
    }
    const done = tests.filter((t) => state.tests[t.id]).length;
    const sec = el('details', { class: 'test-group', open: openKinds.has(kind) ? '' : null, ontoggle: (ev) => { if (ev.target.open) openKinds.add(kind); else openKinds.delete(kind); } },
      el('summary', {}, el('h3', {}, KIND_NAMES[kind] || kind), el('span', { class: 'meta' }, done ? `${done} of ${tests.length} ordered` : `${tests.length} tests`)), ul);
    root.append(sec);
  }
}

function act(fn) { if (state.status !== 'open') return; fn(); renderAll(); }

function confirmThen(title, text, fn) {
  $('cf-title').textContent = title; $('cf-text').textContent = text; $('confirm').hidden = false;
  $('cf-yes').onclick = () => { $('confirm').hidden = true; fn(); };
  $('cf-no').onclick = () => { $('confirm').hidden = true; };
}

function renderDebrief() {
  const d = db.disease(state.id);
  const won = state.status === 'won';
  $('db-title').textContent = won ? `Correct: ${d.n}` : state.committed ? `Wrong. It was ${d.n}` : `Too late. It was ${d.n}`;
  const sc = $('db-score'); sc.textContent = won ? `${state.score} points · ${clockText(state.clock)} · $${state.spent.toLocaleString()}` : '0 points'; sc.className = 'score ' + (won ? 'won' : 'lost');
  if (won) { const best = store.get('best') || {}; if (!best[tier] || state.score > best[tier]) { best[tier] = state.score; store.set('best', best); } }
  const found = new Set(state.findings.map((f) => f.t));
  const body = $('db-body'); body.replaceChildren(
    el('p', { class: 'def' }, d.def || ''),
    d.prev ? el('p', { class: 'def' }, `${d.prev[0]}: ${d.prev[1]}.`) : null,
    el('h3', {}, 'Typical findings (highlighted = found in this patient)'),
    el('ul', { class: 'profile' }, d.t.slice(0, 40).map(([t, p]) => el('li', { class: 'chip' + (found.has(t) ? ' found' : ''), title: `${db.name(t)}, ${Math.round(p * 100)}% of patients` }, db.label(t)))),
    d.mayo ? el('p', { class: 'def' }, d.mayo) : null,
    el('p', { class: 'def' }, `Case ${tier}-${seed}. Source ids: ${d.src.join(', ')}. Mondo ${d.id}.`));
  $('btn-again').onclick = () => { $('debrief').hidden = true; location.hash = `#${tier}-${randomCode()}`; };
  $('btn-title').onclick = () => { $('debrief').hidden = true; };
  $('btn-copy').onclick = async () => { const url = location.href; try { await navigator.clipboard.writeText(url); $('btn-copy').textContent = 'Copied'; } catch { prompt('Case link', url); } };
  $('debrief').hidden = false;
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
}, (id) => { addCandidate(state, id); renderDifferential(); });

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
  const chip = (t, neg) => el('li', { class: 'chip click' + (neg ? ' neg' : ''), title: `${db.name(t)} (${t}). Click to mark ${neg ? 'present' : 'absent'}.`,
    onclick: () => { if (neg) { watch.negatives = watch.negatives.filter((n) => n.t !== t); watch.findings.push({ t }); } else { watch.findings = watch.findings.filter((f) => f.t !== t); watch.negatives.push({ t }); } watchChanged(); } },
    db.label(t), el('span', { class: 'rm', title: 'Remove', onclick: (ev) => { ev.stopPropagation(); watch.findings = watch.findings.filter((f) => f.t !== t); watch.negatives = watch.negatives.filter((n) => n.t !== t); watchChanged(); } }, '×'));
  for (const f of watch.findings) list.append(chip(f.t, false));
  for (const n of watch.negatives) list.append(chip(n.t, true));
  const out = $('w-list'); out.replaceChildren();
  const ranked = watch.findings.length >= 2 ? suggest(db, watch, 12) : [];
  $('w-hint').hidden = ranked.length > 0;
  for (const r of ranked) {
    const d = db.disease(r.id);
    out.append(el('li', { class: 'dx' }, el('span', { class: 'name' }, d.n), el('span', { class: 'meta' }, d.prev ? d.prev[1] : ''),
      el('div', { class: 'fit' }, el('span', { class: 'fit-track' }, el('span', { class: 'fit-bar', style: `width:${Math.round(100 * r.score)}%` })), el('span', {}, `explains ${r.explained} of ${r.total}`)),
      r.unexplained.length ? el('div', { class: 'why' }, 'Does not explain: ' + r.unexplained.slice(0, 4).map((t) => db.label(t)).join(', ') + (r.unexplained.length > 4 ? '…' : '')) : null,
      d.def ? el('p', { class: 'def' }, d.def.length > 220 ? d.def.slice(0, 220) + '…' : d.def) : null));
  }
}
wireSearch('w-search', 'w-suggest', (q) => searchTerms(db, q, 10, new Set([...watch.findings, ...watch.negatives].map((x) => x.t))).map((e) => ({ key: e.id, node: [e.lay || e.name, e.lay ? el('span', { class: 'syn' }, ` (${e.name})`) : null] })),
  (id) => { watch.findings.push({ t: id }); watchChanged(); });
$('w-clear').onclick = () => { watch.findings = []; watch.negatives = []; watchChanged(); };
$('w-copy').onclick = async () => { try { await navigator.clipboard.writeText(location.href); $('w-copy').textContent = 'Copied'; setTimeout(() => { $('w-copy').textContent = 'Copy link'; }, 1500); } catch { prompt('Link', location.href); } };
$('btn-consult').onclick = () => act(() => { for (const id of consult(db, state, suggest)) addCandidate(state, id); });

boot().catch((e) => { $('screen-loading').innerHTML = `<p class="loading">Could not load the game data (${e.message}). The data bundles in <code>data/</code> are built with <code>game/build</code>.</p>`; });
