import { useCallback, useEffect, useRef, useState } from 'react';
import { isPhone, platform } from '../platform/api';
import { addDays, addMonths, parseISODate, toISODate } from '../shared/dates';
import { newMeta, personalDays } from '../shared/db';
import { expandEvents, type EventOccurrence } from '../shared/recurrence';
import type { CalendarEvent, Countdown, FiredAlert, HealthCheckin, ISODate, Reminder } from '../shared/types';
import { AlertCards } from './AlertCards';
import type { ReminderOccurrence } from './calendarData';
import { Button, Icon, Toasts } from './common';
import { DayDrawer, type DrawerTab } from './DayDrawer';
import { newCountdown, newEvent, newReminder } from './drafts';
import { CountdownEditor, EventEditor, ReminderEditor } from './editors';
import { Header, type CalView, type Tab } from './Header';
import { NotePopover, type NotePopState } from './NotePopover';
import { addSticker, stickerKey, StickerDefs, StickerPicker } from './Stickers';
import { MonthView } from './MonthView';
import { Search } from './Search';
import { SettingsPanel, type SettingsTab } from './Settings';
import { CountdownsPage, NavRail, UpcomingPage } from './Pages';
import { playSound } from './sound';
import { startSync } from './sync';
import { useBloom } from './store';
import { UpdateBanner } from './Updates';
import { SettingsAskModal } from './SettingsAsk';
import { WalletPage } from './Wallet';
import { HealthPage } from './Health';
import { SeasonBackdrop } from './season';
import { WeekView } from './WeekView';
import { YearView } from './YearView';
import { useWindowControls } from './windowControls';
import { PHONE_ANIM_MS, PhoneDaySheet, useSwipe } from './phone';

type ModalState =
  | { kind: 'event'; ev: CalendarEvent; isNew: boolean }
  | { kind: 'reminder'; r: Reminder; isNew: boolean }
  | { kind: 'countdown'; c: Countdown; isNew: boolean }
  | { kind: 'settings'; tab?: SettingsTab }
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

/** Repeating events that start on `date` (a sticker added there can repeat with them). */
function repeatingEventsOn(events: CalendarEvent[], date: ISODate): CalendarEvent[] {
  const day = parseISODate(date);
  const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
  const seen = new Set<string>();
  return expandEvents(events.filter((e) => !e.deletedAt && e.repeat !== 'none'), day, next)
    .filter((o) => toISODate(o.start) === date && !seen.has(o.event.id) && seen.add(o.event.id))
    .map((o) => o.event);
}

export function App() {
  const { snap, settings, t, save } = useBloom();
  const [tab, setTab] = useState<Tab>(() => {
    const v = load<string>('bloom-tab', 'calendar');
    return (['calendar', 'upcoming', 'countdowns', 'wallet', 'health'].includes(v) ? v : 'calendar') as Tab;
  });
  const [view, setView] = useState<CalView>(() => load('bloom-view', 'month'));
  const [drawer, setDrawer] = useState<{ tab?: DrawerTab; autoAdd?: 'todo' | 'note'; n: number }>({ n: 0 });
  const [anchor, setAnchor] = useState(() => new Date());
  const [openDay, setOpenDayRaw] = useState<ISODate | null>(null);
  // Phone: the day panel slides away (and the month grows back) before it's removed.
  const [sheetClosing, setSheetClosing] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const setOpenDay = useCallback((d: ISODate | null) => {
    clearTimeout(closeTimer.current);
    if (d === null && isPhone) {
      setSheetClosing(true);
      closeTimer.current = setTimeout(() => {
        setOpenDayRaw(null);
        setSheetClosing(false);
      }, PHONE_ANIM_MS + 30);
      return;
    }
    setSheetClosing(false);
    setOpenDayRaw(d);
  }, []);
  const [modal, setModal] = useState<ModalState>(null);
  const [notePop, setNotePop] = useState<NotePopState | null>(null);
  const [stickerPick, setStickerPick] = useState<{ date: ISODate; anchor: HTMLElement } | null>(null);
  const [selectedSticker, setSelectedSticker] = useState<string | null>(null);
  // Clicking anywhere that isn't a sticker deselects it.
  // While hidden in the tray: pause every animation (nothing is on screen anyway).
  useEffect(() => {
    let trayHidden = false;
    const apply = () => document.documentElement.classList.toggle('app-hidden', trayHidden || document.visibilityState === 'hidden');
    apply();
    document.addEventListener('visibilitychange', apply);
    const off = platform.onHidden((h) => {
      trayHidden = h;
      apply();
    });
    return () => {
      document.removeEventListener('visibilitychange', apply);
      off();
    };
  }, []);
  useWindowControls(platform.kind === 'desktop');
  useEffect(() => {
    const onDown = (e: PointerEvent) => !(e.target as HTMLElement).closest?.('.placed-sticker') && setSelectedSticker(null);
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, []);
  const openNotes = useCallback(
    (date: ISODate, anchor: HTMLElement, mode: 'view' | 'new' | 'todos') => setNotePop((p) => ({ date, anchor, mode, n: (p?.n ?? 0) + 1 })),
    [],
  );
  const [missed, setMissed] = useState<FiredAlert[]>([]);
  const [pageAlerts, setPageAlerts] = useState<FiredAlert[]>([]);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const snapRef = useRef(snap);
  snapRef.current = snap;

  useEffect(() => {
    try {
      localStorage.setItem('bloom-view', view);
      localStorage.setItem('bloom-tab', tab);
    } catch {
      /* ignore */
    }
  }, [view, tab]);

  // "Answer the health questions again" in Settings: go to Health (it opens the questions).
  useEffect(() => {
    const go = () => {
      setModal(null);
      setTab('health');
    };
    window.addEventListener('bloom:health-redo', go);
    return () => window.removeEventListener('bloom:health-redo', go);
  }, []);

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
    (dir: 1 | -1) =>
      setAnchor((a) =>
        view === 'year' ? new Date(a.getFullYear() + dir, a.getMonth(), 1) : view === 'month' ? addMonths(new Date(a.getFullYear(), a.getMonth(), 1), dir) : addDays(a, 7 * dir),
      ),
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
    // Phone: the day panel lives under the month.
    if (isPhone) {
      setTab('calendar');
      setView('month');
    }
  }, [setOpenDay]);
  const openDayRef = useRef(openDay);
  openDayRef.current = sheetClosing ? null : openDay;
  /** Open a day in the panel, optionally on a tab and adding something. */
  const openDayAt = useCallback((date: ISODate, dtab?: DrawerTab, autoAdd?: 'todo' | 'note') => {
    // Phone: tapping the open day again closes it.
    if (isPhone && !dtab && !autoAdd && openDayRef.current === date) return setOpenDay(null);
    setAnchor(parseISODate(date));
    setOpenDay(date);
    if (isPhone) setView('month');
    setDrawer((d) => ({ tab: dtab, autoAdd, n: isPhone && openDayRef.current && !dtab && !autoAdd ? d.n : d.n + 1 }));
  }, [setOpenDay]);
  const editCountdown = useCallback(
    (c: Countdown | null) =>
      setModal(c ? { kind: 'countdown', c, isNew: false } : { kind: 'countdown', c: newCountdown(toISODate(addDays(new Date(), 30))), isNew: true }),
    [],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'f')) {
        e.preventDefault();
        setModal({ kind: 'search' });
        return;
      }
      if (modal || isTyping(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) return;
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
        case 'y':
          setTab('calendar');
          setView('year');
          break;
        case 'n':
          createEvent(openDay ?? toISODate(new Date()));
          e.preventDefault();
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
  }, [modal, go, createEvent, openDay]);

  /** "Taken" on a medicine reminder / "+ glass" on a water nudge. */
  const markTaken = (a: FiredAlert) => {
    const cur = snapRef.current;
    if (a.kind === 'water') {
      const date = a.when.slice(0, 10);
      const all = cur.health.filter((h) => !h.deletedAt);
      const glass = (all.find((h) => h.kind === 'profile') as { glassMl?: number } | undefined)?.glassMl || 250;
      const day = all.filter((h): h is HealthCheckin => h.kind === 'checkin' && h.date === date).sort((x, y) => y.updatedAt - x.updatedAt)[0];
      save('health', day ? { ...day, waterMl: day.waterMl + glass } : { ...newMeta(), kind: 'checkin', date, waterMl: glass, mood: null, sleepH: null, energy: null, stress: null });
    }
    if (a.kind === 'med') save('health', { ...newMeta(), kind: 'taken', medId: a.sourceId, date: a.when.slice(0, 10), time: a.when.slice(11, 16) });
  };
  const markTakenRef = useRef(markTaken);
  markTakenRef.current = markTaken;

  // Android back button: close the top-most thing, then go back to the calendar, then leave.
  const backRef = useRef<() => void>(() => {});
  backRef.current = () => {
    if (notePop) return setNotePop(null);
    if (stickerPick) return setStickerPick(null);
    if (document.querySelector('.scrim, [role="dialog"]')) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return;
    }
    if (openDay) return setOpenDay(null);
    if (tab !== 'calendar') return setTab('calendar');
    if (view !== 'month') return setView('month');
    platform.exitApp();
  };
  useEffect(() => {
    const offs = [platform.onBackButton(() => backRef.current()), platform.onAlertTaken((a) => markTakenRef.current(a))];
    return () => offs.forEach((off) => off());
  }, []);

  // Phone: swipe the calendar sideways to change month / week / year.
  const contentRef = useRef<HTMLDivElement>(null);
  useSwipe(contentRef, isPhone && tab === 'calendar', settings.language === 'he', (dir) => go(dir));

  const findEvent = (id: string) => snap.events.find((e) => e.id === id);
  const findReminder = (id: string) => snap.reminders.find((r) => r.id === id);

  return (
    <div className={`app ${openDay ? 'drawer-open' : ''} ${platform.kind} ${isPhone ? 'phone' : ''} ${isPhone && openDay && !sheetClosing ? 'day-open' : ''}`}>
      <NavRail
        tab={tab}
        onTab={(x) => {
          if (isPhone && openDay) setOpenDay(null);
          setTab(x);
        }}
        onSettings={() => setModal({ kind: 'settings' })}
        badge={missed.length}
      />
      <div className="shell">
        <Header
          tab={tab}
          view={view}
          anchor={anchor}
          onView={setView}
          onPrev={() => go(-1)}
          onNext={() => go(1)}
          onToday={() => setAnchor(new Date())}
          onSearch={() => setModal({ kind: 'search' })}
          isDesktop={platform.kind === 'desktop'}
          phone={isPhone}
          onSettings={() => setModal({ kind: 'settings' })}
        />
        <div className="main">
          <div className="content" ref={contentRef}>
            {/* Calendar: the season of the month on screen. Other pages: today's season. */}
            <SeasonBackdrop month={tab === 'calendar' ? anchor.getMonth() : new Date().getMonth()} count={isPhone ? 12 : undefined} />
            {missed.length > 0 && (
              <div className="missed-bar" role="status">
                <Icon name="gamepad" size={16} />
                <strong>{missed.length === 1 ? t('missedOne') : t('missedBanner', { n: missed.length })}</strong>
                <span className="missed-list">{missed.map((m) => m.title || (m.kind === 'med' ? t('hlMedication') : m.kind === 'weigh' ? t('hlNudgeWeigh') : '—')).join(' · ')}</span>
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
            {tab === 'health' ? (
              <HealthPage onOpenSettings={() => setModal({ kind: 'settings', tab: 'health' })} />
            ) : tab === 'wallet' ? (
              <WalletPage />
            ) : tab === 'upcoming' ? (
              <UpcomingPage onOpenDay={showDay} onOpenEvent={openEvent} onOpenReminder={openReminder} />
            ) : tab === 'countdowns' ? (
              <CountdownsPage onEdit={editCountdown} />
            ) : view === 'year' ? (
              <YearView
                year={anchor.getFullYear()}
                onOpenMonth={(m) => {
                  setAnchor(new Date(anchor.getFullYear(), m, 1));
                  setView('month');
                }}
                onOpenDay={(d) => {
                  setView('month');
                  openDayAt(d);
                }}
              />
            ) : view === 'month' ? (
              <MonthView anchor={anchor} selected={openDay} onOpenDay={(d) => openDayAt(d)} onOpenEvent={openEvent}
                onOpenNotes={openNotes}
                onOpenStickers={(date, el) => setStickerPick({ date, anchor: el })}
                selectedSticker={selectedSticker}
                onSelectSticker={setSelectedSticker}
                phone={isPhone}
                frozen={isPhone && !!openDay}
              />
            ) : (
              <WeekView
                anchor={anchor}
                selected={openDay}
                onOpenDay={(d) => openDayAt(d)}
                onOpenEvent={openEvent}
                onOpenReminder={openReminder}
                onCreateAt={(d, time) => createEvent(d, time)}
                onOpenNotes={openNotes}
              />
            )}
          </div>
          {openDay && isPhone && (
            <PhoneDaySheet closing={sheetClosing} onClose={() => setOpenDay(null)} onSticker={(el) => setStickerPick({ date: openDay, anchor: el })}>
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
              />
            </PhoneDaySheet>
          )}
          {openDay && !isPhone && (
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
          repeatOptions={repeatingEventsOn(snap.events, stickerPick.date).map((e) => ({ id: e.id, title: e.title }))}
          onPick={(kind, repeatWith) => {
            const ev = repeatWith ? snap.events.find((e) => e.id === repeatWith && !e.deletedAt) : undefined;
            if (ev) {
              // Repeats with the event from this day on.
              const { entry } = addSticker(undefined, stickerPick.date, kind);
              const st = { ...entry.stickers![0], from: stickerPick.date };
              save('events', { ...ev, stickers: [...(ev.stickers ?? []), st] });
              setSelectedSticker(stickerKey(st.id, stickerPick.date, true));
            } else {
              const { entry, id } = addSticker(personalDays(snap.days).find((d) => d.date === stickerPick.date), stickerPick.date, kind);
              save('days', entry);
              setSelectedSticker(id);
            }
            setStickerPick(null);
          }}
        />
      )}
      <StickerDefs />
      {notePop && <NotePopover key={`${notePop.date}-${notePop.n}`} state={notePop} onClose={() => setNotePop(null)} />}
      {modal?.kind === 'settings' && <SettingsPanel initialTab={modal.tab} onClose={() => setModal(null)} />}
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
            onTaken={(key) => {
              const a = pageAlerts.find((x) => x.key === key);
              if (a) markTaken(a);
              setPageAlerts((p) => p.filter((x) => x.key !== key));
            }}
            onOpen={(d) => {
              setPageAlerts([]);
              showDay(d);
            }}
          />
        </div>
      )}
      {isPhone && tab === 'calendar' && !openDay && (
        <button type="button" className="phone-fab" aria-label={t('newEvent')} title={t('newEvent')} onClick={() => createEvent(toISODate(anchor.getMonth() === new Date().getMonth() && anchor.getFullYear() === new Date().getFullYear() ? new Date() : anchor))}>
          <Icon name="plus" size={24} />
        </button>
      )}
      <SettingsAskModal />
      <UpdateBanner />
      <Toasts />
    </div>
  );
}
