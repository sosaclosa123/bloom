// Left navigation tabs + the Upcoming and Countdowns pages.
import { useEffect, useMemo, useState } from 'react';
import { addDays, dayDiff, parseISODate, sameDay, startOfDay, toISODate } from '../shared/dates';
import { expandEvents, type EventOccurrence } from '../shared/recurrence';
import type { Countdown, ISODate } from '../shared/types';
import { formatTime, isDailyNudge, useRangeData, type ReminderOccurrence } from './calendarData';
import { Icon, type IconName } from './common';
import type { Tab } from './Header';
import { CountdownIcon } from './Stickers';
import { useAlive, useBloom } from './store';

// ------------------------------------------------------------------ nav rail

const TABS: { id: Tab; icon: IconName; label: 'calendar' | 'upcoming' | 'wallet' | 'railCountdowns' }[] = [
  { id: 'calendar', icon: 'calendar', label: 'calendar' },
  { id: 'upcoming', icon: 'clock', label: 'upcoming' },
  { id: 'countdowns', icon: 'heart', label: 'railCountdowns' },
  { id: 'wallet', icon: 'wallet', label: 'wallet' },
];

export function NavRail({ tab, onTab, onSettings, badge }: { tab: Tab; onTab: (t: Tab) => void; onSettings: () => void; badge: number }) {
  const { t } = useBloom();
  return (
    <nav className="rail" aria-label="Bloom">
      <div className="rail-brand" aria-hidden="true">
        <svg viewBox="24 24 464 464" width="30" height="30">
          <rect x="24" y="24" width="464" height="464" rx="116" fill="#3f4f49" />
          <g transform="translate(-32 0)">
            <path d="M200 128v254" stroke="#f3ebe2" strokeWidth="40" strokeLinecap="round" />
            <circle cx="278" cy="304" r="78" fill="none" stroke="#f3ebe2" strokeWidth="40" />
            <path d="M304 178c10-46 50-70 92-66-4 44-40 76-92 66z" fill="#e9b0a3" />
          </g>
        </svg>
      </div>
      <div className="rail-tabs" role="tablist">
        {TABS.map((x) => (
          <button type="button" role="tab" aria-selected={tab === x.id} key={x.id} className={`rail-tab ${tab === x.id ? 'active' : ''}`} onClick={() => onTab(x.id)}>
            <span className="rail-icon">
              <Icon name={x.icon} size={20} />
              {x.id === 'upcoming' && badge > 0 && <span className="rail-badge">{badge}</span>}
            </span>
            <span className="rail-label">{t(x.label)}</span>
          </button>
        ))}
      </div>
      <button type="button" className="rail-tab rail-settings" onClick={onSettings}>
        <span className="rail-icon">
          <Icon name="settings" size={20} />
        </span>
        <span className="rail-label">{t('settings')}</span>
      </button>
    </nav>
  );
}

// ------------------------------------------------------------------ upcoming

interface UpcomingProps {
  onOpenDay: (date: ISODate) => void;
  onOpenEvent: (o: EventOccurrence) => void;
  onOpenReminder: (r: ReminderOccurrence) => void;
}

export { repeatLabel } from '../shared/schedule';
import { repeatLabel } from '../shared/schedule';

export function UpcomingPage({ onOpenDay, onOpenEvent, onOpenReminder }: UpcomingProps) {
  const { t, locale, save } = useBloom();
  // Re-check every minute, so finished items drop off by themselves even when
  // Bloom stays open for hours (and a new day starts on time).
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      timer = setTimeout(() => {
        setClock(Date.now());
        next();
      }, 60000 - (Date.now() % 60000) + 50);
    };
    next();
    const wake = () => setClock(Date.now());
    window.addEventListener('focus', wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', wake);
    };
  }, []);
  const today = startOfDay(new Date(clock));
  const range = useRangeData(today, addDays(today, 14));
  const days = useAlive('days');
  const events = useAlive('events');
  const now = clock;

  // Repeating events: listed once each with their next time, not on every day.
  const repeating = useMemo(() => {
    const from = new Date(now);
    const until = addDays(today, 800);
    const out: EventOccurrence[] = [];
    for (const ev of events) {
      if (ev.repeat === 'none') continue;
      const next = expandEvents([ev], from, until).find((o) => o.end.getTime() >= now);
      if (next) out.push(next);
    }
    return out.sort((a, b) => a.start.getTime() - b.start.getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, now]);

  const list = useMemo(() => {
    const out: { date: ISODate; occs: EventOccurrence[]; rems: ReminderOccurrence[]; todos: { cardId: string; id: string; text: string }[] }[] = [];
    for (let i = 0; i < 14; i++) {
      const iso = toISODate(addDays(today, i));
      // One-time things only; repeating ones live in their own section above.
      // Multi-day events show once: on the day they start (or today, if already going).
      const occs = (range.eventsByDay.get(iso) ?? []).filter(
        (o) => o.end.getTime() >= now && o.event.repeat === 'none' && !isDailyNudge(o) && (toISODate(o.start) === iso || (i === 0 && o.start < today)),
      );
      const rems = (range.remindersByDay.get(iso) ?? []).filter((r) => r.at.getTime() >= now && r.reminder.repeat === 'none');
      const entry = days.find((d) => d.date === iso);
      const todos = (entry?.cards ?? [])
        .filter((c) => c.kind === 'checklist')
        .flatMap((c) => c.items.filter((it) => !it.done && it.text.trim()).map((it) => ({ cardId: c.id, id: it.id, text: it.text })));
      if (occs.length || rems.length || todos.length) out.push({ date: iso, occs, rems, todos });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, days, now]);

  // Last day an event covers (an all-day event "ends" at midnight after it).
  const lastDay = (o: EventOccurrence) => toISODate(new Date(o.end.getTime() - (o.event.allDay ? 1 : 0)));
  const nextLabel = (d: Date) =>
    sameDay(d, today) ? t('today') : sameDay(d, addDays(today, 1)) ? t('tomorrow') : d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });

  const dayLabel = (iso: ISODate) => {
    const d = parseISODate(iso);
    if (sameDay(d, today)) return t('today');
    if (sameDay(d, addDays(today, 1))) return t('tomorrow');
    return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });
  };

  const tick = (date: ISODate, cardId: string, itemId: string) => {
    const entry = days.find((d) => d.date === date);
    if (!entry) return;
    save('days', {
      ...entry,
      cards: entry.cards.map((c) => (c.id === cardId ? { ...c, items: c.items.map((i) => (i.id === itemId ? { ...i, done: true } : i)) } : c)),
    });
  };

  // All one-time items by day (shared ones carry the people icon).
  const renderDays = () => {
    const days = list;
    if (days.length === 0) return <p className="up-none">{t('nothingHere')}</p>;
    return (
      <>
    {days.map((day, di) => (
        <section key={day.date} className="up-day" style={{ ['--i' as string]: di }}>
          <button type="button" className="up-day-title" onClick={() => onOpenDay(day.date)}>
            {dayLabel(day.date)}
          </button>
          <ul className="up-list">
            {day.occs.map((o) => (
              <li key={o.key}>
                <button type="button" className={`up-row ev-${o.event.color}`} onClick={() => onOpenEvent(o)}>
                  <span className="up-bar" />
                  <span className="up-time">{o.event.allDay ? t('allDay') : formatTime(o.start, locale)}</span>
                  <span className="up-title" dir="auto">
                    {o.event.title || '—'}
                  </span>
                  {lastDay(o) > toISODate(o.start) && (
                    <span className="up-next">{t('untilDate', { d: parseISODate(lastDay(o)).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }) })}</span>
                  )}
                  {o.event.visibility === 'shared' && <Icon name="people" size={14} className="shared-ico" />}
                </button>
              </li>
            ))}
            {day.rems.map((r) => (
              <li key={r.reminder.id + r.at.getTime()}>
                <button type="button" className="up-row reminder" onClick={() => onOpenReminder(r)}>
                  <Icon name="bell" size={14} className="up-ico" />
                  <span className="up-time">{formatTime(r.at, locale)}</span>
                  <span className="up-title" dir="auto">
                    {r.reminder.title || '—'}
                  </span>
                </button>
              </li>
            ))}
            {day.todos.map((td) => (
              <li key={td.id} className="up-row todo">
                <label className="check">
                  <input type="checkbox" checked={false} onChange={() => tick(day.date, td.cardId, td.id)} aria-label={td.text} />
                  <span className="check-box">
                    <Icon name="check" size={12} />
                  </span>
                </label>
                <span className="up-title" dir="auto">
                  {td.text}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      </>
    );
  };

  return (
    <div className="page">
      {list.length === 0 && repeating.length === 0 && (
        <div className="page-empty">
          <div className="page-empty-art" aria-hidden="true">
            🌤️
          </div>
          <p>{t('nothingUpcoming')}</p>
        </div>
      )}
      {/* Two sections side by side, each scrolling on its own: Coming up (one-time, shared ones marked) | Repeating. */}
      <div className="up-cols">
        <section className="up-col">
          <h3 className="up-section-title">
            <Icon name="calendar" size={14} /> {t('onceSection')}
          </h3>
          <div className="up-col-scroll">{renderDays()}</div>
        </section>
        <section className="up-col up-repeating">
          <h3 className="up-section-title">
            <Icon name="repeat" size={15} /> {t('repeatingSection')}
          </h3>
          <div className="up-col-scroll">
            {repeating.length === 0 ? (
              <p className="up-none">{t('nothingHere')}</p>
            ) : (
              <ul className="up-list">
                {repeating.map((o) => (
                  <li key={o.event.id}>
                    <button type="button" className={`up-row ev-${o.event.color}`} onClick={() => onOpenEvent(o)}>
                      <span className="up-bar" />
                      <span className="up-title" dir="auto">
                        {o.event.title || '—'}
                      </span>
                      <span className="up-repeat">{repeatLabel(o.event, t)}</span>
                      <span className="up-next">
                        {t('nextAt', { d: nextLabel(o.start), time: o.event.allDay ? t('allDay') : formatTime(o.start, locale) })}
                      </span>
                      {o.event.visibility === 'shared' && <Icon name="people" size={14} className="shared-ico" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ countdowns

/** Next date a countdown points at (yearly ones roll over). */
export function countdownTarget(c: Countdown, today: Date): Date {
  const d = parseISODate(c.date);
  if (!c.yearly) return d;
  let next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
  return next;
}

export function CountdownsPage({ onEdit }: { onEdit: (c: Countdown | null) => void }) {
  const { t, locale } = useBloom();
  const countdowns = useAlive('countdowns');
  const today = startOfDay(new Date());
  const list = useMemo(
    () =>
      countdowns
        .map((c) => ({ c, target: countdownTarget(c, today), days: dayDiff(today, countdownTarget(c, today)) }))
        .filter((x) => x.days >= 0)
        .sort((a, b) => a.days - b.days),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [countdowns, toISODate(today)],
  );

  return (
    <div className="page">
      <div className="page-scroll">
        <div className="cd-grid">
          {list.map(({ c, target, days }, i) => (
            <button type="button" key={c.id} className="cd-card" style={{ ['--i' as string]: i }} onClick={() => onEdit(c)}>
              <span className="cd-emoji">
                <CountdownIcon value={c.emoji} size={58} />
              </span>
              <span className="cd-num">{days === 0 ? '🎉' : days}</span>
              <span className="cd-unit">{days === 0 ? t('isToday') : days === 1 ? t('oneDayToGo') : t('daysLeft')}</span>
              <span className="cd-title" dir="auto">
                {c.title || '—'}
              </span>
              <span className="cd-date">{target.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
            </button>
          ))}
          <button type="button" className="cd-card cd-new" onClick={() => onEdit(null)}>
            <Icon name="plus" size={26} />
            <span>{t('addCountdown')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
