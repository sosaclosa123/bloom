// Top bar: month navigation + title on the calendar, view switch and search.
import { useMemo } from 'react';
import { addDays, startOfWeek } from '../shared/dates';
import { IconButton, Segmented } from './common';
import { monthInk, SeasonLayer } from './season';
import { useBloom } from './store';

export type Tab = 'calendar' | 'upcoming' | 'countdowns' | 'wallet';
export type CalView = 'month' | 'week' | 'year';

interface Props {
  tab: Tab;
  view: CalView;
  anchor: Date;
  onView: (v: CalView) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSearch: () => void;
  isDesktop: boolean;
}

export function Header(p: Props) {
  const { t, locale, settings, dark, setSettings } = useBloom();
  const rtl = settings.language === 'he';

  const title = useMemo(() => {
    if (p.tab !== 'calendar') return t(p.tab === 'upcoming' ? 'upcoming' : p.tab === 'wallet' ? 'wallet' : 'countdowns');
    if (p.view === 'year') return String(p.anchor.getFullYear());
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
      {p.tab === 'calendar' && <SeasonLayer month={p.anchor.getMonth()} />}
      {/* Arrows come first so they never move when the month name changes length. */}
      {p.tab === 'calendar' && (
        <div className="nav">
          <IconButton icon={rtl ? 'chevronRight' : 'chevronLeft'} label={t('prev')} onClick={p.onPrev} />
          <IconButton icon={rtl ? 'chevronLeft' : 'chevronRight'} label={t('next')} onClick={p.onNext} />
          <button type="button" className="today-btn" onClick={p.onToday}>
            {t('today')}
          </button>
        </div>
      )}
      <h1 className={`period-title ${p.tab === 'calendar' ? 'is-month' : ''}`} style={p.tab === 'calendar' ? { color: monthInk(p.anchor.getMonth(), dark) } : undefined}>
        {title}
      </h1>
      <span className="spacer" />
      {p.tab === 'calendar' && (
        <button
          type="button"
          className={`hebdate-toggle ${settings.showHebrewDate ? 'on' : ''}`}
          aria-pressed={settings.showHebrewDate}
          title={t('showHebrewDate')}
          onClick={() => setSettings({ showHebrewDate: !settings.showHebrewDate })}
        >
          <span aria-hidden="true">א׳</span>
          <span className="hebdate-label">{t('hebrewDates')}</span>
        </button>
      )}
      {p.tab === 'calendar' && (
        <Segmented
          value={p.view}
          onChange={p.onView}
          label={t('month')}
          options={[
            { value: 'month', label: t('month') },
            { value: 'week', label: t('week') },
            { value: 'year', label: t('year') },
          ]}
        />
      )}
      <IconButton icon="search" label={`${t('search')} (Ctrl+K)`} onClick={p.onSearch} />
    </header>
  );
}
