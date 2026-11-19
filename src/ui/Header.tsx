// Top bar: page title (+ month navigation on the calendar), search and a
// single "＋" button that holds quick add and every "add" option.
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDuration, type StringKey } from '../i18n/strings';
import { addDays, parseISODate, startOfWeek } from '../shared/dates';
import { newMeta } from '../shared/db';
import { parseQuickAdd } from '../shared/quickAdd';
import type { ISODate } from '../shared/types';
import { Icon, IconButton, Segmented } from './common';
import { useBloom } from './store';

export type Tab = 'calendar' | 'upcoming' | 'journal' | 'countdowns';
export type CalView = 'month' | 'week';
export type AddKind = 'event' | 'reminder' | 'todo' | 'note' | 'journal' | 'countdown';

interface Props {
  tab: Tab;
  view: CalView;
  anchor: Date;
  addDate: ISODate;
  onView: (v: CalView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSearch: () => void;
  onAdd: (kind: AddKind) => void;
  onQuickAdded: (date: ISODate) => void;
  addOpen: boolean;
  setAddOpen: (open: boolean) => void;
  isDesktop: boolean;
}

export function Header(p: Props) {
  const { t, locale, settings } = useBloom();
  const rtl = settings.language === 'he';

  const title = useMemo(() => {
    if (p.tab !== 'calendar') return t(p.tab === 'upcoming' ? 'upcoming' : p.tab === 'journal' ? 'journal' : 'countdowns');
    if (p.view === 'month') return p.anchor.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    const s = startOfWeek(p.anchor, settings.weekStart);
    const e = addDays(s, 6);
    const sameMonth = s.getMonth() === e.getMonth();
    const a = s.toLocaleDateString(locale, { day: 'numeric', month: sameMonth ? undefined : 'short' });
    const b = e.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    return `${a} – ${b}`;
  }, [p.tab, p.view, p.anchor, locale, settings.weekStart, t]);

  return (
    <header className={`header ${p.isDesktop ? 'desktop' : ''}`}>
      <h1 className="period-title">{title}</h1>
      {p.tab === 'calendar' && (
        <div className="nav">
          <IconButton icon={rtl ? 'chevronRight' : 'chevronLeft'} label={t('prev')} onClick={p.onPrev} />
          <IconButton icon={rtl ? 'chevronLeft' : 'chevronRight'} label={t('next')} onClick={p.onNext} />
          <button type="button" className="today-btn" onClick={p.onToday}>
            {t('today')}
          </button>
        </div>
      )}
      <span className="spacer" />
      {p.tab === 'calendar' && (
        <Segmented
          value={p.view}
          onChange={p.onView}
          label={t('month')}
          options={[
            { value: 'month', label: t('month') },
            { value: 'week', label: t('week') },
          ]}
        />
      )}
      <IconButton icon="search" label={`${t('search')} (Ctrl+K)`} onClick={p.onSearch} />
      <AddMenu open={p.addOpen} setOpen={p.setAddOpen} date={p.addDate} onAdd={p.onAdd} onQuickAdded={p.onQuickAdded} />
    </header>
  );
}

const ADD_OPTIONS: { kind: AddKind; emoji: string; label: StringKey }[] = [
  { kind: 'event', emoji: '📅', label: 'tileEvent' },
  { kind: 'todo', emoji: '✅', label: 'tileTodo' },
  { kind: 'note', emoji: '📝', label: 'tileNote' },
  { kind: 'journal', emoji: '📖', label: 'tileJournal' },
  { kind: 'countdown', emoji: '⏳', label: 'tileCountdown' },
];

function AddMenu({
  open,
  setOpen,
  date,
  onAdd,
  onQuickAdded,
}: {
  open: boolean;
  setOpen: (o: boolean) => void;
  date: ISODate;
  onAdd: (k: AddKind) => void;
  onQuickAdded: (d: ISODate) => void;
}) {
  const { t, locale, settings, save, toast } = useBloom();
  const [text, setText] = useState('');
  const wrap = useRef<HTMLDivElement>(null);
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text) : null), [text]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  const submit = () => {
    if (!parsed || !parsed.title) return;
    const allDay = !parsed.start;
    save('events', {
      ...newMeta(),
      title: parsed.title,
      allDay,
      start: `${parsed.date}T${parsed.start ?? '00:00'}`,
      end: `${parsed.date}T${parsed.end ?? '23:59'}`,
      color: 'lilac',
      notes: '',
      location: '',
      repeat: parsed.repeat,
      remindBefore: parsed.remindBefore ?? (allDay ? [] : settings.defaultRemindBefore),
      sound: settings.defaultSound,
    });
    toast(`${t('saved')}: ${parsed.title}`);
    setText('');
    setOpen(false);
    onQuickAdded(parsed.date);
  };

  const dayLabel = parseISODate(date).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="add-wrap" ref={wrap}>
      <button type="button" className={`add-btn ${open ? 'open' : ''}`} aria-label={t('add')} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="plus" size={20} />
      </button>
      {open && (
        <div className="add-menu" role="menu">
          <input
            autoFocus
            className="add-quick"
            value={text}
            placeholder={t('quickAddPlaceholder')}
            aria-label={t('quickAddPlaceholder')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
          />
          {parsed?.title ? (
            <button type="button" className="add-preview" onClick={submit}>
              <span className="qp-title">{parsed.title}</span>
              <span className="qp-chip">{parseISODate(parsed.date).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
              <span className="qp-chip">{parsed.start ? `${parsed.start}–${parsed.end}` : t('quickAddAllDay')}</span>
              {parsed.repeat !== 'none' && <span className="qp-chip">{t(`repeat_${parsed.repeat}` as StringKey)}</span>}
              {parsed.remindBefore && parsed.remindBefore.length > 0 && (
                <span className="qp-chip">🔔 {formatDuration(settings.language, parsed.remindBefore[0])}</span>
              )}
              <span className="qp-hint">↵</span>
            </button>
          ) : (
            <>
              <div className="add-for">{t('addFor', { d: dayLabel })}</div>
              <div className="add-grid">
                {ADD_OPTIONS.map((o, i) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={o.kind}
                    className={`add-option opt-${o.kind}`}
                    style={{ ['--i' as string]: i }}
                    onClick={() => {
                      setOpen(false);
                      onAdd(o.kind);
                    }}
                  >
                    <span className="add-option-emoji" aria-hidden="true">
                      {o.emoji}
                    </span>
                    {t(o.label)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
