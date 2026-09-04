/* Pure audio math and the sound tables: the cutoff law, note names, the sound and loop catalogue, parameter ranges.
   No Web Audio here, so the smoke test can import it in Node. The engine (engine.ts) turns these into nodes. */
import type { LoopFamily, Params, SoundName } from '../types.ts';

/** 40 Hz to 20 kHz, log-spaced over the knob's travel. */
export const cutoffHz = (v: number): number => 40 * Math.pow(500, v);
/** CUTOFF is an "MG Low 24" style ladder: two cascaded 2-pole low-passes, the second carrying a little resonance. */
export const FILTER_Q: readonly [number, number] = [0.54, 2.2];

const PITCH = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const noteName = (midi: number): string => PITCH[midi % 12] + (Math.floor(midi / 12) - 1);

export interface SoundSpec { dir: string; label: string; root: number; gain: number; }
/** Spence's Serum patches rendered from his Live set, one file per key with a crossfaded sustain loop. */
export const SOUNDS: Record<SoundName, SoundSpec> = {
  pad:  { dir: 'pad',  label: 'PAD',  root: 53, gain: 0.75 },   // key 0 = F3 (MIDI 53) … key 23 = E5
  lead: { dir: 'lead', label: 'LEAD', root: 53, gain: 1.0 },
  bass: { dir: 'bass', label: 'BASS', root: 47, gain: 0.55 },   // keyed from B2: the bass sits best B to A#
};
export const SOUND_ORDER: SoundName[] = ['pad', 'lead', 'bass'];
export const LOOPS: Record<LoopFamily, string[]> = { kick: ['kick-1', 'kick-2', 'kick-3'], clap: ['clap-1', 'clap-2', 'clap-3'], hat: ['hat-1', 'hat-2', 'hat-3'], top: ['top-1', 'top-2', 'top-3'] };
export const LOOP_ORDER: LoopFamily[] = ['kick', 'clap', 'hat', 'top'];
export const LOOP_LABEL: Record<LoopFamily, string> = { kick: 'KICK', clap: 'CLAP', hat: 'HAT', top: 'TOP' };
/** The loops were rendered at 132, so they play at pitch at the default tempo. */
export const LOOP_BPM = 132;
/** Seconds: the crossfaded sustain region in every note file. */
export const NOTE_LOOP: readonly [number, number] = [0.9, 1.55];
/** Spence's 4-bar previews: 16 beats at 132. */
export const PREVIEW_BEATS = 16;
export const PREVIEW_BPM: Record<SoundName, number> = { pad: 132, lead: 132, bass: 132 };

export const DEFAULT_PARAMS: Params = { reverb: 0.0, cutoff: 1.0, bpm: 132, volume: 0.8, sidechain: 0.0, flutter: 0.0, flutterDiv: 8 };
export const MASTER = 0.9;
export const BPM_MIN = 60;
export const BPM_MAX = 180;
