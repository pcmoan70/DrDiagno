// Seeded random numbers so a case code always reproduces the same case.
export function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function makeRng(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashSeed(String(seed));
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.pick = (arr) => arr[Math.floor(next() * arr.length)];
  // Weighted pick without replacement: returns k items.
  next.weightedSample = (items, weightOf, k) => {
    const pool = items.slice();
    const out = [];
    while (out.length < k && pool.length) {
      const w = pool.map(weightOf);
      const total = w.reduce((s, x) => s + x, 0);
      let r = next() * total;
      let i = 0;
      for (; i < pool.length - 1; i++) {
        r -= w[i];
        if (r <= 0) break;
      }
      out.push(pool.splice(i, 1)[0]);
    }
    return out;
  };
  return next;
}

export function randomCode() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const buf = new Uint32Array(6);
  (globalThis.crypto || { getRandomValues: (b) => { for (let i = 0; i < b.length; i++) b[i] = (Math.random() * 4294967296) >>> 0; } }).getRandomValues(buf);
  for (const v of buf) s += chars[v % chars.length];
  return s;
}
