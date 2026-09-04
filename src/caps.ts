/* Key caps: the tactile layer over the device render.
   A cap is a crop of the render laid over its key, so hovering can lift the cap itself. Round caps are rigid, like a
   moulded key: they only travel along their axis (a little rise on hover, a dip on press) with over-damped easing, so
   they never wobble. The encoder knobs are "loose": a knob on a shaft may drag a touch toward the pointer and settle
   with one small spring wobble. One CapField owns the caps of one device and drives them from a single rAF loop. */
import { IMG_W, pct } from './geometry.ts';

export interface Cap {
  el: HTMLSpanElement; loose: boolean;
  x: number; y: number; s: number; vx: number; vy: number; vs: number; tx: number; ty: number; ts: number;
  hover: boolean; live: boolean;
  ind?: HTMLSpanElement; rot: number;
}

const LIFT = 1.045, DIP = 0.955, KNOB_LIFT = 1.06, KNOB_DIP = 0.94, KNOB_DRAG = 8;   // drag = max offset, % of the knob

export class CapField {
  private readonly caps: Cap[] = [];
  private raf = 0;

  /** Lay a cap of diameter `d` over button `btn`, whose box is (x, y, w, h) in device space. */
  add(btn: HTMLElement, x: number, y: number, w: number, h: number, d: number, square = false, loose = false): Cap {
    const cap = document.createElement('span'); cap.className = 'shos-cap' + (square ? ' shos-cap--sq' : '');
    const l = x + (w - d) / 2, t = y + (h - d) / 2;
    cap.style.left = pct(l - x, w); cap.style.top = pct(t - y, h); cap.style.width = pct(d, w); cap.style.height = pct(d, h);
    cap.style.backgroundPosition = (-l / IMG_W * 100).toFixed(3) + 'cqw ' + (-t / IMG_W * 100).toFixed(3) + 'cqw';
    btn.appendChild(cap);
    const c: Cap = { el: cap, loose, x: 0, y: 0, s: 1, vx: 0, vy: 0, vs: 0, tx: 0, ty: 0, ts: 1, hover: false, live: false, rot: -135 };
    const lift = loose ? KNOB_LIFT : LIFT, dip = loose ? KNOB_DIP : DIP;
    this.caps.push(c);
    const aim = (e: PointerEvent) => {
      if (!c.loose) return;
      const r = btn.getBoundingClientRect(); if (!r.width) return;
      c.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2)) * KNOB_DRAG;
      c.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2)) * KNOB_DRAG;
    };
    btn.addEventListener('pointerenter', (e) => { if (e.pointerType === 'touch') return; c.hover = true; c.ts = lift; aim(e); this.wake(c); });
    btn.addEventListener('pointermove', (e) => { if (c.loose && c.hover) { aim(e); this.wake(c); } });
    btn.addEventListener('pointerleave', () => { c.hover = false; c.tx = 0; c.ty = 0; c.ts = 1; this.wake(c); });
    btn.addEventListener('pointerdown', () => { c.ts = dip; this.wake(c); });
    const release = () => { c.ts = c.hover ? lift : 1; this.wake(c); };
    btn.addEventListener('pointerup', release); btn.addEventListener('pointercancel', release);
    return c;
  }

  /** A dot near the rim that rides along with a knob cap and turns with the value. */
  addMark(c: Cap, btn: HTMLElement, d: number, w: number): void {
    const ind = document.createElement('span'); ind.className = 'shos-knob-ind';
    ind.style.left = pct((w - d) / 2, w); ind.style.top = pct((w - d) / 2, w); ind.style.width = pct(d, w); ind.style.height = pct(d, w);
    btn.appendChild(ind); c.ind = ind; c.rot = -135; ind.style.transform = 'rotate(-135deg)';
  }
  setAngle(c: Cap | undefined, deg: number): void { if (!c) return; c.rot = deg; if (!c.live && c.ind) c.ind.style.transform = 'rotate(' + deg.toFixed(1) + 'deg)'; }

  private wake(c: Cap): void {
    if (!c.live) { c.live = true; c.el.classList.add('is-live'); }
    if (!this.raf) this.raf = requestAnimationFrame(this.tick);
  }
  private tick = (): void => {
    let busy = false;
    const K = 0.22, D = 0.78;                                  // knob spring: a touch under-damped, so it wobbles once and settles
    for (const c of this.caps) {
      if (!c.live) continue;
      let still: boolean;
      if (c.loose) {
        c.vx = (c.vx + (c.tx - c.x) * K) * D; c.x += c.vx;
        c.vy = (c.vy + (c.ty - c.y) * K) * D; c.y += c.vy;
        c.vs = (c.vs + (c.ts - c.s) * K) * D; c.s += c.vs;
        still = Math.abs(c.tx - c.x) + Math.abs(c.ty - c.y) < 0.03 && Math.abs(c.ts - c.s) < 0.0015 && Math.abs(c.vx) + Math.abs(c.vy) + Math.abs(c.vs) * 50 < 0.03;
        if (still) { c.x = c.tx; c.y = c.ty; c.s = c.ts; c.vx = c.vy = c.vs = 0; }
        const T = 'translate(' + c.x.toFixed(2) + '%,' + c.y.toFixed(2) + '%) scale(' + c.s.toFixed(4) + ')';
        c.el.style.transform = T; if (c.ind) c.ind.style.transform = T + ' rotate(' + c.rot.toFixed(1) + 'deg)';
      } else {
        const rate = c.ts < c.s ? 0.42 : 0.2;                  // rigid cap: sinks fast, rises smoothly; exponential approach = no overshoot
        c.s += (c.ts - c.s) * rate;
        still = Math.abs(c.ts - c.s) < 0.0008;
        if (still) c.s = c.ts;
        c.el.style.transform = 'scale(' + c.s.toFixed(4) + ')';
      }
      if (still && !c.hover) { c.live = false; c.el.classList.remove('is-live'); c.el.style.transform = ''; if (c.ind) c.ind.style.transform = 'rotate(' + c.rot.toFixed(1) + 'deg)'; }
      else if (!still) busy = true;
    }
    this.raf = busy ? requestAnimationFrame(this.tick) : 0;
  };

  destroy(): void { cancelAnimationFrame(this.raf); this.raf = 0; this.caps.length = 0; }
}
