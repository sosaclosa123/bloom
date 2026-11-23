import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { addDays, monthGrid, sameDay, toISODate } from '../shared/dates';
import { hebrewDateLabel } from '../shared/holidays';
import type { EventOccurrence } from '../shared/recurrence';
import type { ISODate } from '../shared/types';
import { countdownsOn, formatTime, isDailyNudge, useRangeData, weekdayNames } from './calendarData';
import { newDayEntry, nextStatus } from './drafts';
import { Icon } from './common';
import { dayColor, inkOf, monthColor, monthInk, seasonOf } from './season';
import { DayChips } from './DayChips';
import { CountdownIcon, repeatingStickersOn, StickerLayer } from './Stickers';
import { useAlive, useBloom } from './store';

interface Props {
  anchor: Date;
  selected: ISODate | null;
  onOpenDay: (date: ISODate) => void;
  onOpenEvent: (occ: EventOccurrence) => void;
  onOpenNotes: (date: ISODate, anchor: HTMLElement, mode: 'view' | 'new' | 'todos') => void;
  onOpenStickers: (date: ISODate, anchor: HTMLElement) => void;
  selectedSticker: string | null;
  onSelectSticker: (id: string | null) => void;
  /** Phone: small cells with color dots while a day is open below. */
  phone?: boolean;
  /** Phone: don't re-fit while the month is small or animating (keeps the full-size fit). */
  frozen?: boolean;
}

export function MonthView({ anchor, selected, onOpenDay, onOpenEvent, onOpenNotes, onOpenStickers, selectedSticker, onSelectSticker, phone, frozen }: Props) {
  const { settings, locale, t, save } = useBloom();
  const m = anchor.getMonth();
  const grid = useMemo(
    () => monthGrid(anchor.getFullYear(), anchor.getMonth(), settings.weekStart),
    [anchor, settings.weekStart],
  );
  const data = useRangeData(grid[0], addDays(grid[41], 1));
  const countdowns = useAlive('countdowns');
  const today = new Date();
  const names = weekdayNames(locale, settings.weekStart, 'short');
  // Show only 5 rows when the 6th row is entirely next month.
  const rows = grid[35].getMonth() !== anchor.getMonth() ? 5 : 6;

  // Fit check: if a day's content doesn't fit its cell (big text, small window),
  // fold more events into "+N more" instead of letting text get cut off.
  const gridRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ key: unknown[]; cut: Record<string, number> }>({ key: [], cut: {} });
  const [size, setSize] = useState(0);
  // (Phone: the selected day doesn't change the cells, so it isn't part of the key.)
  const fitKey = [data.eventsByDay, data.remindersByDay, data.days, data.holidays, anchor, rows, size, settings.fontSize, settings.showHebrewDate, settings.language, phone ? null : selected];
  const sameKey = fit.key.length === fitKey.length && fit.key.every((k, i) => Object.is(k, fitKey[i]));
  const lastCut = useRef<Record<string, number>>({});
  const cut = frozen ? lastCut.current : sameKey ? fit.cut : {};
  if (!frozen && sameKey) lastCut.current = fit.cut;
  const passes = useRef(0);
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el || frozen) return;
    if (!sameKey) passes.current = 0;
    if (passes.current > 12) return; // safety: never loop forever
    const next = { ...cut };
    let changed = !sameKey;
    el.querySelectorAll<HTMLElement>('.cell').forEach((c) => {
      // Steps: first fold events into "+N more" one by one, then (still too
      // full, e.g. tiny window + big text) tighten the layout in three levels.
      const maxSteps = Number(c.dataset.fitMax ?? 0);
      const iso = c.dataset.date!;
      if ((next[iso] ?? 0) >= maxSteps) return;
      const pills = c.querySelector<HTMLElement>('.pills');
      const last = pills?.lastElementChild as HTMLElement | null | undefined;
      // Lowest bit of real content (stickers and hover buttons don't count).
      const cellBottom = c.getBoundingClientRect().top + c.clientTop + c.clientHeight;
      const contentBottom = Math.max(
        ...[...c.children]
          .filter((k) => !k.matches('.sticker-layer, .cell-add'))
          .map((k) => k.getBoundingClientRect().bottom),
      );
      const overflow =
        contentBottom > cellBottom + 0.5 || (!!pills && !!last && last.getBoundingClientRect().bottom > pills.getBoundingClientRect().bottom + 0.5);
      if (overflow) {
        next[iso] = (next[iso] ?? 0) + 1;
        changed = true;
      }
    });
    if (changed) {
      passes.current += 1;
      setFit({ key: fitKey, cut: next });
    } else passes.current = 0;
  });
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    let w = 0;
    let h = 0;
    let wait: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (Math.abs(width - w) > 0.5 || Math.abs(height - h) > 0.5) {
        w = width;
        h = height;
        // Phone: the month grows/shrinks with an animation; measure once it has settled.
        if (phone) {
          clearTimeout(wait);
          wait = setTimeout(() => setSize((n) => n + 1), 120);
        } else setSize((n) => n + 1);
      }
    });
    ro.observe(el);
    // Fonts often finish loading after the first layout (slower PCs, Windows
    // scaling): measure again then, or text could stay cut until something
    // else (like switching language) re-measured it.
    const refit = () => setSize((n) => n + 1);
    const fonts = document.fonts;
    fonts?.addEventListener?.('loadingdone', refit);
    fonts?.ready.then(refit).catch(() => {});
    window.addEventListener('focus', refit);
    return () => {
      clearTimeout(wait);
      ro.disconnect();
      fonts?.removeEventListener?.('loadingdone', refit);
      window.removeEventListener('focus', refit);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`month calendar-light season-${seasonOf(m)}`} style={{ ['--rows' as string]: rows, ['--month-ink' as string]: monthInk(m, false) }}>
      <div className="month-weekdays">
        {names.map((n) => (
          <div key={n}>{n}</div>
        ))}
      </div>
      <div className="month-grid" ref={gridRef}>
        {grid.slice(0, rows * 7).map((d, cellIdx) => {
          const iso = toISODate(d);
          const entry = data.days.get(iso);
          const occs = (data.eventsByDay.get(iso) ?? []).filter((o) => !isDailyNudge(o));
          // Daily reminders would put a bell on every day — keep those to the drawer/week view.
          const rems = (data.remindersByDay.get(iso) ?? []).filter((r) => r.reminder.repeat !== 'daily');
          const hol = data.holidays.get(iso) ?? [];
          const cds = countdownsOn(countdowns, iso);
          const outside = d.getMonth() !== anchor.getMonth();
          const isToday = sameDay(d, today);
          // Leave room so the day's chips (to-dos, notes) are never pushed out of view.
          const hasChips =
            rems.length > 0 ||
            !!entry?.cards.some((c) => (c.kind === 'text' ? c.text.trim() : c.items.some((i) => i.text.trim())));
          const maxPills = Math.max(1, 3 - (entry?.headline ? 1 : 0) - (hasChips ? 1 : 0));
          const basePills = Math.min(maxPills, occs.length);
          const steps = cut[iso] ?? 0;
          const shown = occs.slice(0, Math.max(0, basePills - steps));
          const tight = Math.max(0, steps - basePills); // 0..3
          const hidden = occs.length - shown.length;
          const moreEl = hidden > 0 && <span className="more">{t('more', { n: hidden })}</span>;
          const cls = [
            'cell',
            entry?.status ? `status-${entry.status}` : '',
            outside ? 'outside' : '',
            isToday ? 'today' : '',
            tight ? `tight tight-${tight}` : '',
            selected === iso ? 'selected' : '',
            d.getDay() === 6 ? 'weekend' : '',
          ].join(' ');
          const statusLabel = entry?.status
            ? t(entry.status === 'free' ? 'statusFree' : entry.status === 'some' ? 'statusSome' : 'statusPacked')
            : t('statusNone');

          return (
            <div
              key={iso}
              className={cls}
              style={{ ['--i' as string]: cellIdx, ['--cell-bg' as string]: dayColor(d), ['--day-ink' as string]: inkOf(monthColor(d.getMonth()), 'strong'), ['--heb-ink' as string]: inkOf(monthColor(d.getMonth()), 'medium') }}
              role="button"
              tabIndex={0}
              data-date={iso}
              data-fit-max={basePills + 3}
              aria-label={d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
              onClick={() => onOpenDay(iso)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpenDay(iso))}
            >
              <div className="cell-top">
                <span className="daynum">{d.getDate()}</span>
                {settings.showHebrewDate && <span className="hebdate">{hebrewDateLabel(d, settings.language)}</span>}
                <button
                  type="button"
                  key={entry?.status ?? 'none'}
                  className={`status-dot ${entry?.status ?? 'none'}`}
                  title={`${t('status')} — ${statusLabel}`}
                  aria-label={`${t('status')}: ${statusLabel}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const base = entry ?? newDayEntry(iso);
                    save('days', { ...base, status: nextStatus(base.status) });
                  }}
                />
              </div>
              {hol.length > 0 && (
                <div className={`holiday-label ${hol.some((h) => h.major) ? 'major' : ''}`} title={hol.map((h) => h.name).join(' · ')}>
                  {hol[0].name}
                </div>
              )}
              {cds.length > 0 && (
                <div className="countdown-label" dir="auto" title={cds.map((c) => c.title).join(' · ')}>
                  <CountdownIcon value={cds[0].emoji} size={18} /> {cds[0].title || '—'}
                  {cds.length > 1 && <span className="cd-more"> +{cds.length - 1}</span>}
                </div>
              )}
              {entry?.headline && <div className="headline" dir="auto" title={entry.headline}>{entry.headline}</div>}
              <div className="pills">
                {shown.map((o) => (
                  <button
                    type="button"
                    key={o.key}
                    className={`pill ev-${o.event.color} ${o.event.allDay ? 'allday' : ''} ${o.event.visibility === 'shared' ? 'is-shared' : 'is-private'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Phone: names are tiny, a tap opens the whole day.
                      if (phone) onOpenDay(iso);
                      else onOpenEvent(o);
                    }}
                    title={o.event.title}
                  >
                    {!o.event.allDay && sameDay(o.start, d) && <span className="pill-time">{formatTime(o.start, locale)}</span>}
                    <span className="pill-title" dir="auto">{o.event.title || '—'}</span>
                    {o.event.visibility === 'shared' && <Icon name="people" size={11} className="pill-shared" />}
                  </button>
                ))}
                {!hasChips && moreEl}
              </div>
              {phone && occs.length > 0 && (
                <div className="cell-dots" aria-hidden="true">
                  {occs.slice(0, 4).map((o) => (
                    <span key={o.key} className={`cell-dot ev-${o.event.color}`} />
                  ))}
                </div>
              )}
              <DayChips
                entry={entry}
                reminders={rems}
                onOpenNotes={(el) => onOpenNotes(iso, el, 'view')}
                onOpenTodos={(el) => onOpenNotes(iso, el, 'todos')}
                lead={hasChips ? moreEl : null}
              />
              <StickerLayer
                date={iso}
                entry={entry}
                // Stickers repeat on the day each occurrence starts.
                repeating={repeatingStickersOn(
                  (data.eventsByDay.get(iso) ?? []).filter((o) => o.event.stickers?.length && toISODate(o.start) === iso).map((o) => o.event),
                  iso,
                )}
                selectedId={selectedSticker}
                onSelect={onSelectSticker}
              />
              <button
                type="button"
                className="cell-add cell-sticker"
                aria-label={t('addSticker')}
                title={t('addSticker')}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenStickers(iso, e.currentTarget);
                }}
              >
                <Icon name="sticker" size={15} />
              </button>
              <button
                type="button"
                className="cell-add"
                aria-label={t('addNoteTo', { d: d.getDate() })}
                title={t('addNoteTo', { d: d.getDate() })}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenNotes(iso, e.currentTarget, 'new');
                }}
              >
                <Icon name="plus" size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
