// Top bar: month navigation + title on the calendar, view switch and search.
import { useEffect, useMemo, useState } from 'react';
import { addDays, startOfWeek } from '../shared/dates';
import { IconButton, Segmented } from './common';
import { monthInk, SeasonLayer } from './season';
import { useBloom } from './store';

export type Tab = 'calendar' | 'upcoming' | 'countdowns' | 'wallet' | 'health';
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
  /** Phone layout: gear here (no side rail), view switch on a second row. */
  phone?: boolean;
  onSettings?: () => void;
}

export function Header(p: Props) {
  const { t, locale, settings, dark, setSettings } = useBloom();
  const rtl = settings.language === 'he';

  const title = useMemo(() => {
    if (p.tab !== 'calendar') return t(p.tab === 'upcoming' ? 'upcoming' : p.tab === 'wallet' ? 'wallet' : p.tab === 'health' ? 'health' : 'countdowns');
    if (p.view === 'year') return String(p.anchor.getFullYear());
    if (p.view === 'month') return p.anchor.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    const s = startOfWeek(p.anchor, settings.weekStart);
    const e = addDays(s, 6);
    const sameMonth = s.getMonth() === e.getMonth();
    const a = s.toLocaleDateString(locale, { day: 'numeric', month: sameMonth ? undefined : 'short' });
    const b = e.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    return `${a} – ${b}`;
  }, [p.tab, p.view, p.anchor, locale, settings.weekStart, t]);

  if (p.phone) {
    const cal = p.tab === 'calendar';
    return (
      <header className="header phone-header">
        <SeasonLayer month={cal ? p.anchor.getMonth() : new Date().getMonth()} />
        <div className="ph-row">
          {cal && <IconButton icon={rtl ? 'chevronRight' : 'chevronLeft'} label={t('prev')} onClick={p.onPrev} />}
          <h1 className={`period-title ${cal ? 'is-month' : ''}`} style={cal ? { color: monthInk(p.anchor.getMonth(), dark) } : undefined}>
            {title}
          </h1>
          {cal && <IconButton icon={rtl ? 'chevronLeft' : 'chevronRight'} label={t('next')} onClick={p.onNext} />}
          <span className="spacer" />
          <IconButton icon="search" label={t('search')} onClick={p.onSearch} />
          <IconButton icon="settings" label={t('settings')} onClick={p.onSettings ?? (() => {})} className="phone-gear" />
        </div>
        {cal && (
          <div className="ph-row ph-row2">
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
            <span className="spacer" />
            <button
              type="button"
              className={`hebdate-toggle ${settings.showHebrewDate ? 'on' : ''}`}
              aria-pressed={settings.showHebrewDate}
              title={t('showHebrewDate')}
              aria-label={t('showHebrewDate')}
              onClick={() => setSettings({ showHebrewDate: !settings.showHebrewDate })}
            >
              <span aria-hidden="true">א׳</span>
            </button>
            <button type="button" className="today-btn" onClick={p.onToday}>
              {t('today')}
            </button>
          </div>
        )}
      </header>
    );
  }

  return (
    <header className={`header ${p.isDesktop ? 'desktop' : ''}`}>
      {/* Calendar: the season of the month on screen. Other pages: today's season. */}
      <SeasonLayer month={p.tab === 'calendar' ? p.anchor.getMonth() : new Date().getMonth()} />
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
      <Clock />
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

/** Small live date + time pill (updates exactly on the minute). */
function Clock() {
  const { locale } = useBloom();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const d = new Date();
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 50);
    };
    schedule();
    // Catch up straight away after sleep / waking the PC.
    const onWake = () => setNow(new Date());
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, []);
  const time = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = `${now.getDate()}.${now.getMonth() + 1}`;
  return (
    <span className="clock-pill" dir="ltr" title={now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}>
      <b>{time}</b>
      <span className="clock-date">· {date}</span>
    </span>
  );
}
