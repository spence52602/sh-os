/* The custom cursor (Figma node 47:2447): follows a fine pointer, drops its shadow and shrinks while pressed.
   One cursor per page, shared by every instrument on it (reference counted), only on devices with a fine pointer.
   The wrapper moves on the compositor (translate3d, no layout, no transition); inside it the arrow scales on press
   and a pre-rendered shadow image fades, so nothing is filtered or laid out per frame and it cannot stutter. The
   native pointer is hidden with a near-transparent PNG cursor pinned inline on <html> and <body>, because a plain
   `cursor: none` flashed the OS arrow while caps restyled under the pointer. */

const HOT = [5, 5];                                  // hotspot: the pointer sits just inside the arrow's rounded tip (design px)
const CUR_W = 38.67, CUR_H = 36.64, SH_M = 8;        // design px; the shadow image carries an 8-px margin all round
const HIDE = 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAHElEQVR42u3BAQEAAAjDoNm/tEEOVF0AAADAsgcgPAACkdngMQAAAABJRU5ErkJggg==") 0 0, none';

let el: HTMLDivElement | null = null;
let users = 0;
let k = 1;
let teardown: (() => void) | null = null;

export interface CursorHandle { scale(k: number): void; release(): void; }

/** Attach the cursor for one instrument; returns a handle to scale it with the device and to release it. */
export function acquireCursor(src: string, shadowSrc: string): CursorHandle {
  users++;
  if (!el && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches) mount(src, shadowSrc);
  return { scale: setScale, release: () => { if (--users <= 0) unmount(); } };
}

function mount(src: string, shadowSrc: string): void {
  const root = document.createElement('div'); root.className = 'shos-cursor'; root.setAttribute('aria-hidden', 'true');
  const sh = document.createElement('i'); sh.className = 'shos-cursor-sh'; sh.style.backgroundImage = 'url("' + shadowSrc + '")';
  const ar = document.createElement('i'); ar.className = 'shos-cursor-ar'; ar.style.backgroundImage = 'url("' + src + '")';
  root.appendChild(sh); root.appendChild(ar);
  document.body.appendChild(root); el = root;
  document.documentElement.classList.add('shos-has-cursor');
  try { document.documentElement.style.setProperty('cursor', HIDE, 'important'); document.body.style.setProperty('cursor', HIDE, 'important'); } catch { /* strict style policies */ }
  let x = -200, y = -200;
  const move = (e: PointerEvent) => {
    if (e.pointerType === 'touch') { root.classList.remove('is-on'); return; }
    x = e.clientX; y = e.clientY;
    root.style.transform = 'translate3d(' + (x - HOT[0] * k).toFixed(1) + 'px,' + (y - HOT[1] * k).toFixed(1) + 'px,0)';
    root.classList.add('is-on');
  };
  const down = (e: PointerEvent) => { if (e.pointerType === 'touch') return; move(e); root.classList.add('is-down'); };
  const up = () => root.classList.remove('is-down');
  const leave = () => root.classList.remove('is-on');
  const enter = () => { if (x > -100) root.classList.add('is-on'); };
  const vis = () => { if (document.hidden) up(); };
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerdown', down, true);
  window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true); window.addEventListener('blur', up);
  document.addEventListener('mouseleave', leave); document.addEventListener('mouseenter', enter); document.addEventListener('visibilitychange', vis);
  teardown = () => {
    window.removeEventListener('pointermove', move); window.removeEventListener('pointerdown', down, true);
    window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true); window.removeEventListener('blur', up);
    document.removeEventListener('mouseleave', leave); document.removeEventListener('mouseenter', enter); document.removeEventListener('visibilitychange', vis);
  };
  setScale(k);
}

function unmount(): void {
  users = 0;
  if (!el) return;
  teardown?.(); teardown = null;
  el.remove(); el = null;
  document.documentElement.classList.remove('shos-has-cursor');
  try { document.documentElement.style.removeProperty('cursor'); document.body.style.removeProperty('cursor'); } catch { /* ignore */ }
}

/** Scale the cursor with the device (1 at the design width, down to 0.6 on small stages). */
function setScale(scale: number): void {
  k = scale;
  if (!el) return;
  const ar = el.lastChild as HTMLElement, sh = el.firstChild as HTMLElement;
  el.style.width = (CUR_W * k).toFixed(2) + 'px'; el.style.height = (CUR_H * k).toFixed(2) + 'px';
  ar.style.transformOrigin = (HOT[0] * k).toFixed(2) + 'px ' + (HOT[1] * k).toFixed(2) + 'px';
  sh.style.left = (-SH_M * k).toFixed(2) + 'px'; sh.style.top = (-SH_M * k).toFixed(2) + 'px';
  sh.style.width = ((CUR_W + 2 * SH_M) * k).toFixed(2) + 'px'; sh.style.height = ((CUR_H + 2 * SH_M) * k).toFixed(2) + 'px';
}
