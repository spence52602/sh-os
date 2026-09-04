/* The drop-in: auto-mounts on every `[data-shos]` element when the script loads, wires the page's mode toggles, and
   exposes window.SHOS, the debug API the README documents and the tests drive (state readers, parameter setters and
   the measurement taps). This is the entry esbuild bundles into sh-os.js; hosts that mount from code import index.ts. */
import { VERSION, createShOs, bindModeToggles, currentMode, setMode } from './index.ts';
import type { ShOsInstance, ShOsOptions } from './index.ts';
import type { ParamName, SoundName } from './types.ts';
import { LOOP_ORDER } from './audio/tuning.ts';

const instances: ShOsInstance[] = [];
function mount(root: HTMLElement, opts: Partial<ShOsOptions> = {}): ShOsInstance {
  const inst = createShOs(root, { version: VERSION, ...opts });
  if (instances.indexOf(inst) < 0) instances.push(inst);
  return inst;
}
function boot(): void { document.querySelectorAll<HTMLElement>('[data-shos]').forEach((el) => mount(el)); bindModeToggles(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

/** The first mounted instrument's engine, for the debug API. */
const eng = () => instances[0]?.engine;

const SHOS = {
  version: VERSION,
  init: mount,
  instances,
  active: () => eng()?.activeNotes() ?? [],
  ctxState: () => eng()?.ctxState() ?? 'none',
  muted: () => !!eng()?.muted,
  setMuted: (on: boolean) => eng()?.setMuted(on),
  set: (name: ParamName, v: number) => eng()?.setParam(name, v),
  setBpm: (v: number) => eng()?.setBpm(v),
  setSound: (s: SoundName) => eng()?.setSound(s),
  night: (on?: boolean) => { if (on !== undefined) setMode(on ? 1 : 0); return currentMode() > 0; },
  mode: (m?: number) => { if (m !== undefined) setMode(m); return currentMode(); },
  /** A snapshot of everything the screens and the tests read. */
  params() {
    const e = eng(); if (!e) return null;
    const p = e.params, pv = e.preview;
    return {
      reverb: p.reverb, cutoff: p.cutoff, bpm: p.bpm, volume: p.volume, sidechain: p.sidechain, flutter: p.flutter, flutterDiv: p.flutterDiv,
      limiter: e.lim.ready, sound: e.sound,
      loops: LOOP_ORDER.map((f) => e.loopIndex(f)), loopsLive: LOOP_ORDER.map((f) => e.loopLive(f)),
      metro: e.metro.on, lastLaunch: e.clock.lastLaunch, beatLen: e.beatLen(), clock: e.clock.start,
      starts: { clock: e.clock.start, kick: e.loopState.kick ? e.loopState.kick.at ?? null : null, preview: pv.src ? pv.at ?? null : null },
      preview: pv.name, previewLoop: pv.src ? [pv.src.loop, +pv.src.loopEnd.toFixed(3), +pv.src.playbackRate.value.toFixed(3)] : null,
      ir: !!(e.convolver && e.convolver.buffer),
    };
  },
  // measurement taps
  _buf: (n: string) => eng()?.buffers[n] ?? null,
  _env: (n: string) => eng()?.env(n) ?? null,
  _tap: (sec: number) => eng()!.tap(sec),
  _peak: (sec: number, pre?: boolean) => eng()!.peak(sec, pre),
  _mixEnv: (sec: number) => eng()!.mixEnv(sec),
};
(window as unknown as { SHOS: typeof SHOS }).SHOS = SHOS;
export type ShosDebugApi = typeof SHOS;
