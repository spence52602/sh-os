# SH-OS

An OP-1 style instrument for [spencehoellen.com](https://spencehoellen.com). Spence designed the device in Figma; this is the web build: the render, exact hit zones over it, a screen system and a Web Audio engine. Vanilla JavaScript, no build step, no dependencies.

Live: https://payments-api-spencehoellen.vercel.app/sh-os/ (the same bundle is embedded on the portfolio site).

## Play it

- **Keyboard**: click or drag across the keys, or use `Z` to `M` and `Q` to `U` on a QWERTY keyboard. Two octaves from F3 (BASS starts at B2).
- **SOUND** steps PAD → LEAD → BASS. **PREVIEW** loops a 4-bar phrase of the current sound, in time with the drums.
- **KICK / CLAP / HAT / TOP** each step 1 → 2 → 3 → off and launch on the next bar. **METRO** ticks. **STOP** (or the space bar) silences everything.
- **Knobs**: REVERB, CUTOFF (40 Hz to 20 kHz), BPM (60 to 180, everything follows), VOLUME, and SIDECHAIN (the small knob by MUTE: a Kickstart-style duck on the synth).
- **LIMITER**: the touch strip on the right rail. Coming soon: dragging it says so while the design is thought through (the Pro-L style worklet is in the repo, parked).
- **DESIGN / AI / BUILD / SHIP** show the stack. **WHY?** tells the backstory. The **GitHub** key opens this repo. **HELP** overlays a guide. The clock in the footer cycles light, dark and glow.

## Designed and built start to finish

- **Design**: the device, its three modes and every printed legend live in one Figma file. The screens are Figma frames too, exported with text outlined.
- **From file to hit zones**: the renders are exported at 2x and composited; every key, knob and strip is placed from the file's own coordinates, so the pixel geometry of the export is the layout system.
- **Engine**: a Web Audio graph with measured parts. The sidechain shape is Kickstart 2's quick chain sampled at 0.25 ms from a render, the limiter is a lookahead model fitted to Pro-L 2 renders (about 1 dB rms envelope error), and loop and preview sync was verified by cross-correlation to within 8 ms.
- **Feel**: rigid keycaps that only travel on their axis, loose knobs with a little inertia, a custom cursor, a touch strip, and a live oscilloscope on the PLAY screen.
- **Shipping**: one script and one stylesheet, framework-agnostic on purpose. The same bundle embeds in Webflow, Framer or a React host with three tags, and assets are versioned so the CDN never serves a stale render.

## How it is built

| File | Role |
| --- | --- |
| `index.html` | Demo page with the page chrome. A host page needs only the stylesheet, `<div data-shos data-assets="…/assets/">` and the script. |
| `sh-os.js` | The runtime: device and hit zones (in the Figma export's pixel space), cap and knob motion, screens (SVG exports plus HTML screens), the audio graph and beat clock, the `window.SHOS` debug API. |
| `sh-os-limiter.js` | The limiter as an AudioWorklet: a lookahead gain computer fitted to Pro-L 2 renders. |
| `sh-os.css` | Styles. Everything inside the screen is sized in container units so it scales with the device. |
| `assets/` | Device renders (light, dark, glow), screen SVGs, cursor, audio. |

Audio graph: notes and previews → synth bus → two cascaded lowpass filters (Q 0.54 and 2.2, close to a 24 dB ladder with a little resonance) → dry plus a reverb send (convolution with an impulse captured from ValhallaVintageVerb) → sidechain gain, last in the chain so tails pump too → master → limiter worklet. Loops and the metronome go straight to the master.

Timing: launches quantise to the next bar of a shared beat clock. A BPM change rebases the clock and every playback rate at the same instant, so loops and previews stay locked. The sidechain shape is Kickstart 2's quick chain, measured from a render at 0.25 ms resolution.

## Audio assets

- `assets/audio/pad|lead|bass/note-00..23.wav`: Spence's Serum sounds rendered from Ableton Live, one file per key, 32 kHz mono with a crossfaded loop region.
- `assets/audio/preview/*.wav`: his 4-bar phrases at 132 BPM.
- `assets/audio/ir/vintageverb.wav`: the reverb impulse, deconvolved from a click through the plugin.
- `assets/audio/click-*.wav`: the key clicks.
- The drum loops in `assets/audio/loops/` are licensed EvoSounds samples. They are not in this repo. The live site serves them, and the code treats a missing loop as silence.

## Run locally

The page fetches assets and loads a worklet, so it needs a server:

```bash
npm start
```

Then open http://localhost:8787/. `npm test` runs a syntax check and a smoke test of the pure parts (sidechain shape, cutoff mapping, key tables).

Query flags: `?mode=0|1|2` picks light, dark or glow. `?screen=help` jumps straight to a screen.

## Debug API

`SHOS.params()` returns the current state. `SHOS.set('cutoff', 0.5)` sets a knob (0 to 1). `SHOS.setBpm(120)` and `SHOS.setSound('bass')` do what they say.

## Credits

Design: Spence Hoellen, in Figma. Build: Spence with Claude Code. Sounds: Serum via Ableton Live. Reverb impulse from ValhallaVintageVerb, sidechain curve measured from Kickstart 2, limiter fitted to FabFilter Pro-L 2 renders.

Released under the MIT License (see `LICENSE`). That covers the code and Spence's own audio renders; the EvoSounds loops are not part of the repo.
