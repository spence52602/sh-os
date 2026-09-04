/* Browser characterisation test for SH-OS, run with `npm test` (needs the Playwright dev dependency).
   Serves the repo folder on a local port, drives the instrument in headless Chromium the way a person would (pointer
   events on the keys, the QWERTY map, the knobs' API) and checks what the runtime promises: the boot sequence, every
   key's screen, notes and release, loop and preview timing, the hover-click gate, the safety limiter, the modes and
   the phone mode. Audio runs for real: Chromium is launched with autoplay allowed, so the AudioContext renders. */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.wav': 'audio/wav', '.json': 'application/json', '.md': 'text/markdown' };

/** Minimal static server for the repo folder; fetch and the AudioWorklet need a real origin. */
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let file = normalize(join(ROOT, url.pathname === '/' ? '/index.html' : url.pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${origin}/?mode=0`);

  // helpers injected into the page: press a key by its accessible name, read the screen
  await page.evaluate(() => {
    window.__t = {
      q: (s) => document.querySelector(s),
      press(label) {
        const b = document.querySelector(`button[aria-label="${label}"]`);
        const o = { bubbles: true, pointerId: 9, pointerType: 'mouse' };
        b.dispatchEvent(new PointerEvent('pointerdown', o)); b.dispatchEvent(new PointerEvent('pointerup', o)); b.click();
      },
      screen: () => document.querySelector('.shos-screen').getAttribute('data-screen'),
      noteDown(label, id) { document.querySelector(`button[aria-label="${label}"]`).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: id, pointerType: 'mouse' })); },
      noteUp(id) { window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: id, pointerType: 'mouse' })); },
    };
  });

  // ---- boot: device, keys, SVG screens, then idle
  await page.waitForSelector('.shos-scr[data-name="idle"].is-on', { timeout: 6000 }).catch(() => {});
  const boot = await page.evaluate(() => ({
    screen: __t.screen(),
    cmdKeys: document.querySelectorAll('.shos-key:not(.shos-key--note):not(.shos-key--enc)').length,
    noteKeys: document.querySelectorAll('.shos-key--note').length,
    knobs: document.querySelectorAll('.shos-key--enc').length,
    fader: document.querySelectorAll('.shos-fader').length,
    svgScreens: ['boot', 'idle', 'play', 'rec', 'mix', 'about', 'link'].filter((n) => document.querySelector(`.shos-scr[data-name="${n}"] svg`)).length,
    htmlScreens: ['help', 'why', 'stack:design', 'stack:ai', 'stack:build', 'stack:ship', 'beta', 'github', 'mobile'].filter((n) => document.querySelector(`.shos-scr[data-name="${n}"]`)).length,
  }));
  check('boots to the idle screen', boot.screen === 'idle', boot.screen);
  check('31 command keys, 24 note keys, 5 knobs, 1 strip', boot.cmdKeys === 31 && boot.noteKeys === 24 && boot.knobs === 5 && boot.fader === 1, JSON.stringify(boot));
  check('7 SVG screens loaded, 9 HTML screens built', boot.svgScreens === 7 && boot.htmlScreens === 9, `${boot.svgScreens} / ${boot.htmlScreens}`);

  // ---- screens per key
  const seq = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = {};
    const go = async (label, key) => { __t.press(label); await sleep(120); out[key || label] = __t.screen(); };
    await go('Design'); await go('AI'); await go('Build'); await go('Ship');
    await go('Slot 2'); out.slot = document.querySelector('.shos-beta-slot').textContent;
    await go('GitHub');
    await go('Why?'); await go('Why?', 'whyAgain');
    await go('Help'); out.guideOn = document.querySelector('.shos-guide').classList.contains('is-on');
    await go('Help', 'helpAgain');
    await go('Next'); await go('Next', 'next2'); await go('Previous');
    await go('About'); await go('Resume'); await go('Contact'); await go('X'); await go('LinkedIn', 'in');
    return out;
  });
  check('stack keys show their own screens', seq.Design === 'stack:design' && seq.AI === 'stack:ai' && seq.Build === 'stack:build' && seq.Ship === 'stack:ship', JSON.stringify(seq));
  check('slot keys share the beta screen with the slot number', seq['Slot 2'] === 'beta' && seq.slot === '2');
  check('GitHub shows the source screen', seq.GitHub === 'github');
  check('WHY? toggles and returns to the previous screen', seq['Why?'] === 'why' && seq.whyAgain === 'github');
  check('HELP shows the guide and toggles back', seq.Help === 'help' && seq.guideOn && seq.helpAgain === 'github');
  check('browse order wraps: github → link → design → link', seq.Next === 'link' && seq.next2 === 'stack:design' && seq.Previous === 'link');
  check('rail keys show about / mix / rec / link screens', seq.About === 'about' && seq.Resume === 'mix' && seq.Contact === 'rec' && seq.X === 'link' && seq.in === 'link');

  // ---- notes: pointer and QWERTY
  const notes = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = {};
    __t.noteDown('Note C4', 21); await sleep(400);
    out.held = SHOS.active(); out.screen = __t.screen(); out.noteText = document.querySelector('.shos-note').textContent; out.ctx = SHOS.ctxState();
    __t.noteUp(21); await sleep(250); out.released = SHOS.active();
    const root = document.querySelector('.shos');
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', bubbles: true })); await sleep(300); out.qwerty = SHOS.active();
    root.dispatchEvent(new KeyboardEvent('keyup', { key: 'z', bubbles: true })); await sleep(250); out.qwertyUp = SHOS.active();
    return out;
  });
  check('a held key sounds and shows PLAY with its note', notes.held.join() === '7' && notes.screen === 'play' && notes.noteText === 'C4', JSON.stringify(notes));
  check('release ends the voice', notes.released.length === 0);
  check('QWERTY z plays key 0 and releases', notes.qwerty.join() === '0' && notes.qwertyUp.length === 0);
  check('audio context is running', notes.ctx === 'running', notes.ctx);

  // ---- jam: loops launch on the next bar, preview follows BPM, STOP clears everything
  const jam = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const out = {};
    __t.press('Kick loop'); out.loopsAfterPress = SHOS.params().loops;
    __t.press('Preview'); await sleep(2400);
    const p = SHOS.params(); out.kickLive = p.loopsLive[0]; out.preview = p.preview; out.previewLoop = p.previewLoop;
    out.aligned = p.starts.kick !== null && p.starts.preview !== null && Math.abs(((p.starts.preview - p.starts.kick) / (4 * p.beatLen)) % 1) < 0.002;
    SHOS.setBpm(140); await sleep(100); out.rateAt140 = SHOS.params().previewLoop[2];
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); await sleep(300);
    const q = SHOS.params(); out.afterStop = { live: q.loopsLive, preview: q.preview, loops: q.loops };
    SHOS.setBpm(132);
    return out;
  });
  check('KICK press arms slot 1 and the loop is live after the bar', jam.loopsAfterPress[0] === 0 && jam.kickLive === true, JSON.stringify(jam));
  check('PREVIEW loops the pad phrase, bar-aligned with the kick', jam.preview === 'pad' && jam.previewLoop && jam.previewLoop[0] === true && jam.aligned);
  check('BPM 140 retunes the preview rate', jam.rateAt140 && Math.abs(jam.rateAt140 - 140 / 132) < 0.002, String(jam.rateAt140));
  check('space stops loops and preview', jam.afterStop.live.every((v) => !v) && jam.afterStop.preview === null && jam.afterStop.loops.every((v) => v === -1));

  // ---- hover clicks: audible when idle, silent while anything plays
  const hover = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const starts = []; const orig = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function () { starts.push(this.buffer ? this.buffer.duration : 0); return orig.apply(this, arguments); };
    const hoverKeys = () => ['Design', 'AI', 'Build'].forEach((l) => document.querySelector(`button[aria-label="${l}"]`).dispatchEvent(new PointerEvent('pointerenter', { pointerId: 3, pointerType: 'mouse' })));
    const clicks = () => starts.filter((d) => d > 0 && d < 0.6).length;
    await sleep(600); hoverKeys(); await sleep(150); const idle = clicks(); starts.length = 0;
    __t.press('Preview'); await sleep(2300); hoverKeys(); await sleep(150); const busy = clicks();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true })); await sleep(200);
    AudioBufferSourceNode.prototype.start = orig;
    return { idle, busy };
  });
  check('hover clicks play when idle and stay silent while the preview runs', hover.idle > 0 && hover.busy === 0, JSON.stringify(hover));

  // ---- safety limiter: a loud stack peaks under full scale at the output
  const lim = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    SHOS.set('volume', 1); SHOS.set('reverb', 0.5); SHOS.setSound('pad');
    ['Kick loop', 'Clap loop', 'Hat loop', 'Top loop', 'Preview'].forEach(__t.press);
    const notes = [...document.querySelectorAll('.shos-key--note')];
    [0, 4, 7, 12].forEach((i, n) => notes[i].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 40 + n, pointerType: 'mouse' })));
    await sleep(2400);
    const pre = await SHOS._peak(1.5, true); const post = await SHOS._peak(1.5);
    [0, 1, 2, 3].forEach((n) => __t.noteUp(40 + n));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    SHOS.set('volume', 0.8); SHOS.set('reverb', 0);
    return { pre, post };
  });
  check('the loud scenario really exceeds full scale before the limiter', lim.pre.peak > 1.0, JSON.stringify(lim.pre));
  check('the output never exceeds the ceiling', lim.post.limiter && lim.post.peak <= 0.996 && lim.post.over === 0, JSON.stringify(lim.post));

  // ---- FLUTTER: the strip gates the mix at the division rate; a tap steps the rate
  const flt = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const strip = document.querySelector('.shos-fader');
    const tap = () => { const o = { bubbles: true, pointerId: 70, pointerType: 'mouse', clientX: 10, clientY: 10 }; strip.dispatchEvent(new PointerEvent('pointerdown', o)); strip.dispatchEvent(new PointerEvent('pointerup', o)); };
    const divs = []; tap(); divs.push(SHOS.params().flutterDiv); tap(); divs.push(SHOS.params().flutterDiv); tap(); divs.push(SHOS.params().flutterDiv);
    // a 1 ms RMS envelope still ripples at the note's own pitch, so smooth over 8 ms before counting gate closures
    const smooth = (env) => env.map((_, i) => { let s = 0, n = 0; for (let j = i - 4; j <= i + 4; j++) if (env[j] !== undefined) { s += env[j]; n++; } return s / n; });
    // a closure = the level under 10% of the window's peak for at least 20 ms (the pad's own wobble never gets that low)
    const troughsOf = (env) => { const sm = smooth(env), max = Math.max(...sm); let t = 0, run = 0; for (const v of sm) { if (v < 0.1 * max) run++; else { if (run >= 20) t++; run = 0; } } return t + (run >= 20 ? 1 : 0); };
    SHOS.setSound('pad'); __t.noteDown('Note C4', 61); await sleep(500);
    const dry = troughsOf(await SHOS._mixEnv(0.8));
    SHOS.set('flutter', 1); await sleep(600);
    const wet = troughsOf(await SHOS._mixEnv(1.0));
    __t.noteUp(61); SHOS.set('flutter', 0);
    const p = SHOS.params(); const perSecond = 1 / ((60 / p.bpm) * 4 / p.flutterDiv);
    return { divs, dry, wet, perSecond: +perSecond.toFixed(1), div: p.flutterDiv };
  });
  check('a tap on the strip steps the rate 1/16 → 1/4 → 1/8', flt.divs.join() === '16,4,8', flt.divs.join());
  check('FLUTTER at full amount gates a held note at the division rate', flt.dry === 0 && Math.abs(flt.wet - flt.perSecond) <= 1.5, JSON.stringify(flt));

  // ---- modes
  const modes = await page.evaluate(async () => {
    SHOS.mode(2); const glow = document.body.classList.contains('shos-is-glow') && document.body.classList.contains('shos-is-night');
    SHOS.mode(1); const dark = document.body.classList.contains('shos-is-night') && !document.body.classList.contains('shos-is-glow');
    SHOS.mode(0); const light = !document.body.classList.contains('shos-is-night');
    return { glow, dark, light, stored: localStorage.getItem('shos-mode') };
  });
  check('clock modes: light, dark, glow', modes.glow && modes.dark && modes.light && modes.stored === '0', JSON.stringify(modes));

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 300));
  await page.close();

  // ---- phones: look, don't play
  const phone = await browser.newPage({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  await phone.goto(`${origin}/?mode=0`);
  await phone.waitForSelector('.shos-scr[data-name="idle"].is-on', { timeout: 6000 }).catch(() => {});
  const mob = await phone.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const root = document.querySelector('.shos'), stage = document.querySelector('.shos-stage'), scr = document.querySelector('.shos-screen');
    const out = { isMobile: root.classList.contains('is-mobile'), screenInside: scr.parentNode === stage, stageWidth: Math.round(stage.getBoundingClientRect().width) };
    const key = document.querySelector('button[aria-label="Note C4"]');
    const o = { bubbles: true, cancelable: true, pointerId: 5, pointerType: 'touch', isPrimary: true };
    key.dispatchEvent(new PointerEvent('pointerdown', o)); key.dispatchEvent(new PointerEvent('pointerup', o)); key.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await sleep(300);
    out.screen = scr.getAttribute('data-screen'); out.notice = document.querySelector('.shos-notice').classList.contains('is-on');
    out.active = SHOS.active().length; out.ctx = SHOS.ctxState();
    return out;
  });
  check('phone: device whole, screen inside it, tap shows the notice, nothing plays', mob.isMobile && mob.screenInside && mob.screen === 'mobile' && mob.notice && mob.active === 0 && mob.ctx === 'none', JSON.stringify(mob));
  await phone.close();
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${!r.ok && r.info ? `  → ${r.info}` : ''}`);
console.log(`browser: ${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
