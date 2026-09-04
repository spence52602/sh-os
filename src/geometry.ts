/* Device geometry: where everything sits on the render, in the Figma export's own pixel space.
   Owns the hit zones (command keys, the 24-key keyboard, knobs, the limiter strip, the screen), the HELP callout boxes
   and the two helpers that turn those coordinates into percentages of the stage. Nothing here touches audio or the
   DOM beyond `place()`; content (labels, copy, links) lives in content.ts. Group 11 = 1594 × 565.11; the keys live in
   "Group 4", whose origin inside the device frame is (OX, OY). */
import type { GuideBox, KeySpec, KnobSpec, PianoKey } from './types.ts';

export const IMG_W = 1594;
export const IMG_H = 565.11;
export const OX = 26.91;
export const OY = 27.48;
export const KEY = 81.88;
export const SCREEN_RECT = [365.29, 27.48, 335.52, 166.61] as const;
/** Round cap diameter as a share of a key well (caps measure ~0.78); encoder knob crop (knobs measure 39 px). */
export const CAP = 0.74;
export const ENC_CAP = 36;
/** The volume-module knob (SIDECHAIN): a device-space box around the ~44 px knob left of MUTE. */
export const SC_KNOB = [205.0, 36.5, 68, 68] as const;
/** LIMITER strip on the right rail (Figma track "Group 5", x 1518.4, y 187.2 to 288): a touch sensor, no handle. */
export const FADER = { top: 193.5, bottom: 278.3, hit: [1492, 178, 54, 118] as const };
export const ENCODERS: ReadonlyArray<readonly [number, number, string]> = [[739.74, 63.55, 'red'], [908.65, 63.55, 'orange'], [1078.13, 63.55, 'cream'], [1247.03, 63.55, 'blue']];

/** The five knobs in KnobParam order: the four encoders, then the small sidechain knob. */
export const KNOBS: KnobSpec[] = ENCODERS.map((e) => ({ x: e[0], y: e[1], size: 95.04, cap: ENC_CAP, name: e[2] }))
  .concat([{ x: SC_KNOB[0], y: SC_KNOB[1], size: SC_KNOB[2], cap: 40, name: 'sidechain' }]);

// ---- command keys (row 2, rail, top block), Group-4 space
const ROW2_X = [2.29, 87.03, 171.19, 255.93, 340.67, 425.41, 509.58, 594.31, 679.05, 763.79, 847.96, 932.70, 1017.43, 1102.17, 1186.34, 1271.08, 1355.82];
// the seven blank transport keys are the jam section: sound select, four loop families (each press steps 1 → 2 → 3 → off), metronome, stop-all
const ROW2 = ['stack:design', 'stack:ai', 'stack:build', 'stack:ship', 'beta:1', 'beta:2', 'beta:3', 'beta:4', 'prev', 'next', 'sound', 'loop:kick', 'loop:clap', 'loop:hat', 'loop:top', 'metro', 'stopall'];
const ROW2_LABELS = ['Design', 'AI', 'Build', 'Ship', 'Slot 1', 'Slot 2', 'Slot 3', 'Slot 4', 'Previous', 'Next', 'Sound', 'Kick loop', 'Clap loop', 'Hat loop', 'Top loop', 'Metronome', 'Stop loops'];
const RAIL: ReadonlyArray<readonly [number, number, string, string]> = [
  [2.29, 255.93, 'about', 'About'], [87.03, 255.93, 'mix', 'Resume'], [171.19, 255.93, 'rec', 'Contact'],
  [2.29, 341.24, 'link:x', 'X'], [87.03, 341.24, 'link:linkedin', 'LinkedIn'], [171.19, 341.24, 'link:instagram', 'Instagram'],
  [2.29, 425.98, 'link:email', 'Email'], [87.03, 425.98, 'rec', 'Phone'], [171.19, 425.98, 'link:pay', 'Pay'],
];
export const COMMAND_KEYS: KeySpec[] = [
  ...ROW2_X.map((x, i) => ({ x, y: 171.19, w: KEY, h: KEY, action: ROW2[i], label: ROW2_LABELS[i] })),
  ...RAIL.map((k) => ({ x: k[0], y: k[1], w: KEY, h: KEY, action: k[2], label: k[3] })),
  { x: 171.19, y: 87.03, w: KEY, h: KEY, action: 'why', label: 'Why?' },          // the backstory screen (toggle)
  { x: 255.93, y: 87.03, w: KEY, h: KEY, action: 'github', label: 'GitHub' },     // the source, press twice to open
  { x: 267.95, y: 14.89, w: 57.26, h: 57.26, action: 'mute', label: 'Mute' },
  { x: 1355.82, y: 2.29, w: KEY, h: KEY, action: 'help', label: 'Help' },
  { x: 1355.82, y: 87.03, w: KEY, h: KEY, action: 'preview', label: 'Preview' },  // Spence's 4-bar phrase for the current sound
];

// ---- keyboard: 14 naturals + 10 sharps, sorted by x into chromatic order F3 … E5
export const NOTE_NAMES = ['F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3', 'C4', 'C#4', 'D4', 'D#4', 'E4', 'F4', 'F#4', 'G4', 'G#4', 'A4', 'A#4', 'B4', 'C5', 'C#5', 'D5', 'D#5', 'E5'];
const PILLS = [255.93, 340.10, 424.84, 509.58, 594.31, 679.63, 763.79, 847.96, 932.70, 1017.43, 1101.60, 1186.34, 1271.08, 1355.82]
  .map((x) => ({ x, y: 340.67, w: KEY, h: 167.19, cx: x + KEY / 2, pill: true }));
const SHARPS = [[255.93, 51.53], [382.47, 12.02], [467.21, 13.17], [594.31, 53.25], [721.42, 15.46], [847.96, 53.25], [974.49, 12.60], [1059.23, 13.74], [1186.34, 52.68], [1313.45, 14.89]]
  .map((s) => { const x = s[0] + s[1]; return { x, y: 255.93 + 12.6, w: 57.26, h: 57.26, cx: x + 28.63, pill: false }; });
export const PIANO: PianoKey[] = [...PILLS, ...SHARPS].sort((a, b) => a.cx - b.cx).map((k, i) => ({ ...k, note: i, name: NOTE_NAMES[i] }));

/** Piano-style QWERTY: whites z x c v b n m / q w e r t y u, sharps s d g h j / 2 3 5 6 7, chromatic from F3. */
export const QWERTY = ['z', 's', 'x', 'd', 'c', 'g', 'v', 'b', 'h', 'n', 'j', 'm', 'q', '2', 'w', '3', 'e', '5', 'r', 't', '6', 'y', '7', 'u'];

// ---- HELP guide callouts: key groups in Group-4 space, encoders and the strip in device space
const g4 = (x1: number, y1: number, x2: number, y2: number, title: string, note: string, side?: 'right'): GuideBox =>
  ({ x1: OX + x1, y1: OY + y1, x2: OX + x2, y2: OY + y2, title, note, side });
export const GUIDE: GuideBox[] = [
  g4(2.29, 171.19, 337.81, 253.07, 'STACK', 'Design · AI · Build · Ship — the tools behind the work'),
  g4(340.67, 171.19, 676.19, 253.07, 'SLOTS 1–4', 'Empty in Beta v1.0 — more features shipping soon'),
  g4(679.05, 171.19, 845.67, 253.07, '◁ ▷', 'Step through screens'),
  g4(847.96, 171.19, 1437.70, 253.07, 'JAM', 'Sound · kick · clap · hat · top (press to step 1 · 2 · 3 · off) · metronome · stop'),
  g4(171.19, 12.60, 337.81, 168.91, 'SIDECHAIN · MUTE · WHY? · GITHUB', 'Duck the synth to the beat (turn) · silence · the backstory · the source (press twice to open)'),
  g4(2.29, 255.93, 253.07, 507.86, 'PAGES + SOCIALS', 'About · résumé · contact · X · in · IG · mail · phone · pay — press twice to open'),
  g4(255.93, 255.93, 1437.70, 507.86, 'KEYBOARD', 'Play it · drag for glissando · Z–M / Q–U on QWERTY'),
  { x1: 739.74, y1: 63.55, x2: 1342.07, y2: 158.59, title: 'KNOBS', note: 'Reverb · cutoff · BPM · volume — scroll or drag to turn' },
  g4(1355.82, 2.29, 1437.70, 168.91, 'HELP · PREVIEW', 'This guide · hear the current sound (knobs work while it plays)', 'right'),
  { x1: 1490, y1: 178, x2: 1548, y2: 300, title: 'FLUTTER', note: 'Drag up for stutter · tap to switch 1/8 · 1/16 · 1/4', side: 'right' },
];

/** `v` as a percentage of `of`, to three decimals: the stage is laid out entirely in percentages so it scales as one piece. */
export const pct = (v: number, of: number): string => (v / of * 100).toFixed(3) + '%';
/** Position an absolutely placed element by a device-space box. */
export function place(el: HTMLElement, x: number, y: number, w: number, h: number): void {
  el.style.left = pct(x, IMG_W); el.style.top = pct(y, IMG_H);
  el.style.width = pct(w, IMG_W); el.style.height = pct(h, IMG_H);
}
export const pad2 = (n: number): string => (n < 10 ? '0' : '') + n;
