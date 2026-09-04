/* React example: mounts <ShOs /> from the wrapper, with a mode switch and a mount/unmount toggle to show the
   lifecycle is clean. React comes from the page's import map (see index.html); this file is bundled to app.js by
   `npm run build` with React left external. */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ShOs } from '../../react/ShOs.tsx';
import type { ModeIndex, ShOsInstance } from '../../src/index.ts';

function App() {
  const [mounted, setMounted] = useState(true);
  const [mode, setMode] = useState<ModeIndex>(0);
  const [screen, setScreen] = useState<string>('…');
  const onReady = (inst: ShOsInstance) => {
    const tick = () => setScreen(inst.screen() ?? '…');
    tick(); const id = window.setInterval(tick, 500);
    const stop = inst.destroy; inst.destroy = () => { window.clearInterval(id); stop.call(inst); };
  };
  return (
    <>
      <header className="ex-bar">
        <strong>SH-OS in React</strong>
        <label>mode <select value={mode} onChange={(e) => setMode(+e.target.value as ModeIndex)}><option value={0}>light</option><option value={1}>dark</option><option value={2}>glow</option></select></label>
        <button type="button" onClick={() => setMounted((m) => !m)}>{mounted ? 'unmount' : 'mount'}</button>
        <span>screen: <code>{mounted ? screen : 'none'}</code></span>
      </header>
      <main>{mounted && <ShOs assets="../../assets/" mode={mode} onReady={onReady} />}</main>
    </>
  );
}

createRoot(document.getElementById('app')!).render(<App />);
