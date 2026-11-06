import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTestDb } from './helpers.js';
import { pickDisease, createCase, orderTest, poolFor, treat } from '../engine/case.js';
import { differentialMap, isCut, organSystems } from '../engine/scoring.js';
import { makeRng } from '../engine/rng.js';

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
