import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, sameDay, startOfDay, startOfWeek, toISODate } from '../shared/dates';
import { hebrewDateLabel } from '../shared/holidays';
import type { EventOccurrence } from '../shared/recurrence';
import type { ISODate } from '../shared/types';
import { formatTime, useRangeData, type ReminderOccurrence } from './calendarData';
import { Icon } from './common';
import { newDayEntry, nextStatus } from './drafts';
import { DayChips } from './DayChips';
import { useAlive, useBloom } from './store';

const HOUR_H = 52;

interface Props {
  anchor: Date;
  selected: ISODate | null;
  onOpenDay: (date: ISODate) => void;
  onOpenEvent: (occ: EventOccurrence) => void;
  onOpenReminder: (r: ReminderOccurrence) => void;
  onCreateAt: (date: ISODate, time: string) => void;
  onOpenJournal: (date: ISODate) => void;
}

interface Placed {
  occ: EventOccurrence;
  top: number;
  height: number;
  col: number;
  cols: number;
}

/** Lays out overlapping timed events side by side. */
function layoutDay(occs: EventOccurrence[], day: Date): Placed[] {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + 86400000;
  const items = occs
    .filter((o) => !o.event.allDay)
    .map((o) => {
      const s = Math.max(o.start.getTime(), dayStart);
      const e = Math.min(Math.max(o.end.getTime(), s + 20 * 60000), dayEnd);
      return { occ: o, s, e };
    })
    .sort((a, b) => a.s - b.s || b.e - a.e);

  const placed: Placed[] = [];
  let cluster: { item: (typeof items)[number]; col: number }[] = [];
  let clusterEnd = 0;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    for (const c of cluster)
      placed.push({
        occ: c.item.occ,
        top: ((c.item.s - dayStart) / 3600000) * HOUR_H,
        height: Math.max(22, ((c.item.e - c.item.s) / 3600000) * HOUR_H - 2),
        col: c.col,
        cols,
      });
    cluster = [];
  };
  for (const it of items) {
    if (cluster.length && it.s >= clusterEnd) flush();
    const used = new Set(cluster.filter((c) => c.item.e > it.s).map((c) => c.col));
    let col = 0;
    while (used.has(col)) col++;
    cluster.push({ item: it, col });
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  flush();
  return placed;
}

export function WeekView({ anchor, selected, onOpenDay, onOpenEvent, onOpenReminder, onCreateAt, onOpenJournal }: Props) {
  const { settings, locale, t, save } = useBloom();
  const start = useMemo(() => startOfWeek(anchor, settings.weekStart), [anchor, settings.weekStart]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const data = useRangeData(start, addDays(start, 7));
  const scroller = useRef<HTMLDivElement>(null);
  const journal = useAlive('journal');
  const journalByDate = useMemo(() => new Map(journal.map((j) => [j.date, j])), [journal]);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(id);
  }, []);
  // Scroll so the week's first event is in view (or 7:30 if there are none
  // earlier), so nothing starts out hidden above the visible area.
  const firstHour = useMemo(() => {
    let min = 7.5;
    for (const occs of data.eventsByDay.values())
      for (const o of occs) if (!o.event.allDay) min = Math.min(min, o.start.getHours() + o.start.getMinutes() / 60 - 0.5);
    return Math.max(0, min);
  }, [data.eventsByDay]);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = HOUR_H * firstHour;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start.getTime()]);

  const hours = Array.from({ length: 24 }, (_, h) => h);

  return (
    <div className="week">
      <div className="week-head">
        <div className="gutter" />
        {days.map((d) => {
          const iso = toISODate(d);
          const entry = data.days.get(iso);
          const hol = data.holidays.get(iso) ?? [];
          return (
            <div
              key={iso}
              className={`week-day-head ${sameDay(d, now) ? 'today' : ''} ${selected === iso ? 'selected' : ''} ${entry?.status ? `status-${entry.status}` : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => onOpenDay(iso)}
              onKeyDown={(e) => e.key === 'Enter' && onOpenDay(iso)}
            >
              <div className="wd-row">
                <span className="wd-name">{d.toLocaleDateString(locale, { weekday: 'short' })}</span>
                <span className="wd-num">{d.getDate()}</span>
                <button
                  type="button"
                  className={`status-dot ${entry?.status ?? 'none'}`}
                  aria-label={t('status')}
                  title={t('status')}
                  onClick={(e) => {
                    e.stopPropagation();
                    const base = entry ?? newDayEntry(iso);
                    save('days', { ...base, status: nextStatus(base.status) });
                  }}
                />
              </div>
              {settings.showHebrewDate && <div className="hebdate">{hebrewDateLabel(d, settings.language)}</div>}
              {hol[0] && <div className="holiday-label">{hol[0].name}</div>}
              {entry?.headline && <div className="headline" dir="auto">{entry.headline}</div>}
              <DayChips compact entry={entry} journal={journalByDate.get(iso)} onOpenJournal={() => onOpenJournal(iso)} />
            </div>
          );
        })}
      </div>

      <div className="week-allday">
        <div className="gutter">{t('allDay')}</div>
        {days.map((d) => {
          const iso = toISODate(d);
          const all = (data.eventsByDay.get(iso) ?? []).filter((o) => o.event.allDay);
          return (
            <div key={iso} className="allday-cell">
              {all.map((o) => (
                <button type="button" key={o.key} className={`pill allday ev-${o.event.color}`} onClick={() => onOpenEvent(o)}>
                  <span className="pill-title" dir="auto">{o.event.title || '—'}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <div className="week-scroll" ref={scroller}>
        <div className="week-grid" style={{ height: HOUR_H * 24 }}>
          <div className="gutter hours">
            {hours.map((h) => (
              <div key={h} className="hour-label" style={{ top: h * HOUR_H }}>
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>
          {days.map((d) => {
            const iso = toISODate(d);
            const placed = layoutDay(data.eventsByDay.get(iso) ?? [], d);
            const rems = data.remindersByDay.get(iso) ?? [];
            const isToday = sameDay(d, now);
            return (
              <div
                key={iso}
                className={`day-col ${isToday ? 'today' : ''}`}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const mins = Math.floor(((e.clientY - rect.top) / HOUR_H) * 2) * 30;
                  const h = Math.min(23, Math.floor(mins / 60));
                  onCreateAt(iso, `${String(h).padStart(2, '0')}:${mins % 60 === 30 ? '30' : '00'}`);
                }}
              >
                {hours.map((h) => (
                  <div key={h} className="hour-line" style={{ top: h * HOUR_H }} />
                ))}
                {placed.map((p) => (
                  <button
                    type="button"
                    key={p.occ.key}
                    className={`week-event ev-${p.occ.event.color}`}
                    style={{
                      top: p.top,
                      height: p.height,
                      insetInlineStart: `calc(${(p.col / p.cols) * 100}% + 2px)`,
                      width: `calc(${100 / p.cols}% - 4px)`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenEvent(p.occ);
                    }}
                  >
                    <span className="we-title">{p.occ.event.title || '—'}</span>
                    {p.height > 34 && (
                      <span className="we-time">
                        {formatTime(p.occ.start, locale)}–{formatTime(p.occ.end, locale)}
                      </span>
                    )}
                  </button>
                ))}
                {rems.map((r) => (
                  <button
                    type="button"
                    key={r.reminder.id + r.at.getTime()}
                    className="week-reminder"
                    style={{ top: ((r.at.getHours() * 60 + r.at.getMinutes()) / 60) * HOUR_H - 10 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenReminder(r);
                    }}
                    title={r.reminder.title}
                  >
                    <Icon name="bell" size={12} />
                    <span>{r.reminder.title || '—'}</span>
                  </button>
                ))}
                {isToday && (
                  <div className="now-line" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_H }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
