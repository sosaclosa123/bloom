// Stickers on calendar days: pick one, drag it anywhere in the day's square,
// resize it (fixed pixel size between MIN and MAX, so it never scales with the
// window), and lock it in place.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { uuid } from '../shared/db';
import type { CalendarEvent, DayEntry, ISODate, PlacedSticker } from '../shared/types';
import { Icon, Toggle } from './common';
import { newDayEntry } from './drafts';
import { STICKERS } from './stickerDesigns';
import { useBloom } from './store';
import { isPhone } from '../platform/api';

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

export function StickerPicker({
  onPick,
  onClose,
  anchor,
  repeatOptions = [],
}: {
  onPick: (kind: string, repeatWith: string | null) => void;
  onClose: () => void;
  anchor: HTMLElement;
  /** Repeating events on this day: the sticker can repeat with one of them. */
  repeatOptions?: { id: string; title: string }[];
}) {
  const { t, settings } = useBloom();
  const [q, setQ] = useState('');
  const [repeat, setRepeat] = useState(repeatOptions.length > 0);
  const [withId, setWithId] = useState(repeatOptions[0]?.id ?? null);
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
      {repeatOptions.length > 0 && (
        <div className="sp-repeat">
          <Toggle
            checked={repeat}
            onChange={setRepeat}
            label={
              <>
                <Icon name="repeat" size={13} /> {repeatOptions.length === 1 ? t('stickerRepeatWith', { e: repeatOptions[0].title || '—' }) : t('stickerRepeat')}
              </>
            }
          />
          {repeat && repeatOptions.length > 1 && (
            <select value={withId ?? ''} onChange={(e) => setWithId(e.target.value)} aria-label={t('stickerRepeat')}>
              {repeatOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title || '—'}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      <div className="sp-grid">
        {list.map(([kind, s], i) => (
          <button type="button" key={kind} className="sp-item" style={{ ['--i' as string]: i }} title={settings.language === 'he' ? s.labelHe : s.label} onClick={() => onPick(kind, repeat ? withId : null)}>
            <StickerArt kind={kind} size={40} />
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- stickers on a day

/** A sticker that repeats with an event, as shown on one of its days. */
export interface RepeatingSticker {
  event: CalendarEvent;
  st: PlacedSticker;
}

/** Repeating stickers shown on `date` for these events (from the day added, minus removed days). */
export function repeatingStickersOn(events: CalendarEvent[], date: ISODate): RepeatingSticker[] {
  const out: RepeatingSticker[] = [];
  for (const event of events) for (const st of event.stickers ?? []) if ((!st.from || st.from <= date) && !st.skip?.includes(date)) out.push({ event, st });
  return out;
}

/** Selection key: a repeating sticker is selected per day, not on every day at once. */
export const stickerKey = (id: string, date: ISODate, repeating: boolean) => (repeating ? `${id}@${date}` : id);

type Scope = 'day' | 'all';
// Remember the answer while the same sticker stays selected (so rotating
// 3 times asks once).
let remembered: { key: string; scope: Scope } | null = null;

interface LayerProps {
  date: ISODate;
  entry?: DayEntry;
  repeating?: RepeatingSticker[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

interface Item {
  st: PlacedSticker;
  key: string;
  event: CalendarEvent | null;
}

export function StickerLayer({ date, entry, repeating = [], selectedId, onSelect }: LayerProps) {
  const { t, save } = useBloom();
  const layer = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<{ key: string; st: PlacedSticker } | null>(null); // while dragging/resizing or waiting for an answer
  const [ask, setAsk] = useState<{ key: string; rect: DOMRect; run: (scope: Scope) => void } | null>(null);
  const latest = useRef(entry);
  latest.current = entry;
  // Phone (owner, Nov 2026): stickers keep their PC look but scaled to the
  // phone's narrower day squares (PC squares are ~150 px wide).
  const [scale, setScale] = useState(1);
  const hasAny = (entry?.stickers?.length ?? 0) + repeating.length > 0;
  useEffect(() => {
    const el = layer.current;
    if (!isPhone || !el) return;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w > 0) setScale(Math.min(1, Math.max(0.3, w / 150)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [hasAny]);
  const items: Item[] = [
    ...(entry?.stickers ?? []).map((st) => ({ st, key: st.id, event: null })),
    ...repeating.map((r) => ({ st: r.st, key: stickerKey(r.st.id, date, true), event: r.event })),
  ];
  if (remembered && remembered.key !== selectedId) remembered = null;

  const saveDay = (next: PlacedSticker[]) => {
    const base = latest.current ?? newDayEntry(date);
    save('days', { ...base, stickers: next });
  };
  const saveEventSticker = (event: CalendarEvent, id: string, change: (st: PlacedSticker) => PlacedSticker | null) => {
    const list = (event.stickers ?? []).flatMap((x) => {
      if (x.id !== id) return [x];
      const n = change(x);
      return n ? [n] : [];
    });
    save('events', { ...event, stickers: list });
  };

  /** Apply an edit (or removal, when `next` is null) to a sticker. */
  const apply = (it: Item, next: PlacedSticker | null) => {
    if (!it.event) {
      const list = latest.current?.stickers ?? [];
      saveDay(next ? list.map((x) => (x.id === it.st.id ? next : x)) : list.filter((x) => x.id !== it.st.id));
      return;
    }
    const event = it.event;
    const run = (scope: Scope) => {
      remembered = { key: it.key, scope };
      setAsk(null);
      setLive(null);
      if (scope === 'all') {
        // Keep the repeat info (from / removed days); change the look everywhere.
        saveEventSticker(event, it.st.id, (x) => (next ? { ...next, id: x.id, from: x.from, skip: x.skip } : null));
        if (!next) onSelect(null);
        return;
      }
      // Only this day: hide the repeating one here…
      saveEventSticker(event, it.st.id, (x) => ({ ...x, skip: [...(x.skip ?? []), date] }));
      if (!next) {
        onSelect(null);
        return;
      }
      // …and put an ordinary copy with the change on this day.
      const copy: PlacedSticker = { ...next, id: uuid(), from: undefined, skip: undefined };
      saveDay([...(latest.current?.stickers ?? []), copy]);
      onSelect(copy.id);
    };
    if (remembered?.key === it.key) return run(remembered.scope);
    const el = layer.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(it.key)}"]`);
    if (next) setLive({ key: it.key, st: next }); // show the change while asking
    setAsk({ key: it.key, rect: (el ?? layer.current!).getBoundingClientRect(), run });
  };

  const startDrag = (e: React.PointerEvent, it: Item, mode: 'move' | 'resize') => {
    const st = it.st;
    if (st.locked || ask) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(it.key);
    const rect = layer.current!.getBoundingClientRect();
    const sx = e.clientX;
    const sy = e.clientY;
    let cur = st;
    const move = (ev: PointerEvent) => {
      if (mode === 'move') {
        cur = { ...st, x: clamp(st.x + (ev.clientX - sx) / rect.width, 0, 1), y: clamp(st.y + (ev.clientY - sy) / rect.height, 0, 1) };
      } else {
        const d = (Math.max(ev.clientX - sx, ev.clientY - sy) * 2) / scale;
        cur = { ...st, size: Math.round(clamp(st.size + d, STICKER_MIN, STICKER_MAX)) };
      }
      setLive({ key: it.key, st: cur });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (cur !== st) apply(it, cur);
      else setLive(null);
      if (!it.event || remembered?.key === it.key) setLive(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  if (items.length === 0) return null;
  return (
    <div className="sticker-layer" ref={layer}>
      {items.map((it) => {
        const st = live && live.key === it.key ? live.st : it.st;
        const sel = selectedId === it.key && !st.locked;
        const px = Math.round(st.size * scale);
        const half = px / 2;
        return (
          <div
            key={it.key}
            data-key={it.key}
            className={`placed-sticker ${st.locked ? 'locked' : ''} ${sel ? 'selected' : ''} ${it.event ? 'repeating' : ''}`}
            title={it.event ? t('stickerRepeatsWith', { e: it.event.title || '—' }) : undefined}
            style={{
              width: px,
              height: px,
              // Keep the whole sticker inside the square whatever its size.
              left: `clamp(${half}px, ${st.x * 100}%, calc(100% - ${half}px))`,
              top: `clamp(${half}px, ${st.y * 100}%, calc(100% - ${half}px))`,
              transform: `translate(-50%, -50%) rotate(${st.rot}deg)`,
            }}
            onPointerDown={(e) => startDrag(e, it, 'move')}
            onClick={(e) => !st.locked && e.stopPropagation()}
          >
            <StickerArt kind={st.kind} size={px} />
            {it.event && <span className="sticker-repeat-badge" aria-hidden="true"><Icon name="repeat" size={9} /></span>}
            {st.locked && (
              <button
                type="button"
                className="sticker-unlock"
                title={t('unlockSticker')}
                aria-label={t('unlockSticker')}
                onClick={(e) => {
                  e.stopPropagation();
                  apply(it, { ...st, locked: false });
                  onSelect(it.key);
                }}
              >
                <Icon name="lock" size={10} />
              </button>
            )}
            {sel && !ask && (
              <>
                <div className="sticker-tools" onPointerDown={(e) => e.stopPropagation()}>
                  <button type="button" title={t('lockSticker')} aria-label={t('lockSticker')} onClick={(e) => (e.stopPropagation(), apply(it, { ...st, locked: true }), !it.event && onSelect(null))}>
                    <Icon name="lock" size={12} />
                  </button>
                  <button type="button" title={t('rotate')} aria-label={t('rotate')} onClick={(e) => (e.stopPropagation(), apply(it, { ...st, rot: ((st.rot + 15 + 180) % 360) - 180 }))}>
                    <Icon name="repeat" size={12} />
                  </button>
                  <button type="button" title={t('delete')} aria-label={t('delete')} onClick={(e) => (e.stopPropagation(), apply(it, null), !it.event && onSelect(null))}>
                    <Icon name="trash" size={12} />
                  </button>
                </div>
                <span className="sticker-resize" title={t('resize')} onPointerDown={(e) => startDrag(e, it, 'resize')} />
              </>
            )}
          </div>
        );
      })}
      {ask &&
        createPortal(
          <ScopeAsk
            rect={ask.rect}
            onPick={ask.run}
            onCancel={() => {
              setAsk(null);
              setLive(null);
            }}
          />,
          document.body,
        )}
    </div>
  );
}

/** "Only this day / All days" for a repeating sticker. */
function ScopeAsk({ rect, onPick, onCancel }: { rect: DOMRect; onPick: (s: Scope) => void; onCancel: () => void }) {
  const { t } = useBloom();
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  // Place once next to the sticker; close on a click outside or Escape.
  useLayoutEffect(() => {
    const w = box.current?.offsetWidth ?? 220;
    const h = box.current?.offsetHeight ?? 90;
    const left = clamp(rect.left + rect.width / 2 - w / 2, 8, window.innerWidth - w - 8);
    const top = rect.top - h - 8 > 8 ? rect.top - h - 8 : Math.min(rect.bottom + 8, window.innerHeight - h - 8);
    setPos({ left, top });
  }, [rect]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && cancel.current();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancel.current();
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  return (
    <div ref={box} className="scope-ask" style={pos} role="dialog" aria-label={t('stickerScopeQ')} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <span className="scope-q">{t('stickerScopeQ')}</span>
      <div className="scope-btns">
        <button type="button" className="btn btn-soft btn-sm" onClick={() => onPick('day')}>
          {t('onlyThisDay')}
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onPick('all')}>
          {t('allDays')}
        </button>
      </div>
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

// ---------------------------------------------------------------- countdown icons

/** Stickers offered for countdowns (birthdays, trips, holidays…). */
export const COUNTDOWN_STICKERS = ['birthday', 'anniversary', 'date', 'gift', 'party', 'travel', 'vacation', 'beach', 'home', 'flowers', 'baby', 'study', 'important', 'shabbat', 'dayoff', 'car', 'pet', 'music', 'movie', 'gaming', 'gym', 'work', 'done', 'idea'].filter((k) => STICKERS[k]);

// Countdowns made before used emojis; show them as the matching sticker.
const FROM_EMOJI: Record<string, string> = {
  '💗': 'date',
  '💍': 'anniversary',
  '🎂': 'birthday',
  '✈️': 'travel',
  '🎉': 'party',
  '🏖️': 'beach',
  '🎄': 'gift',
  '🕎': 'shabbat',
  '🎓': 'study',
  '🏠': 'home',
  '🌸': 'flowers',
  '⭐': 'important',
  // savings goals
  '🚗': 'car',
  '💻': 'homework',
  '🛋️': 'home',
  '👶': 'baby',
  '🐶': 'pet',
  '🐷': 'bills',
};

/** Stickers offered for savings goals. */
export const GOAL_STICKERS = ['home', 'car', 'travel', 'vacation', 'beach', 'anniversary', 'study', 'homework', 'baby', 'pet', 'gift', 'shopping', 'bills', 'music', 'gaming', 'gym', 'party', 'flowers', 'important', 'idea'].filter((k) => STICKERS[k]);

/** The sticker kind for a countdown's icon value (a sticker kind, or an old emoji). */
export const countdownSticker = (value: string): string | null => (STICKERS[value] ? value : (FROM_EMOJI[value] ?? null));

/** A countdown's icon in the sticker style (falls back to the text if unknown). */
export function CountdownIcon({ value, size }: { value: string; size: number }) {
  const kind = countdownSticker(value);
  if (!kind) return <span style={{ fontSize: size * 0.7 }}>{value}</span>;
  return (
    <span className="cd-sticker" style={{ width: size, height: size }} aria-hidden="true">
      <StickerArt kind={kind} size={size} />
    </span>
  );
}
