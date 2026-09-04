/* Shared types for the SH-OS runtime. Everything here is data-shaped and erasable, so Node can run the tests
   on the source with its built-in type stripping and esbuild can bundle it without a type pass. */

/** Every knob-driven parameter plus the FLUTTER strip amount. */
export type ParamName = 'reverb' | 'cutoff' | 'bpm' | 'volume' | 'sidechain' | 'flutter';
/** The five physical knobs, in the order they sit on the device (red, orange, cream, blue, the small one by MUTE). */
export type KnobParam = 'reverb' | 'cutoff' | 'bpm' | 'volume' | 'sidechain';
export type SoundName = 'pad' | 'lead' | 'bass';
export type LoopFamily = 'kick' | 'clap' | 'hat' | 'top';
/** 0 light, 1 dark, 2 glow. */
export type ModeIndex = 0 | 1 | 2;

/** A command key: its box in Group-4 space (the Figma frame the keys sit in), the action it fires, its accessible name. */
export interface KeySpec { x: number; y: number; w: number; h: number; action: string; label: string; }
/** One of the 24 keyboard keys, sorted into chromatic order by its centre. */
export interface PianoKey { x: number; y: number; w: number; h: number; cx: number; pill: boolean; note: number; name: string; }
/** A HELP callout box in device space plus its title and note; `side` puts the tag on the right edge. */
export interface GuideBox { x1: number; y1: number; x2: number; y2: number; title: string; note: string; side?: 'right'; }
/** An encoder knob: box origin in device space, size, cap diameter, colour name. */
export interface KnobSpec { x: number; y: number; size: number; cap: number; name: string; }

export interface Params { reverb: number; cutoff: number; bpm: number; volume: number; sidechain: number; flutter: number; flutterDiv: number; }
