import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTestDb } from './helpers.js';
import { suggest } from '../web/engine/scoring.js';
import { poolFor } from '../web/engine/case.js';

const db = loadTestDb();
const byName = (n) => db.index.find((e) => e.n === n);

test('common diseases are in the library with measured or literature-derived findings', () => {
  for (const n of ['common cold', 'influenza', 'appendicitis', 'asthma', 'myocardial infarction', 'pneumonia', 'migraine disorder']) {
    const e = byName(n);
    assert.ok(e, `${n} missing from the index`);
    const d = db.disease(e.i);
    assert.ok(d.src.some((s) => s.startsWith('DDXPLUS:') || s.startsWith('HSDN:')), `${n} should come from DDXPlus or HSDN`);
    assert.ok(d.t.length >= 5 && d.t.every(([, p]) => p > 0 && p <= 1), `${n} has ${d.t.length} findings`);
  }
  assert.ok(db.disease(byName('common cold').i).src[0].startsWith('DDXPLUS:'), 'common cold uses measured frequencies');
  assert.ok(poolFor(db, 'student').includes(byName('common cold').i), 'students meet the common cold');
});

test('a cold-like picture ranks common respiratory infections near the top of the whole library', () => {
  const t = (name) => Object.keys(db.terms).find((k) => db.terms[k][0] === name);
  const state = { findings: ['Fever', 'Cough', 'Nasal congestion', 'Pharyngalgia', 'Headache'].map((n) => ({ t: t(n) })), negatives: [] };
  assert.ok(state.findings.every((f) => f.t), 'all finding terms resolve');
  const top = suggest(db, state, 10).map((r) => db.disease(r.id).n);
  assert.ok(top.some((n) => ['common cold', 'influenza', 'pharyngitis', 'bronchitis', 'sinusitis'].includes(n)), `top 10 was ${top.join(', ')}`);
});
