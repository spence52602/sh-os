/* The audio engine: one Web Audio graph per instrument.
   Owns the context and every node, the sample cache, voices, the four loop slots, the preview phrase, the beat clock,
   the metronome, the sidechain scheduler and the limiter worklet. It knows nothing about the DOM: the device
   (device.ts) calls into it and reads its state to draw screens. Graph: notes and previews → synth bus → 2 × lowpass
   (CUTOFF) → dry + convolver send (REVERB) → sidechain gain (so tails pump) → FLUTTER gate → master (VOLUME) → limiter.
   Loops and clicks go straight to the master, so the drums never pass through the sidechain or the flutter.
   Sidechain and flutter shapes live in sidechain.ts / flutter.ts, tables and math in tuning.ts. */
import type { LoopFamily, ParamName, Params, SoundName } from '../types.ts';
import { pad2 } from '../geometry.ts';
import { buildShape, scCurve } from './sidechain.ts';
import { FLUTTER_DIVS, buildFlutter, flutterCurve, flutterDepth, flutterPeriod } from './flutter.ts';
import { BPM_MAX, BPM_MIN, DEFAULT_PARAMS, FILTER_Q, LOOPS, LOOP_BPM, LOOP_ORDER, MASTER, NOTE_LOOP, PREVIEW_BEATS, PREVIEW_BPM, SOUNDS, SOUND_ORDER, cutoffHz, noteName } from './tuning.ts';

interface Voice { src: AudioBufferSourceNode; g: GainNode; t0: number; lvl: number; }
interface LoopSlot { idx: number; src: AudioBufferSourceNode | null; g: GainNode | null; pending: string | null; at?: number; }
interface Preview { src: AudioBufferSourceNode | null; g: GainNode | null; name: SoundName | null; at?: number; }

export interface EngineOptions { assetBase: string; version: string; }

/** Peak / rms report from `peak()`; `pre` means measured before the limiter. */
export interface PeakReport { peak: number; peakDb: number; over: number; rms: number; limiter: boolean; pre: boolean; }

export class Engine {
  readonly params: Params = { ...DEFAULT_PARAMS };
  sound: SoundName = 'pad';
  muted = false;
  ac: AudioContext | null = null;
  master: GainNode | null = null;
  synthBus: GainNode | null = null;
  scGain: GainNode | null = null;
  filter: BiquadFilterNode | null = null;
  filter2: BiquadFilterNode | null = null;
  wetGain: GainNode | null = null;
  convolver: ConvolverNode | null = null;
  loopBus: GainNode | null = null;
  clickBus: GainNode | null = null;
  /** The FLUTTER gate: the last stage of the synth chain, before the master; drums bypass it. */
  flutterGain: GainNode | null = null;
  /** Analysers feeding the PLAY screen oscilloscope: the synth chain and the whole mix. */
  scopeSynth: AnalyserNode | null = null;
  scopeMix: AnalyserNode | null = null;
  readonly buffers: Record<string, AudioBuffer> = {};
  readonly voices: Record<number, Voice> = {};
  readonly clock: { start: number | null; lastLaunch: number | null } = { start: null, lastLaunch: null };
  readonly loopState: Partial<Record<LoopFamily, LoopSlot | null>> = {};
  readonly metro = { on: false, timer: 0, next: 0 };
  readonly preview: Preview = { src: null, g: null, name: null };
  /** Runtime defaults are a transparent safety limiter (the mix must never fly over 0 dB): 1.5 ms lookahead, 60 ms
   *  release, peaks held at −0.18 dBFS with a brickwall at −0.04 dBFS behind it. The Pro-L 2 "push" fit
   *  (0.25 ms / 8 ms / gain-computer ceiling 1.343) returns with the PUSH strip once that ships. */
  readonly lim = { node: null as AudioWorkletNode | null, ready: false, lookMs: 1.5, relMs: 60, limCeiling: 0.98, ceiling: 0.995, soft: 0 };

  private readonly assetBase: string;
  private readonly vq: string;
  private readonly loading: Partial<Record<string, Promise<AudioBuffer>>> = {};
  private readonly heldKeys: Record<number, boolean> = {};
  private readonly sc = { timer: 0, next: 0, shape: buildShape() };
  private readonly fl = { timer: 0, next: 0, shape: buildFlutter() };
  private lastClick = -1;
  private levelBuf: Float32Array<ArrayBuffer> | null = null;
  private preloadTimer = 0;

  constructor(opts: EngineOptions) {
    this.assetBase = opts.assetBase;
    this.vq = '?v=' + opts.version;
  }

  /** The AudioContext and graph, created on first use (a page can only start audio after a gesture; see unlock). */
  ctx(): AudioContext | null {
    if (this.ac) return this.ac;
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!C) return null;
    const ac = (this.ac = new C());
    const master = (this.master = ac.createGain()); master.gain.value = this.masterTarget(); master.connect(ac.destination);
    this.initLimiter(ac);
    const synthBus = (this.synthBus = ac.createGain());
    const scGain = (this.scGain = ac.createGain()); scGain.gain.value = 1;
    const filter = (this.filter = ac.createBiquadFilter()); filter.type = 'lowpass'; filter.Q.value = FILTER_Q[0]; filter.frequency.value = cutoffHz(this.params.cutoff);
    const filter2 = (this.filter2 = ac.createBiquadFilter()); filter2.type = 'lowpass'; filter2.Q.value = FILTER_Q[1]; filter2.frequency.value = cutoffHz(this.params.cutoff);
    synthBus.connect(filter); filter.connect(filter2); filter2.connect(scGain);
    const convolver = (this.convolver = ac.createConvolver());
    const wetGain = (this.wetGain = ac.createGain()); wetGain.gain.value = this.params.reverb;
    filter2.connect(wetGain); wetGain.connect(convolver); convolver.connect(scGain);
    const flutterGain = (this.flutterGain = ac.createGain()); flutterGain.gain.value = 1;
    scGain.connect(flutterGain); flutterGain.connect(master);
    const scopeSynth = (this.scopeSynth = ac.createAnalyser()); scopeSynth.fftSize = 2048; scopeSynth.smoothingTimeConstant = 0; flutterGain.connect(scopeSynth);
    const scopeMix = (this.scopeMix = ac.createAnalyser()); scopeMix.fftSize = 2048; scopeMix.smoothingTimeConstant = 0; master.connect(scopeMix);
    this.loopBus = ac.createGain(); this.loopBus.connect(master);
    this.clickBus = ac.createGain(); this.clickBus.connect(master);
    return ac;
  }
  /** Resume a context the browser parked before the first gesture. */
  unlock(): void { const c = this.ctx(); if (c && c.state === 'suspended') void c.resume(); }
  ctxState(): string { return this.ac ? this.ac.state : 'none'; }

  // ---- limiter (AudioWorklet on the master)
  private initLimiter(c: AudioContext): void {
    if (!c.audioWorklet || this.lim.ready) return;
    const url = this.assetBase.replace(/assets\/$/, '') + 'sh-os-limiter.js' + this.vq;
    c.audioWorklet.addModule(url).then(() => {
      const tail = this.master;
      if (this.ac !== c || !tail) return;                                                 // destroyed while loading
      const node = new AudioWorkletNode(c, 'shos-limiter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
      const l = this.lim;
      node.port.postMessage({ lookMs: l.lookMs, relMs: l.relMs, limCeiling: l.limCeiling, ceiling: l.ceiling, soft: l.soft, drive: 1 });
      tail.disconnect(c.destination); tail.connect(node); node.connect(c.destination);
      l.node = node; l.ready = true;
    }).catch(() => { this.lim.ready = false; });
  }

  // ---- master
  private masterTarget(): number { return this.muted ? 0 : MASTER * this.params.volume; }
  setMuted(on: boolean): void {
    this.muted = !!on;
    const c = this.ctx(); if (!c || !this.master) return;
    this.master.gain.cancelScheduledValues(c.currentTime);
    this.master.gain.setTargetAtTime(this.masterTarget(), c.currentTime, 0.015);
  }

  // ---- samples
  /** Previews loop at exactly 16 beats but the bounces end mid-waveform, so the wrap back to bar 1 clicked: a 4 ms
   *  raised-cosine fade into the loop point (the drum loops already end on zero). */
  private condition(name: string, b: AudioBuffer): AudioBuffer {
    if (name.indexOf('preview/') !== 0) return b;
    const end = Math.min(b.length, Math.round(PREVIEW_BEATS * 60 / (PREVIEW_BPM[name.slice(8) as SoundName] || LOOP_BPM) * b.sampleRate));
    const n = Math.min(end, Math.round(b.sampleRate * 0.004));
    for (let ch = 0; ch < b.numberOfChannels; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) d[end - n + i] *= 0.5 * (1 + Math.cos(Math.PI * i / (n - 1)));
    }
    return b;
  }
  /** Fetch and decode `audio/<name>.wav` once; the promise is shared while it loads. */
  load(name: string): Promise<AudioBuffer> {
    if (this.buffers[name]) return Promise.resolve(this.buffers[name]);
    const pending = this.loading[name]; if (pending) return pending;
    const c = this.ctx(); if (!c) return Promise.reject(new Error('no audio'));
    this.loading[name] = fetch(this.assetBase + 'audio/' + name + '.wav' + this.vq).then((r) => r.arrayBuffer())
      .then((ab) => c.decodeAudioData(ab))
      .then((b) => { this.buffers[name] = this.condition(name, b); return b; });
    return this.loading[name];
  }
  private preloadSound(name: SoundName): void { for (let i = 0; i < 24; i++) this.load(SOUNDS[name].dir + '/note-' + pad2(i)).catch(() => {}); }
  /** Clicks, the current sound and the reverb impulse now; the other sounds after a beat, so SOUND switches are instant. */
  preload(): void {
    if (!this.ctx()) return;
    ['click-1', 'click-2', 'click-3'].forEach((n) => this.load(n).catch(() => {}));
    this.preloadSound(this.sound);
    this.load('ir/vintageverb').then((b) => { if (this.convolver) this.convolver.buffer = b; }).catch(() => {});
    clearTimeout(this.preloadTimer);
    this.preloadTimer = window.setTimeout(() => { SOUND_ORDER.forEach((s) => { if (s !== this.sound) this.preloadSound(s); }); }, 1500);
  }

  // ---- hover clicks
  /** True while anything sounds: a loop / preview / metronome running, a note held, or a synth tail still ringing. */
  audioBusy(): boolean {
    if (this.anyRunning() || Object.keys(this.voices).length) return true;
    if (!this.scopeSynth) return false;
    if (!this.levelBuf) this.levelBuf = new Float32Array(this.scopeSynth.fftSize);
    this.scopeSynth.getFloatTimeDomainData(this.levelBuf);
    let sum = 0; for (let i = 0; i < this.levelBuf.length; i += 4) sum += this.levelBuf[i] * this.levelBuf[i];
    return Math.sqrt(sum / (this.levelBuf.length / 4)) > 0.001;               // above −60 dBFS on the synth bus
  }
  /** One of the three key clicks, never the same twice in a row; silent while anything plays. */
  playClick(): void {
    const c = this.ctx(); if (!c || c.state !== 'running' || this.muted || !this.clickBus) return;
    if (this.audioBusy()) return;
    let pick: number; do { pick = 1 + Math.floor(Math.random() * 3); } while (pick === this.lastClick);
    this.lastClick = pick;
    const b = this.buffers['click-' + pick]; if (!b) return;
    const src = c.createBufferSource(); src.buffer = b;
    const g = c.createGain(); g.gain.value = 0.7;
    src.connect(g); g.connect(this.clickBus); src.start(0);
  }

  // ---- notes
  noteOn(i: number): void {
    this.heldKeys[i] = true;
    const c = this.ctx(); if (!c || !this.synthBus) return; this.unlock();
    const s = SOUNDS[this.sound], b = this.buffers[s.dir + '/note-' + pad2(i)];
    if (!b) {                                                                  // first press before the sample landed: play it the moment it does, if still held
      const want = this.sound; this.preloadSound(this.sound);
      this.load(s.dir + '/note-' + pad2(i)).then(() => { if (this.sound === want && !this.voices[i] && this.heldKeys[i]) this.noteOn(i); }).catch(() => {});
      return;
    }
    if (this.voices[i]) this.noteOff(i, true);
    const t = c.currentTime;
    const src = c.createBufferSource(); src.buffer = b; src.loop = true; src.loopStart = NOTE_LOOP[0]; src.loopEnd = NOTE_LOOP[1];
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(s.gain, t + 0.004);
    src.connect(g); g.connect(this.synthBus); src.start(t);
    this.voices[i] = { src, g, t0: t, lvl: s.gain };
  }
  noteOff(i: number, fast = false): void {
    this.heldKeys[i] = false;
    const v = this.voices[i]; if (!v) return; delete this.voices[i];
    const c = this.ctx(); if (!c) return;
    const rel = fast ? 0.03 : 0.12, t = Math.max(c.currentTime, v.t0 + 0.006);
    v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.lvl, t);
    v.g.gain.linearRampToValueAtTime(0.0001, t + rel);
    try { v.src.stop(t + rel + 0.02); } catch { /* already stopped */ }
  }
  allNotesOff(): void { Object.keys(this.voices).forEach((i) => this.noteOff(+i)); }
  activeNotes(): string[] { return Object.keys(this.voices); }
  setSound(name: SoundName): void { this.sound = name; if (this.ac) this.preloadSound(name); }
  keyNoteName(i: number): string { return noteName(SOUNDS[this.sound].root + i); }

  // ---- beat clock, loops, metronome
  beatLen(): number { return 60 / this.params.bpm; }
  private clockStart(c: AudioContext): number { if (this.clock.start === null) this.clock.start = c.currentTime + 0.03; return this.clock.start; }
  private nextBeat(c: AudioContext): number { const s = this.clockStart(c), now = c.currentTime + 0.015, n = Math.max(0, Math.ceil((now - s) / this.beatLen())); return s + n * this.beatLen(); }
  /** Launches quantise to the next bar line, like Live's 1-bar global quantisation: everything starts on its own "1". */
  private nextBar(c: AudioContext): number { const s = this.clockStart(c), now = c.currentTime + 0.015, bar = 4 * this.beatLen(), n = Math.max(0, Math.ceil((now - s) / bar)); return s + n * bar; }
  anyRunning(): boolean { return this.metro.on || !!this.preview.src || LOOP_ORDER.some((f) => !!(this.loopState[f] && this.loopState[f]!.src)); }
  private loopStopSrc(fam: LoopFamily): void {
    const l = this.loopState[fam]; if (!l || !l.src || !l.g || !this.ac) return;
    const t = this.ac.currentTime; l.g.gain.cancelScheduledValues(t); l.g.gain.setTargetAtTime(0, t, 0.012);
    try { l.src.stop(t + 0.1); } catch { /* already stopped */ }
    l.src = null;
  }
  loopPlay(fam: LoopFamily, idx: number): void {
    const c = this.ctx(); if (!c || !this.loopBus) return; this.unlock();
    const name = LOOPS[fam][idx];
    this.loopStopSrc(fam); this.loopState[fam] = { idx, src: null, g: null, pending: name };
    this.load('loops/' + name).then((b) => {
      const l = this.loopState[fam]; if (!l || l.pending !== name || !this.loopBus) return;
      const src = c.createBufferSource(); src.buffer = b; src.loop = true; src.loopStart = 0; src.loopEnd = b.duration;
      src.playbackRate.value = this.params.bpm / LOOP_BPM;
      const g = c.createGain(); g.gain.value = 0; src.connect(g); g.connect(this.loopBus);
      const t = this.nextBar(c);                                                 // on the next "1", from the top of the loop
      src.start(t, 0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.004);
      l.src = src; l.g = g; l.pending = null; l.at = t; this.clock.lastLaunch = t;
    }).catch(() => {});
  }
  loopStop(fam: LoopFamily): void { this.loopStopSrc(fam); this.loopState[fam] = null; }
  loopIndex(fam: LoopFamily): number { const l = this.loopState[fam]; return l ? l.idx : -1; }
  /** A loop key steps its family 1 → 2 → 3 → off. */
  loopCycle(fam: LoopFamily): void { const next = this.loopIndex(fam) + 1; if (next > 2) this.loopStop(fam); else this.loopPlay(fam, next); }
  loopLive(fam: LoopFamily): boolean { const l = this.loopState[fam]; return !!(l && l.src); }

  private previewRate(): number { return this.params.bpm / (PREVIEW_BPM[this.preview.name as SoundName] || LOOP_BPM); }
  previewStop(): void {
    const p = this.preview; p.name = null;
    if (!p.src || !p.g || !this.ac) return;
    const t = this.ac.currentTime; p.g.gain.cancelScheduledValues(t); p.g.gain.setTargetAtTime(0, t, 0.012);
    try { p.src.stop(t + 0.1); } catch { /* already stopped */ }
    p.src = null;
  }
  /** The current sound's 4-bar phrase, looped like a drum loop: bar-aligned, following BPM, through the synth chain. */
  previewPlay(): void {
    const c = this.ctx(); if (!c || !this.synthBus) return; this.unlock();
    const name = this.sound; this.previewStop(); this.preview.name = name;
    this.load('preview/' + name).then((b) => {
      const p = this.preview; if (p.name !== name || p.src || !this.synthBus) return;
      const src = c.createBufferSource(); src.buffer = b; src.loop = true; src.loopStart = 0; src.loopEnd = PREVIEW_BEATS * 60 / (PREVIEW_BPM[name] || LOOP_BPM);
      src.playbackRate.value = this.params.bpm / (PREVIEW_BPM[name] || LOOP_BPM);
      const g = c.createGain(); g.gain.value = 0; src.connect(g); g.connect(this.synthBus);
      const t = this.nextBar(c);                                                 // on the next "1", from the top of the phrase
      src.start(t, 0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.004);
      p.src = src; p.g = g; p.at = t; this.clock.lastLaunch = t;
    }).catch(() => { this.preview.name = null; });
  }
  /** Stop loops, metronome and preview; the sidechain and the flutter keep their own beat. */
  stopAllLoops(): void {
    LOOP_ORDER.forEach((f) => this.loopStop(f)); this.setMetro(false); this.previewStop(); this.clock.start = null;
    if (this.params.sidechain > 0) this.scReschedule();
    if (this.params.flutter > 0) this.flReschedule();
  }

  private metroTick(c: AudioContext, t: number, accent: boolean): void {
    if (!this.clickBus) return;
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = accent ? 1760 : 1175;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(accent ? 0.45 : 0.3, t + 0.0015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    o.connect(g); g.connect(this.clickBus); o.start(t); o.stop(t + 0.06);
  }
  private metroPump = (): void => {
    const c = this.ac; if (!c || !this.metro.on) return;
    while (this.metro.next < c.currentTime + 0.12) {
      const n = Math.round((this.metro.next - (this.clock.start || 0)) / this.beatLen());
      if (this.metro.next >= c.currentTime - 0.01) this.metroTick(c, this.metro.next, n % 4 === 0);
      this.metro.next += this.beatLen();
    }
  };
  setMetro(on: boolean): void {
    const c = this.ctx(); if (!c) return;
    this.metro.on = !!on; clearInterval(this.metro.timer); this.metro.timer = 0;
    if (this.metro.on) { this.unlock(); this.metro.next = this.nextBeat(c); this.metroPump(); this.metro.timer = window.setInterval(this.metroPump, 30); }
  }

  // ---- sidechain scheduling
  private scPump = (): void => {
    const c = this.ac; if (!c || !this.scGain || this.params.sidechain <= 0) return;
    while (this.sc.next < c.currentTime + 0.15) {
      if (this.sc.next >= c.currentTime) { try { this.scGain.gain.setValueCurveAtTime(scCurve(this.sc.shape, this.params.sidechain), this.sc.next, this.beatLen() * 0.995); } catch { /* overlapping curve: skip this beat */ } }
      this.sc.next += this.beatLen();
    }
  };
  /** (Re)start the duck from the next beat: after a BPM change, a mix change, or STOP. */
  private scReschedule(): void {
    const c = this.ac; if (!c || !this.scGain) return;
    clearInterval(this.sc.timer); this.sc.timer = 0;
    const t = c.currentTime + 0.005;
    this.scGain.gain.cancelScheduledValues(t);
    if (this.params.sidechain <= 0) { this.scGain.gain.setTargetAtTime(1, t, 0.02); return; }
    this.scGain.gain.setTargetAtTime(1, t, 0.01);
    this.sc.next = this.nextBeat(c); this.scPump(); this.sc.timer = window.setInterval(this.scPump, 40);
  }

  // ---- flutter scheduling: the same beat-locked curve idea as the sidechain, one curve per division. Each curve is
  // built with the strip's amount at scheduling time, so turning the strip blends the depth in over the next beat
  // instead of restarting the gate.
  private flPump = (): void => {
    const c = this.ac; if (!c || !this.flutterGain || this.params.flutter <= 0) return;
    const period = flutterPeriod(this.params.flutterDiv, this.params.bpm);
    while (this.fl.next < c.currentTime + 0.15) {
      if (this.fl.next >= c.currentTime) { try { this.flutterGain.gain.setValueCurveAtTime(flutterCurve(this.fl.shape, flutterDepth(this.params.flutter)), this.fl.next, period * 0.995); } catch { /* overlapping curve: skip */ } }
      this.fl.next += period;
    }
  };
  /** (Re)start the gate on the next division boundary of the beat clock. */
  private flReschedule(): void {
    const c = this.ac; if (!c || !this.flutterGain) return;
    clearInterval(this.fl.timer); this.fl.timer = 0;
    const t = c.currentTime + 0.005;
    this.flutterGain.gain.cancelScheduledValues(t);
    if (this.params.flutter <= 0) { this.flutterGain.gain.setTargetAtTime(1, t, 0.02); return; }
    this.flutterGain.gain.setTargetAtTime(1, t, 0.01);
    const s = this.clockStart(c), period = flutterPeriod(this.params.flutterDiv, this.params.bpm), now = c.currentTime + 0.015;
    this.fl.next = s + Math.max(0, Math.ceil((now - s) / period)) * period;
    this.flPump(); this.fl.timer = window.setInterval(this.flPump, 40);
  }
  /** Step the division: 1/8 → 1/16 → 1/4 → 1/8. Returns the new one. */
  cycleFlutterDiv(): number {
    const i = FLUTTER_DIVS.indexOf(this.params.flutterDiv as (typeof FLUTTER_DIVS)[number]);
    this.params.flutterDiv = FLUTTER_DIVS[(i + 1) % FLUTTER_DIVS.length];
    if (this.params.flutter > 0) this.flReschedule();
    return this.params.flutterDiv;
  }

  // ---- parameters
  /** Tempo: the clock and every playback rate change at the same instant, so nothing drifts. */
  setBpm(v: number): void {
    v = Math.round(Math.max(BPM_MIN, Math.min(BPM_MAX, v)));
    const old = this.params.bpm; this.params.bpm = v;
    const c = this.ac; if (!c) return;
    const at = c.currentTime + 0.005;
    if (this.clock.start !== null) {                                            // keep the beat phase where it is
      const beats = (at - this.clock.start) / (60 / old);
      this.clock.start = at - beats * (60 / v);
      if (this.metro.on) this.metro.next = this.nextBeat(c);
    }
    LOOP_ORDER.forEach((f) => { const l = this.loopState[f]; if (l && l.src) l.src.playbackRate.setValueAtTime(v / LOOP_BPM, at); });
    if (this.preview.src) this.preview.src.playbackRate.setValueAtTime(this.previewRate(), at);
    if (this.params.sidechain > 0) this.scReschedule();
    if (this.params.flutter > 0) this.flReschedule();
  }
  /** Knob values are 0 to 1 except bpm, which is absolute. */
  setParam(name: ParamName, v: number): void {
    if (name === 'bpm') return this.setBpm(v);
    v = Math.max(0, Math.min(1, v)); this.params[name] = v;
    const c = this.ac; if (!c) return;
    const t = c.currentTime;
    if (name === 'reverb' && this.wetGain) this.wetGain.gain.setTargetAtTime(v * 0.9, t, 0.02);
    if (name === 'cutoff' && this.filter && this.filter2) { const hz = cutoffHz(v); this.filter.frequency.setTargetAtTime(hz, t, 0.02); this.filter2.frequency.setTargetAtTime(hz, t, 0.02); }
    if (name === 'volume' && this.master) this.master.gain.setTargetAtTime(this.masterTarget(), t, 0.02);
    if (name === 'sidechain') { this.unlock(); this.scReschedule(); }
    if (name === 'flutter') { this.unlock(); if (v <= 0 || !this.fl.timer) this.flReschedule(); }   // running: the next curves pick the new depth up
  }

  // ---- diagnostics (used by the tests and the debug API)
  /** 1 ms RMS envelope of a decoded asset (e.g. 'loops/kick-1', 'preview/bass'). */
  env(name: string): number[] | null {
    const b = this.buffers[name]; if (!b) return null;
    const d = b.getChannelData(0), hop = Math.round(b.sampleRate / 1000), out: number[] = [];
    for (let i = 0; i + hop <= d.length; i += hop) { let s = 0; for (let j = i; j < i + hop; j++) s += d[j] * d[j]; out.push(Math.sqrt(s / hop)); }
    return out;
  }
  /** Record the drum bus and the synth bus for `sec` seconds → 1 ms RMS envelopes, used to verify sync. */
  tap(sec: number): Promise<{ t0: number; sampleRate: number; loops: number[]; synth: number[]; clock: number | null; beatLen: number }> {
    const c = this.ctx(); if (!c || !this.loopBus || !this.scGain) return Promise.reject(new Error('no audio'));
    const loopBus = this.loopBus, scGain = this.scGain;
    return new Promise((resolve) => {
      const n = Math.ceil(sec * c.sampleRate), L = new Float32Array(n), S = new Float32Array(n); let t0: number | null = null, k = 0;
      const merger = c.createChannelMerger(2), proc = c.createScriptProcessor(4096, 2, 1);
      const sink = c.createGain(); sink.gain.value = 0; sink.connect(c.destination);
      loopBus.connect(merger, 0, 0); scGain.connect(merger, 0, 1); merger.connect(proc); proc.connect(sink);
      proc.onaudioprocess = (e) => {
        if (t0 === null) t0 = e.playbackTime;
        const a = e.inputBuffer.getChannelData(0), b = e.inputBuffer.getChannelData(1), m = Math.max(0, Math.min(a.length, n - k));
        L.set(a.subarray(0, m), k); S.set(b.subarray(0, m), k); k += a.length;
        if (k >= n) {
          loopBus.disconnect(merger); scGain.disconnect(merger); merger.disconnect(); proc.disconnect(); proc.onaudioprocess = null;
          const hop = Math.round(c.sampleRate / 1000);
          const env = (x: Float32Array) => { const out: number[] = []; for (let i = 0; i + hop <= n; i += hop) { let s = 0; for (let j = i; j < i + hop; j++) s += x[j] * x[j]; out.push(Math.sqrt(s / hop)); } return out; };
          resolve({ t0: t0 as number, sampleRate: c.sampleRate, loops: env(L), synth: env(S), clock: this.clock.start, beatLen: this.beatLen() });
        }
      };
    });
  }
  /** 1 ms RMS envelope of the synth chain after the flutter gate, for `sec` seconds: shows the stutter pattern. */
  mixEnv(sec: number): Promise<number[]> {
    const c = this.ctx(); if (!c || !this.flutterGain) return Promise.reject(new Error('no audio'));
    const src = this.flutterGain;
    return new Promise((resolve) => {
      const n = Math.ceil(sec * c.sampleRate), X = new Float32Array(n); let k = 0;
      const proc = c.createScriptProcessor(4096, 2, 1), sink = c.createGain(); sink.gain.value = 0; sink.connect(c.destination);
      src.connect(proc); proc.connect(sink);
      proc.onaudioprocess = (e) => {
        const a = e.inputBuffer.getChannelData(0), m = Math.max(0, Math.min(a.length, n - k)); X.set(a.subarray(0, m), k); k += a.length;
        if (k >= n) {
          src.disconnect(proc); proc.disconnect(); proc.onaudioprocess = null;
          const hop = Math.round(c.sampleRate / 1000), out: number[] = [];
          for (let i = 0; i + hop <= n; i += hop) { let s = 0; for (let j = i; j < i + hop; j++) s += X[j] * X[j]; out.push(Math.sqrt(s / hop)); }
          resolve(out);
        }
      };
    });
  }
  /** Peak / rms over `sec` seconds at the output (post-limiter), or at the master (pre-limiter) when `pre` is set. */
  peak(sec: number, pre = false): Promise<PeakReport> {
    const c = this.ctx(); if (!c || !this.master) return Promise.reject(new Error('no audio'));
    const src: AudioNode = (!pre && this.lim.node) || this.master;
    return new Promise((resolve) => {
      const n = Math.ceil(sec * c.sampleRate); let k = 0, peak = 0, over = 0, sum = 0;
      const proc = c.createScriptProcessor(4096, 2, 1), sink = c.createGain(); sink.gain.value = 0; sink.connect(c.destination);
      src.connect(proc); proc.connect(sink);
      proc.onaudioprocess = (e) => {
        for (let ch = 0; ch < 2; ch++) { const d = e.inputBuffer.getChannelData(ch); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; if (a > 0.999) over++; sum += a * a; } }
        k += e.inputBuffer.length;
        if (k >= n) {
          src.disconnect(proc); proc.disconnect(); proc.onaudioprocess = null;
          resolve({ peak: +peak.toFixed(4), peakDb: +(20 * Math.log10(peak || 1e-9)).toFixed(2), over, rms: +Math.sqrt(sum / (2 * k)).toFixed(4), limiter: this.lim.ready, pre });
        }
      };
    });
  }

  /** Silence everything, stop the schedulers and close the context. The engine is not reusable afterwards. */
  destroy(): void {
    clearInterval(this.sc.timer); clearInterval(this.fl.timer); clearInterval(this.metro.timer); clearTimeout(this.preloadTimer);
    this.metro.on = false;
    this.allNotesOff();
    LOOP_ORDER.forEach((f) => this.loopStop(f));
    this.previewStop();
    const ac = this.ac; this.ac = null;
    if (ac && ac.state !== 'closed') void ac.close().catch(() => {});
  }
}
