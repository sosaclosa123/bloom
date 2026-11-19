import { useMemo } from 'react';
import { addDays, monthGrid, sameDay, toISODate } from '../shared/dates';
import { hebrewDateLabel } from '../shared/holidays';
import type { EventOccurrence } from '../shared/recurrence';
import type { ISODate } from '../shared/types';
import { formatTime, isDailyNudge, useRangeData, weekdayNames } from './calendarData';
import { newDayEntry, nextStatus } from './drafts';
import { DayChips } from './DayChips';
import { useAlive, useBloom } from './store';

interface Props {
  anchor: Date;
  selected: ISODate | null;
  onOpenDay: (date: ISODate) => void;
  onOpenEvent: (occ: EventOccurrence) => void;
  onOpenJournal: (date: ISODate) => void;
}

export function MonthView({ anchor, selected, onOpenDay, onOpenEvent, onOpenJournal }: Props) {
  const { settings, locale, t, save } = useBloom();
  const grid = useMemo(
    () => monthGrid(anchor.getFullYear(), anchor.getMonth(), settings.weekStart),
    [anchor, settings.weekStart],
  );
  const data = useRangeData(grid[0], addDays(grid[41], 1));
  const journal = useAlive('journal');
  const journalByDate = useMemo(() => new Map(journal.map((j) => [j.date, j])), [journal]);
  const today = new Date();
  const names = weekdayNames(locale, settings.weekStart, 'short');
  // Show only 5 rows when the 6th row is entirely next month.
  const rows = grid[35].getMonth() !== anchor.getMonth() ? 5 : 6;

  return (
    <div className="month" style={{ ['--rows' as string]: rows }}>
      <div className="month-weekdays">
        {names.map((n) => (
          <div key={n}>{n}</div>
        ))}
      </div>
      <div className="month-grid">
        {grid.slice(0, rows * 7).map((d, cellIdx) => {
          const iso = toISODate(d);
          const entry = data.days.get(iso);
          const occs = (data.eventsByDay.get(iso) ?? []).filter((o) => !isDailyNudge(o));
          // Daily reminders would put a bell on every day — keep those to the drawer/week view.
          const rems = (data.remindersByDay.get(iso) ?? []).filter((r) => r.reminder.repeat !== 'daily');
          const hol = data.holidays.get(iso) ?? [];
          const outside = d.getMonth() !== anchor.getMonth();
          const isToday = sameDay(d, today);
          const maxPills = entry?.headline ? 2 : 3;
          const shown = occs.slice(0, maxPills);
          const hidden = occs.length - shown.length;
          const cls = [
            'cell',
            entry?.status ? `status-${entry.status}` : '',
            outside ? 'outside' : '',
            isToday ? 'today' : '',
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
              style={{ ['--i' as string]: cellIdx }}
              role="button"
              tabIndex={0}
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
              {entry?.headline && <div className="headline" dir="auto">{entry.headline}</div>}
              <div className="pills">
                {shown.map((o) => (
                  <button
                    type="button"
                    key={o.key}
                    className={`pill ev-${o.event.color} ${o.event.allDay ? 'allday' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenEvent(o);
                    }}
                    title={o.event.title}
                  >
                    {!o.event.allDay && sameDay(o.start, d) && <span className="pill-time">{formatTime(o.start, locale)}</span>}
                    <span className="pill-title" dir="auto">{o.event.title || '—'}</span>
                  </button>
                ))}
                {hidden > 0 && <span className="more">{t('more', { n: hidden })}</span>}
              </div>
              <DayChips entry={entry} journal={journalByDate.get(iso)} reminders={rems} onOpenJournal={() => onOpenJournal(iso)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
