import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTestDb } from './helpers.js';
import { pickDisease, createCase, orderTest, poolFor, treat } from '../web/engine/case.js';
import { differentialMap, isCut, organSystems, suggestTests, vennSets, explainStrength, fit } from '../web/engine/scoring.js';
import { makeRng } from '../web/engine/rng.js';

const db = loadTestDb();

test('organ systems: 23 roots under Phenotypic abnormality', () => {
  assert.equal(organSystems(db).length, 23);
});

test('differential map never rules out the true disease (300 random cases, random workups, treatments)', () => {
  const plain = db.tests.filter((t) => !t.special).map((t) => t.id);
  const drugIds = Object.keys(db.drugs);
  for (const tier of ['resident', 'attending', 'house']) {
    const pool = poolFor(db, tier);
    for (let i = 0; i < 100; i++) {
      const seed = `map${i}`, rng = makeRng(seed);
      const id = pickDisease(db, { tier, seed });
      const s = createCase(db, { tier, seed, id });
      let prev = pool.length;
      for (let k = 0; k < 5 && s.status === 'open'; k++) {
        if (k === 2) treat(db, s, rng.pick(drugIds)); else orderTest(db, s, rng.pick(plain));
        const m = differentialMap(db, s, pool);
        assert.equal(m.total, pool.length);
        assert.ok(m.compatible >= 1 && m.compatible <= prev + pool.length, 'count in range');
        const truth = db.disease(id);
        assert.ok(!isCut(db, truth, { findings: s.findings.filter((f) => f.src !== 'drug'), negatives: s.negatives }), `truth cut: ${truth.n} (${tier}-${seed})`);
        assert.ok(m.systems.every((x) => x.count <= m.compatible));
        prev = m.compatible;
      }
      // the truth itself must be counted compatible: recompute with a pool of one
      assert.equal(differentialMap(db, s, [id]).compatible, 1, `truth not compatible: ${db.disease(id).n} (${tier}-${seed})`);
    }
  }
});

test('differential map shrinks as findings accumulate (typical case)', () => {
  const tier = 'resident', seed = 'shrink1';
  const id = pickDisease(db, { tier, seed });
  const s = createCase(db, { tier, seed, id });
  const pool = poolFor(db, tier);
  const m0 = differentialMap(db, s, pool);
  for (const t of ['ex_vitals', 'ex_neuro', 'ex_skin', 'lab_cbc']) if (db.testById.has(t)) orderTest(db, s, t);
  const m1 = differentialMap(db, s, pool);
  assert.ok(m0.compatible < pool.length, 'presenting findings already prune');
  assert.ok(m1.compatible <= m0.compatible, `${m1.compatible} <= ${m0.compatible}`);
});

test('suggestTests proposes unordered studies that split the fitting diseases', () => {
  const id = pickDisease(db, { tier: 'student', seed: 'coach' });
  const s = createCase(db, { tier: 'student', seed: 'coach', id });
  orderTest(db, s, 'ex_vitals');
  const tips = suggestTests(db, s, poolFor(db, 'student'));
  assert.ok(tips.length >= 1 && tips.length <= 3);
  for (const x of tips) { assert.ok(!s.tests[x.id]); assert.ok(x.probes > 0 && x.probes < x.total); }
  for (let i = 1; i < tips.length; i++) assert.ok(tips[i - 1].gain >= tips[i].gain);
});

test('venn sets: every finding in exactly one region, the truth explains all its own non-drug findings', () => {
  const plain = db.tests.filter((t) => !t.special).map((t) => t.id);
  const pool = poolFor(db, 'student');
  for (let i = 0; i < 30; i++) {
    const seed = `venn${i}`, rng = makeRng(seed);
    const id = pickDisease(db, { tier: 'student', seed });
    const s = createCase(db, { tier: 'student', seed, id });
    for (let k = 0; k < 4; k++) orderTest(db, s, rng.pick(plain));
    const others = [rng.pick(pool), rng.pick(pool)].filter((x) => x !== id);
    const ids = [id, ...others];
    const regions = vennSets(db, s, ids);
    assert.equal([...regions.values()].reduce((a, b) => a + b.length, 0), s.findings.length);
    for (const [mask, fs] of regions) {
      assert.ok(mask >= 0 && mask < 1 << ids.length);
      for (const f of fs) if (f.src !== 'drug') assert.ok(mask & 1, `truth ${db.disease(id).n} does not explain ${db.label(f.t)} (${seed})`);
      // the region agrees with the fit score's "unexplained" list for each candidate
      ids.forEach((cid, j) => { const un = new Set(fit(db, db.disease(cid), s).unexplained); for (const f of fs) assert.equal(!!(mask & (1 << j)), !un.has(f.t)); });
    }
  }
});
