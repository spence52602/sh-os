# SH-OS

An OP-1 style instrument for [spencehoellen.com](https://spencehoellen.com). Spence designed the device in Figma; this is the web build: the render, exact hit zones over it, a screen system and a Web Audio engine. TypeScript source, one built script to embed, no runtime dependencies, and a typed React wrapper for hosts that mount from code.

Live: https://payments-api-spencehoellen.vercel.app/sh-os/ (the same bundle is embedded on the portfolio site).

## Play it

- **Keyboard**: click or drag across the keys, or use `Z` to `M` and `Q` to `U` on a QWERTY keyboard. Two octaves from F3 (BASS starts at B2).
- **SOUND** steps PAD → LEAD → BASS. **PREVIEW** loops a 4-bar phrase of the current sound, in time with the drums.
- **KICK / CLAP / HAT / TOP** each step 1 → 2 → 3 → off and launch on the next bar. **METRO** ticks. **STOP** (or the space bar) silences everything.
- **Knobs**: REVERB, CUTOFF (40 Hz to 20 kHz), BPM (60 to 180, everything follows), VOLUME, and SIDECHAIN (the small knob by MUTE: a Kickstart-style duck on the synth).
- **FLUTTER**: the touch strip on the right rail. Drag up to mix a beat-locked gate into the synth (the drums stay dry), tap to step the rate 1/8 → 1/16 → 1/4. The shape is a hard ramp up and a curved ramp down, per Spence's sketch, and the amount follows a dB curve so it blends in from a light pulse to full chops.
- **DESIGN / AI / BUILD / SHIP** show the stack. **WHY?** tells the backstory. The **GitHub** key opens this repo. **HELP** overlays a guide. The clock in the footer cycles light, dark and glow.
- On phones the device is there to look at; a tap says so. Play it on a desktop browser.

## Designed and built start to finish

- **Design**: the device, its three modes and every printed legend live in one Figma file. The screens are Figma frames too, exported with text outlined.
- **From file to hit zones**: the renders are exported at 2x and composited; every key, knob and strip is placed from the file's own coordinates, so the pixel geometry of the export is the layout system.
- **Engine**: a Web Audio graph with measured parts. The sidechain shape is Kickstart 2's quick chain sampled at 0.25 ms from a render, the limiter is a lookahead model fitted to Pro-L 2 renders (about 1 dB rms envelope error), and loop and preview sync was verified by cross-correlation to within 8 ms.
- **Feel**: rigid keycaps that only travel on their axis, loose knobs with a little inertia, a custom cursor, a touch strip, and a live oscilloscope on the PLAY screen.
- **Shipping**: one script and one stylesheet, framework-agnostic on purpose. The same bundle embeds in Webflow, Framer or a React host, and assets are versioned so the CDN never serves a stale render.

## Structure

| Path | Role |
| --- | --- |
| `src/index.ts` | Public entry for hosts that mount from code: `createShOs(root, options)` returns an instance with `screen()`, `show()`, `act()`, the engine and `destroy()`. No side effects on import. |
| `src/embed.ts` | The drop-in: auto-mounts on `[data-shos]` elements and exposes the `window.SHOS` debug API. Bundled to `sh-os.js`. |
| `src/device.ts` | DOM, interaction and screens for one instrument: keys, knobs, the strip, the HELP guide, the phone notice, the SVG and HTML screens, the oscilloscope. |
| `src/audio/engine.ts` | The Web Audio graph: samples, voices, loops, preview, beat clock, metronome, sidechain and flutter schedulers, the limiter worklet. Knows nothing about the DOM. |
| `src/audio/sidechain.ts`, `src/audio/flutter.ts`, `src/audio/tuning.ts` | Pure shapes, tables and math, so Node can test them without a browser. |
| `src/geometry.ts`, `src/content.ts` | Where things sit on the render, and every word a person reads. Edit copy in content.ts. |
| `src/caps.ts`, `src/cursor.ts`, `src/modes.ts` | Cap physics, the custom cursor, the light / dark / glow modes. |
| `react/ShOs.tsx` | `<ShOs assets="…" mode={2} />`: a typed React component over the runtime; unmount tears everything down. |
| `examples/react/` | The component in a page (React from an import map). |
| `sh-os.js` | The built bundle, committed so static hosts serve it as-is. Generated: edit `src/` and run the build. |
| `sh-os-limiter.js` | The limiter as an AudioWorklet: a lookahead gain computer, run as a transparent safety limiter and fitted to Pro-L 2 renders. |
| `sh-os.css` | Styles. Everything inside the screen is sized in container units so it scales with the device. |
| `assets/` | Device renders (light, dark, glow), screen SVGs, cursor, audio. |
| `test/` | `smoke.mjs` checks the pure modules in Node; `browser.mjs` drives the instrument in headless Chromium. |

Audio graph: notes and previews → synth bus → two cascaded lowpass filters (Q 0.54 and 2.2, close to a 24 dB ladder with a little resonance) → dry plus a reverb send (convolution with an impulse captured from ValhallaVintageVerb) → sidechain gain, so tails pump too → FLUTTER gate → master → safety limiter (peaks held at −0.18 dBFS, 1.5 ms lookahead, 60 ms release) → output. Loops and the metronome go straight to the master, so neither the sidechain nor the flutter touches the drums.

Timing: launches quantise to the next bar of a shared beat clock. A BPM change rebases the clock and every playback rate at the same instant, so loops, previews, the sidechain and the flutter stay locked.

## Embed it

```html
<link rel="stylesheet" href="https://payments-api-spencehoellen.vercel.app/sh-os/sh-os.css">
<div data-shos data-assets="https://payments-api-spencehoellen.vercel.app/sh-os/assets/"></div>
<script defer src="https://payments-api-spencehoellen.vercel.app/sh-os/sh-os.js"></script>
```

Or from code:

```ts
import { createShOs } from './src/index.ts';
const shos = createShOs(document.querySelector('#stage'), { assets: '/sh-os/assets/', version: '20' });
shos.act('stack:design');
shos.destroy();
```

In React, `react/ShOs.tsx` wraps the same call in an effect and destroys the instance on unmount.

## Develop

```bash
npm install
npm start        # serves the folder on http://localhost:8787/
npm run build    # src/ → sh-os.js and examples/react/app.js
npm test         # typecheck, smoke test, build, then the browser test in headless Chromium
```

The browser test serves the repo on a local port, plays the instrument like a person would (pointer events on the keys, the QWERTY map, the knob API) and checks the boot sequence, every key's screen, notes and release, loop and preview timing, the hover-click gate, the flutter rate, the safety limiter, the modes and the phone mode. Audio renders for real: Chromium is launched with autoplay allowed.

Query flags: `?mode=0|1|2` picks light, dark or glow. `?screen=help` jumps straight to a screen.

## Audio assets

- `assets/audio/pad|lead|bass/note-00..23.wav`: Spence's Serum sounds rendered from Ableton Live, one file per key, 32 kHz mono with a crossfaded loop region.
- `assets/audio/preview/*.wav`: his 4-bar phrases at 132 BPM.
- `assets/audio/ir/vintageverb.wav`: the reverb impulse, deconvolved from a click through the plugin.
- `assets/audio/click-*.wav`: the key clicks.
- The drum loops in `assets/audio/loops/` are licensed EvoSounds samples. They are not in this repo. The live site serves them, and the code treats a missing loop as silence.

## Debug API

On a page with the drop-in, `SHOS.params()` returns the current state. `SHOS.set('cutoff', 0.5)` sets a knob (0 to 1), `SHOS.set('flutter', 1)` the strip. `SHOS.setBpm(120)`, `SHOS.setSound('bass')` and `SHOS.mode(2)` do what they say. `SHOS._peak(sec, pre)` and `SHOS._mixEnv(sec)` measure the output.

## Credits

Design: Spence Hoellen, in Figma. Build: Spence with Claude Code. Sounds: Serum via Ableton Live. Reverb impulse from ValhallaVintageVerb, sidechain curve measured from Kickstart 2, limiter fitted to FabFilter Pro-L 2 renders.

Released under the MIT License (see `LICENSE`). That covers the code and Spence's own audio renders; the EvoSounds loops are not part of the repo.
