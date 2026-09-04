/* Public entry: what a host imports to mount SH-OS from code (the React wrapper in react/ does exactly this).
   No side effects on import. The drop-in bundle (sh-os.js) is built from embed.ts, which adds the auto-boot on
   `[data-shos]` elements and the window.SHOS debug API on top of this module. */
export { createDevice as createShOs } from './device.ts';
export type { ShOsInstance, DeviceOptions as ShOsOptions } from './device.ts';
export { Engine } from './audio/engine.ts';
export type { PeakReport } from './audio/engine.ts';
export { setMode, currentMode, bindModeToggles } from './modes.ts';
export type { ModeIndex, ParamName, SoundName, LoopFamily, Params } from './types.ts';

/** Asset tag: bump when an asset changes. Assets cache for an hour on the CDN; the script itself revalidates every load. */
export const VERSION = '20';
