import { useCallback, useEffect, useRef, useState } from 'react';
import { platform } from '../platform/api';
import { addDays, addMonths, parseISODate, toISODate } from '../shared/dates';
import type { EventOccurrence } from '../shared/recurrence';
import type { CalendarEvent, Countdown, FiredAlert, ISODate, Reminder } from '../shared/types';
import { AlertCards } from './AlertCards';
import type { ReminderOccurrence } from './calendarData';
import { Button, Icon, Toasts } from './common';
import { DayDrawer, type DrawerTab } from './DayDrawer';
import { newCountdown, newEvent, newReminder } from './drafts';
import { CountdownEditor, EventEditor, ReminderEditor } from './editors';
import { Header, type AddKind, type CalView, type Tab } from './Header';
import { JournalModal } from './JournalModal';
import { NotePopover, type NotePopState } from './NotePopover';
import { addSticker, StickerDefs, StickerPicker } from './Stickers';
import { MonthView } from './MonthView';
import { Search } from './Search';
import { SettingsPanel } from './Settings';
import { CountdownsPage, NavRail, UpcomingPage } from './Pages';
import { playSound } from './sound';
import { startSync } from './sync';
import { useBloom } from './store';
import { UpdateBanner } from './Updates';
import { WalletPage } from './Wallet';
import { WeekView } from './WeekView';

type ModalState =
  | { kind: 'event'; ev: CalendarEvent; isNew: boolean }
  | { kind: 'reminder'; r: Reminder; isNew: boolean }
  | { kind: 'countdown'; c: Countdown; isNew: boolean }
  | { kind: 'settings' }
  | { kind: 'search' }
  | null;

function load<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
}

const isTyping = (el: Element | null) =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable);

export function App() {
  const { snap, settings, t, save } = useBloom();
  const [tab, setTab] = useState<Tab>(() => {
    const v = load<string>('bloom-tab', 'calendar');
    return (['calendar', 'upcoming', 'countdowns', 'wallet'].includes(v) ? v : 'calendar') as Tab;
  });
  const [view, setView] = useState<CalView>(() => load('bloom-view', 'month'));
  const [addOpen, setAddOpen] = useState(false);
  const [drawer, setDrawer] = useState<{ tab?: DrawerTab; autoAdd?: 'todo' | 'note'; n: number }>({ n: 0 });
  const [anchor, setAnchor] = useState(() => new Date());
  const [openDay, setOpenDay] = useState<ISODate | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [journalDate, setJournalDate] = useState<ISODate | null>(null);
  const [notePop, setNotePop] = useState<NotePopState | null>(null);
  const [stickerPick, setStickerPick] = useState<{ date: ISODate; anchor: HTMLElement } | null>(null);
  const [selectedSticker, setSelectedSticker] = useState<string | null>(null);
  // Clicking anywhere that isn't a sticker deselects it.
  useEffect(() => {
    const onDown = (e: PointerEvent) => !(e.target as HTMLElement).closest?.('.placed-sticker') && setSelectedSticker(null);
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, []);
  const openNotes = useCallback(
    (date: ISODate, anchor: HTMLElement, mode: 'view' | 'new') => setNotePop((p) => ({ date, anchor, mode, n: (p?.n ?? 0) + 1 })),
    [],
  );
  const [missed, setMissed] = useState<FiredAlert[]>([]);
  const [pageAlerts, setPageAlerts] = useState<FiredAlert[]>([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    try {
      localStorage.setItem('bloom-view', view);
      localStorage.setItem('bloom-tab', tab);
    } catch {
      /* ignore */
    }
  }, [view, tab]);

  // Platform events
  useEffect(() => {
    void startSync();
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
  /** Open a day in the panel, optionally on a tab and adding something. */
  const openDayAt = useCallback((date: ISODate, dtab?: DrawerTab, autoAdd?: 'todo' | 'note') => {
    setAnchor(parseISODate(date));
    setOpenDay(date);
    setDrawer((d) => ({ tab: dtab, autoAdd, n: d.n + 1 }));
  }, []);
  const editCountdown = useCallback(
    (c: Countdown | null) =>
      setModal(c ? { kind: 'countdown', c, isNew: false } : { kind: 'countdown', c: newCountdown(toISODate(addDays(new Date(), 30))), isNew: true }),
    [],
  );
  const addDate = openDay ?? toISODate(new Date());
  const add = (kind: AddKind) => {
    if (kind === 'event') createEvent(addDate);
    if (kind === 'reminder') createReminder(addDate);
    if (kind === 'todo') openDayAt(addDate, 'todo', 'todo');
    if (kind === 'note') openDayAt(addDate, 'notes', 'note');
    if (kind === 'journal') setJournalDate(addDate);
    if (kind === 'countdown') editCountdown(null);
    if (kind === 'sticker') {
      // Show the month that has this day, then open the picker on its square.
      setTab('calendar');
      setView('month');
      setAnchor(parseISODate(addDate));
      setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`.cell[data-date="${addDate}"]`);
        if (el) setStickerPick({ date: addDate, anchor: el });
      }, 60);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'f')) {
        e.preventDefault();
        setModal({ kind: 'search' });
        return;
      }
      if (modal || journalDate || addOpen || isTyping(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) return;
      const rtl = settingsRef.current.language === 'he';
      switch (e.key) {
        case 't':
          setTab('calendar');
          setAnchor(new Date());
          break;
        case 'm':
          setTab('calendar');
          setView('month');
          break;
        case 'w':
          setTab('calendar');
          setView('week');
          break;
        case 'n':
          createEvent(openDay ?? toISODate(new Date()));
          e.preventDefault();
          break;
        case '/':
        case 'q':
        case '+':
          e.preventDefault();
          setAddOpen(true);
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
  }, [modal, journalDate, addOpen, go, createEvent, openDay]);

  const findEvent = (id: string) => snap.events.find((e) => e.id === id);
  const findReminder = (id: string) => snap.reminders.find((r) => r.id === id);

  return (
    <div className={`app ${openDay ? 'drawer-open' : ''} ${platform.kind}`}>
      <NavRail tab={tab} onTab={setTab} onSettings={() => setModal({ kind: 'settings' })} badge={missed.length} />
      <div className="shell">
        <Header
          tab={tab}
          view={view}
          anchor={anchor}
          addDate={addDate}
          onView={setView}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          onToday={() => setAnchor(new Date())}
          onSearch={() => setModal({ kind: 'search' })}
          onAdd={add}
          onQuickAdded={(d) => setAnchor(parseISODate(d))}
          addOpen={addOpen}
          setAddOpen={setAddOpen}
          isDesktop={platform.kind === 'desktop'}
        />
        <div className="main">
          <div className="content">
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
            {tab === 'wallet' ? (
              <WalletPage />
            ) : tab === 'upcoming' ? (
              <UpcomingPage onOpenDay={showDay} onOpenEvent={openEvent} onOpenReminder={openReminder} />
            ) : tab === 'countdowns' ? (
              <CountdownsPage onEdit={editCountdown} />
            ) : view === 'month' ? (
              <MonthView anchor={anchor} selected={openDay} onOpenDay={(d) => openDayAt(d)} onOpenEvent={openEvent}
                onOpenJournal={setJournalDate}
                onOpenNotes={openNotes}
                onOpenStickers={(date, el) => setStickerPick({ date, anchor: el })}
                selectedSticker={selectedSticker}
                onSelectSticker={setSelectedSticker}
              />
            ) : (
              <WeekView
                anchor={anchor}
                selected={openDay}
                onOpenDay={(d) => openDayAt(d)}
                onOpenEvent={openEvent}
                onOpenReminder={openReminder}
                onCreateAt={(d, time) => createEvent(d, time)}
                onOpenJournal={setJournalDate}
                onOpenNotes={openNotes}
              />
            )}
          </div>
          {openDay && (
            <DayDrawer
              key={`${openDay}-${drawer.n}`}
              date={openDay}
              initialTab={drawer.tab}
              autoAdd={drawer.autoAdd}
              onClose={() => setOpenDay(null)}
              onOpenEvent={openEvent}
              onNewEvent={(d) => createEvent(d)}
              onOpenReminder={openReminder}
              onNewReminder={createReminder}
              onOpenJournal={setJournalDate}
            />
          )}
        </div>
      </div>

      {modal?.kind === 'event' && <EventEditor key={modal.ev.id} initial={modal.ev} isNew={modal.isNew} onClose={() => setModal(null)} />}
      {modal?.kind === 'reminder' && <ReminderEditor key={modal.r.id} initial={modal.r} isNew={modal.isNew} onClose={() => setModal(null)} />}
      {modal?.kind === 'countdown' && <CountdownEditor key={modal.c.id} initial={modal.c} isNew={modal.isNew} onClose={() => setModal(null)} />}
      {stickerPick && (
        <StickerPicker
          anchor={stickerPick.anchor}
          onClose={() => setStickerPick(null)}
          onPick={(kind) => {
            const { entry, id } = addSticker(snap.days.find((d) => d.date === stickerPick.date && !d.deletedAt), stickerPick.date, kind);
            save('days', entry);
            setSelectedSticker(id);
            setStickerPick(null);
          }}
        />
      )}
      <StickerDefs />
      {notePop && <NotePopover key={`${notePop.date}-${notePop.n}`} state={notePop} onClose={() => setNotePop(null)} />}
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
