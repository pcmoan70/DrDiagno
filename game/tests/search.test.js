import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTestDb } from './helpers.js';
import { searchTerms, searchDiseases } from '../web/engine/search.js';
import { suggest } from '../web/engine/scoring.js';

const db = loadTestDb();

test('term search finds seizure first and matches lay names', () => {
  const r = searchTerms(db, 'seizure');
  assert.equal(r[0].id, 'HP:0001250');
  assert.ok(searchTerms(db, 'foot drop').length > 0);
  assert.equal(searchTerms(db, 'x').length, 0);
  assert.ok(searchTerms(db, 'seizure', 5, new Set(['HP:0001250'])).every((e) => e.id !== 'HP:0001250'));
});

test('watch-along ranking: a textbook triad ranks its disease in the top 10', () => {
  // Rett syndrome: regression, stereotypic hand movements, microcephaly (postnatal)
  const state = { findings: [{ t: 'HP:0002376' }, { t: 'HP:0012171' }, { t: 'HP:0005484' }], negatives: [] };
  const top = suggest(db, state, 10).map((r) => db.disease(r.id).n.toLowerCase());
  assert.ok(top.some((n) => n.includes('rett')), top.join(' | '));
});

test('fuzzy search tolerates typos and word order, for findings and diseases', () => {
  const first = (q) => { const e = searchTerms(db, q)[0]; return e ? [e.name, e.lay] : []; }; // HPO name or everyday name
  assert.ok(first('hedache').includes('Headache'));
  assert.ok(first('diarhea').includes('Diarrhea'));
  assert.ok(first('sezure').includes('Seizure'));
  assert.ok(first('pain chest').includes('Chest pain'));
  assert.ok(first('foot drop').includes('Foot drop'));
  assert.ok(first('runny nose').includes('Rhinorrhea'), 'lay names still match as a phrase');
  const dz = (q) => searchDiseases(db, q).map((e) => e.n);
  assert.equal(dz('apendicitis')[0], 'appendicitis');
  assert.equal(dz('influenza')[0], 'influenza');
  assert.ok(dz('cold common')[0] === 'common cold', dz('cold common').join(' | '));
  assert.ok(dz('marfan').some((n) => /marfan/i.test(n)));
  assert.equal(searchDiseases(db, 'influenza', 8, new Set(['MONDO:0005812'])).some((e) => e.i === 'MONDO:0005812'), false);
});
