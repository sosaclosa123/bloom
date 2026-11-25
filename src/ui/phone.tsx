// Phone layout helpers (Android app): the day panel under the small month,
// which closes with its X, a tap on the same day, or a swipe down; and a
// sideways swipe on the calendar to change month / week / year.
import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './common';
import { useBloom } from './store';

/** How long the month grows / shrinks (keep in sync with phone.css). */
export const PHONE_ANIM_MS = 320;

export function PhoneDaySheet({ closing, onClose, onSticker, children }: { closing: boolean; onClose: () => void; onSticker: (el: HTMLElement) => void; children: ReactNode }) {
  const { t } = useBloom();
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; t: number; dy: number; id: number } | null>(null);

  // Drag down on the handle or the day's title bar (not on its buttons).
  const onDown = (e: React.PointerEvent) => {
    const el = e.target as HTMLElement;
    if (!el.closest('.phone-grab, .drawer-head') || el.closest('button, input, textarea, [contenteditable="true"]')) return;
    drag.current = { y: e.clientY, t: e.timeStamp, dy: 0, id: e.pointerId };
    ref.current?.setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !ref.current) return;
    d.dy = Math.max(0, e.clientY - d.y);
    ref.current.style.transition = 'none';
    ref.current.style.transform = `translateY(${d.dy}px)`;
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    const el = ref.current;
    if (!d || !el) return;
    const speed = d.dy / Math.max(1, e.timeStamp - d.t); // px per ms
    el.style.transition = '';
    if (d.dy > 70 || (d.dy > 16 && speed > 0.45)) {
      el.style.transform = `translateY(${d.dy}px)`;
      onClose();
    } else el.style.transform = '';
  };
  useEffect(() => {
    if (closing && ref.current) ref.current.style.transform = '';
  }, [closing]);

  return (
    <div
      ref={ref}
      className={`phone-sheet ${closing ? 'closing' : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div className="phone-grab" aria-hidden="true">
        <span />
      </div>
      <button type="button" className="icon-btn phone-sheet-sticker" aria-label={t('addSticker')} title={t('addSticker')} onClick={(e) => onSticker(e.currentTarget)}>
        <Icon name="sticker" size={18} />
      </button>
      {children}
    </div>
  );
}

/**
 * Calendar swipe that follows the finger (owner, Nov 2026): while the finger
 * moves sideways the page moves with it; let go past ~25% (or a quick flick)
 * and it slides out, the next month comes in from the other side; otherwise
 * it springs back. Transforms only (smooth on phones). RTL: a swipe to the
 * right = next month.
 */
export function useSwipe(ref: React.RefObject<HTMLElement | null>, enabled: boolean, rtl: boolean, onSwipe: (dir: 1 | -1) => void) {
  const cb = useRef(onSwipe);
  cb.current = onSwipe;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const pageOf = () => el.querySelector<HTMLElement>(':scope > .month, :scope > .week, :scope > .year');
    let start: { x: number; y: number; t: number } | null = null;
    let dragging = false;
    // Recent finger points, for the speed at the moment it lets go.
    let trail: { x: number; t: number }[] = [];
    let page: HTMLElement | null = null;
    const set = (x: number, ms: number, opacity = 1) => {
      if (!page) return;
      page.style.transition = ms ? `transform ${ms}ms cubic-bezier(0.22, 0.8, 0.24, 1), opacity ${ms}ms ease` : 'none';
      page.style.transform = x ? `translateX(${x}px)` : '';
      page.style.opacity = opacity === 1 ? '' : String(opacity);
    };
    const down = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      start = e.touches.length === 1 && !target.closest('.placed-sticker, input, textarea, .year-card .color-dot') ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: e.timeStamp } : null;
      dragging = false;
      trail = start ? [{ x: start.x, t: e.timeStamp }] : [];
      page = pageOf();
    };
    const move = (e: TouchEvent) => {
      if (!start || !page) return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (!dragging) {
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.3) {
          if (Math.abs(dy) > 12) start = null; // a scroll, not a swipe
          return;
        }
        dragging = true;
      }
      e.preventDefault();
      trail.push({ x: e.touches[0].clientX, t: e.timeStamp });
      if (trail.length > 8) trail.shift();
      set(dx, 0, 1 - Math.min(0.35, Math.abs(dx) / el.clientWidth / 2));
    };
    const end = (e: TouchEvent) => {
      if (!start || !page || !dragging) {
        start = null;
        return;
      }
      const x = e.changedTouches[0].clientX;
      const dx = x - start.x;
      // Finger speed over its last ~100 ms of moving (like Android's own
      // fling check); resting before letting go = no flick.
      const last = trail[trail.length - 1] ?? { x: start.x, t: start.t };
      const from = trail.find((p) => last.t - p.t <= 100) ?? last;
      const v = e.timeStamp - last.t > 100 ? 0 : (last.x - from.x) / Math.max(16, last.t - from.t);
      const fast = Math.abs(dx) > 30 && Math.abs(v) > 0.35 && Math.sign(v) === Math.sign(dx);
      start = null;
      dragging = false;
      const w = el.clientWidth;
      if (Math.abs(dx) < w * 0.25 && !fast) return set(0, 220);
      const out = dx < 0 ? -w : w;
      set(out, 160, 0.4);
      const p = page;
      window.setTimeout(() => {
        const left = dx < 0; // finger moved to the left = next (LTR)
        cb.current(left !== rtl ? 1 : -1);
        // The new month comes in from the other side.
        requestAnimationFrame(() => {
          page = pageOf() ?? p;
          set(-out * 0.35, 0, 0.4);
          requestAnimationFrame(() => requestAnimationFrame(() => set(0, 240)));
        });
      }, 160);
    };
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', end, { passive: true });
    el.addEventListener('touchcancel', end, { passive: true });
    return () => {
      el.removeEventListener('touchstart', down);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
      el.removeEventListener('touchcancel', end);
    };
  }, [ref, enabled, rtl]);
}

/**
 * Keyboard on the phone (owner, Nov 2026: "the keyboard hides everything").
 * Whatever is being typed in moves up above the keyboard:
 *  - `--kb` = the part of the page the keyboard still covers. Android
 *    either makes the app shorter (then nothing is covered) or lays the
 *    keyboard over it (then the app is shortened here by that much); the
 *    native side measures it (`bloomKeyboard` event), a browser shrinks the
 *    visual viewport.
 *  - `kb-open` on <html>: tabs hide, windows sit right above the keyboard and
 *    the day panel takes the whole page while typing in it (phone.css).
 *  - the box being typed in is scrolled into view.
 */
export function useKeyboard(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    let full = window.innerHeight; // app height without a keyboard (per orientation)
    let wide = window.innerWidth;
    let native = 0; // part of the page the keyboard covers, measured by Android (CSS px)
    let nativeOpen = false;
    let open = false;
    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=date]):not([type=time]), textarea, select, [contenteditable="true"]') || el.isContentEditable);
    };
    const reveal = () => {
      const el = document.activeElement as HTMLElement | null;
      if (el && typing()) el.scrollIntoView({ block: 'center', inline: 'nearest' });
    };
    const update = () => {
      if (window.innerWidth !== wide) {
        wide = window.innerWidth; // turned sideways: start over
        full = window.innerHeight;
      }
      if (!typing() && window.innerHeight > full) full = window.innerHeight;
      const shrunk = Math.max(0, full - window.innerHeight); // already made room (Android resized the app)
      const vv = window.visualViewport;
      const browserKb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
      const covered = Math.max(0, Math.round(Math.max(native, browserKb)));
      const isOpen = nativeOpen || covered > 80 || shrunk > 120;
      root.style.setProperty('--kb', `${isOpen ? covered : 0}px`);
      root.classList.toggle('kb-open', isOpen && typing());
      if (isOpen && !open) setTimeout(reveal, 60);
      open = isOpen;
    };
    const onNative = (e: Event) => {
      const d = e as Event & { height?: number; open?: boolean };
      native = Number(d.height) || 0;
      nativeOpen = !!d.open;
      update();
    };
    const onFocus = () => {
      update();
      if (open) setTimeout(reveal, 60);
    };
    const onBlur = () => setTimeout(update, 0);
    window.addEventListener('bloomKeyboard', onNative);
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    return () => {
      window.removeEventListener('bloomKeyboard', onNative);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onBlur);
      root.classList.remove('kb-open');
      root.style.removeProperty('--kb');
    };
  }, [enabled]);
}
