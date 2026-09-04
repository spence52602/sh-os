/* <ShOs />: the instrument as a React component.
   A thin, typed wrapper over the framework-agnostic runtime: it owns nothing but the mount and the unmount. The
   runtime attaches to the div this component renders, and `destroy()` on unmount removes the stage, the listeners,
   the timers and the AudioContext, so the component can come and go with a route. Props change → remount. */
import { useEffect, useRef } from 'react';
import { VERSION, createShOs } from '../src/index.ts';
import type { ModeIndex, ShOsInstance } from '../src/index.ts';

export interface ShOsProps {
  /** Base URL of the assets folder, e.g. `https://…/sh-os/assets/`. */
  assets: string;
  /** Start in this mode instead of the remembered one: 0 light, 1 dark, 2 glow. */
  mode?: ModeIndex;
  /** Cache tag for the assets; defaults to the runtime's own. */
  version?: string;
  className?: string;
  /** Called once the runtime is mounted, with the live instance (engine, screens, `destroy`). */
  onReady?: (instance: ShOsInstance) => void;
}

export function ShOs({ assets, mode, version, className, onReady }: ShOsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const ready = useRef(onReady); ready.current = onReady;
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const instance = createShOs(el, { assets, mode, version: version ?? VERSION });
    ready.current?.(instance);
    return () => instance.destroy();
  }, [assets, mode, version]);
  return <div ref={ref} className={className} />;
}
