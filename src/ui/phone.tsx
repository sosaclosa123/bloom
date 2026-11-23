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

/** Sideways swipe on an element: dir = +1 (to the next page) / -1 (back), RTL-aware. */
export function useSwipe(ref: React.RefObject<HTMLElement | null>, enabled: boolean, rtl: boolean, onSwipe: (dir: 1 | -1) => void) {
  const cb = useRef(onSwipe);
  cb.current = onSwipe;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    let start: { x: number; y: number; t: number } | null = null;
    const down = (e: TouchEvent) => {
      const tt = e.touches[0];
      // Not while moving a sticker or typing.
      const target = e.target as HTMLElement;
      start = e.touches.length === 1 && !target.closest('.placed-sticker, input, textarea') ? { x: tt.clientX, y: tt.clientY, t: e.timeStamp } : null;
    };
    const up = (e: TouchEvent) => {
      if (!start) return;
      const tt = e.changedTouches[0];
      const dx = tt.clientX - start.x;
      const dy = tt.clientY - start.y;
      const fast = e.timeStamp - start.t < 600;
      start = null;
      if (fast && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        const left = dx < 0; // finger moved to the left = next (LTR)
        cb.current(left !== rtl ? 1 : -1);
      }
    };
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchend', up, { passive: true });
    return () => {
      el.removeEventListener('touchstart', down);
      el.removeEventListener('touchend', up);
    };
  }, [ref, enabled, rtl]);
}
