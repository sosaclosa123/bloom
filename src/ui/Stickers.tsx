// Stickers on calendar days: pick one, drag it anywhere in the day's square,
// resize it (fixed pixel size between MIN and MAX, so it never scales with the
// window), and lock it in place.
import { useEffect, useMemo, useRef, useState } from 'react';
import { uuid } from '../shared/db';
import type { DayEntry, ISODate, PlacedSticker } from '../shared/types';
import { Icon } from './common';
import { newDayEntry } from './drafts';
import { STICKERS } from './stickerDesigns';
import { useBloom } from './store';

export const STICKER_MIN = 20;
export const STICKER_MAX = 120;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Shared SVG filter that draws the white sticker border + soft shadow. Render once. */
export function StickerDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <filter id="bloom-sticker" x="-25%" y="-25%" width="150%" height="150%">
          <feMorphology in="SourceAlpha" operator="dilate" radius="3.2" result="grow" />
          <feFlood floodColor="#fffdf9" />
          <feComposite in2="grow" operator="in" result="border" />
          <feGaussianBlur in="grow" stdDeviation="1.6" result="blur" />
          <feOffset in="blur" dx="0" dy="1.6" result="off" />
          <feFlood floodColor="#6b4f43" floodOpacity="0.28" />
          <feComposite in2="off" operator="in" result="shadow" />
          <feMerge>
            <feMergeNode in="shadow" />
            <feMergeNode in="border" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}

export function StickerArt({ kind, size }: { kind: string; size: number }) {
  const s = STICKERS[kind];
  if (!s) return null;
  return (
    <svg viewBox="-4 -4 72 72" width={size} height={size} aria-hidden="true">
      <g filter="url(#bloom-sticker)" dangerouslySetInnerHTML={{ __html: s.svg }} />
    </svg>
  );
}

// ---------------------------------------------------------------- picker

export function StickerPicker({ onPick, onClose, anchor }: { onPick: (kind: string) => void; onClose: () => void; anchor: HTMLElement }) {
  const { t, settings } = useBloom();
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return Object.entries(STICKERS).filter(([, s]) => !query || s.label.toLowerCase().includes(query) || s.labelHe.includes(query));
  }, [q]);

  useEffect(() => {
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const w = 360;
      const h = box.current?.offsetHeight ?? 360;
      const left = clamp(a.left + a.width / 2 - w / 2, 8, window.innerWidth - w - 8);
      const top = a.top - h - 10 > 8 ? a.top - h - 10 : Math.min(a.bottom + 10, window.innerHeight - h - 8);
      setPos({ left, top });
    };
    place();
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('resize', place);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  return (
    <div ref={box} className="sticker-picker" style={pos} role="dialog" aria-label={t('stickers')}>
      <input autoFocus dir="auto" className="sp-search" value={q} placeholder={t('searchStickers')} onChange={(e) => setQ(e.target.value)} />
      <div className="sp-grid">
        {list.map(([kind, s], i) => (
          <button type="button" key={kind} className="sp-item" style={{ ['--i' as string]: i }} title={settings.language === 'he' ? s.labelHe : s.label} onClick={() => onPick(kind)}>
            <StickerArt kind={kind} size={40} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- stickers on a day

interface LayerProps {
  date: ISODate;
  entry?: DayEntry;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export function StickerLayer({ date, entry, selectedId, onSelect }: LayerProps) {
  const { t, save } = useBloom();
  const layer = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<PlacedSticker | null>(null); // while dragging/resizing
  const stickers = entry?.stickers ?? [];
  const latest = useRef(entry);
  latest.current = entry;

  const commit = (next: PlacedSticker[]) => {
    const base = latest.current ?? newDayEntry(date);
    save('days', { ...base, stickers: next });
  };
  const replace = (st: PlacedSticker) => commit((latest.current?.stickers ?? []).map((x) => (x.id === st.id ? st : x)));

  const startDrag = (e: React.PointerEvent, st: PlacedSticker, mode: 'move' | 'resize') => {
    if (st.locked) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(st.id);
    const rect = layer.current!.getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    let cur = st;
    const move = (ev: PointerEvent) => {
      if (mode === 'move') {
        cur = { ...st, x: clamp(st.x + (ev.clientX - sx) / rect.width, 0, 1), y: clamp(st.y + (ev.clientY - sy) / rect.height, 0, 1) };
      } else {
        const d = Math.max(ev.clientX - sx, ev.clientY - sy) * 2;
        cur = { ...st, size: Math.round(clamp(st.size + d, STICKER_MIN, STICKER_MAX)) };
      }
      setLive(cur);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setLive(null);
      if (cur !== st) replace(cur);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  if (stickers.length === 0) return null;
  return (
    <div className="sticker-layer" ref={layer}>
      {stickers.map((raw) => {
        const st = live && live.id === raw.id ? live : raw;
        const sel = selectedId === st.id && !st.locked;
        const half = st.size / 2;
        return (
          <div
            key={st.id}
            className={`placed-sticker ${st.locked ? 'locked' : ''} ${sel ? 'selected' : ''}`}
            style={{
              width: st.size,
              height: st.size,
              // Keep the whole sticker inside the square whatever its size.
              left: `clamp(${half}px, ${st.x * 100}%, calc(100% - ${half}px))`,
              top: `clamp(${half}px, ${st.y * 100}%, calc(100% - ${half}px))`,
              transform: `translate(-50%, -50%) rotate(${st.rot}deg)`,
            }}
            onPointerDown={(e) => startDrag(e, st, 'move')}
            onClick={(e) => !st.locked && e.stopPropagation()}
          >
            <StickerArt kind={st.kind} size={st.size} />
            {st.locked && (
              <button
                type="button"
                className="sticker-unlock"
                title={t('unlockSticker')}
                aria-label={t('unlockSticker')}
                onClick={(e) => {
                  e.stopPropagation();
                  replace({ ...st, locked: false });
                  onSelect(st.id);
                }}
              >
                <Icon name="lock" size={10} />
              </button>
            )}
            {sel && (
              <>
                <div className="sticker-tools" onPointerDown={(e) => e.stopPropagation()}>
                  <button type="button" title={t('lockSticker')} aria-label={t('lockSticker')} onClick={(e) => (e.stopPropagation(), replace({ ...st, locked: true }), onSelect(null))}>
                    <Icon name="lock" size={12} />
                  </button>
                  <button type="button" title={t('rotate')} aria-label={t('rotate')} onClick={(e) => (e.stopPropagation(), replace({ ...st, rot: ((st.rot + 15 + 180) % 360) - 180 }))}>
                    <Icon name="repeat" size={12} />
                  </button>
                  <button type="button" title={t('delete')} aria-label={t('delete')} onClick={(e) => (e.stopPropagation(), commit((latest.current?.stickers ?? []).filter((x) => x.id !== st.id)), onSelect(null))}>
                    <Icon name="trash" size={12} />
                  </button>
                </div>
                <span className="sticker-resize" title={t('resize')} onPointerDown={(e) => startDrag(e, st, 'resize')} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function addSticker(entry: DayEntry | undefined, date: ISODate, kind: string): { entry: DayEntry; id: string } {
  const base = entry ?? newDayEntry(date);
  const id = uuid();
  const n = (base.stickers ?? []).length;
  const st: PlacedSticker = { id, kind, x: 0.62 - (n % 3) * 0.12, y: 0.62, size: 44, rot: 0, locked: false };
  return { entry: { ...base, stickers: [...(base.stickers ?? []), st] }, id };
}
