/* FLUTTER: a beat-locked dry/wet gate on the mix, for stutter-house chops.
   Pure data: one period of the LFO as a gain shape, from Spence's sketch: a hard ramp up, then a curved ramp down
   that lands softly and lifts a touch before the next hit. The engine schedules it once per division (1/4, 1/8 or
   1/16 of a bar... in beats: a beat, half a beat, a quarter beat) and mixes it in by the strip amount. */

export const FLUTTER_DIVS = [8, 16, 4] as const;   // tap order on the strip: 1/8 → 1/16 → 1/4
export type FlutterDiv = (typeof FLUTTER_DIVS)[number];

/** Share of the period spent on the hard ramp up (4.5 ms at 1/16, 132 BPM): fast, but never a step. */
const RISE = 0.04;
/** The floor the curve settles on before the lift; the next period's ramp starts from here. */
const FLOOR = 0.0;
const LIFT = 0.05;

/**
 * One period of the flutter, `n` points, as a gain 0 to 1. p = 0 starts the ramp; by RISE the gate is fully open;
 * the fall follows (1 - q)^2 (straight at first, rounding into the floor) and the last 15% lifts to LIFT so the
 * ramp has somewhere to start from, which is what gives the sketch its curled tail.
 */
export function buildFlutter(n = 1024): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i / n;
    if (p < RISE) { const k = p / RISE; out[i] = LIFT + (1 - LIFT) * (0.5 - 0.5 * Math.cos(Math.PI * k)); continue; }
    const q = (p - RISE) / (1 - RISE);
    const fall = Math.pow(1 - q, 2) * (1 - FLOOR) + FLOOR;
    const lift = q < 0.85 ? 0 : LIFT * (0.5 - 0.5 * Math.cos(Math.PI * (q - 0.85) / 0.15));
    out[i] = fall + lift * (1 - fall);
  }
  return out;
}

/** The shape mixed in by `amount` (0 = dry, 1 = the full gate). */
export function flutterCurve(shape: Float32Array, amount: number): Float32Array {
  const out = new Float32Array(shape.length);
  for (let i = 0; i < out.length; i++) out[i] = 1 - amount * (1 - shape[i]);
  return out;
}

/** Strip amount → gate depth on a dB curve, so the effect mixes in gradually: 30% is a −14 dB pulse, 70% a −34 dB chop,
 *  100% closes fully. A linear blend only became audible past the halfway point. */
export const flutterDepth = (amount: number): number => 1 - Math.pow(10, -2.4 * Math.max(0, Math.min(1, amount)));

/** Period in seconds for a division at a tempo: 1/4 = a beat, 1/8 = half, 1/16 = a quarter. */
export const flutterPeriod = (div: number, bpm: number): number => (60 / bpm) * 4 / div;
