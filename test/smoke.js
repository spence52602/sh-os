/* Smoke test for the pure parts of sh-os.js, run with `npm test`.
   The runtime is one browser IIFE with no exports, so this lifts the self-contained blocks it needs out of the
   source text and evaluates them in Node: the sidechain shape, the cutoff mapping and the key tables. It is a
   characterisation net for refactors, not a test of the audio graph (that needs a browser). */
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'sh-os.js'), 'utf8');

/** Evaluate the source between two markers (start inclusive, end exclusive) and return the named bindings. */
function lift(start, end, names) {
  const a = src.indexOf(start), b = src.indexOf(end, a);
  assert(a >= 0 && b > a, `markers not found: ${start} … ${end}`);
  return new Function(`${src.slice(a, b)}\n; return { ${names.join(', ')} };`)();   // newline first: a lifted line may end in a comment
}

// sidechain: the Kickstart-measured duck, one beat long, starts and ends at unity, bottoms out around 30 ms, no steps
const sc = lift('  var SC_CURVE', '  function scCurve(mix)', ['SC_SHAPE', 'SC_REF_BEAT_MS']);
const N = sc.SC_SHAPE.length;
assert.strictEqual(sc.SC_SHAPE[0], 1);
assert.strictEqual(sc.SC_SHAPE[N - 1], 1);
let min = 1, minAt = 0, maxStep = 0;
for (let i = 0; i < N; i++) {
  if (sc.SC_SHAPE[i] < min) { min = sc.SC_SHAPE[i]; minAt = i / (N - 1) * sc.SC_REF_BEAT_MS; }
  if (i) maxStep = Math.max(maxStep, Math.abs(sc.SC_SHAPE[i] - sc.SC_SHAPE[i - 1]));
}
assert(min < 0.03 && minAt > 20 && minAt < 40, `duck floor ${min.toFixed(3)} at ${minAt.toFixed(1)} ms`);
assert(maxStep < 0.12, `sidechain shape has a step of ${maxStep.toFixed(3)} between points`);

// cutoff: 40 Hz … 20 kHz, log-spaced
const cut = lift('  function cutoffHz', '\n', ['cutoffHz']);
assert.strictEqual(Math.round(cut.cutoffHz(0)), 40);
assert.strictEqual(Math.round(cut.cutoffHz(1)), 20000);
assert(Math.abs(cut.cutoffHz(0.5) - Math.sqrt(40 * 20000)) < 1);

// keyboard map: 24 distinct keys, two octaves from z
const kb = lift('  var QWERTY', '\n', ['QWERTY']);
assert.strictEqual(kb.QWERTY.length, 24);
assert.strictEqual(new Set(kb.QWERTY).size, 24);
assert.strictEqual(kb.QWERTY[0], 'z');

// no em dashes in the WHY? copy (Spence's brief)
const why = /var WHY_COPY = '([^']*)'/.exec(src);
assert(why && !why[1].includes('—'), 'WHY_COPY contains an em dash');

console.log('smoke: sidechain shape, cutoff mapping, QWERTY map, WHY copy ok');
