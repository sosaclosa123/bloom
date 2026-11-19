// Left navigation tabs + the Upcoming and Countdowns pages.
import { useMemo } from 'react';
import { addDays, dayDiff, parseISODate, sameDay, startOfDay, toISODate } from '../shared/dates';
import type { EventOccurrence } from '../shared/recurrence';
import type { Countdown, ISODate } from '../shared/types';
import { formatTime, isDailyNudge, useRangeData, type ReminderOccurrence } from './calendarData';
import { Icon, type IconName } from './common';
import type { Tab } from './Header';
import { useAlive, useBloom } from './store';

// ------------------------------------------------------------------ nav rail

const TABS: { id: Tab; icon: IconName; label: 'calendar' | 'upcoming' | 'journal' | 'railCountdowns' }[] = [
  { id: 'calendar', icon: 'calendar', label: 'calendar' },
  { id: 'upcoming', icon: 'clock', label: 'upcoming' },
  { id: 'journal', icon: 'book', label: 'journal' },
  { id: 'countdowns', icon: 'heart', label: 'railCountdowns' },
];

export function NavRail({ tab, onTab, onSettings, badge }: { tab: Tab; onTab: (t: Tab) => void; onSettings: () => void; badge: number }) {
  const { t } = useBloom();
  return (
    <nav className="rail" aria-label="Bloom">
      <div className="rail-brand" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="26" height="26">
          <g transform="translate(16 16)">
            {[0, 72, 144, 216, 288].map((r) => (
              <ellipse key={r} rx="5.2" ry="8.4" cy="-7.2" transform={`rotate(${r})`} fill="var(--brand-petal)" />
            ))}
            <circle r="4" fill="var(--brand-center)" />
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

export function UpcomingPage({ onOpenDay, onOpenEvent, onOpenReminder }: UpcomingProps) {
  const { t, locale, save } = useBloom();
  const today = startOfDay(new Date());
  const range = useRangeData(today, addDays(today, 14));
  const days = useAlive('days');
  const now = Date.now();

  const list = useMemo(() => {
    const out: { date: ISODate; occs: EventOccurrence[]; rems: ReminderOccurrence[]; todos: { cardId: string; id: string; text: string }[] }[] = [];
    for (let i = 0; i < 14; i++) {
      const iso = toISODate(addDays(today, i));
      const occs = (range.eventsByDay.get(iso) ?? []).filter((o) => o.end.getTime() >= now && (i === 0 || !isDailyNudge(o)));
      // Daily reminders only on today, so they don't repeat down the whole list.
      const rems = (range.remindersByDay.get(iso) ?? []).filter((r) => r.at.getTime() >= now && (i === 0 || r.reminder.repeat !== 'daily'));
      const entry = days.find((d) => d.date === iso);
      const todos = (entry?.cards ?? [])
        .filter((c) => c.kind === 'checklist')
        .flatMap((c) => c.items.filter((it) => !it.done && it.text.trim()).map((it) => ({ cardId: c.id, id: it.id, text: it.text })));
      if (occs.length || rems.length || todos.length) out.push({ date: iso, occs, rems, todos });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, days, toISODate(today)]);

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

  return (
    <div className="page">
      {list.length === 0 && (
        <div className="page-empty">
          <div className="page-empty-art" aria-hidden="true">
            🌤️
          </div>
          <p>{t('nothingUpcoming')}</p>
        </div>
      )}
      <div className="page-scroll">
        {list.map((day, di) => (
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
              <span className="cd-emoji">{c.emoji}</span>
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
