import { loadDb } from './engine/db.js';
import { pickDisease, createCase, orderTest, consult, addCandidate, removeCandidate, treat, commit, patientFor, poolFor, CONSULT } from './engine/case.js';
import { rankDifferential, suggest } from './engine/scoring.js';
import { randomCode } from './engine/rng.js';

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

let db, state, tier, seed;
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } } };

function show(id) { for (const s of document.querySelectorAll('main.screen')) s.hidden = s.id !== id; $('hud').hidden = id !== 'screen-play'; }
function clockText(h) { const day = Math.floor((h + 8) / 24) + 1; const hh = Math.floor((h + 8) % 24); const mm = Math.round(((h + 8) % 1) * 60); return `Day ${day}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }

async function boot() {
  db = await loadDb('.');
  await db.loadAll((done, total) => { $('load-progress').textContent = `${Math.round(100 * done / total)}%`; });
  renderTitle();
  window.addEventListener('hashchange', route);
  route();
}

function route() {
  const m = location.hash.match(/^#(resident|attending|house)-([a-z0-9]+)$/);
  if (m) startCase(m[1], m[2]); else show('screen-title');
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
  show('screen-play');
  renderAll();
}

function renderAll() { const y = window.scrollY; renderHud(); renderPatient(); renderDifferential(); renderTests(); window.scrollTo(0, y); if (state.status !== 'open') renderDebrief(); }

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
    root.append(el('div', { class: 'test-group' }, el('h3', {}, KIND_NAMES[kind] || kind), ul));
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

// disease search
let selIdx = -1, matches = [];
$('dx-search').addEventListener('input', (ev) => {
  const q = ev.target.value.trim().toLowerCase();
  const box = $('dx-suggest'); box.replaceChildren(); selIdx = -1; matches = [];
  if (q.length < 2) { box.hidden = true; return; }
  for (const e of db.index) {
    if (state.differential.includes(e.i)) continue;
    const syn = e.s.find((x) => x.toLowerCase().includes(q));
    if (e.n.toLowerCase().includes(q) || syn) { matches.push(e); box.append(el('li', { role: 'option', onclick: () => pickMatch(e) }, e.n, syn && !e.n.toLowerCase().includes(q) ? el('span', { class: 'syn' }, ` (${syn})`) : null)); }
    if (matches.length >= 8) break;
  }
  box.hidden = matches.length === 0;
});
$('dx-search').addEventListener('keydown', (ev) => {
  const items = [...$('dx-suggest').children];
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); selIdx = Math.max(0, Math.min(items.length - 1, selIdx + (ev.key === 'ArrowDown' ? 1 : -1))); items.forEach((li, i) => li.setAttribute('aria-selected', i === selIdx)); }
  else if (ev.key === 'Enter') { ev.preventDefault(); if (matches[selIdx >= 0 ? selIdx : 0]) pickMatch(matches[selIdx >= 0 ? selIdx : 0]); }
  else if (ev.key === 'Escape') { $('dx-suggest').hidden = true; }
});
function pickMatch(e) { $('dx-suggest').hidden = true; $('dx-search').value = ''; addCandidate(state, e.i); renderDifferential(); }
document.addEventListener('click', (ev) => { if (!ev.target.closest('.search')) $('dx-suggest').hidden = true; });
$('btn-consult').onclick = () => act(() => { for (const id of consult(db, state, suggest)) addCandidate(state, id); });

boot().catch((e) => { $('screen-loading').innerHTML = `<p class="loading">Could not load the game data (${e.message}). The data bundles in <code>data/</code> are built with <code>game/build</code>.</p>`; });
