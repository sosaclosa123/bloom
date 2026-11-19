import { useCallback, useEffect, useRef, useState } from 'react';
import { platform } from '../platform/api';
import { addDays, addMonths, parseISODate, toISODate } from '../shared/dates';
import type { EventOccurrence } from '../shared/recurrence';
import type { CalendarEvent, Countdown, FiredAlert, ISODate, Reminder } from '../shared/types';
import { AlertCards } from './AlertCards';
import type { ReminderOccurrence } from './calendarData';
import { Button, Icon, Toasts } from './common';
import { DayDrawer } from './DayDrawer';
import { newCountdown, newEvent, newReminder } from './drafts';
import { CountdownEditor, EventEditor, ReminderEditor } from './editors';
import { Header, type ViewMode } from './Header';
import { JournalPage } from './Journal';
import { JournalModal } from './JournalModal';
import { MonthView } from './MonthView';
import { Search } from './Search';
import { SettingsPanel } from './Settings';
import { Sidebar } from './Sidebar';
import { playSound } from './sound';
import { useBloom } from './store';
import { UpdateBanner } from './Updates';
import { WeekView } from './WeekView';

type ModalState =
  | { kind: 'event'; ev: CalendarEvent; isNew: boolean }
  | { kind: 'reminder'; r: Reminder; isNew: boolean }
  | { kind: 'countdown'; c: Countdown; isNew: boolean }
  | { kind: 'settings' }
  | { kind: 'search' }
  | null;

const isTyping = (el: Element | null) =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable);

export function App() {
  const { snap, settings, t } = useBloom();
  const [view, setView] = useState<ViewMode>(() => {
    try {
      return (localStorage.getItem('bloom-view') as ViewMode) || 'month';
    } catch {
      return 'month';
    }
  });
  const [anchor, setAnchor] = useState(() => new Date());
  const [openDay, setOpenDay] = useState<ISODate | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [journalDate, setJournalDate] = useState<ISODate | null>(null);
  const [missed, setMissed] = useState<FiredAlert[]>([]);
  const [pageAlerts, setPageAlerts] = useState<FiredAlert[]>([]);
  const quickRef = useRef<HTMLInputElement>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    try {
      localStorage.setItem('bloom-view', view);
    } catch {
      /* ignore */
    }
  }, [view]);

  // Platform events
  useEffect(() => {
    platform.getMissed().then(setMissed);
    const offs = [
      platform.onMissed(setMissed),
      platform.onPlaySound((id, soft) => playSound(id, settingsRef.current.volume, soft)),
      platform.onOpenDate((date) => {
        setAnchor(parseISODate(date));
        setOpenDay(date);
      }),
      platform.onInPageAlert((a) => setPageAlerts((p) => [...p, ...a])),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  const go = useCallback(
    (dir: 1 | -1) => setAnchor((a) => (view === 'month' ? addMonths(new Date(a.getFullYear(), a.getMonth(), 1), dir) : addDays(a, 7 * dir))),
    [view],
  );

  const openEvent = useCallback((o: EventOccurrence) => setModal({ kind: 'event', ev: o.event, isNew: false }), []);
  const openReminder = useCallback((r: ReminderOccurrence) => setModal({ kind: 'reminder', r: r.reminder, isNew: false }), []);
  const createEvent = useCallback(
    (date: ISODate, time?: string) => setModal({ kind: 'event', ev: newEvent(date, settingsRef.current, time), isNew: true }),
    [],
  );
  const createReminder = useCallback((date: ISODate) => setModal({ kind: 'reminder', r: newReminder(date, settingsRef.current), isNew: true }), []);
  const showDay = useCallback((date: ISODate) => {
    setAnchor(parseISODate(date));
    setOpenDay(date);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'f')) {
        e.preventDefault();
        setModal({ kind: 'search' });
        return;
      }
      if (modal || journalDate || isTyping(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) return;
      const rtl = settingsRef.current.language === 'he';
      switch (e.key) {
        case 't':
          setAnchor(new Date());
          break;
        case 'm':
          setView('month');
          break;
        case 'w':
          setView('week');
          break;
        case 'j':
          setView('journal');
          break;
        case 'n':
          createEvent(openDay ?? toISODate(new Date()));
          e.preventDefault();
          break;
        case '/':
        case 'q':
          e.preventDefault();
          quickRef.current?.focus();
          break;
        case 'ArrowLeft':
          go(rtl ? 1 : -1);
          break;
        case 'ArrowRight':
          go(rtl ? -1 : 1);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, journalDate, go, createEvent, openDay]);

  const findEvent = (id: string) => snap.events.find((e) => e.id === id);
  const findReminder = (id: string) => snap.reminders.find((r) => r.id === id);

  return (
    <div className={`app ${openDay ? 'drawer-open' : ''} ${platform.kind}`}>
      <Header
        ref={quickRef}
        view={view}
        anchor={anchor}
        onView={setView}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
        onToday={() => setAnchor(new Date())}
        onNewEvent={() => createEvent(openDay ?? toISODate(new Date()))}
        onSearch={() => setModal({ kind: 'search' })}
        onSettings={() => setModal({ kind: 'settings' })}
        onQuickAdded={(d) => setAnchor(parseISODate(d))}
        isDesktop={platform.kind === 'desktop'}
      />
      <div className="main">
        <Sidebar
          onOpenDay={showDay}
          onOpenEvent={openEvent}
          onOpenReminder={openReminder}
          onEditCountdown={(c) =>
            setModal(c ? { kind: 'countdown', c, isNew: false } : { kind: 'countdown', c: newCountdown(toISODate(addDays(new Date(), 30))), isNew: true })
          }
        />
        <div className="calendar">
          {missed.length > 0 && (
            <div className="missed-bar" role="status">
              <Icon name="gamepad" size={16} />
              <strong>{missed.length === 1 ? t('missedOne') : t('missedBanner', { n: missed.length })}</strong>
              <span className="missed-list">{missed.map((m) => m.title || '—').join(' · ')}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  platform.clearMissed();
                  setMissed([]);
                }}
              >
                {t('clear')}
              </Button>
            </div>
          )}
          {view === 'journal' ? (
            <JournalPage selected={journalDate} onOpenJournal={setJournalDate} />
          ) : view === 'month' ? (
            <MonthView anchor={anchor} selected={openDay} onOpenDay={setOpenDay} onOpenEvent={openEvent} onOpenJournal={setJournalDate} />
          ) : (
            <WeekView
              anchor={anchor}
              selected={openDay}
              onOpenDay={setOpenDay}
              onOpenEvent={openEvent}
              onOpenReminder={openReminder}
              onCreateAt={(d, time) => createEvent(d, time)}
              onOpenJournal={setJournalDate}
            />
          )}
        </div>
        {openDay && (
          <DayDrawer
            key={openDay}
            date={openDay}
            onClose={() => setOpenDay(null)}
            onOpenEvent={openEvent}
            onNewEvent={(d) => createEvent(d)}
            onOpenReminder={openReminder}
            onNewReminder={createReminder}
            onOpenJournal={setJournalDate}
          />
        )}
      </div>

      {modal?.kind === 'event' && <EventEditor key={modal.ev.id} initial={modal.ev} isNew={modal.isNew} onClose={() => setModal(null)} />}
      {modal?.kind === 'reminder' && <ReminderEditor key={modal.r.id} initial={modal.r} isNew={modal.isNew} onClose={() => setModal(null)} />}
      {modal?.kind === 'countdown' && <CountdownEditor key={modal.c.id} initial={modal.c} isNew={modal.isNew} onClose={() => setModal(null)} />}
      {journalDate && <JournalModal key="journal" date={journalDate} onClose={() => setJournalDate(null)} onChangeDate={setJournalDate} />}
      {modal?.kind === 'settings' && <SettingsPanel onClose={() => setModal(null)} />}
      {modal?.kind === 'search' && (
        <Search
          onClose={() => setModal(null)}
          onOpenDay={showDay}
          onOpenEventId={(id) => {
            const ev = findEvent(id);
            if (ev) {
              showDay(ev.start.slice(0, 10));
              setModal({ kind: 'event', ev, isNew: false });
            }
          }}
          onOpenReminderId={(id) => {
            const r = findReminder(id);
            if (r) {
              showDay(r.at.slice(0, 10));
              setModal({ kind: 'reminder', r, isNew: false });
            }
          }}
        />
      )}

      {pageAlerts.length > 0 && (
        <div className="page-alerts">
          <AlertCards
            alerts={pageAlerts}
            reason="now"
            lang={settings.language}
            snoozeOptions={settings.snoozeOptions}
            onSnooze={(key) => setPageAlerts((p) => p.filter((a) => a.key !== key))}
            onDismiss={(key) => setPageAlerts((p) => p.filter((a) => a.key !== key))}
            onDismissAll={() => setPageAlerts([])}
            onOpen={(d) => {
              setPageAlerts([]);
              showDay(d);
            }}
          />
        </div>
      )}
      <UpdateBanner />
      <Toasts />
    </div>
  );
}
