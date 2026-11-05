import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTestDb } from './helpers.js';
import { pickDisease, createCase, orderTest, advance, commit, treat, addCandidate, poolFor } from '../engine/case.js';
import { fit, rankDifferential } from '../engine/scoring.js';
import { makeRng } from '../engine/rng.js';

const db = loadTestDb();
const newCase = (tier, seed) => { const id = pickDisease(db, { tier, seed }); return createCase(db, { tier, seed, id }); };

test('rng is deterministic', () => {
  const a = makeRng('x'), b = makeRng('x');
  assert.equal(a(), b());
});

test('every tier has a pool', () => {
  for (const tier of ['resident', 'attending', 'house']) assert.ok(poolFor(db, tier).length > 100, tier);
});

test('same seed gives the same case', () => {
  const a = newCase('house', 'abc'), b = newCase('house', 'abc');
  assert.equal(a.id, b.id);
  assert.deepEqual(a.findings, b.findings);
  assert.deepEqual(a.timeline, b.timeline);
});

test('presenting findings never leak the diagnosis and are patient-visible', () => {
  for (let i = 0; i < 200; i++) {
    const s = newCase('attending', `seed${i}`);
    assert.ok(s.findings.length >= 2 && s.findings.length <= 3, `presenting count ${s.findings.length}`);
    for (const f of s.findings) assert.ok(db.terms[f.t], 'known term');
    assert.ok(!JSON.stringify(s.findings).includes(db.disease(s.id).n));
  }
});

test('progression reveals findings and the clock drains stability', () => {
  const s = newCase('house', 'prog');
  const before = s.findings.length;
  advance(db, s, s.H * 0.5);
  assert.ok(s.findings.length > before);
  assert.ok(s.stability < 100 && s.stability > 0);
  advance(db, s, s.H);
  assert.equal(s.status, 'lost');
});

test('every test resolves and is idempotent', () => {
  const s = newCase('attending', 'tests');
  for (const t of db.tests) { orderTest(db, s, t.id); if (s.status !== 'open') break; assert.ok(s.tests[t.id], t.id); }
  const n = Object.keys(s.tests).length;
  orderTest(db, s, db.tests[0].id);
  assert.equal(Object.keys(s.tests).length, n);
});

test('the true disease fits better than a random one on average', () => {
  let wins = 0, n = 0;
  for (let i = 0; i < 150; i++) {
    const s = newCase('attending', `fit${i}`);
    for (const id of ['ex_vitals', 'hx_constitutional', 'ex_neuro', 'ex_skin', 'lab_cbc', 'lab_chem']) orderTest(db, s, id);
    const rand = makeRng(`r${i}`).pick(db.index).i;
    if (rand === s.id) continue;
    n++;
    if (fit(db, db.disease(s.id), s).score > fit(db, db.disease(rand), s).score) wins++;
  }
  assert.ok(wins / n > 0.9, `true disease won ${wins}/${n}`);
});

test('commit scores correct and wrong answers', () => {
  const s = newCase('resident', 'c1');
  const d = db.disease(s.id);
  const wrong = d.decoys[0];
  const s2 = newCase('resident', 'c1');
  commit(db, s, s.id);
  assert.equal(s.status, 'won'); assert.ok(s.score > 0);
  commit(db, s2, wrong);
  assert.equal(s2.status, 'lost'); assert.equal(s2.score, 0);
});

test('treatment with the indicated drug halts the drain', () => {
  const withDrug = Object.entries(db.drugsByDisease).find(([id, [ind]]) => ind.length && db.index.find((e) => e.i === id)?.tiers.includes('attending'));
  assert.ok(withDrug);
  const [id, [ind]] = withDrug;
  const s = createCase(db, { tier: 'attending', seed: 'tx', id });
  treat(db, s, ind[0]);
  assert.equal(s.treated, true);
  const st = s.stability;
  advance(db, s, 10);
  assert.equal(s.stability, st);
});

test('1000 random cases run to completion without errors', () => {
  const tiers = ['resident', 'attending', 'house'];
  for (let i = 0; i < 1000; i++) {
    const tier = tiers[i % 3];
    const s = newCase(tier, `run${i}`);
    const rng = makeRng(i);
    addCandidate(s, s.id);
    for (const dec of db.disease(s.id).decoys) addCandidate(s, dec);
    let steps = 0;
    while (s.status === 'open' && steps++ < 12) {
      orderTest(db, s, rng.pick(db.tests).id);
      rankDifferential(db, s);
    }
    if (s.status === 'open') commit(db, s, rng() < 0.5 ? s.id : s.differential[1]);
    assert.ok(['won', 'lost'].includes(s.status));
  }
});
