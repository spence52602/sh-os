/* Portfolio content: everything a person reads on the device that is Spence's, not the instrument's.
   Links and their rail, the stack screens, the GitHub pointer, the WHY? copy, the screen registry (which Figma SVG
   backs which screen, the ◁ ▷ browse order). Edit copy here; nothing else in the runtime carries prose. */
import type { SoundName } from './types.ts';

export const SITE = 'https://spencehoellen.com';

export interface LinkSpec { label: string; handle: string; domain: string; url: string; icon: keyof typeof ICONS; rail: string; }
export const LINKS: Record<string, LinkSpec> = {
  x:         { label: 'X — SOCIAL',          handle: '@SPENCEHOELLEN', domain: 'X.COM',             url: 'https://x.com/SpenceHoellen',                 icon: 'x',    rail: 'X' },
  linkedin:  { label: 'LINKEDIN — SOCIAL',   handle: 'SPENCE-HOELLEN', domain: 'LINKEDIN.COM',      url: 'https://www.linkedin.com/in/spence-hoellen/', icon: 'in',   rail: 'LINKEDIN' },
  instagram: { label: 'INSTAGRAM — SOCIAL',  handle: '@SPENCEHOELLEN', domain: 'INSTAGRAM.COM',     url: 'https://www.instagram.com/spencehoellen/',    icon: 'ig',   rail: 'INSTAGRAM' },
  email:     { label: 'EMAIL — DIRECT',      handle: 'SPENCE52602',    domain: 'GMAIL.COM',         url: 'mailto:spence52602@gmail.com',                icon: 'mail', rail: 'EMAIL' },
  pay:       { label: 'PAY — CLIENT PORTAL', handle: 'PORTAL',         domain: 'SPENCEHOELLEN.COM', url: SITE + '/pay',                                 icon: 'pay',  rail: 'PAY' },
};
export const RAIL_ORDER = ['x', 'linkedin', 'instagram', 'email', 'pay'];
/** Inline SVG bodies for the link screen's icon (40 × 40 viewBox, stroked by the stylesheet). */
export const ICONS = {
  x:    '<path d="M11 11L29 29M29 11L11 29"/>',
  in:   '<rect x="4.5" y="4.5" width="31" height="31" rx="6"/><text x="20" y="27" font-size="17" font-weight="500" fill="#F0E8D2" stroke="none" text-anchor="middle">in</text>',
  ig:   '<rect x="5" y="5" width="30" height="30" rx="8"/><circle cx="20" cy="20" r="7"/><circle cx="29" cy="11" r="1.8" fill="#F0E8D2" stroke="none"/>',
  mail: '<rect x="5" y="9" width="30" height="22" rx="3"/><path d="M6 11l14 11 14-11"/>',
  pay:  '<circle cx="20" cy="20" r="14"/><text x="20" y="26" font-size="16" font-weight="500" fill="#F0E8D2" stroke="none" text-anchor="middle">$</text>',
} as const;

/** The four stack keys (DESIGN · AI · BUILD · SHIP): one screen each, only tools Spence has shipped with. */
export interface StackScreen { key: string; label: string; tag: string; foot: string; tools: ReadonlyArray<readonly [string, string]>; }
export const STACK: StackScreen[] = [
  { key: 'design', label: 'DESIGN', tag: 'WHAT I DESIGN WITH', foot: 'TRUSTWORTHY · FAST · PRECISE',
    tools: [['Figma', 'systems · tokens · specs'], ['Design systems', 'CFDS: 58 DTCG tokens'], ['Type & spacing', 'hierarchy for dense data'], ['Framer', 'prototypes · this site'], ['Illustrator', 'brand · packaging'], ['After Effects', 'motion studies']] },
  { key: 'ai', label: 'AI', tag: 'HOW I WORK WITH MODELS', foot: 'PAIR, NOT AUTOPILOT',
    tools: [['Claude Code', 'pair builder'], ['Claude', 'research · review'], ['Figma MCP', 'design to code'], ['Webflow MCP', 'publishing'], ['Ableton MCP', 'the sounds here'], ['Playwright', 'model-driven checks']] },
  { key: 'build', label: 'BUILD', tag: 'WHAT I BUILD WITH', foot: 'WIREFRAME → PRODUCTION',
    tools: [['React', 'features end to end'], ['TypeScript', 'types as the contract'], ['Next.js', 'apps · sites'], ['Tailwind CSS', 'utility styling'], ['GSAP', 'motion systems'], ['Web Audio', 'this synth']] },
  { key: 'ship', label: 'SHIP', tag: 'WHERE IT GOES LIVE', foot: 'DESIGN → CODE → PRODUCTION',
    tools: [['Vercel', 'hosting · APIs · previews'], ['GitHub', 'source · reviews'], ['Framer', 'spencehoellen.com'], ['Webflow', 'client sites'], ['Shopify', 'storefronts']] },
];
export const GITHUB = { url: 'https://github.com/spence52602/sh-os', path: 'github.com/spence52602/sh-os' };
/** WHY? screen copy (Spence's brief, tightened; no em dashes). */
export const WHY_COPY = 'Before design, Spence Hoellen made records. As a DJ and producer he passed a million streams and signed with Warner Bros. at nineteen. The run was short and it was a blast. It also built the instincts he still works from: taste, timing, and shipping work people can feel. SH-OS is a small tribute to that era.';
/** Second press of a key opens its destination. */
export const URLS: Record<string, string> = { about: SITE + '/about', github: GITHUB.url, mix: 'https://payments-api-spencehoellen.vercel.app/Spence_Hoellen_Resume.pdf', rec: SITE + '/contact' };

// ---- screen registry
/** Screens backed by outlined Figma SVG exports, and their files under assets/. */
export const SCREENS = ['boot', 'idle', 'play', 'rec', 'mix', 'about', 'link'] as const;
export const FILES: Record<(typeof SCREENS)[number], string> = { boot: '01-boot.svg', idle: '02-idle.svg', play: '06-play.svg', rec: '07-rec.svg', mix: '08-mix.svg', about: '09-about.svg', link: '10-link.svg' };
/** ◁ ▷ order across HTML and SVG screens. */
export const BROWSE = ['stack:design', 'stack:ai', 'stack:build', 'stack:ship', 'play', 'rec', 'mix', 'about', 'github', 'link'];

/** The knob readout labels on the screen popup. */
export const KNOB_LABEL: Record<string, string> = { reverb: 'REVERB', cutoff: 'CUTOFF · MG LOW 24', bpm: 'BPM', volume: 'VOLUME', sidechain: 'SIDECHAIN · KICKSTART' };
export const SOUND_LABEL: Record<SoundName, string> = { pad: 'PAD', lead: 'LEAD', bass: 'BASS' };
