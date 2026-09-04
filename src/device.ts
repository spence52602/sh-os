/* The device: DOM, interaction and screens for one instrument.
   Builds the stage over the render (three mode renders, the screen, every key, knob and the FLUTTER strip, the HELP
   guide, the phone notice), wires pointer and keyboard input to the engine, and runs the screen system (SVG exports
   plus HTML screens, the overlays, the oscilloscope, the readout popup, the now-playing strip). Geometry comes from
   geometry.ts, copy from content.ts, sound from the Engine. `createDevice` returns the instance the public API and
   the React wrapper hold; `destroy()` unwinds everything it attached to the page. */
import type { KnobParam, LoopFamily, ModeIndex, SoundName } from './types.ts';
import { CAP, COMMAND_KEYS, FADER, GUIDE, IMG_W, KEY, KNOBS, OX, OY, PIANO, QWERTY, SCREEN_RECT, pad2, pct, place } from './geometry.ts';
import { BROWSE, FILES, GITHUB, ICONS, KNOB_LABEL, LINKS, RAIL_ORDER, SCREENS, STACK, URLS, WHY_COPY } from './content.ts';
import { Engine } from './audio/engine.ts';
import { BPM_MAX, BPM_MIN, LOOP_LABEL, LOOP_ORDER, SOUNDS, SOUND_ORDER, cutoffHz } from './audio/tuning.ts';
import { CapField, type Cap } from './caps.ts';
import { acquireCursor } from './cursor.ts';
import { currentMode, initialMode, registerDeviceImage, setMode } from './modes.ts';

export interface DeviceOptions {
  /** Base URL of the assets folder (trailing slash added if missing). */
  assets?: string;
  /** Cache-busting tag appended to every asset request. */
  version: string;
  /** Skip the remembered / URL-forced mode and start in this one. */
  mode?: ModeIndex;
}

export interface ShOsInstance {
  readonly root: HTMLElement;
  readonly engine: Engine;
  /** The screen showing now (`idle`, `play`, `stack:design` …). */
  screen(): string | null;
  /** Show a screen by name, as a key press would. */
  show(name: string): void;
  /** Fire a key's action (`'help'`, `'loop:kick'`, `'stack:ai'` …). */
  act(action: string): void;
  setMode(mode: number): void;
  mode(): ModeIndex;
  /** Remove the device from the page, stop audio, drop every listener and timer. */
  destroy(): void;
}

const KNOB_PARAMS: KnobParam[] = ['reverb', 'cutoff', 'bpm', 'volume', 'sidechain'];

function ensureFont(): void {
  if (document.querySelector('link[data-shos-font]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.setAttribute('data-shos-font', '');
  l.href = 'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100;400;500&display=swap';
  document.head.appendChild(l);
}
function hideIn(svg: SVGElement, selectors: string[]): void {
  selectors.forEach((sel) => svg.querySelectorAll<SVGElement>(sel).forEach((n) => { n.style.display = 'none'; }));
}

export function createDevice(root: HTMLElement & { __shos?: ShOsInstance }, opts: DeviceOptions): ShOsInstance {
  if (root.__shos) return root.__shos;
  let base = opts.assets || root.getAttribute('data-assets') || './assets/';
  if (base.slice(-1) !== '/') base += '/';
  const VQ = '?v=' + opts.version;
  const engine = new Engine({ assetBase: base, version: opts.version });
  const caps = new CapField();
  const listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined]> = [];
  const on = (t: EventTarget, type: string, fn: EventListenerOrEventListenerObject, o?: boolean | AddEventListenerOptions) => { t.addEventListener(type, fn, o); listeners.push([t, type, fn, o]); };
  const timers: number[] = [];
  const later = (fn: () => void, ms: number) => { const id = window.setTimeout(fn, ms); timers.push(id); return id; };

  /** Phones and small tablets: under 760 px, or a coarse pointer under 1024 px. */
  const isMobile = () => root.clientWidth < 760 || (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches && root.clientWidth < 1024);

  root.classList.add('shos');
  ensureFont();
  const darkSrc = root.getAttribute('data-device-dark') || (base + 'device-dark@2x.png' + VQ);
  const glowSrc = root.getAttribute('data-device-glow') || (base + 'device-glow@2x.png' + VQ);
  root.style.setProperty('--shos-dev-light', 'url("' + base + 'device@2x.png' + VQ + '")');
  root.style.setProperty('--shos-dev-dark', 'url("' + darkSrc + '")');
  root.style.setProperty('--shos-dev-glow', 'url("' + glowSrc + '")');
  const cursor = acquireCursor(base + 'cursor@4x.png' + VQ, base + 'cursor-shadow@4x.png' + VQ);

  // ---- the render: light always, dark and glow fade in for their modes
  const stage = document.createElement('div'); stage.className = 'shos-stage';
  const img = document.createElement('img');
  img.className = 'shos-device shos-device-light'; img.src = base + 'device@2x.png' + VQ; img.alt = 'SH-OS, an OP-1 style portfolio instrument'; img.draggable = false;
  stage.appendChild(img);
  const unregister: Array<() => void> = [];
  const modeImage = (cls: string, src: string, mode: ModeIndex) => {
    const el = document.createElement('img'); el.className = 'shos-device ' + cls; el.alt = ''; el.draggable = false;
    el.addEventListener('load', () => root.classList.add('shos-dark-ready'));
    el.addEventListener('error', () => { el.remove(); if (mode === 1) root.classList.remove('shos-dark-ready'); });
    stage.appendChild(el); unregister.push(registerDeviceImage(el, src, mode));
  };
  modeImage('shos-device-dark', darkSrc, 1);
  modeImage('shos-device-glow', glowSrc, 2);

  // ---- screen
  const screen = document.createElement('div'); screen.className = 'shos-screen';
  place(screen, SCREEN_RECT[0], SCREEN_RECT[1], SCREEN_RECT[2], SCREEN_RECT[3]);
  const scrEls: Record<string, HTMLElement> = {};
  SCREENS.forEach((name) => { const s = document.createElement('div'); s.className = 'shos-scr'; s.setAttribute('data-name', name); screen.appendChild(s); scrEls[name] = s; });
  // HTML screens share one idiom (header line · title · body · footer chip); the SVG screens are Figma exports.
  // Big type: the device screen shows at ~52% of the 640-px design, so anything under ~20 design px is unreadable.
  const htmlScreen = (name: string, cls: string, html: string) => {
    const el = document.createElement('div'); el.className = 'shos-scr shos-helpscr' + (cls ? ' ' + cls : ''); el.setAttribute('data-name', name);
    el.innerHTML = html; screen.appendChild(el); scrEls[name] = el; return el;
  };
  htmlScreen('help', '',
    '<div class="shos-hc"><span>HELP — SH-OS</span><span>EXIT × · HELP · ESC</span></div>' +
    '<div class="shos-hh">HOW TO PLAY</div>' +
    '<div class="shos-hb"><p>ANY KEY SHOWS A SCREEN<br>PRESS IT AGAIN TO OPEN THE LINK</p><p>THE KEYBOARD PLAYS · DRAG IT · OR Z–M / Q–U</p>' +
    '<p>BLANK KEYS JAM: SOUND · LOOPS · METRONOME<br>KNOBS: REVERB · CUTOFF · BPM · VOLUME</p></div>' +
    '<div class="shos-hf"><b>EXIT →</b><span>CLOCK ↓ NIGHT MODE</span></div>');
  htmlScreen('why', 'shos-whyscr',
    '<div class="shos-hc"><span>WHY? · SH-OS</span><span>THE BACKSTORY</span></div>' +
    '<div class="shos-hh">ONCE A PRODUCER</div>' +
    '<div class="shos-hb"><p>' + WHY_COPY + '</p></div>' +
    '<div class="shos-hf"><b>BACK</b><span>WHY? AGAIN · ESC</span></div>');
  STACK.forEach((st, i) => htmlScreen('stack:' + st.key, 'shos-stackscr',
    '<div class="shos-hc"><span>' + st.label + ' · STACK ' + (i + 1) + '/' + STACK.length + '</span><span>' + st.tag + '</span></div>' +
    '<div class="shos-tools">' + st.tools.map((t) => '<div><b>' + t[0] + '</b><span>' + t[1] + '</span></div>').join('') + '</div>' +
    '<div class="shos-hf"><b>' + st.label + '</b><span>' + st.foot + '</span></div>'));
  htmlScreen('beta', 'shos-betascr',
    '<div class="shos-hc"><span>SLOT <i class="shos-beta-slot">1</i> · EMPTY</span><span>BETA V1.0</span></div>' +
    '<div class="shos-hh">SORRY, NO FEATURES YET</div>' +
    '<div class="shos-hb"><p>THIS IS BETA V1.0</p><p>MORE FEATURES SHIPPING SOON</p></div>' +
    '<div class="shos-hf"><b>BETA</b><span>◁ ▷ BROWSE · ESC = BACK</span></div>');
  const betaSlot = screen.querySelector('.shos-beta-slot') as HTMLElement;
  htmlScreen('mobile', 'shos-mobilescr',
    '<div class="shos-hc"><span>SH-OS · MOBILE</span><span>BETA V1.0</span></div>' +
    '<div class="shos-hh">DESKTOP ONLY FOR NOW</div>' +
    '<div class="shos-hb"><p>ONLY AVAILABLE ON DESKTOP FOR NOW.</p><p>OPEN IT ON A LAPTOP TO PLAY.</p></div>' +
    '<div class="shos-hf"><b>SOON</b><span>MOBILE IS ON THE LIST</span></div>');
  htmlScreen('github', 'shos-gitscr',
    '<div class="shos-hc"><span>GITHUB · SOURCE</span><span>PRESS AGAIN → OPEN</span></div>' +
    '<div class="shos-hh">SH-OS IS OPEN SOURCE</div>' +
    '<div class="shos-hb"><p class="shos-git-url">' + GITHUB.path + '</p><p>WEB AUDIO · TYPESCRIPT · ONE SCRIPT TO EMBED</p></div>' +
    '<div class="shos-hf"><b>OPEN →</b><span>PRESS GITHUB AGAIN · ESC = BACK</span></div>');

  const dot = document.createElement('div'); dot.className = 'shos-rec-dot'; screen.appendChild(dot);
  const caret = document.createElement('div'); caret.className = 'shos-caret'; screen.appendChild(caret);

  // ---- live overlays (positions are the Figma coordinates on the 640 × 320 screen, as percentages)
  const ovs: HTMLElement[] = [];
  const ov = (forScreen: string, cls: string, x: number, y: number, size: number, o: { right?: boolean; text?: string } = {}) => {
    const el = document.createElement('div'); el.className = 'shos-ov ' + cls; el.setAttribute('data-for', forScreen);
    if (o.right) el.style.right = pct(640 - x, 640); else el.style.left = pct(x, 640);
    el.style.top = pct(y + size * 0.115, 320);
    el.style.fontSize = (size / 640 * 100).toFixed(3) + 'cqw';
    if (o.text) el.textContent = o.text;
    screen.appendChild(el); ovs.push(el); return el;
  };
  const dateEl = ov('idle', 'shos-date', 28, 58, 56);
  const timeEl = ov('idle', 'shos-time', 28, 132, 56);
  const noteEl = ov('play', 'shos-note', 612, 46, 60, { right: true, text: 'C4' });
  const muteEl = document.createElement('div'); muteEl.className = 'shos-ov shos-mute'; muteEl.textContent = 'MUTE';
  const ticks: HTMLElement[] = [];
  for (let i = 0; i < 24; i++) {
    const tk = document.createElement('div'); tk.className = 'shos-ov shos-tick'; tk.setAttribute('data-for', 'play');
    tk.style.left = ((28 + i * 21.2) / 640 * 100).toFixed(3) + '%';
    screen.appendChild(tk); ticks.push(tk); ovs.push(tk);
  }
  const lkLabel = ov('link', 'shos-t-ink shos-t-med', 162, 80, 9);
  const lkHandle = ov('link', 'shos-t-crm shos-t-thin shos-t-track', 110, 130, 46);
  const lkDomain = ov('link', 'shos-t-ink shos-t-med', 552, 96, 9);
  const lkIcon = document.createElement('div'); lkIcon.className = 'shos-ov shos-lk-icon'; lkIcon.setAttribute('data-for', 'link');
  lkIcon.style.left = pct(110, 640); lkIcon.style.top = pct(72, 320); lkIcon.style.width = pct(40, 640); lkIcon.style.height = pct(40, 320);
  screen.appendChild(lkIcon); ovs.push(lkIcon);
  const lkRail = ov('link', 'shos-rail', 28, 274, 9);
  // PLAY: the jam layer, sound list (left), knob readouts (right), loop line (bottom)
  const jamSound = SOUND_ORDER.map((_, i) => ov('play', 'shos-jam-row', 25, 82 + i * 30, 10));
  const jamParam = KNOB_PARAMS.map((_, i) => ov('play', 'shos-t-ink shos-t-med shos-jam-val', 612, 111 + i * 15, 9, { right: true }));
  const jamLoops = ov('play', 'shos-jam-loops', 363, 272, 9);

  // ---- oscilloscope: replaces the static waves on PLAY. White = the mix, blue = the synth, zero-crossing triggered.
  const SCOPE = [112, 48, 424, 210];                                  // the whole centre bay between the sound list and the readouts
  const SCOPE_CLEAR = [96, 40, 545, 264];                             // static design parts whose centre falls in here are retired
  const scope = document.createElement('canvas'); scope.className = 'shos-ov shos-scope'; scope.setAttribute('data-for', 'play');
  scope.style.left = pct(SCOPE[0], 640); scope.style.top = pct(SCOPE[1], 320); scope.style.width = pct(SCOPE[2], 640); scope.style.height = pct(SCOPE[3], 320);
  scope.width = SCOPE[2] * 2; scope.height = SCOPE[3] * 2; screen.appendChild(scope); ovs.push(scope);
  let scopeRaf = 0, scopeBufA: Float32Array<ArrayBuffer> | null = null, scopeBufB: Float32Array<ArrayBuffer> | null = null;
  const trigger = (buf: Float32Array, n: number, span: number) => {   // first rising zero crossing after a quarter of the buffer → a stable trace for pitched signals
    const start = n >> 2, end = n - span; if (end <= start) return 0;
    for (let i = start + 1; i < end; i++) if (buf[i - 1] <= 0 && buf[i] > 0) return i;
    return start;
  };
  const drawScope = () => {
    scopeRaf = 0;
    if (state.current !== 'play') return;
    if (!engine.ac || !engine.scopeMix || !engine.scopeSynth) { scopeRaf = requestAnimationFrame(drawScope); return; }   // audio not unlocked yet: keep waiting on this screen
    const g = scope.getContext('2d')!, W = scope.width, H = scope.height, n = engine.scopeMix.fftSize, span = 880;   // ~20 ms window
    if (!scopeBufA || !scopeBufB) { scopeBufA = new Float32Array(n); scopeBufB = new Float32Array(n); }
    engine.scopeMix.getFloatTimeDomainData(scopeBufA); engine.scopeSynth.getFloatTimeDomainData(scopeBufB);
    g.clearRect(0, 0, W, H);
    g.strokeStyle = '#3A3A40'; g.lineWidth = 1.5; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke(); g.setLineDash([]);
    const traces: Array<[Float32Array, string]> = [[scopeBufA, '#E9E9EC'], [scopeBufB, '#45A8F0']];
    for (const [buf, colour] of traces) {
      const t0 = trigger(buf, n, span), amp = 0.94 * H / 2;
      g.strokeStyle = colour; g.lineWidth = 2.6; g.lineJoin = 'round'; g.beginPath();
      for (let i = 0; i < span; i++) { const v = Math.max(-1, Math.min(1, buf[t0 + i])); const x = i / (span - 1) * W, y = H / 2 - v * amp; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
      g.stroke();
    }
    g.fillStyle = '#F0E8D2';                                          // the design's dots: five markers along the baseline
    for (let d = 0; d < 5; d++) { g.beginPath(); g.arc(d / 4 * (W - 10) + 5, H / 2, 5, 0, Math.PI * 2); g.fill(); }
    scopeRaf = requestAnimationFrame(drawScope);
  };
  const scopeOn = () => { if (!scopeRaf) scopeRaf = requestAnimationFrame(drawScope); };

  // ---- readout popup: a big centred value over whatever screen is showing while something turns; fades after you stop
  const knobPop = document.createElement('div'); knobPop.className = 'shos-knobpop';
  knobPop.innerHTML = '<div class="shos-kp-val"></div><div class="shos-kp-label"></div><div class="shos-kp-bar"><i></i></div><div class="shos-kp-hint"></div>';
  screen.appendChild(knobPop);
  const kpVal = knobPop.querySelector('.shos-kp-val') as HTMLElement, kpLabel = knobPop.querySelector('.shos-kp-label') as HTMLElement, kpBar = knobPop.querySelector('.shos-kp-bar i') as HTMLElement, kpHint = knobPop.querySelector('.shos-kp-hint') as HTMLElement;
  let kpTimer = 0;
  const P = engine.params;
  const knobText = (p: KnobParam) => {
    if (p === 'bpm') return String(P.bpm);
    if (p === 'sidechain') return Math.round(P.sidechain * 100) + '%';
    if (p === 'cutoff') { const hz = cutoffHz(P.cutoff); return hz >= 1000 ? (hz / 1000).toFixed(1) + 'K' : String(Math.round(hz)); }
    return Math.round(P[p] * 100) + (p === 'reverb' ? '%' : '');
  };
  /** pop(value, label[, 0..1[, hint]]): the same big readout for knobs (with a position bar) and for jam keys (without). */
  const pop = (value: string, label: string, v01?: number | null, hint = '') => {
    kpVal.textContent = value; kpLabel.textContent = label; kpHint.textContent = hint;
    knobPop.classList.toggle('no-bar', v01 === undefined || v01 === null);
    if (v01 !== undefined && v01 !== null) kpBar.style.width = (v01 * 100).toFixed(1) + '%';
    knobPop.classList.add('is-on');
    clearTimeout(kpTimer); kpTimer = later(() => knobPop.classList.remove('is-on'), 1100);
  };
  const knobValue = (p: KnobParam) => (p === 'bpm' ? (P.bpm - BPM_MIN) / (BPM_MAX - BPM_MIN) : P[p]);
  const showKnob = (p: KnobParam) => pop(knobText(p), KNOB_LABEL[p], knobValue(p));
  // now-playing strip: top centre of every screen while anything loops (drum slots · preview · metronome · effects · mute)
  const hud = document.createElement('div'); hud.className = 'shos-hud'; screen.appendChild(hud);
  hud.appendChild(muteEl);
  stage.appendChild(screen);

  const state = { current: null as string | null, idleTimer: 0, lastScreen: BROWSE[0], clockTimer: 0, link: 'x', lastAction: null as string | null, beforeHelp: null as string | null, beforeWhy: null as string | null, jamParam: null as KnobParam | null };
  let muteKey: HTMLButtonElement | null = null, stopKey: HTMLButtonElement | null = null;

  const fmtParam = (p: KnobParam) => {
    if (p === 'reverb') return 'REV ' + Math.round(P.reverb * 100) + '%';
    if (p === 'sidechain') return 'SC ' + Math.round(P.sidechain * 100) + '%';
    if (p === 'cutoff') { const hz = cutoffHz(P.cutoff); return 'CUT ' + (hz >= 1000 ? (hz / 1000).toFixed(1) + 'K' : Math.round(hz)); }
    if (p === 'bpm') return 'BPM ' + P.bpm;
    return 'VOL ' + Math.round(P.volume * 100);
  };
  const chip = (text: string, cls?: string) => { const b = document.createElement('b'); if (cls) b.className = cls; b.textContent = text; hud.appendChild(b); };
  const refreshJam = () => {
    SOUND_ORDER.forEach((s, i) => { jamSound[i].innerHTML = s === engine.sound ? '<b>' + SOUNDS[s].label + '</b>' : '<span>' + SOUNDS[s].label + '</span>'; });
    KNOB_PARAMS.forEach((p, i) => { jamParam[i].textContent = fmtParam(p); jamParam[i].classList.toggle('is-hot', p === state.jamParam); });
    jamLoops.innerHTML = LOOP_ORDER.map((f) => { const idx = engine.loopIndex(f); return '<span class="' + (idx >= 0 ? 'is-on' : '') + '">' + LOOP_LABEL[f] + (idx >= 0 ? ' ' + (idx + 1) : '') + '</span>'; }).join('<i>·</i>') +
      '<i>·</i><span class="shos-jam-metro' + (engine.metro.on ? ' is-on' : '') + '">● METRO</span>' + (engine.preview.src || engine.preview.name ? '<i>·</i><span class="is-on">▶ PREVIEW</span>' : '');
    if (stopKey) stopKey.classList.toggle('is-glow', engine.anyRunning() || !!engine.preview.name);   // the STOP key breathes while anything runs
    hud.querySelectorAll('b').forEach((n) => n.remove());
    LOOP_ORDER.forEach((f) => { const idx = engine.loopIndex(f); if (idx >= 0) chip(LOOP_LABEL[f] + ' ' + (idx + 1)); });
    if (engine.preview.name) chip(SOUNDS[engine.preview.name].label + ' ▶', 'crm');
    if (engine.metro.on) chip('● ' + P.bpm, 'grn');
    if (P.sidechain > 0) chip('SC ' + Math.round(P.sidechain * 100), 'crm');
    if (P.flutter > 0) chip('FLT ' + Math.round(P.flutter * 100) + ' · 1/' + P.flutterDiv, 'crm');
  };
  const applyLink = () => {
    const l = LINKS[state.link];
    lkLabel.textContent = l.label; lkHandle.textContent = l.handle; lkDomain.textContent = l.domain;
    lkIcon.innerHTML = '<svg viewBox="0 0 40 40">' + ICONS[l.icon] + '</svg>';
    lkRail.innerHTML = RAIL_ORDER.map((k) => (k === state.link ? '<b>' + LINKS[k].rail + '</b>' : '<span>' + LINKS[k].rail + '</span>')).join('<i>·</i>');
  };
  applyLink(); refreshJam();

  const tickClock = () => {
    const d = new Date();
    dateEl.textContent = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    timeEl.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  };
  const show = (name: string) => {
    if (!scrEls[name] || name === state.current) return;
    if (state.current) scrEls[state.current].classList.remove('is-on');
    state.current = name;
    screen.setAttribute('data-screen', name);
    scrEls[name].classList.add('is-on');
    ovs.forEach((o) => o.classList.toggle('is-on', o.getAttribute('data-for') === name && !o.classList.contains('shos-tick')));
    guide.classList.toggle('is-on', name === 'help');
    screen.classList.add('is-switching'); later(() => screen.classList.remove('is-switching'), 320);
    if (BROWSE.indexOf(name) >= 0) state.lastScreen = name;
    clearInterval(state.clockTimer);
    if (name === 'idle') { tickClock(); state.clockTimer = window.setInterval(tickClock, 1000); }
    if (name === 'play') scopeOn();
    armIdle();
  };
  const armIdle = () => {
    clearTimeout(state.idleTimer);
    if (state.current === 'idle' || state.current === 'boot') return;
    state.idleTimer = later(() => { if (engine.anyRunning()) armIdle(); else show('idle'); }, 30000);   // never sleep mid-jam
  };
  const toPlay = () => { if (state.current !== 'play') { state.lastAction = null; show('play'); } else armIdle(); };
  const jamNav = () => { if (state.current === 'idle' || state.current === 'boot') toPlay(); else armIdle(); };   // jam keys wake the device but never change the screen
  const step = (dir: number) => { let i = BROWSE.indexOf(state.current || ''); if (i < 0) i = 0; state.lastAction = null; show(BROWSE[(i + dir + BROWSE.length) % BROWSE.length]); };
  const pulse = () => { screen.classList.add('is-switching'); later(() => screen.classList.remove('is-switching'), 260); };
  const toggleMute = () => {
    engine.setMuted(!engine.muted);
    screen.classList.toggle('is-muted', engine.muted);
    if (muteKey) { muteKey.classList.toggle('is-muted', engine.muted); muteKey.setAttribute('aria-pressed', String(engine.muted)); }
    pulse(); armIdle();
  };
  const openUrl = (url: string) => { try { window.open(url, '_blank', 'noopener'); } catch { location.href = url; } };
  // HELP: the screen legend plus the callout guide over the keys; HELP again, EXIT or Esc returns to where you were
  const closeHelp = () => { const back = state.beforeHelp; state.lastAction = null; show(back && back !== 'help' && back !== 'boot' ? back : 'idle'); };
  const openHelp = () => { if (state.current === 'help') return closeHelp(); state.beforeHelp = state.current; state.lastAction = 'help'; show('help'); };
  const closeWhy = () => { const back = state.beforeWhy; state.lastAction = null; show(back && back !== 'why' && back !== 'help' && back !== 'boot' ? back : 'idle'); };
  const toggleWhy = () => { if (state.current === 'why') return closeWhy(); state.beforeWhy = state.current; state.lastAction = 'why'; show('why'); };
  /** First press shows the screen; pressing the same key again opens its destination. */
  const act = (action: string) => {
    const parts = action.split(':'), name = parts[0], arg = parts[1];
    if (name === 'prev') return step(-1);
    if (name === 'next') return step(1);
    if (name === 'mute') return toggleMute();
    if (name === 'help') return openHelp();
    if (name === 'why') return toggleWhy();
    if (name === 'sound') {
      engine.unlock(); engine.setSound(SOUND_ORDER[(SOUND_ORDER.indexOf(engine.sound) + 1) % SOUND_ORDER.length]); engine.allNotesOff();
      if (engine.preview.name) engine.previewPlay();                                      // a running preview switches to the new sound, in time
      refreshJam(); pop(SOUNDS[engine.sound].label, 'SOUND ' + (SOUND_ORDER.indexOf(engine.sound) + 1) + '/' + SOUND_ORDER.length); return jamNav();
    }
    if (name === 'loop') { const fam = arg as LoopFamily; engine.loopCycle(fam); refreshJam(); const li = engine.loopIndex(fam); pop(LOOP_LABEL[fam] + (li >= 0 ? ' ' + (li + 1) : ' OFF'), 'DRUM LOOP'); return jamNav(); }
    if (name === 'metro') { engine.setMetro(!engine.metro.on); refreshJam(); pop(engine.metro.on ? 'ON' : 'OFF', 'METRONOME · ' + P.bpm); return jamNav(); }
    if (name === 'stopall') { engine.stopAllLoops(); refreshJam(); pop('STOP', 'ALL LOOPS'); return jamNav(); }
    if (name === 'preview') { if (engine.preview.name) engine.previewStop(); else engine.previewPlay(); refreshJam(); pop(engine.preview.name ? SOUNDS[engine.sound].label + ' ▶' : 'STOP', 'PREVIEW'); return jamNav(); }
    let target = name, url: string | null = URLS[name] || null;
    if (name === 'stack') target = action;                                                // 'stack:design' … one screen per key
    if (name === 'beta') { target = 'beta'; if (betaSlot) betaSlot.textContent = arg; }   // slots 1–4: the same empty screen, numbered
    if (name === 'link') { state.link = arg; applyLink(); target = 'link'; url = LINKS[arg].url; }
    if (state.current === target && state.lastAction === action) { if (url) { openUrl(url); pulse(); } return; }
    state.lastAction = action;
    if (state.current === 'idle' && name === 'idle') return show(state.lastScreen);
    show(target);
  };

  // ---- command keys: click sound on hover, screen on press
  const playClick = () => engine.playClick();
  COMMAND_KEYS.forEach((k) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'shos-key';
    b.setAttribute('aria-label', k.label); b.setAttribute('data-action', k.action);
    place(b, OX + k.x, OY + k.y, k.w, k.h);
    if (k.action === 'mute') caps.add(b, OX + k.x, OY + k.y, k.w, k.h, k.w * 0.9, true);
    else caps.add(b, OX + k.x, OY + k.y, k.w, k.h, KEY * CAP);
    b.addEventListener('pointerenter', playClick);
    b.addEventListener('pointerdown', () => b.classList.add('is-down'));
    const up = () => b.classList.remove('is-down');
    b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
    b.addEventListener('click', () => act(k.action));
    if (k.action === 'mute') { muteKey = b; b.setAttribute('aria-pressed', 'false'); }
    if (k.action === 'stopall') { stopKey = b; const glow = document.createElement('span'); glow.className = 'shos-glow'; b.appendChild(glow); }
    stage.appendChild(b);
  });

  // ---- keyboard keys: sample on press, held while down, glissando on drag, note + rail on screen
  const keyEls: HTMLButtonElement[] = [];
  const keyDown = (i: number) => {
    if (keyEls[i].classList.contains('is-down')) return;
    keyEls[i].classList.add('is-down');
    engine.noteOn(i);
    noteEl.textContent = engine.keyNoteName(i);
    ticks[i].classList.add('is-on');
    toPlay();
  };
  const keyUp = (i: number | undefined) => {
    if (i === undefined || i < 0 || !keyEls[i] || !keyEls[i].classList.contains('is-down')) return;
    keyEls[i].classList.remove('is-down');
    engine.noteOff(i);
    ticks[i].classList.remove('is-on');
  };
  let pointerNotes: Record<number, number> = {};
  const noteUnder = (x: number, y: number) => { const el = document.elementFromPoint(x, y); const b = el && el.closest ? el.closest('.shos-key--note') : null; return b ? +(b.getAttribute('data-note') || -1) : -1; };
  PIANO.forEach((k) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'shos-key shos-key--note' + (k.pill ? ' shos-key--pill' : ' shos-key--sharp');
    b.setAttribute('aria-label', 'Note ' + k.name); b.setAttribute('data-note', String(k.note));
    place(b, OX + k.x, OY + k.y, k.w, k.h);                            // the QWERTY legends are printed on the device render itself (Figma)
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* synthetic */ } engine.unlock(); pointerNotes[e.pointerId] = k.note; keyDown(k.note); });
    b.addEventListener('pointermove', (e) => {
      if (pointerNotes[e.pointerId] === undefined) return;
      const n = noteUnder(e.clientX, e.clientY), cur = pointerNotes[e.pointerId];
      if (n === cur) return;
      if (cur >= 0) keyUp(cur);
      pointerNotes[e.pointerId] = n;
      if (n >= 0) keyDown(n);
    });
    const up = (e: PointerEvent) => { const n = pointerNotes[e.pointerId]; delete pointerNotes[e.pointerId]; if (n !== undefined) keyUp(n); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    keyEls[k.note] = b;
    stage.appendChild(b);
  });
  const releasePointer = (e: Event) => { const pe = e as PointerEvent; if (pe.pointerId !== undefined && pointerNotes[pe.pointerId] !== undefined) { keyUp(pointerNotes[pe.pointerId]); delete pointerNotes[pe.pointerId]; } };
  const releaseAll = () => {
    Object.keys(pointerNotes).forEach((id) => keyUp(pointerNotes[+id])); pointerNotes = {};
    engine.allNotesOff(); ticks.forEach((t) => t.classList.remove('is-on')); keyEls.forEach((b) => b.classList.remove('is-down'));
  };
  on(window, 'pointerup', releasePointer, true);
  on(window, 'pointercancel', releasePointer, true);
  on(window, 'mouseup', () => { if (Object.keys(pointerNotes).length) releaseAll(); }, true);
  on(window, 'blur', releaseAll);
  on(document, 'visibilitychange', () => { if (document.hidden) releaseAll(); });

  // ---- knobs: reverb · cutoff · BPM · volume · sidechain. Scroll or drag to turn; a rim mark shows the position.
  const knobCaps: Cap[] = [];
  const refreshKnobs = () => KNOB_PARAMS.forEach((p, i) => caps.setAngle(knobCaps[i], -135 + 270 * knobValue(p)));
  KNOBS.forEach((e, idx) => {
    const p = KNOB_PARAMS[idx];
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'shos-key shos-key--enc';
    b.setAttribute('aria-label', e.name + ' knob: ' + p);
    place(b, e.x, e.y, e.size, e.size);
    const c = caps.add(b, e.x, e.y, e.size, e.size, e.cap, false, true);   // loose: the knobs may drag and wobble
    if (p !== 'sidechain') caps.addMark(c, b, e.cap, e.size);                // the sidechain knob already carries a moulded pip in the render
    knobCaps[idx] = c;
    b.addEventListener('pointerenter', playClick);
    let acc = 0;
    const turn = (amount: number) => {                                       // amount: wheel units (a mouse notch ≈ 100), up = more
      engine.unlock();
      if (p === 'bpm') { acc += amount / 40; const st = Math.trunc(acc); if (!st) return; acc -= st; engine.setBpm(P.bpm + st); }   // ≈ 2 BPM per notch
      else engine.setParam(p, P[p] + amount / 1000);                                                                                 // ≈ 10 notches end to end
      state.jamParam = p; refreshJam(); refreshKnobs();
      showKnob(p); armIdle();                                                // readout over the current screen; no screen change
    };
    b.addEventListener('wheel', (ev) => { ev.preventDefault(); turn(-ev.deltaY); }, { passive: false });
    let drag: { y: number; moved: boolean } | null = null;
    b.addEventListener('pointerdown', (ev) => { drag = { y: ev.clientY, moved: false }; try { b.setPointerCapture(ev.pointerId); } catch { /* synthetic */ } });
    b.addEventListener('pointermove', (ev) => { if (!drag) return; const dy = drag.y - ev.clientY; if (Math.abs(dy) < 1) return; drag.y = ev.clientY; drag.moved = true; turn(dy * 8); });   // ~125 px of drag end to end
    const end = () => { if (drag && !drag.moved) { state.jamParam = p; refreshJam(); toPlay(); } drag = null; };
    b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end); b.addEventListener('lostpointercapture', () => { drag = null; });
    stage.appendChild(b);
  });
  refreshKnobs();

  // ---- FLUTTER strip (right rail): a touch sensor on the real thing. Drag up for the amount, tap to step the rate.
  const strip = document.createElement('button'); strip.type = 'button'; strip.className = 'shos-fader';
  strip.setAttribute('aria-label', 'Flutter strip: drag for amount, tap for rate');
  place(strip, FADER.hit[0], FADER.hit[1], FADER.hit[2], FADER.hit[3]);
  const flutterTo = (v: number) => {
    engine.setParam('flutter', v); refreshJam();
    pop(Math.round(P.flutter * 100) + '%', 'FLUTTER · 1/' + P.flutterDiv, P.flutter, 'TAP THE STRIP FOR 1/8 · 1/16 · 1/4'); armIdle();
  };
  strip.addEventListener('pointerenter', playClick);
  strip.addEventListener('wheel', (ev) => { ev.preventDefault(); engine.unlock(); flutterTo(P.flutter - ev.deltaY / 1000); }, { passive: false });
  let fd: { y: number; v: number; moved: boolean } | null = null;
  strip.addEventListener('pointerdown', (ev) => { engine.unlock(); fd = { y: ev.clientY, v: P.flutter, moved: false }; strip.classList.add('is-down'); try { strip.setPointerCapture(ev.pointerId); } catch { /* synthetic */ } });
  strip.addEventListener('pointermove', (ev) => {
    if (!fd) return; const dy = fd.y - ev.clientY; if (!fd.moved && Math.abs(dy) < 2) return;
    fd.moved = true;
    const r = strip.getBoundingClientRect(), travel = r.height * (FADER.bottom - FADER.top) / FADER.hit[3];
    flutterTo(fd.v + dy / travel);
  });
  const stripEnd = () => {
    if (fd && !fd.moved) { const div = engine.cycleFlutterDiv(); refreshJam(); pop('1/' + div, 'FLUTTER · RATE', null, 'DRAG UP TO MIX IT IN'); armIdle(); }   // a tap steps 1/8 → 1/16 → 1/4
    fd = null; strip.classList.remove('is-down');
  };
  strip.addEventListener('pointerup', stripEnd); strip.addEventListener('pointercancel', () => { fd = null; strip.classList.remove('is-down'); }); strip.addEventListener('lostpointercapture', () => { fd = null; strip.classList.remove('is-down'); });
  stage.appendChild(strip);

  // ---- HELP guide layer (above the keys, below the screen; keys stay live underneath)
  const guide = document.createElement('div'); guide.className = 'shos-guide';
  GUIDE.forEach((g) => {
    const bx = document.createElement('div'); bx.className = 'shos-gbox';
    place(bx, g.x1 - 4, g.y1 - 4, g.x2 - g.x1 + 8, g.y2 - g.y1 + 8);
    const tag = document.createElement('span'); tag.className = 'shos-gtag' + (g.side === 'right' ? ' shos-gtag--r' : '');
    const t = document.createElement('b'); t.textContent = g.title;
    const n = document.createElement('i'); n.textContent = g.note;
    tag.appendChild(t); tag.appendChild(n); bx.appendChild(tag);
    guide.appendChild(bx);
  });
  const exitBtn = document.createElement('button'); exitBtn.type = 'button'; exitBtn.className = 'shos-guide-exit';
  exitBtn.textContent = 'EXIT ×'; exitBtn.setAttribute('aria-label', 'Exit help');
  exitBtn.addEventListener('pointerenter', playClick);
  exitBtn.addEventListener('click', () => closeHelp());
  guide.appendChild(exitBtn);
  stage.appendChild(guide);
  root.appendChild(stage);

  // ---- audio wake-up: preload on the first hover, unlock on the first gesture anywhere
  on(root, 'pointerenter', () => engine.preload(), { once: true });
  const wake = () => { engine.unlock(); engine.preload(); };
  on(document, 'pointerdown', wake, { once: true }); on(document, 'keydown', wake, { once: true });

  // ---- keyboard: space stops everything from anywhere; the QWERTY map, arrows and Esc when the device has focus
  root.tabIndex = 0;
  on(document, 'keydown', (ev: Event) => {
    const e = ev as KeyboardEvent;
    if (e.key !== ' ' && e.code !== 'Space') return;
    const t = e.target as HTMLElement | null; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
    engine.stopAllLoops(); releaseAll(); refreshJam(); pop('STOP', 'ALL SOUND'); armIdle();
  });
  const held: Record<string, boolean> = {};
  on(root, 'keydown', (ev: Event) => {
    const e = ev as KeyboardEvent;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase(), i = QWERTY.indexOf(k);
    if (i >= 0) { e.preventDefault(); if (!held[k]) { held[k] = true; engine.unlock(); keyDown(i); } return; }
    if (e.key === 'ArrowRight') { step(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); }
    else if (e.key === 'Escape') { if (state.current === 'help') closeHelp(); else if (state.current === 'why') closeWhy(); else { state.lastAction = null; show('idle'); } }
  });
  on(root, 'keyup', (ev: Event) => { const k = (ev as KeyboardEvent).key.toLowerCase(), i = QWERTY.indexOf(k); if (i >= 0) { held[k] = false; keyUp(i); } });

  // ---- screens: load the outlined SVG exports, retire the static bits the overlays now drive, then boot
  let destroyed = false;
  SCREENS.forEach((name) => {
    fetch(base + FILES[name] + VQ).then((r) => r.text()).then((svg) => {
      if (destroyed) return;
      scrEls[name].innerHTML = svg;
      const el = scrEls[name].querySelector('svg');
      if (el) {
        el.removeAttribute('width'); el.removeAttribute('height'); el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        if (name === 'idle') hideIn(el, ['[id="2026-09-03"]', '[id="22:58"]']);
        if (name === 'play') {
          hideIn(el, ['[id="C4"]', 'path[stroke="#45A8F0"][stroke-width="3"]', '[id="PAD"]', '[id="DRUM"]', '[id="8BIT"]', '[id="FM"]', '[id="Rectangle"]', '[id^="ENGINE"]', '[id^="ATK"]', '[id^="REL"]', '[id^="POLY"]', '[id^="REC"]']);
          el.querySelectorAll<SVGGraphicsElement>('path, circle, ellipse, line, rect').forEach((p) => {   // the old sines, dots and baseline: anything centred in the scope bay
            try { const b = p.getBBox(), cx = b.x + b.width / 2, cy = b.y + b.height / 2; if (cx > SCOPE_CLEAR[0] && cx < SCOPE_CLEAR[2] && cy > SCOPE_CLEAR[1] && cy < SCOPE_CLEAR[3] && b.width < 460) p.style.display = 'none'; } catch { /* detached */ }
          });
        }
        if (name === 'link') hideIn(el, ['[id$="SOCIAL"]', '[id^="@SPENCE"]', '[id="X.COM"]', '[id="X"]', '[id$="INSTAGRAM"]', '#Rectangle_4', 'path[stroke="#F0E8D2"][stroke-width="2.5"]']);
      }
      if (name === 'boot' && !state.current) {
        const pick = /[?&]screen=([a-z]+)/.exec(location.search);   // ?screen=help jumps straight to a screen (previews, checks)
        const lk = /[?&]link=([a-z]+)/.exec(location.search); if (lk && LINKS[lk[1]]) { state.link = lk[1]; applyLink(); }
        if (pick && scrEls[pick[1]]) { show(pick[1]); return; }
        show('boot');
        later(() => show('idle'), 1800);
      }
    }).catch(() => {});
  });

  // ---- layout: the device scales as one piece at every width; the cursor scales with it
  const layout = () => { root.classList.toggle('is-mobile', isMobile()); cursor.scale(Math.max(0.6, Math.min(1, root.clientWidth / IMG_W))); };
  layout();
  on(window, 'resize', layout);

  // ---- phones: the device is there to look at; every tap answers "desktop only for now", as a readable overlay too
  const notice = document.createElement('div'); notice.className = 'shos-notice'; notice.textContent = 'Only available on desktop for now';
  root.appendChild(notice);
  let noticeTimer = 0;
  const mobileBlock = (ev: Event) => {
    if (!isMobile()) return;
    ev.preventDefault(); ev.stopPropagation();
    if (ev.type !== 'pointerdown') return;
    if (state.current !== 'mobile') { state.lastAction = null; show('mobile'); } else pulse();
    notice.classList.add('is-on'); clearTimeout(noticeTimer); noticeTimer = later(() => notice.classList.remove('is-on'), 2400);
  };
  ['pointerdown', 'pointerup', 'click'].forEach((t) => on(stage, t, mobileBlock, true));   // capture: before any key

  setMode(opts.mode !== undefined ? opts.mode : initialMode(location.search), true);

  const instance: ShOsInstance = {
    root, engine,
    screen: () => state.current,
    show, act,
    setMode: (m) => setMode(m),
    mode: () => currentMode(),
    destroy() {
      if (destroyed) return; destroyed = true;
      listeners.forEach(([t, type, fn, o]) => t.removeEventListener(type, fn, o));
      timers.forEach((id) => clearTimeout(id));
      clearInterval(state.clockTimer); clearTimeout(state.idleTimer); clearTimeout(kpTimer); clearTimeout(noticeTimer);
      cancelAnimationFrame(scopeRaf); scopeRaf = 0;
      caps.destroy(); cursor.release(); unregister.forEach((u) => u());
      engine.destroy();
      stage.remove(); notice.remove();
      root.classList.remove('shos', 'is-mobile', 'shos-dark-ready');
      delete root.__shos;
    },
  };
  root.__shos = instance;
  return instance;
}
