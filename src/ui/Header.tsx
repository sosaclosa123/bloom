import { forwardRef, useMemo, useState } from 'react';
import { formatDuration, type StringKey } from '../i18n/strings';
import { addDays, parseISODate, startOfWeek } from '../shared/dates';
import { parseQuickAdd } from '../shared/quickAdd';
import { newMeta } from '../shared/db';
import { Button, IconButton, Segmented } from './common';
import { useBloom } from './store';

export type ViewMode = 'month' | 'week';

interface Props {
  view: ViewMode;
  anchor: Date;
  onView: (v: ViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onNewEvent: () => void;
  onSearch: () => void;
  onSettings: () => void;
  onQuickAdded: (date: string) => void;
  isDesktop: boolean;
}

export const Header = forwardRef<HTMLInputElement, Props>(function Header(p, quickRef) {
  const { t, locale, settings } = useBloom();

  const title = useMemo(() => {
    if (p.view === 'month') return p.anchor.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    const s = startOfWeek(p.anchor, settings.weekStart);
    const e = addDays(s, 6);
    const sameMonth = s.getMonth() === e.getMonth();
    const a = s.toLocaleDateString(locale, { day: 'numeric', month: sameMonth ? undefined : 'short' });
    const b = e.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    return `${a} – ${b}`;
  }, [p.view, p.anchor, locale, settings.weekStart]);

  return (
    <header className={`header ${p.isDesktop ? 'desktop' : ''}`}>
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="22" height="22">
            <g transform="translate(16 16)">
              {[0, 72, 144, 216, 288].map((r) => (
                <ellipse key={r} rx="5.2" ry="8.4" cy="-7.2" transform={`rotate(${r})`} fill="var(--brand-petal)" />
              ))}
              <circle r="4" fill="var(--brand-center)" />
            </g>
          </svg>
        </span>
        <span className="brand-name">Bloom</span>
      </div>

      <div className="nav">
        <Button size="sm" onClick={p.onToday}>
          {t('today')}
        </Button>
        <div className="nav-arrows">
          <IconButton icon={settings.language === 'he' ? 'chevronRight' : 'chevronLeft'} label={t('prev')} onClick={p.onPrev} />
          <IconButton icon={settings.language === 'he' ? 'chevronLeft' : 'chevronRight'} label={t('next')} onClick={p.onNext} />
        </div>
        <h1 className="period-title">{title}</h1>
      </div>

      <QuickAdd ref={quickRef} onAdded={p.onQuickAdded} />

      <div className="header-actions">
        <Segmented
          value={p.view}
          onChange={p.onView}
          label={t('month')}
          options={[
            { value: 'month', label: t('month') },
            { value: 'week', label: t('week') },
          ]}
        />
        <IconButton icon="search" label={`${t('search')} (Ctrl+K)`} onClick={p.onSearch} />
        <IconButton icon="settings" label={t('settings')} onClick={p.onSettings} />
        <Button variant="primary" icon="plus" onClick={p.onNewEvent} className="new-btn">
          <span className="new-label">{t('newEvent')}</span>
        </Button>
      </div>
    </header>
  );
});

const QuickAdd = forwardRef<HTMLInputElement, { onAdded: (date: string) => void }>(function QuickAdd({ onAdded }, ref) {
  const { t, locale, settings, save, toast } = useBloom();
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text) : null), [text]);

  const submit = () => {
    if (!parsed || !parsed.title) return;
    const allDay = !parsed.start;
    const remind = parsed.remindBefore ?? (allDay ? [] : settings.defaultRemindBefore);
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
      remindBefore: remind,
      sound: settings.defaultSound,
    });
    toast(`${t('saved')}: ${parsed.title}`);
    setText('');
    onAdded(parsed.date);
  };

  const dateLabel = parsed ? parseISODate(parsed.date).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }) : '';

  return (
    <div className="quick-add">
      <input
        ref={ref}
        value={text}
        placeholder={t('quickAddPlaceholder')}
        aria-label={t('quickAddPlaceholder')}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') {
            setText('');
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      {focused && parsed && parsed.title && (
        <div className="quick-preview" role="status">
          <span className="qp-title">{parsed.title}</span>
          <span className="qp-chip">{dateLabel}</span>
          <span className="qp-chip">{parsed.start ? `${parsed.start}–${parsed.end}` : t('quickAddAllDay')}</span>
          {parsed.repeat !== 'none' && <span className="qp-chip">{t(`repeat_${parsed.repeat}` as StringKey)}</span>}
          {parsed.remindBefore && parsed.remindBefore.length > 0 && (
            <span className="qp-chip">🔔 {formatDuration(settings.language, parsed.remindBefore[0])}</span>
          )}
          <span className="qp-hint">{t('quickAddHint')} ↵</span>
        </div>
      )}
    </div>
  );
});
