import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// app.js runs as a module, so a top-level `const history = ...` silently replaces window.history for the
// whole file (it broke the watch-along's history.replaceState once). Keep browser globals unshadowed.
const BROWSER_GLOBALS = ['history', 'location', 'name', 'status', 'event', 'top', 'parent', 'self', 'close', 'open', 'print', 'stop', 'screen', 'navigator', 'document', 'window'];

test('app.js declares no top-level binding that shadows a browser global', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'app.js'), 'utf8');
  const re = /^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm;
  const shadowed = [...src.matchAll(re)].map((m) => m[1]).filter((n) => BROWSER_GLOBALS.includes(n));
  assert.deepEqual(shadowed, []);
});
