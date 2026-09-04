/* The SIDECHAIN duck: Kickstart 2's "quick chain" as a gain shape over one beat.
   Pure data and math, no Web Audio: the engine schedules the shape with setValueCurveAtTime once per beat and mixes it
   in by the knob amount. Two measurements from Spence's Live set feed it: the 96-bin wet/dry curve over a beat, and the
   attack re-measured at 0.25 ms (Hilbert envelope of a 262 Hz tone), because the first bin had averaged over the fall. */

/** Wet/dry gain per 1/96 of the beat, median of 15 beats: −36 dB at 6% of the beat, back to 90% at 33%, full at 46%. */
export const SC_CURVE = new Float32Array([0.163, 0.072, 0.056, 0.041, 0.028, 0.017, 0.015, 0.032, 0.063, 0.101, 0.142, 0.184, 0.228, 0.271, 0.315, 0.358, 0.401, 0.442, 0.484, 0.523, 0.563, 0.6, 0.638, 0.672, 0.706, 0.738, 0.769, 0.797, 0.824, 0.848, 0.871, 0.891, 0.909, 0.925, 0.939, 0.952, 0.962, 0.972, 0.98, 0.986, 0.991, 0.995, 0.998, 0.999, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
/** Kickstart's own attack at 0.25 ms steps, 0 to 3.5 ms: −6 dB at 1.5 ms, −20 dB at 3.25 ms, floor ≈ 0.08. */
export const SC_ATTACK = new Float32Array([1, 0.941, 0.865, 0.782, 0.692, 0.597, 0.498, 0.398, 0.300, 0.211, 0.157, 0.121, 0.101, 0.087, 0.082]);
/** Measured at 132 BPM; the shape stretches with the beat, like Kickstart's. */
export const SC_REF_BEAT_MS = 60000 / 132;

/**
 * Build the playback shape: `n` points across one beat (0.22 ms at 132 for the default 2048), the measured attack
 * first, then the body bins (bin j centred at (j + 0.5) / 96 of the beat; bin 0 is replaced by the attack), linearly
 * interpolated. Starts and ends at unity, so consecutive beats join without a step.
 */
export function buildShape(n = 2048): Float32Array {
  const out = new Float32Array(n), kt: number[] = [], kv: number[] = [], M = SC_CURVE.length;
  for (let a = 0; a < SC_ATTACK.length; a++) { kt.push(a * 0.25); kv.push(SC_ATTACK[a]); }
  for (let j = 1; j < M; j++) { kt.push((j + 0.5) / M * SC_REF_BEAT_MS); kv.push(SC_CURVE[j]); }
  kt.push(SC_REF_BEAT_MS); kv.push(1);
  for (let i = 0, k = 0; i < n; i++) {
    const t = i / (n - 1) * SC_REF_BEAT_MS;
    while (k < kt.length - 2 && t > kt[k + 1]) k++;
    const f = Math.max(0, Math.min(1, (t - kt[k]) / (kt[k + 1] - kt[k])));
    out[i] = kv[k] * (1 - f) + kv[k + 1] * f;
  }
  out[0] = 1; out[n - 1] = 1;
  return out;
}

/** The shape mixed in by `mix` (0 = no duck, 1 = the full measured duck). */
export function scCurve(shape: Float32Array, mix: number): Float32Array {
  const out = new Float32Array(shape.length);
  for (let i = 0; i < out.length; i++) out[i] = 1 - mix * (1 - shape[i]);
  return out;
}
