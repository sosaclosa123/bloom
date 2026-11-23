// The small "Coming up" window shown in the corner when the PC starts:
// the next (up to 5) events, grouped by day, each day as a mini calendar
// square with its stickers and to-dos, plus that day's notes. It never takes
// focus, and stays until it's closed (✕ or "Open Bloom").
import { StrictMode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { dirFor, localeFor, translate, type StringKey } from './i18n/strings';
import { parseISODate, toISODate } from './shared/dates';
import { personalDays } from './shared/db';
import { expandEvents, type EventOccurrence } from './shared/recurrence';
import { countdownsOn } from './shared/schedule';
import { glanceDoses } from './shared/health';
import type { DayEntry, Snapshot } from './shared/types';
import { dayColor, inkOf, monthColor, setCustomMonthColors } from './ui/season';
import { CountdownIcon, StickerArt, StickerDefs, repeatingStickersOn } from './ui/Stickers';
import { stripMarks } from './ui/NoteRich';
import './theme/tokens.css';
import './theme/app.css';
import './theme/motion.css';
import '@fontsource/outfit/600.css';
import '@fontsource/caveat/600.css';
import '@fontsource/gveret-levin/400.css';

const MAX_EVENTS = 5;

export interface GlanceDay {
  date: string;
  occs: EventOccurrence[];
  entry?: DayEntry;
}

/** The next `max` events from `now`, grouped by the day they start (today first). */
export function upcomingDays(snap: Snapshot, now: Date, max = MAX_EVENTS): GlanceDay[] {
  const until = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 120);
  const occs = expandEvents(
    snap.events.filter((e) => !e.deletedAt),
    now,
    until,
  )
    .filter((o) => o.end.getTime() >= now.getTime())
    .slice(0, max);
  const days = personalDays(snap.days);
  const out: GlanceDay[] = [];
  for (const o of occs) {
    // A multi-day event that already started counts for today.
    const date = o.start < now ? toISODate(now) : toISODate(o.start);
    let day = out.find((d) => d.date === date);
    if (!day) out.push((day = { date, occs: [], entry: days.find((d) => d.date === date) }));
    day.occs.push(o);
  }
  return out;
}

function Glance() {
  const bridge = window.bloomDesktop!;
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bridge.load().then(setSnap);
    return bridge.onChange(setSnap);
  }, [bridge]);

  const lang = snap?.settings.language ?? 'en';
  const t = (k: StringKey, v?: Record<string, string | number>) => translate(lang, k, v);
  const locale = localeFor(lang);
  const now = useMemo(() => new Date(), [snap]);
  const days = useMemo(() => (snap ? upcomingDays(snap, now) : []), [snap, now]);
  const doses = useMemo(() => (snap ? glanceDoses(snap, now) : []), [snap, now]);
  const empty = days.length === 0 && doses.length === 0;

  useEffect(() => {
    if (!snap) return;
    const dark = snap.settings.theme === 'system' ? window.matchMedia('(prefers-color-scheme: dark)').matches : snap.settings.theme === 'dark';
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.dataset.fontSize = snap.settings.fontSize ?? 'medium';
    document.documentElement.lang = lang;
    document.documentElement.dir = dirFor(lang);
    setCustomMonthColors(snap.settings.monthColors);
    // Nothing coming up: no window at all.
    if (empty) bridge.glance.close();
  }, [snap, empty, lang, bridge]);

  useLayoutEffect(() => {
    if (ref.current && !empty) bridge.glance.resize(ref.current.getBoundingClientRect().height);
  });

  if (!snap || empty) return null;
  const today = toISODate(now);
  const tomorrow = toISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const dayName = (iso: string) =>
    iso === today ? t('today') : iso === tomorrow ? t('tomorrow') : parseISODate(iso).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' });
  const time = (d: Date) => d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div ref={ref} className="glance" role="dialog" aria-label={t('glanceTitle')}>
      <StickerDefs />
      <header className="glance-head">
        <span className="glance-logo" aria-hidden="true">
          b
        </span>
        <strong>{t('glanceTitle')}</strong>
        <button type="button" className="glance-x" aria-label={t('close')} title={t('close')} onClick={() => bridge.glance.close()}>
          ✕
        </button>
      </header>
      <div className="glance-days">
        {days.map((day) => {
          const d = parseISODate(day.date);
          const m = d.getMonth();
          const todos = (day.entry?.cards ?? []).filter((c) => c.kind === 'checklist').flatMap((c) => c.items.filter((i) => i.text.trim()));
          const done = todos.filter((i) => i.done).length;
          const notes = (day.entry?.cards ?? []).filter((c) => c.kind === 'text' && c.text.trim()).map((c) => stripMarks(c.text).trim());
          const stickers = [
            ...(day.entry?.stickers ?? []),
            ...repeatingStickersOn(
              snap.events.filter((e) => !e.deletedAt && e.stickers?.length && day.occs.some((o) => o.event.id === e.id && toISODate(o.start) === day.date)),
              day.date,
            ).map((r) => r.st),
          ];
          const cds = countdownsOn(snap.countdowns, day.date);
          return (
            <button type="button" key={day.date} className="glance-day" onClick={() => bridge.glance.open(day.date)}>
              <span className="glance-sq calendar-light" style={{ background: dayColor(d), color: inkOf(monthColor(m), 'strong') }}>
                <span className="glance-num">{d.getDate()}</span>
                {stickers.slice(0, 3).map((st) => {
                  const size = Math.max(32, Math.min(48, Math.round(st.size * 0.9)));
                  return (
                    <span
                      key={st.id}
                      className="glance-sticker"
                      style={{ left: `clamp(${size / 2}px, ${st.x * 100}%, calc(100% - ${size / 2}px))`, top: `clamp(${size / 2}px, ${st.y * 100}%, calc(100% - ${size / 2}px))`, transform: `translate(-50%, -50%) rotate(${st.rot}deg)` }}
                    >
                      <StickerArt kind={st.kind} size={size} />
                    </span>
                  );
                })}
                {todos.length > 0 && (
                  <span className={`glance-todo ${done === todos.length ? 'all-done' : ''}`}>
                    ✓{done}/{todos.length}
                  </span>
                )}
              </span>
              <span className="glance-info">
                <span className="glance-dayname">{dayName(day.date)}</span>
                {cds.map((c) => (
                  <span key={c.id} className="glance-cd" dir="auto">
                    <CountdownIcon value={c.emoji} size={18} /> {c.title}
                  </span>
                ))}
                {day.occs.map((o) => (
                  <span key={o.key} className={`glance-ev ev-${o.event.color}`}>
                    <i className="glance-dot" aria-hidden="true" />
                    <span className="glance-time">{o.event.allDay ? t('allDay') : time(o.start)}</span>
                    <span className="glance-title" dir="auto">
                      {o.event.title || '—'}
                    </span>
                    {o.event.repeat !== 'none' && <span aria-hidden="true">↻</span>}
                  </span>
                ))}
                {notes.slice(0, 2).map((n, i) => (
                  <span key={i} className="glance-note" dir="auto">
                    📝 {n.split('\n')[0]}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
        {doses.length > 0 && (
          <button type="button" className="glance-day glance-health" onClick={() => bridge.glance.open(today)}>
            <span className="glance-pill" aria-hidden="true">
              💊
            </span>
            <span className="glance-info">
              <span className="glance-dayname">{t('hlMeds')}</span>
              {doses.map((d, i) => (
                <span key={i} className="glance-ev">
                  <span className="glance-time">{d.time}</span>
                  <span className="glance-title" dir="auto">
                    {d.label || t('hlMedication')}
                  </span>
                </span>
              ))}
            </span>
          </button>
        )}
      </div>
      <footer className="glance-foot">
        <button type="button" className="glance-open" onClick={() => bridge.glance.open(today)}>
          {t('openBloom')}
        </button>
      </footer>
    </div>
  );
}

const root = document.getElementById('glance');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Glance />
    </StrictMode>,
  );
}
