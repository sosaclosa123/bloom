// Where are the window's minimize / maximize / close buttons?
//
// On English Windows they sit at the top-right; on Hebrew (right-to-left)
// Windows, Windows mirrors the title bar and puts them at the top-LEFT. The app
// draws its own top bar under that area, so it must keep the right side clear.
// The window reports the exact free area (Window Controls Overlay), so we read
// it live — whatever the language of Windows or of the app, and after resizing,
// moving to another screen or changing scaling — and publish it as CSS vars:
//   --wco-left / --wco-right : px taken by the buttons at each window edge
//   --wco-h                  : height of the buttons area
import { useEffect } from 'react';

interface Overlay extends EventTarget {
  visible: boolean;
  getTitlebarAreaRect(): DOMRect;
}

export function measureControls(rect: { x: number; width: number; height: number }, viewport: number) {
  const left = Math.max(0, Math.round(rect.x));
  const right = Math.max(0, Math.round(viewport - rect.x - rect.width));
  return { left, right, height: Math.round(rect.height) };
}

export function useWindowControls(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const get = () => (navigator as Navigator & { windowControlsOverlay?: Overlay }).windowControlsOverlay;
    const overlay = get();
    const root = document.documentElement;
    const apply = () => {
      const overlay = get();
      if (!overlay || !overlay.visible) {
        root.removeAttribute('data-wco');
        return;
      }
      const r = overlay.getTitlebarAreaRect();
      if (!r || r.width <= 0) return;
      const m = measureControls(r, window.innerWidth);
      root.style.setProperty('--wco-left', `${m.left}px`);
      root.style.setProperty('--wco-right', `${m.right}px`);
      root.style.setProperty('--wco-h', `${m.height}px`);
      root.dataset.wco = m.left > m.right ? 'left' : 'right';
    };
    apply();
    overlay?.addEventListener('geometrychange', apply);
    window.addEventListener('resize', apply);
    return () => {
      overlay?.removeEventListener('geometrychange', apply);
      window.removeEventListener('resize', apply);
    };
  }, [enabled]);
}
