/* SH-OS runtime: the whole instrument in one script (device, keys, screens, audio engine).
   Owns: the device render + hit zones (geometry is in the Figma export's pixel space, Group 11 = 1594 × 565.11),
   the cap/knob animation, the screen system (SVG exports + HTML screens), the Web Audio graph
   (notes → cutoff → reverb → sidechain → master → limiter worklet), the beat clock, the debug API on window.SHOS.
   Boundary: no build step, no dependencies; the page only needs <div data-shos data-assets="…"> and this script.
   The limiter DSP lives in sh-os-limiter.js (AudioWorklet); styling in sh-os.css. */
(function () {
  'use strict';

  var VER = '19', VQ = '?v=' + VER;      // bump when an asset changes: assets cache for an hour, this script revalidates every load
  var IMG_W = 1594, IMG_H = 565.11;
  var OX = 26.91, OY = 27.48;           // Group 4 origin inside the device frame
  var KEY = 81.88;

  var SCREENS = ['boot','idle','play','rec','mix','about','link'];                       // Figma SVG screens
  var FILES = {boot:'01-boot.svg',idle:'02-idle.svg',play:'06-play.svg',rec:'07-rec.svg',mix:'08-mix.svg',about:'09-about.svg',link:'10-link.svg'};
  var BROWSE = ['stack:design','stack:ai','stack:build','stack:ship','play','rec','mix','about','github','link'];   // ◁ ▷ order (HTML + SVG screens)

  // ---- portfolio content -------------------------------------------------
  var SITE = 'https://spencehoellen.com';
  var LINKS = {
    x:         { label: 'X — SOCIAL',          handle: '@SPENCEHOELLEN', domain: 'X.COM',            url: 'https://x.com/SpenceHoellen',                 icon: 'x',    rail: 'X' },
    linkedin:  { label: 'LINKEDIN — SOCIAL',   handle: 'SPENCE-HOELLEN', domain: 'LINKEDIN.COM',     url: 'https://www.linkedin.com/in/spence-hoellen/', icon: 'in',   rail: 'LINKEDIN' },
    instagram: { label: 'INSTAGRAM — SOCIAL',  handle: '@SPENCEHOELLEN', domain: 'INSTAGRAM.COM',    url: 'https://www.instagram.com/spencehoellen/',    icon: 'ig',   rail: 'INSTAGRAM' },
    email:     { label: 'EMAIL — DIRECT',      handle: 'SPENCE52602',    domain: 'GMAIL.COM',        url: 'mailto:spence52602@gmail.com',                icon: 'mail', rail: 'EMAIL' },
    pay:       { label: 'PAY — CLIENT PORTAL', handle: 'PORTAL',         domain: 'SPENCEHOELLEN.COM', url: SITE + '/pay',                                icon: 'pay',  rail: 'PAY' }
  };
  var RAIL_ORDER = ['x','linkedin','instagram','email','pay'];
  var ICONS = {
    x:    '<path d="M11 11L29 29M29 11L11 29"/>',
    'in': '<rect x="4.5" y="4.5" width="31" height="31" rx="6"/><text x="20" y="27" font-size="17" font-weight="500" fill="#F0E8D2" stroke="none" text-anchor="middle">in</text>',
    ig:   '<rect x="5" y="5" width="30" height="30" rx="8"/><circle cx="20" cy="20" r="7"/><circle cx="29" cy="11" r="1.8" fill="#F0E8D2" stroke="none"/>',
    mail: '<rect x="5" y="9" width="30" height="22" rx="3"/><path d="M6 11l14 11 14-11"/>',
    pay:  '<circle cx="20" cy="20" r="14"/><text x="20" y="26" font-size="16" font-weight="500" fill="#F0E8D2" stroke="none" text-anchor="middle">$</text>'
  };
  // the four stack keys (DESIGN · AI · BUILD · SHIP): what Spence uses, one screen each — edit here
  var STACK = [
    { key: 'design', label: 'DESIGN', tag: 'WHAT I DESIGN WITH', foot: 'RESEARCH → INTERFACE → SYSTEM → CODE',
      tools: [['Figma', 'interface · design systems'], ['Framer', 'spencehoellen.com'], ['Webflow', 'client sites'], ['Illustrator', 'brand · packaging'], ['Photoshop', 'image'], ['After Effects', 'motion']] },
    { key: 'ai', label: 'AI', tag: 'HOW I WORK WITH MODELS', foot: 'SH-OS WAS BUILT THIS WAY',
      tools: [['Claude Code', 'pair builder'], ['Claude', 'thinking partner'], ['Figma MCP', 'design to code'], ['Ableton MCP', 'sound design'], ['Webflow MCP', 'publishing'], ['Notion MCP', 'notes · plans']] },
    { key: 'build', label: 'BUILD', tag: 'WHAT I BUILD WITH', foot: 'MINIMAL · HIGH CLARITY · SHIPPED',
      tools: [['React', 'apps'], ['TypeScript', 'types'], ['HTML + CSS', 'the web'], ['Web Audio', 'this synth'], ['Node', 'APIs'], ['Ableton Live', 'the sounds here']] },
    { key: 'ship', label: 'SHIP', tag: 'WHERE IT GOES LIVE', foot: 'DESIGN → CODE → PRODUCTION',
      tools: [['Vercel', 'hosting · APIs'], ['GitHub', 'source'], ['Framer', 'spencehoellen.com'], ['Webflow', 'client sites'], ['Shopify', 'storefronts']] }
  ];
  var GITHUB = { url: 'https://github.com/spence52602/sh-os', path: 'github.com/spence52602/sh-os' };
  // WHY? screen copy (Spence's brief, tightened; no em dashes)
  var WHY_COPY = 'Before design, Spence Hoellen made records. As a DJ and producer he passed a million streams and signed with Warner Bros. at nineteen. The run was short and it was a blast. It also built the instincts he still works from: taste, timing, and shipping work people can feel. SH-OS is a small tribute to that era.';
  var URLS = { about: SITE + '/about', github: GITHUB.url, mix: 'https://payments-api-spencehoellen.vercel.app/Spence_Hoellen_Resume.pdf', rec: SITE + '/contact' };

  // ---- command keys (row 2, rail, top block): [x, y, w, h, action, label], Group-4 space
  var row2X = [2.29,87.03,171.19,255.93,340.67,425.41,509.58,594.31,679.05,763.79,847.96,932.70,1017.43,1102.17,1186.34,1271.08,1355.82];
  // the seven blank transport keys are the jam section: sound select, four loop families (each press steps
  // 1 → 2 → 3 → off), metronome, stop-all
  var row2 = ['stack:design','stack:ai','stack:build','stack:ship','beta:1','beta:2','beta:3','beta:4','prev','next','sound','loop:kick','loop:clap','loop:hat','loop:top','metro','stopall'];
  var row2Labels = ['Design','AI','Build','Ship','Slot 1','Slot 2','Slot 3','Slot 4','Previous','Next','Sound','Kick loop','Clap loop','Hat loop','Top loop','Metronome','Stop loops'];
  var KNOB_PARAMS = ['reverb', 'cutoff', 'bpm', 'volume', 'sidechain'];   // red · orange · cream · blue · the small knob by MUTE
  var keys = [];
  row2X.forEach(function (x, i) { keys.push([x, 171.19, KEY, KEY, row2[i], row2Labels[i]]); });
  [[2.29,255.93,'about','About'],[87.03,255.93,'mix','Resume'],[171.19,255.93,'rec','Contact'],
   [2.29,341.24,'link:x','X'],[87.03,341.24,'link:linkedin','LinkedIn'],[171.19,341.24,'link:instagram','Instagram'],
   [2.29,425.98,'link:email','Email'],[87.03,425.98,'rec','Phone'],[171.19,425.98,'link:pay','Pay']]
    .forEach(function (k) { keys.push([k[0], k[1], KEY, KEY, k[2], k[3]]); });
  keys.push([171.19, 87.03, KEY, KEY, 'why', 'Why?']);   // the backstory screen (toggle)
  keys.push([255.93, 87.03, KEY, KEY, 'github', 'GitHub']);   // the source, press twice to open
  keys.push([267.95, 14.89, 57.26, 57.26, 'mute', 'Mute']);
  keys.push([1355.82, 2.29, KEY, KEY, 'help', 'Help']);
  keys.push([1355.82, 87.03, KEY, KEY, 'preview', 'Preview']);   // plays Spence's 4-bar preview phrase for the current sound

  // ---- keyboard: 14 naturals + 10 sharps, sorted by x into chromatic order F3 … E5
  var NOTE_NAMES = ['F3','F#3','G3','G#3','A3','A#3','B3','C4','C#4','D4','D#4','E4','F4','F#4','G4','G#4','A4','A#4','B4','C5','C#5','D5','D#5','E5'];
  var pills = [255.93,340.10,424.84,509.58,594.31,679.63,763.79,847.96,932.70,1017.43,1101.60,1186.34,1271.08,1355.82]
    .map(function (x) { return { x: x, y: 340.67, w: KEY, h: 167.19, cx: x + KEY / 2, pill: true }; });
  var sharps = [[255.93,51.53],[382.47,12.02],[467.21,13.17],[594.31,53.25],[721.42,15.46],[847.96,53.25],[974.49,12.60],[1059.23,13.74],[1186.34,52.68],[1313.45,14.89]]
    .map(function (s) { var x = s[0] + s[1]; return { x: x, y: 255.93 + 12.6, w: 57.26, h: 57.26, cx: x + 28.63, pill: false }; });
  var piano = pills.concat(sharps).sort(function (a, b) { return a.cx - b.cx; });
  piano.forEach(function (k, i) { k.note = i; k.name = NOTE_NAMES[i]; });

  // piano-style: whites z x c v b n m / q w e r t y u, sharps s d g h j / 2 3 5 6 7 (chromatic from F3: A#3 = g, B3 = v; A#4 = 5, B4 = r)
  var QWERTY = ['z','s','x','d','c','g','v','b','h','n','j','m','q','2','w','3','e','5','r','t','6','y','7','u'];

  var encoders = [[739.74,63.55,'red'],[908.65,63.55,'orange'],[1078.13,63.55,'cream'],[1247.03,63.55,'blue']];
  var SC_KNOB = [205.0, 36.5, 68, 68];   // the volume-module knob (SIDECHAIN): device-space box around the ~44px knob left of MUTE
  // LIMITER fader on the right rail (Figma: track "Group 5" x 1518.4, y 187.2–288; handle "Frame 77" 22×12.6 resting at y 272)
  var FADER = { top: 193.5, bottom: 278.3, hit: [1492, 178, 54, 118] };   // touch strip: full travel = the dashed track's length (Spence: no handle, it's a touch sensor)
  var SCREEN_RECT = [365.29, 27.48, 335.52, 166.61];
  var CAP = 0.74, ENC_CAP = 36;          // round cap diameter as a share of the key well (caps measure ~0.78); encoder knob crop (knobs measure 39px)

  // HELP guide callouts: [x1, y1, x2, y2, title, note] — key groups in Group-4 space, encoders in device space
  function g4(x1, y1, x2, y2) { return [OX + x1, OY + y1, OX + x2, OY + y2]; }
  var GUIDE = [
    g4(2.29, 171.19, 337.81, 253.07).concat(['STACK', 'Design · AI · Build · Ship — the tools behind the work']),
    g4(340.67, 171.19, 676.19, 253.07).concat(['SLOTS 1–4', 'Empty in Beta v1.0 — more features shipping soon']),
    g4(679.05, 171.19, 845.67, 253.07).concat(['◁ ▷', 'Step through screens']),
    g4(847.96, 171.19, 1437.70, 253.07).concat(['JAM', 'Sound · kick · clap · hat · top (press to step 1 · 2 · 3 · off) · metronome · stop']),
    g4(171.19, 12.60, 337.81, 168.91).concat(['SIDECHAIN · MUTE · WHY? · GITHUB', 'Duck the synth to the beat (turn) · silence · the backstory · the source (press twice to open)']),
    g4(2.29, 255.93, 253.07, 507.86).concat(['PAGES + SOCIALS', 'About · résumé · contact · X · in · IG · mail · phone · pay — press twice to open']),
    g4(255.93, 255.93, 1437.70, 507.86).concat(['KEYBOARD', 'Play it · drag for glissando · Z–M / Q–U on QWERTY']),
    [739.74, 63.55, 1342.07, 158.59, 'KNOBS', 'Reverb · cutoff · BPM · volume — scroll or drag to turn'],
    g4(1355.82, 2.29, 1437.70, 168.91).concat(['HELP · PREVIEW', 'This guide · hear the current sound (knobs work while it plays)', 'right']),
    [1490, 178, 1548, 300, 'LIMITER', 'Coming soon: a Pro-L style limiter on the master', 'right']
  ];

  function pct(v, of) { return (v / of * 100).toFixed(3) + '%'; }
  function place(el, x, y, w, h) {
    el.style.left = pct(x, IMG_W); el.style.top = pct(y, IMG_H);
    el.style.width = pct(w, IMG_W); el.style.height = pct(h, IMG_H);
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  // a round cap is a crop of the device render laid over the key, so hovering can lift the cap itself.
  // Rigid, like a moulded key: it only travels along its axis — rises a little on hover, sinks on press —
  // with over-damped easing (a crisp dip, a smooth return, never a wobble).
  // The encoder knobs are the exception ("loose"): a knob on a shaft may drag a touch toward the pointer and
  // settle with a small spring wobble.
  var caps = [], capRaf = 0, LIFT = 1.045, DIP = 0.955, KNOB_LIFT = 1.06, KNOB_DIP = 0.94, KNOB_DRAG = 8;   // drag = max offset, % of the knob
  function addCap(btn, x, y, w, h, d, square, loose) {
    var cap = document.createElement('span'); cap.className = 'shos-cap' + (square ? ' shos-cap--sq' : '');
    var l = x + (w - d) / 2, t = y + (h - d) / 2;
    cap.style.left = pct(l - x, w); cap.style.top = pct(t - y, h); cap.style.width = pct(d, w); cap.style.height = pct(d, h);
    cap.style.backgroundPosition = (-l / IMG_W * 100).toFixed(3) + 'cqw ' + (-t / IMG_W * 100).toFixed(3) + 'cqw';
    btn.appendChild(cap);
    var c = { el: cap, loose: !!loose, x: 0, y: 0, s: 1, vx: 0, vy: 0, vs: 0, tx: 0, ty: 0, ts: 1, hover: false, live: false };
    var lift = loose ? KNOB_LIFT : LIFT, dip = loose ? KNOB_DIP : DIP;
    caps.push(c);
    function aim(e) {
      if (!c.loose) return;
      var r = btn.getBoundingClientRect(); if (!r.width) return;
      c.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2)) * KNOB_DRAG;
      c.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2)) * KNOB_DRAG;
    }
    btn.addEventListener('pointerenter', function (e) { if (e.pointerType === 'touch') return; c.hover = true; c.ts = lift; aim(e); wakeCap(c); });
    btn.addEventListener('pointermove', function (e) { if (c.loose && c.hover) { aim(e); wakeCap(c); } });
    btn.addEventListener('pointerleave', function () { c.hover = false; c.tx = 0; c.ty = 0; c.ts = 1; wakeCap(c); });
    btn.addEventListener('pointerdown', function () { c.ts = dip; wakeCap(c); });
    var release = function () { c.ts = c.hover ? lift : 1; wakeCap(c); };
    btn.addEventListener('pointerup', release); btn.addEventListener('pointercancel', release);
    return c;
  }
  // knob position mark: a dot near the rim that rides along with the knob cap and turns with the value
  function addKnobMark(c, btn, d, w) {
    var ind = document.createElement('span'); ind.className = 'shos-knob-ind';
    ind.style.left = pct((w - d) / 2, w); ind.style.top = pct((w - d) / 2, w); ind.style.width = pct(d, w); ind.style.height = pct(d, w);
    btn.appendChild(ind); c.ind = ind; c.rot = -135; ind.style.transform = 'rotate(-135deg)';
  }
  function setKnobAngle(c, deg) { if (!c) return; c.rot = deg; if (!c.live && c.ind) c.ind.style.transform = 'rotate(' + deg.toFixed(1) + 'deg)'; }
  function wakeCap(c) {
    if (!c.live) { c.live = true; c.el.classList.add('is-live'); }
    if (!capRaf) capRaf = requestAnimationFrame(capTick);
  }
  function capTick() {
    var busy = false, K = 0.22, D = 0.78;                    // knob spring: a touch under-damped, so it wobbles once and settles
    caps.forEach(function (c) {
      if (!c.live) return;
      var still;
      if (c.loose) {
        c.vx = (c.vx + (c.tx - c.x) * K) * D; c.x += c.vx;
        c.vy = (c.vy + (c.ty - c.y) * K) * D; c.y += c.vy;
        c.vs = (c.vs + (c.ts - c.s) * K) * D; c.s += c.vs;
        still = Math.abs(c.tx - c.x) + Math.abs(c.ty - c.y) < 0.03 && Math.abs(c.ts - c.s) < 0.0015 && Math.abs(c.vx) + Math.abs(c.vy) + Math.abs(c.vs) * 50 < 0.03;
        if (still) { c.x = c.tx; c.y = c.ty; c.s = c.ts; c.vx = c.vy = c.vs = 0; }
        var T = 'translate(' + c.x.toFixed(2) + '%,' + c.y.toFixed(2) + '%) scale(' + c.s.toFixed(4) + ')';
        c.el.style.transform = T; if (c.ind) c.ind.style.transform = T + ' rotate(' + c.rot.toFixed(1) + 'deg)';
      } else {
        var rate = c.ts < c.s ? 0.42 : 0.2;                  // rigid cap: sinks fast, rises smoothly; exponential approach = no overshoot
        c.s += (c.ts - c.s) * rate;
        still = Math.abs(c.ts - c.s) < 0.0008;
        if (still) c.s = c.ts;
        c.el.style.transform = 'scale(' + c.s.toFixed(4) + ')';
      }
      if (still && !c.hover) { c.live = false; c.el.classList.remove('is-live'); c.el.style.transform = ''; if (c.ind) c.ind.style.transform = 'rotate(' + c.rot.toFixed(1) + 'deg)'; }
      else if (!still) busy = true;
    });
    capRaf = busy ? requestAnimationFrame(capTick) : 0;
  }

  // ---- custom cursor (Figma node 47:2447): follows the pointer; drops its shadow and shrinks while pressed
  // The wrapper moves on the compositor (translate3d, no layout, no transition); inside it the arrow scales on press and
  // a pre-rendered shadow image fades — nothing is filtered or laid out per frame, so it can't stutter.
  var cursor = { el: null, k: 1 }, HOT = [5, 5];   // hotspot: the pointer sits just inside the arrow's rounded tip (design px)
  var CUR_W = 38.67, CUR_H = 36.64, SH_M = 8;       // design px; the shadow image carries an 8-px margin all round
  function initCursor(src, shadowSrc) {
    if (cursor.el || !window.matchMedia || !matchMedia('(pointer: fine)').matches) return;
    var el = document.createElement('div'); el.className = 'shos-cursor'; el.setAttribute('aria-hidden', 'true');
    var sh = document.createElement('i'); sh.className = 'shos-cursor-sh'; sh.style.backgroundImage = 'url("' + shadowSrc + '")';
    var ar = document.createElement('i'); ar.className = 'shos-cursor-ar'; ar.style.backgroundImage = 'url("' + src + '")';
    el.appendChild(sh); el.appendChild(ar);
    document.body.appendChild(el); cursor.el = el;
    document.documentElement.classList.add('shos-has-cursor');
    // belt and braces: the same hidden cursor pinned inline on the root and body, so no later stylesheet can win
    var HIDE = 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAHElEQVR42u3BAQEAAAjDoNm/tEEOVF0AAADAsgcgPAACkdngMQAAAABJRU5ErkJggg==") 0 0, none';
    try { document.documentElement.style.setProperty('cursor', HIDE, 'important'); document.body.style.setProperty('cursor', HIDE, 'important'); } catch (e) {}
    var x = -200, y = -200;
    function move(e) {
      if (e.pointerType === 'touch') { el.classList.remove('is-on'); return; }
      x = e.clientX; y = e.clientY;
      el.style.transform = 'translate3d(' + (x - HOT[0] * cursor.k).toFixed(1) + 'px,' + (y - HOT[1] * cursor.k).toFixed(1) + 'px,0)';
      el.classList.add('is-on');
    }
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', function (e) { if (e.pointerType === 'touch') return; move(e); el.classList.add('is-down'); }, true);
    var up = function () { el.classList.remove('is-down'); };
    window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true); window.addEventListener('blur', up);
    document.addEventListener('mouseleave', function () { el.classList.remove('is-on'); });
    document.addEventListener('mouseenter', function () { if (x > -100) el.classList.add('is-on'); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) up(); });
    scaleCursor(cursor.k);
  }
  function scaleCursor(k) {
    cursor.k = k;
    if (!cursor.el) return;
    var el = cursor.el, ar = el.lastChild, sh = el.firstChild;
    el.style.width = (CUR_W * k).toFixed(2) + 'px'; el.style.height = (CUR_H * k).toFixed(2) + 'px';
    ar.style.transformOrigin = (HOT[0] * k).toFixed(2) + 'px ' + (HOT[1] * k).toFixed(2) + 'px';
    sh.style.left = (-SH_M * k).toFixed(2) + 'px'; sh.style.top = (-SH_M * k).toFixed(2) + 'px';
    sh.style.width = ((CUR_W + 2 * SH_M) * k).toFixed(2) + 'px'; sh.style.height = ((CUR_H + 2 * SH_M) * k).toFixed(2) + 'px';
  }
  function hideIn(svg, selectors) {
    selectors.forEach(function (sel) { svg.querySelectorAll(sel).forEach(function (n) { n.style.display = 'none'; }); });
  }

  // ---- audio engine -------------------------------------------------------
  // Sounds are Spence's Serum patches rendered from his Live set (PAD / LEAD / BASS, one file per key, looped
  // sustain); loops are his EvoSounds clips rendered at the set's 141 BPM; the reverb is an impulse response of his
  // ValhallaVintageVerb setting. Graph: notes → lowpass (CUTOFF) → dry + convolver send (REVERB) → master (VOLUME);
  // loops and clicks go straight to master. A beat clock keeps loops and the metronome phrase-aligned at any BPM.
  var SOUNDS = {
    pad:  { dir: 'pad',  label: 'PAD',  root: 53, gain: 0.75 },   // key 0 = F3 (MIDI 53) … key 23 = E5
    lead: { dir: 'lead', label: 'LEAD', root: 53, gain: 1.0 },    // (folders swapped 2026-09-04: the Live tracks were named the wrong way round)
    bass: { dir: 'bass', label: 'BASS', root: 47, gain: 0.55 }    // keyed from B2 (Spence: the bass sits best B–A#)
  };
  var SOUND_ORDER = ['pad', 'lead', 'bass'];
  var LOOPS = { kick: ['kick-1','kick-2','kick-3'], clap: ['clap-1','clap-2','clap-3'], hat: ['hat-1','hat-2','hat-3'], top: ['top-1','top-2','top-3'] };
  var LOOP_ORDER = ['kick', 'clap', 'hat', 'top'];
  var LOOP_LABEL = { kick: 'KICK', clap: 'CLAP', hat: 'HAT', top: 'TOP' };
  var LOOP_BPM = 132, LOOP_BEATS = { kick: 16, clap: 16, hat: 16, top: 32 };   // loops re-rendered at 132 (the set's tempo now) so they play at pitch
  var NOTE_LOOP = [0.9, 1.55];                                    // seconds: the crossfaded sustain region in every note file
  var PITCH = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  function noteName(midi) { return PITCH[midi % 12] + (Math.floor(midi / 12) - 1); }
  var PARAMS = { reverb: 0.0, cutoff: 1.0, bpm: 132, volume: 0.8, sidechain: 0.0, push: 0.0 };   // 132 = the previews' native tempo; sidechain = duck mix; push = limiter drive
  var MASTER = 0.9, BPM_MIN = 60, BPM_MAX = 180;
  function cutoffHz(v) { return 40 * Math.pow(500, v); }          // 40 Hz … 20 kHz, log
  // CUTOFF is an "MG Low 24" style ladder: two cascaded 2-pole low-passes = 24 dB/oct, the second stage carrying a
  // little resonance (a mild peak at the cutoff, like a Moog ladder with the resonance a third of the way up)
  var FILTER_Q = [0.54, 2.2];
  var AC = null, master = null, synthBus = null, scGain = null, filter = null, filter2 = null, wetGain = null, convolver = null, loopBus = null, clickBus = null;
  var scopeSynth = null, scopeMix = null;                          // analysers feeding the PLAY screen oscilloscope
  // SIDECHAIN: a Kickstart-2-style duck on the synth bus, once per beat. Curve = gain over one beat (0 → 1 of the beat),
  // mixed in by PARAMS.sidechain. Placeholder shape until the Kickstart "quick chain" render is measured.
  // Measured from Spence's Kickstart 2 "quick chain" (wet/dry of a steady tone, median of 15 beats): −36 dB at 6% of the
  // beat, back to 90% at 33%, full at 46%.
  var SC_CURVE = new Float32Array([0.163,0.072,0.056,0.041,0.028,0.017,0.015,0.032,0.063,0.101,0.142,0.184,0.228,0.271,0.315,0.358,0.401,0.442,0.484,0.523,0.563,0.6,0.638,0.672,0.706,0.738,0.769,0.797,0.824,0.848,0.871,0.891,0.909,0.925,0.939,0.952,0.962,0.972,0.98,0.986,0.991,0.995,0.998,0.999,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]);
  var sc = { timer: null, next: 0 };
  // Kickstart's own attack, re-measured at 0.25 ms from the same render (Hilbert envelope of the 262 Hz tone): −6 dB at
  // 1.5 ms, −20 dB at 3.25 ms, floor ≈ 0.08 by 3.5 ms. The 96-bin curve's first bin (0–4.7 ms) had averaged over this fall.
  var SC_ATTACK = new Float32Array([1, 0.941, 0.865, 0.782, 0.692, 0.597, 0.498, 0.398, 0.300, 0.211, 0.157, 0.121, 0.101, 0.087, 0.082]);   // 0 … 3.5 ms
  var SC_REF_BEAT_MS = 60000 / 132;                                 // measured at 132; the shape stretches with the beat, like Kickstart's
  // Playback shape at 2048 points per beat (0.22 ms at 132): the measured attack, then the body bins (bin j centred at
  // (j + 0.5) / 96 of the beat; bin 0 is replaced by the attack), linearly interpolated — no step, no coarse corners
  var SC_SHAPE = (function () {
    var N = 2048, M = SC_CURVE.length, out = new Float32Array(N), kt = [], kv = [];
    for (var a = 0; a < SC_ATTACK.length; a++) { kt.push(a * 0.25); kv.push(SC_ATTACK[a]); }
    for (var j = 1; j < M; j++) { kt.push((j + 0.5) / M * SC_REF_BEAT_MS); kv.push(SC_CURVE[j]); }
    kt.push(SC_REF_BEAT_MS); kv.push(1);
    for (var i = 0, k = 0; i < N; i++) {
      var t = i / (N - 1) * SC_REF_BEAT_MS;
      while (k < kt.length - 2 && t > kt[k + 1]) k++;
      var f = Math.max(0, Math.min(1, (t - kt[k]) / (kt[k + 1] - kt[k])));
      out[i] = kv[k] * (1 - f) + kv[k + 1] * f;
    }
    out[0] = 1; out[N - 1] = 1; return out;
  })();
  function scCurve(mix) { var out = new Float32Array(SC_SHAPE.length); for (var i = 0; i < out.length; i++) out[i] = 1 - mix * (1 - SC_SHAPE[i]); return out; }
  function scPump() {
    var c = AC; if (!c || PARAMS.sidechain <= 0) return;
    while (sc.next < c.currentTime + 0.15) {
      if (sc.next >= c.currentTime) { try { scGain.gain.setValueCurveAtTime(scCurve(PARAMS.sidechain), sc.next, beatLen() * 0.995); } catch (e) {} }
      sc.next += beatLen();
    }
  }
  function scReschedule() {                                        // (re)start the duck from the next beat: after a BPM change or a mix change
    var c = AC; if (!c) return;
    clearInterval(sc.timer); sc.timer = null;
    var t = c.currentTime + 0.005;
    scGain.gain.cancelScheduledValues(t);
    if (PARAMS.sidechain <= 0) { scGain.gain.setTargetAtTime(1, t, 0.02); return; }
    scGain.gain.setTargetAtTime(1, t, 0.01);
    sc.next = nextBeat(c); scPump(); sc.timer = setInterval(scPump, 40);
  }
  var buffers = {}, loading = {}, lastClick = -1, muted = false, assetBase = './assets/';
  var sound = 'pad';
  function ctx() {
    if (AC) return AC;
    var C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    AC = new C();
    master = AC.createGain(); master.gain.value = muted ? 0 : MASTER * PARAMS.volume; master.connect(AC.destination);
    initLimiter(AC);
    // synth chain: notes/previews → cutoff (2 × lowpass) → dry + reverb send → SIDECHAIN duck (last, so tails pump too) → master
    synthBus = AC.createGain(); scGain = AC.createGain(); scGain.gain.value = 1;
    filter = AC.createBiquadFilter(); filter.type = 'lowpass'; filter.Q.value = FILTER_Q[0]; filter.frequency.value = cutoffHz(PARAMS.cutoff);
    filter2 = AC.createBiquadFilter(); filter2.type = 'lowpass'; filter2.Q.value = FILTER_Q[1]; filter2.frequency.value = cutoffHz(PARAMS.cutoff);
    synthBus.connect(filter); filter.connect(filter2); filter2.connect(scGain);
    convolver = AC.createConvolver(); wetGain = AC.createGain(); wetGain.gain.value = PARAMS.reverb;
    filter2.connect(wetGain); wetGain.connect(convolver); convolver.connect(scGain);
    scGain.connect(master);
    scopeSynth = AC.createAnalyser(); scopeSynth.fftSize = 2048; scopeSynth.smoothingTimeConstant = 0; scGain.connect(scopeSynth);
    scopeMix = AC.createAnalyser(); scopeMix.fftSize = 2048; scopeMix.smoothingTimeConstant = 0; master.connect(scopeMix);
    loopBus = AC.createGain(); loopBus.connect(master);
    clickBus = AC.createGain(); clickBus.connect(master);
    return AC;
  }
  function unlock() { var c = ctx(); if (c && c.state === 'suspended') c.resume(); }
  // ---- LIMITER (Pro-L 2 fit): an AudioWorklet on the master; PUSH drives 0 … +18 dB into a 0.25 ms lookahead
  // limiter (ceiling +2.6 dB over the clip point, 8 ms release) that hands the last peaks to a brickwall at −0.04 dBFS —
  // the combination that matched Spence's three Pro-L renders best (envelope error ≈ 1 dB rms).
  var LIM = { node: null, ready: false, lookMs: 0.25, relMs: 8, limCeiling: 1.343, ceiling: 0.995, soft: 0, maxDriveDb: 18 };
  function driveFor(push) { return Math.pow(10, (Math.max(0, Math.min(1, push)) * LIM.maxDriveDb) / 20); }
  function initLimiter(c) {
    if (!c.audioWorklet || LIM.ready) return;
    var url = assetBase.replace(/assets\/$/, '') + 'sh-os-limiter.js' + VQ;
    c.audioWorklet.addModule(url).then(function () {
      var node = new AudioWorkletNode(c, 'shos-limiter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
      node.port.postMessage({ lookMs: LIM.lookMs, relMs: LIM.relMs, limCeiling: LIM.limCeiling, ceiling: LIM.ceiling, soft: LIM.soft, drive: driveFor(PARAMS.push) });
      master.disconnect(c.destination); master.connect(node); node.connect(c.destination);
      LIM.node = node; LIM.ready = true;
    }).catch(function () { LIM.ready = false; });
  }
  function sendLimiter() { if (LIM.node) LIM.node.port.postMessage({ drive: driveFor(PARAMS.push) }); }
  function masterTarget() { return muted ? 0 : MASTER * PARAMS.volume; }
  function setMuted(on) {
    muted = !!on;
    var c = ctx(); if (!c) return;
    master.gain.cancelScheduledValues(c.currentTime);
    master.gain.setTargetAtTime(masterTarget(), c.currentTime, 0.015);
  }
  // previews loop at exactly 16 beats but Spence's bounces end mid-waveform, so the wrap back to bar 1 clicked:
  // a 4 ms raised-cosine fade into the loop point (the drum loops already end on zero)
  function condition(name, b) {
    if (name.indexOf('preview/') !== 0) return b;
    var end = Math.min(b.length, Math.round(PREVIEW_BEATS * 60 / (PREVIEW_BPM[name.slice(8)] || LOOP_BPM) * b.sampleRate));
    var n = Math.min(end, Math.round(b.sampleRate * 0.004));
    for (var ch = 0; ch < b.numberOfChannels; ch++) {
      var d = b.getChannelData(ch);
      for (var i = 0; i < n; i++) d[end - n + i] *= 0.5 * (1 + Math.cos(Math.PI * i / (n - 1)));
    }
    return b;
  }
  function load(name) {
    if (buffers[name]) return Promise.resolve(buffers[name]);
    if (loading[name]) return loading[name];
    var c = ctx(); if (!c) return Promise.reject();
    loading[name] = fetch(assetBase + 'audio/' + name + '.wav' + VQ).then(function (r) { return r.arrayBuffer(); })
      .then(function (ab) { return c.decodeAudioData(ab); })
      .then(function (b) { buffers[name] = condition(name, b); return b; });
    return loading[name];
  }
  function preloadSound(name) { for (var i = 0; i < 24; i++) load(SOUNDS[name].dir + '/note-' + pad2(i)).catch(function () {}); }
  function preload() {
    if (!ctx()) return;
    ['click-1','click-2','click-3'].forEach(function (n) { load(n).catch(function () {}); });
    preloadSound(sound);
    load('ir/vintageverb').then(function (b) { convolver.buffer = b; }).catch(function () {});
    setTimeout(function () { SOUND_ORDER.forEach(function (s) { if (s !== sound) preloadSound(s); }); }, 1500);   // the other sounds follow, so SOUND switches are instant
  }
  // true while anything sounds: a loop / preview / metronome running, a note held, or a synth tail (reverb) still ringing
  var levelBuf = null;
  function audioBusy() {
    if (anyRunning() || Object.keys(voices).length) return true;
    if (!scopeSynth) return false;
    if (!levelBuf) levelBuf = new Float32Array(scopeSynth.fftSize);
    scopeSynth.getFloatTimeDomainData(levelBuf);
    var sum = 0; for (var i = 0; i < levelBuf.length; i += 4) sum += levelBuf[i] * levelBuf[i];
    return Math.sqrt(sum / (levelBuf.length / 4)) > 0.001;               // above −60 dBFS on the synth bus
  }
  function playClick() {
    var c = ctx(); if (!c || c.state !== 'running' || muted) return;
    if (audioBusy()) return;                                              // Spence: the hover clicks throw you off while sounds play
    var pick; do { pick = 1 + Math.floor(Math.random() * 3); } while (pick === lastClick);
    lastClick = pick;
    var b = buffers['click-' + pick]; if (!b) return;
    var src = c.createBufferSource(); src.buffer = b;
    var g = c.createGain(); g.gain.value = 0.7;
    src.connect(g); g.connect(clickBus); src.start(0);
  }
  var voices = {}, heldKeys = {};
  function noteOn(i) {
    heldKeys[i] = true;
    var c = ctx(); if (!c) return; unlock();
    var s = SOUNDS[sound], b = buffers[s.dir + '/note-' + pad2(i)];
    if (!b) {                                                            // first press before the sample landed: play it the moment it does, if still held
      var want = sound; preloadSound(sound);
      load(s.dir + '/note-' + pad2(i)).then(function () { if (sound === want && !voices[i] && heldKeys[i]) noteOn(i); }).catch(function () {});
      return;
    }
    if (voices[i]) noteOff(i, true);
    var t = c.currentTime;
    var src = c.createBufferSource(); src.buffer = b; src.loop = true; src.loopStart = NOTE_LOOP[0]; src.loopEnd = NOTE_LOOP[1];
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(s.gain, t + 0.004);
    src.connect(g); g.connect(synthBus); src.start(t);
    voices[i] = { src: src, g: g, t0: t, lvl: s.gain };
  }
  function noteOff(i, fast) {
    heldKeys[i] = false;
    var v = voices[i]; if (!v) return; delete voices[i];
    var c = ctx(); var rel = fast ? 0.03 : 0.12;
    var t = Math.max(c.currentTime, v.t0 + 0.006);
    v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.lvl, t);
    v.g.gain.linearRampToValueAtTime(0.0001, t + rel);
    try { v.src.stop(t + rel + 0.02); } catch (e) {}
  }
  function allNotesOff() { Object.keys(voices).forEach(function (i) { noteOff(+i); }); }
  function setSound(name) { sound = name; if (AC) preloadSound(name); }
  function keyNoteName(i) { return noteName(SOUNDS[sound].root + i); }

  // ---- beat clock, loops, metronome ----------------------------------------
  var clock = { start: null }, loopState = {}, metro = { on: false, timer: null, next: 0 };
  function beatLen() { return 60 / PARAMS.bpm; }
  function clockStart(c) { if (clock.start === null) clock.start = c.currentTime + 0.03; return clock.start; }
  function nextBeat(c) { var s = clockStart(c), now = c.currentTime + 0.015; var n = Math.max(0, Math.ceil((now - s) / beatLen())); return s + n * beatLen(); }
  // launches quantise to the next bar line, like Live's 1-bar global quantisation: everything starts on its own "1"
  function nextBar(c) { var s = clockStart(c), now = c.currentTime + 0.015, bar = 4 * beatLen(); var n = Math.max(0, Math.ceil((now - s) / bar)); return s + n * bar; }
  function anyRunning() { return metro.on || !!(preview && preview.src) || LOOP_ORDER.some(function (f) { return loopState[f] && loopState[f].src; }); }
  function loopStopSrc(fam) {
    var l = loopState[fam]; if (!l || !l.src) return;
    var c = AC, t = c.currentTime; l.g.gain.cancelScheduledValues(t); l.g.gain.setTargetAtTime(0, t, 0.012);
    try { l.src.stop(t + 0.1); } catch (e) {}
    l.src = null;
  }
  function loopPlay(fam, idx) {
    var c = ctx(); if (!c) return; unlock();
    var name = LOOPS[fam][idx];
    loopStopSrc(fam); loopState[fam] = { idx: idx, src: null, g: null, pending: name };
    load('loops/' + name).then(function (b) {
      var l = loopState[fam]; if (!l || l.pending !== name) return;
      var src = c.createBufferSource(); src.buffer = b; src.loop = true; src.loopStart = 0; src.loopEnd = b.duration;
      src.playbackRate.value = PARAMS.bpm / LOOP_BPM;
      var g = c.createGain(); g.gain.value = 0; src.connect(g); g.connect(loopBus);
      var t = nextBar(c);                                                 // on the next "1", from the top of the loop
      src.start(t, 0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.004);
      l.src = src; l.g = g; l.pending = null; l.at = t; clock.lastLaunch = t;
    }).catch(function () {});
  }
  function loopStop(fam) { loopStopSrc(fam); loopState[fam] = null; }
  function loopIndex(fam) { return loopState[fam] ? loopState[fam].idx : -1; }
  function loopCycle(fam) { var next = loopIndex(fam) + 1; if (next > 2) loopStop(fam); else loopPlay(fam, next); }
  // preset preview: Spence's 4-bar phrase for the current sound, looped like a drum loop — phrase-aligned to the beat
  // clock, following the BPM knob, and played through the synth chain so reverb / cutoff shape it live
  var PREVIEW_BEATS = 16;
  var PREVIEW_BPM = { pad: 132, lead: 132, bass: 132 };          // native tempo per preview render (Spence's 132 BPM bounces)
  function previewRate() { return PARAMS.bpm / (PREVIEW_BPM[preview.name] || LOOP_BPM); }
  var preview = { src: null, g: null, name: null };
  function previewStop() {
    preview.name = null;
    if (!preview.src) return;
    var c = AC, t = c.currentTime; preview.g.gain.cancelScheduledValues(t); preview.g.gain.setTargetAtTime(0, t, 0.012);
    try { preview.src.stop(t + 0.1); } catch (e) {}
    preview.src = null;
  }
  function previewPlay() {
    var c = ctx(); if (!c) return; unlock();
    var name = sound; previewStop(); preview.name = name;
    load('preview/' + name).then(function (b) {
      if (preview.name !== name || preview.src) return;
      var src = c.createBufferSource(); src.buffer = b; src.loop = true; src.loopStart = 0; src.loopEnd = PREVIEW_BEATS * 60 / (PREVIEW_BPM[name] || LOOP_BPM);
      src.playbackRate.value = PARAMS.bpm / (PREVIEW_BPM[name] || LOOP_BPM);
      var g = c.createGain(); g.gain.value = 0; src.connect(g); g.connect(synthBus);
      var t = nextBar(c);                                                 // on the next "1", from the top of the phrase
      src.start(t, 0); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 0.004);
      preview.src = src; preview.g = g; preview.at = t; clock.lastLaunch = t;
    }).catch(function () { preview.name = null; });
  }
  function stopAllLoops() { LOOP_ORDER.forEach(loopStop); setMetro(false); previewStop(); clock.start = null; if (PARAMS.sidechain > 0) scReschedule(); }   // the duck keeps its own beat
  function metroTick(c, t, accent) {
    var o = c.createOscillator(); o.type = 'sine'; o.frequency.value = accent ? 1760 : 1175;
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(accent ? 0.45 : 0.3, t + 0.0015); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    o.connect(g); g.connect(clickBus); o.start(t); o.stop(t + 0.06);
  }
  function metroPump() {
    var c = AC; if (!c || !metro.on) return;
    while (metro.next < c.currentTime + 0.12) {
      var n = Math.round((metro.next - clock.start) / beatLen());
      if (metro.next >= c.currentTime - 0.01) metroTick(c, metro.next, n % 4 === 0);
      metro.next += beatLen();
    }
  }
  function setMetro(on) {
    var c = ctx(); if (!c) return;
    metro.on = !!on; clearInterval(metro.timer); metro.timer = null;
    if (metro.on) { unlock(); metro.next = nextBeat(c); metroPump(); metro.timer = setInterval(metroPump, 30); }
  }
  function setBpm(v) {
    v = Math.round(Math.max(BPM_MIN, Math.min(BPM_MAX, v)));
    var old = PARAMS.bpm; PARAMS.bpm = v;
    var c = AC; if (!c) return;
    var at = c.currentTime + 0.005;                                       // clock and audio change tempo at the same instant, so they never drift apart
    if (clock.start !== null) {                                            // keep the beat phase where it is
      var beats = (at - clock.start) / (60 / old);
      clock.start = at - beats * (60 / v);
      if (metro.on) metro.next = nextBeat(c);
    }
    LOOP_ORDER.forEach(function (f) { var l = loopState[f]; if (l && l.src) l.src.playbackRate.setValueAtTime(v / LOOP_BPM, at); });
    if (preview.src) preview.src.playbackRate.setValueAtTime(previewRate(), at);
    if (PARAMS.sidechain > 0) scReschedule();
  }
  function setParam(name, v) {
    if (name === 'bpm') return setBpm(v);
    v = Math.max(0, Math.min(1, v)); PARAMS[name] = v;
    var c = AC; if (!c) return;
    if (name === 'reverb') wetGain.gain.setTargetAtTime(v * 0.9, c.currentTime, 0.02);
    if (name === 'cutoff') { var hz = cutoffHz(v); filter.frequency.setTargetAtTime(hz, c.currentTime, 0.02); filter2.frequency.setTargetAtTime(hz, c.currentTime, 0.02); }
    if (name === 'volume') master.gain.setTargetAtTime(masterTarget(), c.currentTime, 0.02);
    if (name === 'sidechain') { unlock(); scReschedule(); }
    if (name === 'push') sendLimiter();
  }

  function ensureFont() {
    if (document.querySelector('link[data-shos-font]')) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.setAttribute('data-shos-font', '');
    l.href = 'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100;400;500&display=swap';
    document.head.appendChild(l);
  }

  // ---- modes: 0 light · 1 dark · 2 glow (all-black device, lit keys) — the footer clock cycles them ----------
  var MODES = 3;
  var night = { on: false, mode: 0, layer: null, darkImgs: [] };   // darkImgs: { img, src, mode } per device render
  function nightLayer() {
    if (night.layer) return night.layer;
    var l = document.createElement('div'); l.className = 'shos-night'; document.body.appendChild(l);
    night.layer = l; return l;
  }
  function setMode(mode, instant) {
    night.mode = ((mode % MODES) + MODES) % MODES; night.on = night.mode > 0;
    nightLayer();
    if (instant) document.documentElement.classList.add('shos-no-anim');
    document.body.classList.toggle('shos-is-night', night.on);            // dark page chrome for modes 1 and 2
    document.body.classList.toggle('shos-is-glow', night.mode === 2);
    night.darkImgs.forEach(function (d) {
      var on = d.mode === night.mode;
      if (on && !d.img.src) d.img.src = d.src;
      d.img.classList.toggle('is-on', on);
    });
    try { localStorage.setItem('shos-mode', String(night.mode)); localStorage.setItem('shos-night', night.on ? '1' : '0'); } catch (e) {}
    if (instant) requestAnimationFrame(function () { requestAnimationFrame(function () { document.documentElement.classList.remove('shos-no-anim'); }); });
  }
  function setNight(on, instant) { setMode(on ? 1 : 0, instant); }
  function bindNightToggles() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-shos-night], .shos-clock-bg'), function (el) {
      if (el.__shosNight) return; el.__shosNight = true;
      el.setAttribute('role', 'button'); el.setAttribute('aria-label', 'Cycle light, dark and glow modes'); el.tabIndex = 0;
      el.addEventListener('click', function () { setMode(night.mode + 1); });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode(night.mode + 1); } });
    });
  }

  function init(root) {
    if (root.__shos) return;
    root.__shos = true;
    var base = root.getAttribute('data-assets') || './assets/';
    if (base.slice(-1) !== '/') base += '/';
    assetBase = base;
    root.classList.add('shos');
    ensureFont();
    var darkSrc = root.getAttribute('data-device-dark') || (base + 'device-dark@2x.png' + VQ);
    root.style.setProperty('--shos-dev-light', 'url("' + base + 'device@2x.png' + VQ + '")');
    root.style.setProperty('--shos-dev-dark', 'url("' + darkSrc + '")');
    initCursor(base + 'cursor@4x.png' + VQ, base + 'cursor-shadow@4x.png' + VQ);

    var stage = document.createElement('div'); stage.className = 'shos-stage';
    var img = document.createElement('img');
    img.className = 'shos-device shos-device-light'; img.src = base + 'device@2x.png' + VQ; img.alt = 'SH-OS — an OP-1 style portfolio instrument';
    img.draggable = false;
    stage.appendChild(img);
    var dark = document.createElement('img');
    dark.className = 'shos-device shos-device-dark'; dark.alt = ''; dark.draggable = false;
    dark.addEventListener('load', function () { root.classList.add('shos-dark-ready'); });
    dark.addEventListener('error', function () { dark.remove(); root.classList.remove('shos-dark-ready'); });
    stage.appendChild(dark);
    night.darkImgs.push({ img: dark, src: darkSrc, mode: 1 });
    var glowSrc = root.getAttribute('data-device-glow') || (base + 'device-glow@2x.png' + VQ);
    root.style.setProperty('--shos-dev-glow', 'url("' + glowSrc + '")');
    var glow = document.createElement('img');
    glow.className = 'shos-device shos-device-glow'; glow.alt = ''; glow.draggable = false;
    glow.addEventListener('load', function () { root.classList.add('shos-dark-ready'); });
    glow.addEventListener('error', function () { glow.remove(); });
    stage.appendChild(glow);
    night.darkImgs.push({ img: glow, src: glowSrc, mode: 2 });
    var ghost = document.createElement('div'); ghost.className = 'shos-screen-ghost';
    place(ghost, SCREEN_RECT[0], SCREEN_RECT[1], SCREEN_RECT[2], SCREEN_RECT[3]);
    stage.appendChild(ghost);

    // ---- screen
    var screen = document.createElement('div'); screen.className = 'shos-screen';
    place(screen, SCREEN_RECT[0], SCREEN_RECT[1], SCREEN_RECT[2], SCREEN_RECT[3]);
    var scrEls = {};
    SCREENS.forEach(function (name) {
      var s = document.createElement('div'); s.className = 'shos-scr'; s.setAttribute('data-name', name);
      screen.appendChild(s); scrEls[name] = s;
    });
    // HTML screens in one idiom (header line · title · body · footer chip); the SVG screens are Figma exports
    // big type: the device screen shows at ~52% of the 640-px design, so anything under ~20 design px is unreadable
    function htmlScreen(name, cls, html) {
      var el = document.createElement('div'); el.className = 'shos-scr shos-helpscr' + (cls ? ' ' + cls : ''); el.setAttribute('data-name', name);
      el.innerHTML = html; screen.appendChild(el); scrEls[name] = el; return el;
    }
    var help = htmlScreen('help', '',
      '<div class="shos-hc"><span>HELP — SH-OS</span><span>EXIT × · HELP · ESC</span></div>' +
      '<div class="shos-hh">HOW TO PLAY</div>' +
      '<div class="shos-hb">' +
      '<p>ANY KEY SHOWS A SCREEN<br>PRESS IT AGAIN TO OPEN THE LINK</p>' +
      '<p>THE KEYBOARD PLAYS · DRAG IT · OR Z–M / Q–U</p>' +
      '<p>BLANK KEYS JAM: SOUND · LOOPS · METRONOME<br>KNOBS: REVERB · CUTOFF · BPM · VOLUME</p>' +
      '</div>' +
      '<div class="shos-hf"><b>EXIT →</b><span>CLOCK ↓ NIGHT MODE</span></div>');
    // WHY?: the backstory, same idiom; WHY? again or Esc returns to where you were
    var why = htmlScreen('why', 'shos-whyscr',
      '<div class="shos-hc"><span>WHY? · SH-OS</span><span>THE BACKSTORY</span></div>' +
      '<div class="shos-hh">ONCE A PRODUCER</div>' +
      '<div class="shos-hb"><p>' + WHY_COPY + '</p></div>' +
      '<div class="shos-hf"><b>BACK</b><span>WHY? AGAIN · ESC</span></div>');
    // STACK: one screen per key, the tools are the focus
    STACK.forEach(function (st, i) {
      htmlScreen('stack:' + st.key, 'shos-stackscr',
        '<div class="shos-hc"><span>' + st.label + ' · STACK ' + (i + 1) + '/' + STACK.length + '</span><span>' + st.tag + '</span></div>' +
        '<div class="shos-tools">' + st.tools.map(function (t) { return '<div><b>' + t[0] + '</b><span>' + t[1] + '</span></div>'; }).join('') + '</div>' +
        '<div class="shos-hf"><b>' + st.label + '</b><span>' + st.foot + '</span></div>');
    });
    // SLOTS 1–4: nothing there yet
    htmlScreen('beta', 'shos-betascr',
      '<div class="shos-hc"><span>SLOT <i class="shos-beta-slot">1</i> · EMPTY</span><span>BETA V1.0</span></div>' +
      '<div class="shos-hh">SORRY, NO FEATURES YET</div>' +
      '<div class="shos-hb"><p>THIS IS BETA V1.0</p><p>MORE FEATURES SHIPPING SOON</p></div>' +
      '<div class="shos-hf"><b>BETA</b><span>◁ ▷ BROWSE · ESC = BACK</span></div>');
    var betaSlot = screen.querySelector('.shos-beta-slot');
    // GITHUB: the source; press the key again to open it
    htmlScreen('github', 'shos-gitscr',
      '<div class="shos-hc"><span>GITHUB · SOURCE</span><span>PRESS AGAIN → OPEN</span></div>' +
      '<div class="shos-hh">SH-OS IS OPEN SOURCE</div>' +
      '<div class="shos-hb"><p class="shos-git-url">' + GITHUB.path + '</p><p>WEB AUDIO · VANILLA JS · NO BUILD STEP</p></div>' +
      '<div class="shos-hf"><b>OPEN →</b><span>PRESS GITHUB AGAIN · ESC = BACK</span></div>');

    var dot = document.createElement('div'); dot.className = 'shos-rec-dot'; screen.appendChild(dot);
    var caret = document.createElement('div'); caret.className = 'shos-caret'; screen.appendChild(caret);

    // live overlays (positions are the Figma coordinates on the 640×320 screen, as percentages)
    var ovs = [];
    function ov(forScreen, cls, x, y, size, opts) {
      opts = opts || {};
      var el = document.createElement('div'); el.className = 'shos-ov ' + cls; el.setAttribute('data-for', forScreen);
      if (opts.right) el.style.right = pct(640 - x, 640); else el.style.left = pct(x, 640);
      el.style.top = pct(y + size * 0.115, 320);
      el.style.fontSize = (size / 640 * 100).toFixed(3) + 'cqw';
      if (opts.html) el.innerHTML = opts.html; else if (opts.text) el.textContent = opts.text;
      screen.appendChild(el); ovs.push(el); return el;
    }
    var dateEl = ov('idle', 'shos-date', 28, 58, 56);
    var timeEl = ov('idle', 'shos-time', 28, 132, 56);
    var noteEl = ov('play', 'shos-note', 612, 46, 60, { right: true, text: 'C4' });
    var muteEl = document.createElement('div'); muteEl.className = 'shos-ov shos-mute'; muteEl.textContent = 'MUTE'; screen.appendChild(muteEl);
    var ticks = [];
    for (var i = 0; i < 24; i++) {
      var tk = document.createElement('div'); tk.className = 'shos-ov shos-tick'; tk.setAttribute('data-for', 'play');
      tk.style.left = ((28 + i * 21.2) / 640 * 100).toFixed(3) + '%';
      screen.appendChild(tk); ticks.push(tk); ovs.push(tk);
    }
    // link screen
    var lkLabel = ov('link', 'shos-t-ink shos-t-med', 162, 80, 9);
    var lkHandle = ov('link', 'shos-t-crm shos-t-thin shos-t-track', 110, 130, 46);
    var lkDomain = ov('link', 'shos-t-ink shos-t-med', 552, 96, 9);
    var lkIcon = document.createElement('div'); lkIcon.className = 'shos-ov shos-lk-icon'; lkIcon.setAttribute('data-for', 'link');
    lkIcon.style.left = pct(110, 640); lkIcon.style.top = pct(72, 320); lkIcon.style.width = pct(40, 640); lkIcon.style.height = pct(40, 320);
    screen.appendChild(lkIcon); ovs.push(lkIcon);
    var lkRail = ov('link', 'shos-rail', 28, 274, 9);
    // play screen — jam layer: sound list (left column), knob readouts (right column), loop line (bottom)
    var jamSound = SOUND_ORDER.map(function (s, i) { return ov('play', 'shos-jam-row', 25, 82 + i * 30, 10); });
    var jamParam = KNOB_PARAMS.map(function (p, i) { return ov('play', 'shos-t-ink shos-t-med shos-jam-val', 612, 111 + i * 15, 9, { right: true }); });
    var jamLoops = ov('play', 'shos-jam-loops', 363, 272, 9);
    // oscilloscope: replaces the static waves on the PLAY screen — white = the mix, blue = the synth, zero-crossing triggered
    var SCOPE = [112, 48, 424, 210];                                // x, y, w, h on the 640×320 design: the whole centre bay between the sound list and the readouts
    var SCOPE_CLEAR = [96, 40, 545, 264];                           // static design parts whose centre falls in here are retired (the old sines, dots, baseline)
    var scope = document.createElement('canvas'); scope.className = 'shos-ov shos-scope'; scope.setAttribute('data-for', 'play');
    scope.style.left = pct(SCOPE[0], 640); scope.style.top = pct(SCOPE[1], 320); scope.style.width = pct(SCOPE[2], 640); scope.style.height = pct(SCOPE[3], 320);
    scope.width = SCOPE[2] * 2; scope.height = SCOPE[3] * 2; screen.appendChild(scope); ovs.push(scope);
    var scopeRaf = 0, scopeBufA = null, scopeBufB = null;
    function trigger(buf, n, span) {                                 // first rising zero crossing after a quarter of the buffer → stable trace for pitched signals
      var start = n >> 2, end = n - span; if (end <= start) return 0;
      for (var i = start + 1; i < end; i++) if (buf[i - 1] <= 0 && buf[i] > 0) return i;
      return start;
    }
    function drawScope() {
      scopeRaf = 0;
      if (state.current !== 'play') return;
      if (!AC) { scopeRaf = requestAnimationFrame(drawScope); return; }   // audio not unlocked yet: keep waiting on this screen
      var g = scope.getContext('2d'), W = scope.width, H = scope.height, n = scopeMix.fftSize, span = 880;   // ~20 ms window
      if (!scopeBufA) { scopeBufA = new Float32Array(n); scopeBufB = new Float32Array(n); }
      scopeMix.getFloatTimeDomainData(scopeBufA); scopeSynth.getFloatTimeDomainData(scopeBufB);
      g.clearRect(0, 0, W, H);
      g.strokeStyle = '#3A3A40'; g.lineWidth = 1.5; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke(); g.setLineDash([]);
      var traces = [[scopeBufA, '#E9E9EC', 2.6, 0.94], [scopeBufB, '#45A8F0', 2.6, 0.94]];
      for (var t = 0; t < 2; t++) {
        var buf = traces[t][0], t0 = trigger(buf, n, span), amp = traces[t][3] * H / 2;
        g.strokeStyle = traces[t][1]; g.lineWidth = traces[t][2]; g.lineJoin = 'round'; g.beginPath();
        for (var i = 0; i < span; i++) { var v = Math.max(-1, Math.min(1, buf[t0 + i])); var x = i / (span - 1) * W, y = H / 2 - v * amp; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); }
        g.stroke();
      }
      g.fillStyle = '#F0E8D2';                                       // the design's dots: five markers along the baseline
      for (var d = 0; d < 5; d++) { g.beginPath(); g.arc(d / 4 * (W - 10) + 5, H / 2, 5, 0, Math.PI * 2); g.fill(); }
      scopeRaf = requestAnimationFrame(drawScope);
    }
    function scopeOn() { if (!scopeRaf) scopeRaf = requestAnimationFrame(drawScope); }
    // knob readout: a big centred value over whatever screen is showing while a knob turns; fades out after you stop
    var knobPop = document.createElement('div'); knobPop.className = 'shos-knobpop';
    knobPop.innerHTML = '<div class="shos-kp-val"></div><div class="shos-kp-label"></div><div class="shos-kp-bar"><i></i></div>';
    screen.appendChild(knobPop);
    var kpVal = knobPop.querySelector('.shos-kp-val'), kpLabel = knobPop.querySelector('.shos-kp-label'), kpBar = knobPop.querySelector('.shos-kp-bar i'), kpTimer = null;
    var KNOB_LABEL = { reverb: 'REVERB', cutoff: 'CUTOFF · MG LOW 24', bpm: 'BPM', volume: 'VOLUME', sidechain: 'SIDECHAIN · KICKSTART' };
    function knobText(p) {
      if (p === 'bpm') return String(PARAMS.bpm);
      if (p === 'sidechain') return Math.round(PARAMS.sidechain * 100) + '%';
      if (p === 'cutoff') { var hz = cutoffHz(PARAMS.cutoff); return hz >= 1000 ? (hz / 1000).toFixed(1) + 'K' : String(Math.round(hz)); }
      return Math.round(PARAMS[p] * 100) + (p === 'reverb' ? '%' : '');
    }
    // pop(value, label[, 0..1]) — the same big readout for knobs (with a position bar) and for jam keys (without)
    function pop(value, label, v01) {
      kpVal.textContent = value; kpLabel.textContent = label;
      knobPop.classList.toggle('no-bar', v01 === undefined || v01 === null);
      if (v01 !== undefined && v01 !== null) kpBar.style.width = (v01 * 100).toFixed(1) + '%';
      knobPop.classList.add('is-on');
      clearTimeout(kpTimer); kpTimer = setTimeout(function () { knobPop.classList.remove('is-on'); }, 1100);
    }
    function showKnob(p, v01) { pop(knobText(p), KNOB_LABEL[p], v01); }
    // now-playing strip: top centre of every screen while anything loops (drum slots · preview · metronome · mute)
    var hud = document.createElement('div'); hud.className = 'shos-hud'; screen.appendChild(hud);
    hud.appendChild(muteEl);

    stage.appendChild(screen);

    var state = { current: null, idleTimer: null, lastScreen: BROWSE[0], clockTimer: null, link: 'x', lastAction: null, beforeHelp: null, beforeWhy: null, jamParam: null };

    function fmtParam(p) {
      if (p === 'reverb') return 'REV ' + Math.round(PARAMS.reverb * 100) + '%';
      if (p === 'sidechain') return 'SC ' + Math.round(PARAMS.sidechain * 100) + '%';
      if (p === 'cutoff') { var hz = cutoffHz(PARAMS.cutoff); return 'CUT ' + (hz >= 1000 ? (hz / 1000).toFixed(1) + 'K' : Math.round(hz)); }
      if (p === 'bpm') return 'BPM ' + PARAMS.bpm;
      return 'VOL ' + Math.round(PARAMS.volume * 100);
    }
    function refreshJam() {
      SOUND_ORDER.forEach(function (s, i) {
        jamSound[i].innerHTML = s === sound ? '<b>' + SOUNDS[s].label + '</b>' : '<span>' + SOUNDS[s].label + '</span>';
      });
      KNOB_PARAMS.forEach(function (p, i) { jamParam[i].textContent = fmtParam(p); jamParam[i].classList.toggle('is-hot', p === state.jamParam); });
      jamLoops.innerHTML = LOOP_ORDER.map(function (f) {
        var idx = loopIndex(f);
        return '<span class="' + (idx >= 0 ? 'is-on' : '') + '">' + LOOP_LABEL[f] + (idx >= 0 ? ' ' + (idx + 1) : '') + '</span>';
      }).join('<i>·</i>') + '<i>·</i><span class="shos-jam-metro' + (metro.on ? ' is-on' : '') + '">● METRO</span>' +
        (preview.src || preview.name ? '<i>·</i><span class="is-on">▶ PREVIEW</span>' : '');
      if (stopKey) stopKey.classList.toggle('is-glow', anyRunning() || !!preview.name);   // the STOP key breathes while anything runs
      // now-playing chips
      Array.prototype.slice.call(hud.querySelectorAll('b')).forEach(function (n) { n.remove(); });
      LOOP_ORDER.forEach(function (f) { var idx = loopIndex(f); if (idx >= 0) { var b = document.createElement('b'); b.textContent = LOOP_LABEL[f] + ' ' + (idx + 1); hud.appendChild(b); } });
      if (preview.name) { var pv = document.createElement('b'); pv.className = 'crm'; pv.textContent = SOUNDS[preview.name].label + ' ▶'; hud.appendChild(pv); }
      if (metro.on) { var mt = document.createElement('b'); mt.className = 'grn'; mt.textContent = '● ' + PARAMS.bpm; hud.appendChild(mt); }
      if (PARAMS.sidechain > 0) { var scb = document.createElement('b'); scb.className = 'crm'; scb.textContent = 'SC ' + Math.round(PARAMS.sidechain * 100); hud.appendChild(scb); }
      if (PARAMS.push > 0) { var lb = document.createElement('b'); lb.textContent = 'LIM ' + Math.round(PARAMS.push * 100); hud.appendChild(lb); }
    }

    function applyLink() {
      var l = LINKS[state.link];
      lkLabel.textContent = l.label; lkHandle.textContent = l.handle; lkDomain.textContent = l.domain;
      lkIcon.innerHTML = '<svg viewBox="0 0 40 40">' + ICONS[l.icon] + '</svg>';
      lkRail.innerHTML = RAIL_ORDER.map(function (k) {
        return k === state.link ? '<b>' + LINKS[k].rail + '</b>' : '<span>' + LINKS[k].rail + '</span>';
      }).join('<i>·</i>');
    }
    applyLink(); refreshJam();

    function tickClock() {
      var d = new Date();
      dateEl.textContent = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
      timeEl.textContent = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    }
    function show(name) {
      if (!scrEls[name] || name === state.current) return;
      if (state.current) scrEls[state.current].classList.remove('is-on');
      state.current = name;
      screen.setAttribute('data-screen', name);
      scrEls[name].classList.add('is-on');
      ovs.forEach(function (o) { o.classList.toggle('is-on', o.getAttribute('data-for') === name && !o.classList.contains('shos-tick')); });
      guide.classList.toggle('is-on', name === 'help');
      screen.classList.add('is-switching');
      setTimeout(function () { screen.classList.remove('is-switching'); }, 320);
      if (BROWSE.indexOf(name) >= 0) state.lastScreen = name;
      clearInterval(state.clockTimer);
      if (name === 'idle') { tickClock(); state.clockTimer = setInterval(tickClock, 1000); }
      if (name === 'play') scopeOn();
      armIdle();
    }
    function armIdle() {
      clearTimeout(state.idleTimer);
      if (state.current === 'idle' || state.current === 'boot') return;
      state.idleTimer = setTimeout(function () { if (anyRunning()) armIdle(); else show('idle'); }, 30000);   // never sleep mid-jam
    }
    function toPlay() { if (state.current !== 'play') { state.lastAction = null; show('play'); } else armIdle(); }
    function jamNav() { if (state.current === 'idle' || state.current === 'boot') toPlay(); else armIdle(); }   // jam keys wake the device but never change the screen
    function step(dir) {
      var browse = BROWSE;
      var i = browse.indexOf(state.current); if (i < 0) i = 0;
      state.lastAction = null;
      show(browse[(i + dir + browse.length) % browse.length]);
    }
    var muteKey = null, stopKey = null;
    function toggleMute() {
      setMuted(!muted);
      screen.classList.toggle('is-muted', muted);
      if (muteKey) { muteKey.classList.toggle('is-muted', muted); muteKey.setAttribute('aria-pressed', String(muted)); }
      pulse(); armIdle();
    }
    function openUrl(url) { try { window.open(url, '_blank', 'noopener'); } catch (e) { location.href = url; } }
    // HELP: the screen legend plus the callout guide over the keys; HELP again, EXIT or Esc returns to where you were
    function openHelp() {
      if (state.current === 'help') return closeHelp();
      state.beforeHelp = state.current; state.lastAction = 'help';
      show('help');
    }
    function closeHelp() {
      var back = state.beforeHelp;
      state.lastAction = null;
      show(back && back !== 'help' && back !== 'boot' ? back : 'idle');
    }
    function toggleWhy() {
      if (state.current === 'why') return closeWhy();
      state.beforeWhy = state.current; state.lastAction = 'why';
      show('why');
    }
    function closeWhy() {
      var back = state.beforeWhy;
      state.lastAction = null;
      show(back && back !== 'why' && back !== 'help' && back !== 'boot' ? back : 'idle');
    }
    // first press shows the screen; pressing the same key again opens its destination
    function act(action) {
      var parts = action.split(':'), name = parts[0], arg = parts[1];
      if (name === 'prev') return step(-1);
      if (name === 'next') return step(1);
      if (name === 'mute') return toggleMute();
      if (name === 'help') return openHelp();
      if (name === 'why') return toggleWhy();
      if (name === 'sound') {
        unlock(); setSound(SOUND_ORDER[(SOUND_ORDER.indexOf(sound) + 1) % SOUND_ORDER.length]); allNotesOff();
        if (preview.name) previewPlay();                                    // a running preview switches to the new sound, in time
        refreshJam(); pop(SOUNDS[sound].label, 'SOUND ' + (SOUND_ORDER.indexOf(sound) + 1) + '/' + SOUND_ORDER.length); return jamNav();
      }
      if (name === 'loop') { loopCycle(arg); refreshJam(); var li = loopIndex(arg); pop(LOOP_LABEL[arg] + (li >= 0 ? ' ' + (li + 1) : ' OFF'), 'DRUM LOOP'); return jamNav(); }
      if (name === 'metro') { setMetro(!metro.on); refreshJam(); pop(metro.on ? 'ON' : 'OFF', 'METRONOME · ' + PARAMS.bpm); return jamNav(); }
      if (name === 'stopall') { stopAllLoops(); refreshJam(); pop('STOP', 'ALL LOOPS'); return jamNav(); }
      if (name === 'preview') { if (preview.name) previewStop(); else previewPlay(); refreshJam(); pop(preview.name ? SOUNDS[sound].label + ' ▶' : 'STOP', 'PREVIEW'); return jamNav(); }   // toggles
      var target = name, url = URLS[name] || null;
      if (name === 'stack') target = action;                                          // 'stack:design' … one screen per key
      if (name === 'beta') { target = 'beta'; if (betaSlot) betaSlot.textContent = arg; }   // slots 1–4: the same empty screen, numbered
      if (name === 'link') { state.link = arg; applyLink(); target = 'link'; url = LINKS[arg].url; }
      if (state.current === target && state.lastAction === action) { if (url) { openUrl(url); pulse(); } return; }
      state.lastAction = action;
      if (state.current === 'idle' && name === 'idle') return show(state.lastScreen);
      show(target);
    }
    function pulse() { screen.classList.add('is-switching'); setTimeout(function () { screen.classList.remove('is-switching'); }, 260); }

    // ---- command keys: click sound on hover, screen on press
    keys.forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'shos-key';
      b.setAttribute('aria-label', k[5]); b.setAttribute('data-action', k[4]);
      place(b, OX + k[0], OY + k[1], k[2], k[3]);
      if (k[4] === 'mute') addCap(b, OX + k[0], OY + k[1], k[2], k[3], k[2] * 0.9, true);
      else addCap(b, OX + k[0], OY + k[1], k[2], k[3], KEY * CAP);
      b.addEventListener('pointerenter', playClick);
      b.addEventListener('pointerdown', function () { b.classList.add('is-down'); });
      var up = function () { b.classList.remove('is-down'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointerleave', up); b.addEventListener('pointercancel', up);
      b.addEventListener('click', function () { act(k[4]); });
      if (k[4] === 'mute') { muteKey = b; b.setAttribute('aria-pressed', 'false'); }
      if (k[4] === 'stopall') { stopKey = b; var glow = document.createElement('span'); glow.className = 'shos-glow'; b.appendChild(glow); }
      stage.appendChild(b);
    });

    // ---- keyboard keys: sample on press, held while down, glissando on drag, note + rail on screen
    var keyEls = [];
    function keyDown(i) {
      if (keyEls[i].classList.contains('is-down')) return;
      keyEls[i].classList.add('is-down');
      noteOn(i);
      noteEl.textContent = keyNoteName(i);
      ticks[i].classList.add('is-on');
      toPlay();
    }
    function keyUp(i) {
      if (i === undefined || i < 0 || !keyEls[i] || !keyEls[i].classList.contains('is-down')) return;
      keyEls[i].classList.remove('is-down');
      noteOff(i);
      ticks[i].classList.remove('is-on');
    }
    var pointerNotes = {};
    function noteUnder(x, y) {
      var el = document.elementFromPoint(x, y);
      var b = el && el.closest ? el.closest('.shos-key--note') : null;
      return b ? +b.getAttribute('data-note') : -1;
    }
    piano.forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'shos-key shos-key--note' + (k.pill ? ' shos-key--pill' : ' shos-key--sharp');
      b.setAttribute('aria-label', 'Note ' + k.name); b.setAttribute('data-note', String(k.note));
      place(b, OX + k.x, OY + k.y, k.w, k.h);   // the QWERTY legends are printed on the device render itself (Figma)
      b.addEventListener('pointerdown', function (e) {
        e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (x) {}
        unlock(); pointerNotes[e.pointerId] = k.note; keyDown(k.note);
      });
      b.addEventListener('pointermove', function (e) {
        if (pointerNotes[e.pointerId] === undefined) return;
        var n = noteUnder(e.clientX, e.clientY);
        var cur = pointerNotes[e.pointerId];
        if (n === cur) return;
        if (cur >= 0) keyUp(cur);
        pointerNotes[e.pointerId] = n;
        if (n >= 0) keyDown(n);
      });
      var up = function (e) { var n = pointerNotes[e.pointerId]; delete pointerNotes[e.pointerId]; if (n !== undefined) keyUp(n); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      keyEls[k.note] = b;
      stage.appendChild(b);
    });
    function releasePointer(e) {
      if (e && e.pointerId !== undefined && pointerNotes[e.pointerId] !== undefined) { keyUp(pointerNotes[e.pointerId]); delete pointerNotes[e.pointerId]; }
    }
    function releaseAll() {
      Object.keys(pointerNotes).forEach(function (id) { keyUp(pointerNotes[id]); }); pointerNotes = {};
      allNotesOff(); ticks.forEach(function (t) { t.classList.remove('is-on'); }); keyEls.forEach(function (b) { b.classList.remove('is-down'); });
    }
    window.addEventListener('pointerup', releasePointer, true);
    window.addEventListener('pointercancel', releasePointer, true);
    window.addEventListener('mouseup', function () { if (Object.keys(pointerNotes).length) releaseAll(); }, true);
    window.addEventListener('blur', releaseAll);
    document.addEventListener('visibilitychange', function () { if (document.hidden) releaseAll(); });

    // ---- knobs: reverb · cutoff · BPM · volume — scroll or drag to turn; a rim mark shows the position
    function knobValue(p) { return p === 'bpm' ? (PARAMS.bpm - BPM_MIN) / (BPM_MAX - BPM_MIN) : PARAMS[p]; }
    var knobCaps = [];
    function refreshKnobs() { KNOB_PARAMS.forEach(function (p, i) { setKnobAngle(knobCaps[i], -135 + 270 * knobValue(p)); }); }
    var knobs = encoders.map(function (e) { return { x: e[0], y: e[1], size: 95.04, cap: ENC_CAP, name: e[2] }; });
    knobs.push({ x: SC_KNOB[0], y: SC_KNOB[1], size: SC_KNOB[2], cap: 40, name: 'sidechain' });
    knobs.forEach(function (e, idx) {
      var p = KNOB_PARAMS[idx];
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'shos-key shos-key--enc';
      b.setAttribute('aria-label', e.name + ' knob — ' + p);
      place(b, e.x, e.y, e.size, e.size);
      var c = addCap(b, e.x, e.y, e.size, e.size, e.cap, false, true);   // loose: the knobs may drag and wobble
      if (p !== 'sidechain') addKnobMark(c, b, e.cap, e.size);            // the sidechain knob already carries a moulded pip in the render
      knobCaps[idx] = c;
      b.addEventListener('pointerenter', playClick);
      var acc = 0;
      function turn(amount) {                      // amount: wheel units (a mouse notch ≈ 100), up = more
        unlock();
        if (p === 'bpm') { acc += amount / 40; var st = Math.trunc(acc); if (!st) return; acc -= st; setBpm(PARAMS.bpm + st); }   // ≈ 2 BPM per notch
        else setParam(p, PARAMS[p] + amount / 1000);                                                                              // ≈ 10 notches end to end
        state.jamParam = p; refreshJam(); refreshKnobs();
        showKnob(p, knobValue(p)); armIdle();                              // readout over the current screen; no screen change
      }
      b.addEventListener('wheel', function (ev) { ev.preventDefault(); turn(-ev.deltaY); }, { passive: false });
      var drag = null;
      b.addEventListener('pointerdown', function (ev) { drag = { y: ev.clientY, moved: false }; try { b.setPointerCapture(ev.pointerId); } catch (x) {} });
      b.addEventListener('pointermove', function (ev) {
        if (!drag) return; var dy = drag.y - ev.clientY; if (Math.abs(dy) < 1) return;
        drag.y = ev.clientY; drag.moved = true; turn(dy * 8);                                                                     // ~125 px of drag end to end
      });
      var end = function () { if (drag && !drag.moved) { state.jamParam = p; refreshJam(); toPlay(); } drag = null; };
      b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end); b.addEventListener('lostpointercapture', function () { drag = null; });
      stage.appendChild(b);
    });
    refreshKnobs();

    // ---- LIMITER strip (right rail): a touch sensor on the real thing — drag up/down on it (or scroll); no handle, the screen shows the value
    var fader = document.createElement('button'); fader.type = 'button'; fader.className = 'shos-fader'; fader.setAttribute('aria-label', 'Limiter strip (coming soon)');
    place(fader, FADER.hit[0], FADER.hit[1], FADER.hit[2], FADER.hit[3]);
    function pushTo(v) {                                                // parked: the strip answers "coming soon" until the limiter is thought through
      pop('SOON', 'LIMITER · COMING SOON'); armIdle();                  // setParam('push', v) drives the Pro-L style worklet once it ships
    }
    fader.addEventListener('pointerenter', playClick);
    fader.addEventListener('wheel', function (ev) { ev.preventDefault(); unlock(); pushTo(PARAMS.push - ev.deltaY / 1000); }, { passive: false });
    var fd = null;
    fader.addEventListener('pointerdown', function (ev) { unlock(); fd = { y: ev.clientY, v: PARAMS.push }; fader.classList.add('is-down'); try { fader.setPointerCapture(ev.pointerId); } catch (x) {} });
    fader.addEventListener('pointermove', function (ev) {
      if (!fd) return; var r = fader.getBoundingClientRect(); var travel = r.height * (FADER.bottom - FADER.top) / FADER.hit[3];
      pushTo(fd.v + (fd.y - ev.clientY) / travel);
    });
    var fend = function () { fd = null; fader.classList.remove('is-down'); };
    fader.addEventListener('pointerup', fend); fader.addEventListener('pointercancel', fend); fader.addEventListener('lostpointercapture', fend);
    stage.appendChild(fader);

    // ---- HELP guide layer (above the keys, below the screen; keys stay live underneath)
    var guide = document.createElement('div'); guide.className = 'shos-guide';
    GUIDE.forEach(function (g) {
      var bx = document.createElement('div'); bx.className = 'shos-gbox';
      place(bx, g[0] - 4, g[1] - 4, g[2] - g[0] + 8, g[3] - g[1] + 8);
      var tag = document.createElement('span'); tag.className = 'shos-gtag' + (g[6] === 'right' ? ' shos-gtag--r' : '');
      var t = document.createElement('b'); t.textContent = g[4];
      var n = document.createElement('i'); n.textContent = g[5];
      tag.appendChild(t); tag.appendChild(n); bx.appendChild(tag);
      guide.appendChild(bx);
    });
    var exitBtn = document.createElement('button'); exitBtn.type = 'button'; exitBtn.className = 'shos-guide-exit';
    exitBtn.textContent = 'EXIT ×'; exitBtn.setAttribute('aria-label', 'Exit help');
    exitBtn.addEventListener('pointerenter', playClick);
    exitBtn.addEventListener('click', function () { closeHelp(); });
    guide.appendChild(exitBtn);
    stage.appendChild(guide);

    root.appendChild(stage);

    root.addEventListener('pointerenter', function () { preload(); }, { once: true });
    ['pointerdown','keydown'].forEach(function (ev) { document.addEventListener(ev, function () { unlock(); preload(); }, { once: true }); });

    root.tabIndex = 0;
    // Space = stop everything (loops, metronome, preview, held notes), from anywhere on the page
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== ' ' && ev.code !== 'Space') return;
      var t = ev.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      ev.preventDefault();
      stopAllLoops(); releaseAll(); refreshJam(); pop('STOP', 'ALL SOUND'); armIdle();
    });
    var held = {};
    root.addEventListener('keydown', function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      var k = ev.key.toLowerCase();
      var i = QWERTY.indexOf(k);
      if (i >= 0) { ev.preventDefault(); if (!held[k]) { held[k] = true; unlock(); keyDown(i); } return; }
      if (ev.key === 'ArrowRight') { step(1); ev.preventDefault(); }
      else if (ev.key === 'ArrowLeft') { step(-1); ev.preventDefault(); }
      else if (ev.key === 'Escape') { if (state.current === 'help') closeHelp(); else if (state.current === 'why') closeWhy(); else { state.lastAction = null; show('idle'); } }
    });
    root.addEventListener('keyup', function (ev) {
      var k = ev.key.toLowerCase(); var i = QWERTY.indexOf(k);
      if (i >= 0) { held[k] = false; keyUp(i); }
    });

    // load screens (outlined SVG exports from Figma); retire the static bits that overlays now drive; then boot
    SCREENS.forEach(function (name) {
      fetch(base + FILES[name] + VQ).then(function (r) { return r.text(); }).then(function (svg) {
        scrEls[name].innerHTML = svg;
        var el = scrEls[name].querySelector('svg');
        if (el) {
          el.removeAttribute('width'); el.removeAttribute('height'); el.setAttribute('preserveAspectRatio', 'xMidYMid meet');
          if (name === 'idle') hideIn(el, ['[id="2026-09-03"]', '[id="22:58"]']);
          if (name === 'play') {
            hideIn(el, ['[id="C4"]', 'path[stroke="#45A8F0"][stroke-width="3"]', '[id="PAD"]', '[id="DRUM"]', '[id="8BIT"]', '[id="FM"]', '[id="Rectangle"]', '[id^="ENGINE"]', '[id^="ATK"]', '[id^="REL"]', '[id^="POLY"]', '[id^="REC"]']);
            // retire the static waves, dots and baseline (any shape whose centre lies in the centre bay); the canvas oscilloscope takes over
            Array.prototype.forEach.call(el.querySelectorAll('path, circle, ellipse, line, rect'), function (p) {
              try {
                var b = p.getBBox(), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
                if (cx > SCOPE_CLEAR[0] && cx < SCOPE_CLEAR[2] && cy > SCOPE_CLEAR[1] && cy < SCOPE_CLEAR[3] && b.width < 460) p.style.display = 'none';
              } catch (e) {}
            });
          }
          if (name === 'link') hideIn(el, ['[id$="SOCIAL"]', '[id^="@SPENCE"]', '[id="X.COM"]', '[id="X"]', '[id$="INSTAGRAM"]', '#Rectangle_4', 'path[stroke="#F0E8D2"][stroke-width="2.5"]']);
        }
        if (name === 'boot' && !state.current) {
          var pick = /[?&]screen=([a-z]+)/.exec(location.search);   // ?screen=help — jump straight to a screen (previews, checks)
          var lk = /[?&]link=([a-z]+)/.exec(location.search); if (lk && LINKS[lk[1]]) { state.link = lk[1]; applyLink(); }
          if (pick && (scrEls[pick[1]])) { show(pick[1]); return; }
          show('boot');
          setTimeout(function () { show('idle'); }, 1800);
        }
      }).catch(function () {});
    });

    function layout() {
      var stacked = root.clientWidth < 760;
      root.classList.toggle('is-stacked', stacked);
      if (stacked && screen.parentNode !== root) root.insertBefore(screen, stage);
      else if (!stacked && screen.parentNode !== stage) { stage.appendChild(screen); }
      scaleCursor(Math.max(0.6, Math.min(1, root.clientWidth / IMG_W)));
    }
    layout();
    window.addEventListener('resize', layout);

    var mode = 0; try { var m = localStorage.getItem('shos-mode'); mode = m !== null ? +m : (localStorage.getItem('shos-night') === '1' ? 1 : 0); } catch (e) {}
    var forced = /[?&](?:night|mode)=([0-2])/.exec(location.search);   // ?night=1 / ?mode=2 for previews and checks
    if (forced) mode = +forced[1];
    if (mode) setMode(mode, true); else nightLayer();
    bindNightToggles();
    root.__shosShow = show;
    root.__shosHelp = function (on) { if (on) openHelp(); else closeHelp(); return state.current === 'help'; };
    root.__shosJam = { act: act, refresh: function () { refreshJam(); refreshKnobs(); }, loops: function () { return LOOP_ORDER.map(loopIndex); }, sound: function () { return sound; } };
  }

  function boot() { Array.prototype.forEach.call(document.querySelectorAll('[data-shos]'), init); bindNightToggles(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.SHOS = {
    init: init,
    active: function () { return Object.keys(voices); },
    ctxState: function () { return AC ? AC.state : 'none'; },
    muted: function () { return muted; },
    setMuted: setMuted,
    _buf: function (n) { return buffers[n] || null; },
    params: function () { return { reverb: PARAMS.reverb, cutoff: PARAMS.cutoff, bpm: PARAMS.bpm, volume: PARAMS.volume, sidechain: PARAMS.sidechain, push: PARAMS.push, limiter: LIM.ready, sound: sound, loops: LOOP_ORDER.map(loopIndex), loopsLive: LOOP_ORDER.map(function (f) { return !!(loopState[f] && loopState[f].src); }), metro: metro.on, lastLaunch: clock.lastLaunch || null, beatLen: 60 / PARAMS.bpm, starts: { clock: clock.start, kick: loopState.kick ? loopState.kick.at : null, preview: preview.src ? preview.at : null }, preview: preview.name, previewLoop: preview.src ? [preview.src.loop, +preview.src.loopEnd.toFixed(3), +preview.src.playbackRate.value.toFixed(3)] : null, ir: !!(convolver && convolver.buffer), clock: clock.start }; },
    set: setParam, setBpm: setBpm, setSound: setSound,
    night: function (on) { if (on !== undefined) setNight(on); return night.on; },
    mode: function (m) { if (m !== undefined) setMode(m); return night.mode; },
    // diagnostic: 1 ms RMS envelope of a decoded asset (e.g. 'loops/kick-1', 'preview/bass')
    _env: function (name) {
      var b = buffers[name]; if (!b) return null;
      var d = b.getChannelData(0), hop = Math.round(b.sampleRate / 1000), out = [];
      for (var i = 0; i + hop <= d.length; i += hop) { var s = 0; for (var j = i; j < i + hop; j++) s += d[j] * d[j]; out.push(Math.sqrt(s / hop)); }
      return out;
    },
    // diagnostic: record the drum bus and the synth bus for `sec` seconds → 1 ms RMS envelopes (used to verify sync)
    _tap: function (sec) {
      var c = ctx(); if (!c) return Promise.reject();
      return new Promise(function (resolve) {
        var n = Math.ceil(sec * c.sampleRate), L = new Float32Array(n), S = new Float32Array(n), t0 = null, k = 0;
        var merger = c.createChannelMerger(2), proc = c.createScriptProcessor(4096, 2, 1);   // one recorder, both buses in lock-step
        var sink = c.createGain(); sink.gain.value = 0; sink.connect(c.destination);
        loopBus.connect(merger, 0, 0); scGain.connect(merger, 0, 1); merger.connect(proc); proc.connect(sink);   // synth channel = post filter/reverb/sidechain
        proc.onaudioprocess = function (e) {
          if (t0 === null) t0 = e.playbackTime;
          var a = e.inputBuffer.getChannelData(0), b = e.inputBuffer.getChannelData(1), m = Math.max(0, Math.min(a.length, n - k));
          L.set(a.subarray(0, m), k); S.set(b.subarray(0, m), k); k += a.length;
          if (k >= n) {
            loopBus.disconnect(merger); scGain.disconnect(merger); merger.disconnect(); proc.disconnect(); proc.onaudioprocess = null;
            var hop = Math.round(c.sampleRate / 1000), env = function (x) { var out = []; for (var i = 0; i + hop <= n; i += hop) { var s = 0; for (var j = i; j < i + hop; j++) s += x[j] * x[j]; out.push(Math.sqrt(s / hop)); } return out; };
            resolve({ t0: t0, sampleRate: c.sampleRate, loops: env(L), synth: env(S), clock: clock.start, beatLen: 60 / PARAMS.bpm });
          }
        };
      });
    }
  };
})();
