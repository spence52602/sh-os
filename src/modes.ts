/* Page modes: 0 light, 1 dark, 2 glow (an all-black device with lit keys). The footer clock cycles them.
   Page-level state shared by every instrument on the page: a black panel that wipes up beneath the page, body
   classes the stylesheet keys off, and one dark and one glow render per device that fade in over the light one.
   The choice is remembered in localStorage (`shos-mode`) and can be forced with `?mode=0|1|2`. */
import type { ModeIndex } from './types.ts';

const MODES = 3;
interface DeviceImage { img: HTMLImageElement; src: string; mode: ModeIndex; }
const state = { mode: 0 as ModeIndex, layer: null as HTMLDivElement | null, images: [] as DeviceImage[] };

export const currentMode = (): ModeIndex => state.mode;
export const isNight = (): boolean => state.mode > 0;

/** A device render that should show in `mode`; its src is only assigned the first time that mode is entered. */
export function registerDeviceImage(img: HTMLImageElement, src: string, mode: ModeIndex): () => void {
  const entry = { img, src, mode }; state.images.push(entry);
  if (mode === state.mode) { img.src = src; img.classList.add('is-on'); }
  return () => { const i = state.images.indexOf(entry); if (i >= 0) state.images.splice(i, 1); };
}

function layer(): HTMLDivElement {
  if (state.layer) return state.layer;
  const l = document.createElement('div'); l.className = 'shos-night'; document.body.appendChild(l);
  state.layer = l; return l;
}

/** Switch mode; `instant` skips the wipe (used when restoring the remembered mode at boot). */
export function setMode(mode: number, instant = false): void {
  state.mode = (((mode % MODES) + MODES) % MODES) as ModeIndex;
  const night = state.mode > 0;
  layer();
  if (instant) document.documentElement.classList.add('shos-no-anim');
  document.body.classList.toggle('shos-is-night', night);                 // dark page chrome for modes 1 and 2
  document.body.classList.toggle('shos-is-glow', state.mode === 2);
  for (const d of state.images) {
    const on = d.mode === state.mode;
    if (on && !d.img.src) d.img.src = d.src;
    d.img.classList.toggle('is-on', on);
  }
  try { localStorage.setItem('shos-mode', String(state.mode)); localStorage.setItem('shos-night', night ? '1' : '0'); } catch { /* private mode */ }
  if (instant) requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('shos-no-anim')));
}
export const setNight = (on: boolean, instant = false): void => setMode(on ? 1 : 0, instant);

/** The remembered mode, or the one forced by the page URL. */
export function initialMode(search: string): ModeIndex {
  let mode = 0;
  try { const m = localStorage.getItem('shos-mode'); mode = m !== null ? +m : (localStorage.getItem('shos-night') === '1' ? 1 : 0); } catch { /* private mode */ }
  const forced = /[?&](?:night|mode)=([0-2])/.exec(search);
  if (forced) mode = +forced[1];
  return (((mode % MODES) + MODES) % MODES) as ModeIndex;
}

/** Any element marked `data-shos-night` (and the demo page's clock) cycles the modes on click or Enter / Space. */
export function bindModeToggles(): void {
  document.querySelectorAll<HTMLElement & { __shosNight?: boolean }>('[data-shos-night], .shos-clock-bg').forEach((el) => {
    if (el.__shosNight) return; el.__shosNight = true;
    el.setAttribute('role', 'button'); el.setAttribute('aria-label', 'Cycle light, dark and glow modes'); el.tabIndex = 0;
    el.addEventListener('click', () => setMode(state.mode + 1));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode(state.mode + 1); } });
  });
}
