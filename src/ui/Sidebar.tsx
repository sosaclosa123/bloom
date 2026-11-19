import { useMemo } from 'react';
import { addDays, dayDiff, parseISODate, sameDay, startOfDay, toISODate } from '../shared/dates';
import type { EventOccurrence } from '../shared/recurrence';
import type { Countdown, ISODate } from '../shared/types';
import { formatTime, useRangeData, type ReminderOccurrence } from './calendarData';
import { Icon, IconButton } from './common';
import { useAlive, useBloom } from './store';

interface Props {
  onOpenDay: (date: ISODate) => void;
  onOpenEvent: (o: EventOccurrence) => void;
  onOpenReminder: (r: ReminderOccurrence) => void;
  onEditCountdown: (c: Countdown | null) => void;
}

/** Next date a countdown points at (yearly ones roll over). */
export function countdownTarget(c: Countdown, today: Date): Date {
  const d = parseISODate(c.date);
  if (!c.yearly) return d;
  let next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
  return next;
}

export function Sidebar({ onOpenDay, onOpenEvent, onOpenReminder, onEditCountdown }: Props) {
  const { t, locale } = useBloom();
  const today = startOfDay(new Date());
  const range = useRangeData(today, addDays(today, 8));
  const countdowns = useAlive('countdowns');

  const upcoming = useMemo(() => {
    const now = Date.now();
    type Item = { at: Date; key: string; day: ISODate; kind: 'event'; occ: EventOccurrence } | { at: Date; key: string; day: ISODate; kind: 'reminder'; r: ReminderOccurrence };
    const items: Item[] = [];
    const seen = new Set<string>();
    for (const [day, occs] of range.eventsByDay) {
      for (const occ of occs) {
        if (seen.has(occ.key) || occ.end.getTime() < now) continue;
        seen.add(occ.key);
        items.push({ at: occ.start, key: occ.key, day, kind: 'event', occ });
      }
    }
    for (const [day, rs] of range.remindersByDay) {
      for (const r of rs) if (r.at.getTime() >= now) items.push({ at: r.at, key: r.reminder.id + r.at.getTime(), day, kind: 'reminder', r });
    }
    return items.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 7);
  }, [range]);

  const cds = useMemo(
    () =>
      countdowns
        .map((c) => ({ c, days: dayDiff(today, countdownTarget(c, today)) }))
        .filter((x) => x.days >= 0)
        .sort((a, b) => a.days - b.days),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [countdowns, toISODate(today)],
  );

  const dayLabel = (d: Date) => {
    if (sameDay(d, today)) return t('today');
    return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric' });
  };

  return (
    <nav className="sidebar">
      <section className="side-section">
        <h3>{t('upcoming')}</h3>
        {upcoming.length === 0 && <p className="empty">{t('nothingUpcoming')}</p>}
        <ul className="upcoming">
          {upcoming.map((it) => (
            <li key={it.key}>
              <button
                type="button"
                className={`up-item ${it.kind === 'event' ? `ev-${it.occ.event.color}` : 'reminder'}`}
                onClick={() => (it.kind === 'event' ? onOpenEvent(it.occ) : onOpenReminder(it.r))}
              >
                <span className="up-when">
                  <span className="up-day">{dayLabel(it.at)}</span>
                  {!(it.kind === 'event' && it.occ.event.allDay) && <span className="up-time">{formatTime(it.at, locale)}</span>}
                </span>
                <span className="up-title">
                  {it.kind === 'reminder' && <Icon name="bell" size={12} />}
                  {it.kind === 'event' ? it.occ.event.title || '—' : it.r.reminder.title || '—'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="side-section">
        <div className="side-head">
          <h3>{t('countdowns')}</h3>
          <IconButton icon="plus" label={t('addCountdown')} onClick={() => onEditCountdown(null)} />
        </div>
        {cds.length === 0 && (
          <button type="button" className="countdown-empty" onClick={() => onEditCountdown(null)}>
            <span>💗</span> {t('addCountdown')}
          </button>
        )}
        <ul className="countdowns">
          {cds.map(({ c, days }) => (
            <li key={c.id}>
              <button
                type="button"
                className="countdown"
                onClick={() => onEditCountdown(c)}
                onDoubleClick={() => onOpenDay(toISODate(countdownTarget(c, today)))}
              >
                <span className="cd-emoji">{c.emoji}</span>
                <span className="cd-text">
                  <span className="cd-title">{c.title || '—'}</span>
                  <span className="cd-days">{days === 0 ? t('isToday') : days === 1 ? t('oneDayToGo') : t('daysToGo', { n: days })}</span>
                </span>
                {days > 1 && <span className="cd-num">{days}</span>}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </nav>
  );
}
