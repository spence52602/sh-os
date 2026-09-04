/* Smoke test for the pure modules, run with `npm test`. Node strips the types itself, so this imports the source
   directly: the sidechain and flutter shapes, the cutoff law, the key tables and the copy. It is a characterisation
   net for refactors, not a test of the audio graph (test/browser.mjs covers that). */
import assert from 'node:assert/strict';
import { buildShape, SC_REF_BEAT_MS } from '../src/audio/sidechain.ts';
import { buildFlutter, flutterPeriod, FLUTTER_DIVS } from '../src/audio/flutter.ts';
import { cutoffHz, DEFAULT_PARAMS } from '../src/audio/tuning.ts';
import { COMMAND_KEYS, PIANO, QWERTY, GUIDE } from '../src/geometry.ts';
import { STACK, WHY_COPY, BROWSE } from '../src/content.ts';

// sidechain: the Kickstart-measured duck, one beat long, starts and ends at unity, bottoms out around 30 ms, no steps
const sc = buildShape(); const N = sc.length;
assert.equal(sc[0], 1); assert.equal(sc[N - 1], 1);
let min = 1, minAt = 0, maxStep = 0;
for (let i = 0; i < N; i++) { if (sc[i] < min) { min = sc[i]; minAt = i / (N - 1) * SC_REF_BEAT_MS; } if (i) maxStep = Math.max(maxStep, Math.abs(sc[i] - sc[i - 1])); }
assert(min < 0.03 && minAt > 20 && minAt < 40, `duck floor ${min.toFixed(3)} at ${minAt.toFixed(1)} ms`);
assert(maxStep < 0.12, `sidechain shape has a step of ${maxStep.toFixed(3)}`);

// flutter: hard ramp to 1 within the first 5%, a curved fall, a soft floor and a small lift; joins its own tail
const fl = buildFlutter(); const M = fl.length;
const peakAt = fl.indexOf(Math.max(...fl));
assert(Math.max(...fl) > 0.999 && peakAt / M <= 0.05, `flutter peak at ${(peakAt / M * 100).toFixed(1)}% of the period`);
assert(Math.min(...fl) < 0.03, 'flutter never closes');
assert(Math.abs(fl[M - 1] - fl[0]) < 0.02, 'flutter period does not join its own start');
let stepF = 0; for (let i = 1; i < M; i++) stepF = Math.max(stepF, Math.abs(fl[i] - fl[i - 1]));
assert(stepF < 0.05, `flutter has a step of ${stepF.toFixed(3)}`);
for (let i = peakAt + 1; i < M * 0.85; i++) assert(fl[i] <= fl[i - 1] + 1e-9, 'flutter fall is not monotonic');
assert.equal(+flutterPeriod(8, 132).toFixed(4), +(60 / 132 / 2).toFixed(4));
assert.deepEqual([...FLUTTER_DIVS], [8, 16, 4]);
assert.equal(DEFAULT_PARAMS.flutterDiv, 8);

// cutoff: 40 Hz … 20 kHz, log-spaced
assert.equal(Math.round(cutoffHz(0)), 40); assert.equal(Math.round(cutoffHz(1)), 20000);
assert(Math.abs(cutoffHz(0.5) - Math.sqrt(40 * 20000)) < 1);

// keys: 31 command keys with actions and labels, 24 piano keys in ascending order, 24 distinct QWERTY keys from z
assert.equal(COMMAND_KEYS.length, 31);
assert(COMMAND_KEYS.every((k) => k.action && k.label));
assert.equal(PIANO.length, 24);
for (let i = 1; i < PIANO.length; i++) assert(PIANO[i].cx > PIANO[i - 1].cx && PIANO[i].note === i);
assert.equal(QWERTY.length, 24); assert.equal(new Set(QWERTY).size, 24); assert.equal(QWERTY[0], 'z');
assert(GUIDE.some((g) => g.title === 'FLUTTER'), 'the HELP guide should explain the FLUTTER strip');

// copy: every stack tool has a name and a caption; no em dashes in the WHY? copy (Spence's brief); browse order is sane
for (const s of STACK) for (const t of s.tools) assert(t.length === 2 && t[0] && t[1], `${s.key}: ${t}`);
assert(!WHY_COPY.includes('—'), 'WHY_COPY contains an em dash');
assert(BROWSE.includes('play') && BROWSE.includes('github') && new Set(BROWSE).size === BROWSE.length);

console.log('smoke: sidechain, flutter, cutoff, key tables, copy ok');
