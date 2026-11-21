// Health tab: private health tracking (optional IBD / Crohn's part).
// Everything here is always private (see db.ts `asPrivateHealth`) and only
// shows on a computer where Health is turned on in Settings.
import { useState } from 'react';
import { addDays, parseISODate, toISODate } from '../shared/dates';
import { bathroomStats, forDate, healthOf, latestWeight, waterGoal } from '../shared/health';
import { Button, Icon, IconButton, Toggle } from './common';
import { useHealth } from './healthUi';
import { CheckinCard } from './HealthCheckin';
import { ProfileCard, ProfileWizard, SetupCard } from './HealthProfile';
import { useBloom } from './store';

// ---------------------------------------------------------------- settings (per device)

export function HealthSettings() {
  const { t, settings, setSettings } = useBloom();
  return (
    <>
      <div className="hl-set-intro">
        <Icon name="lock" size={16} />
        <p>{t('hlEnableHint')}</p>
      </div>
      <Toggle checked={settings.healthEnabled} label={t('hlEnable')} onChange={(healthEnabled) => setSettings({ healthEnabled })} />
      {settings.healthEnabled && (
        <div className="hl-set-sub">
          <Toggle checked={settings.healthIbd} label={t('hlIbd')} onChange={(healthIbd) => setSettings({ healthIbd })} />
          <p className="muted small">{t('hlIbdHint')}</p>
        </div>
      )}
      <p className="muted small">{t('hlDeviceOnly')}</p>
    </>
  );
}

// ---------------------------------------------------------------- page

export function HealthPage({ onOpenSettings }: { onOpenSettings: () => void }) {
  const { t, settings } = useBloom();
  if (!settings.healthEnabled) {
    return (
      <div className="page">
        <div className="page-empty hl-off">
          <div className="hl-off-icon" aria-hidden="true">
            <Icon name="heartPulse" size={40} />
          </div>
          <p className="hl-off-title">{t('hlOffTitle')}</p>
          <p>{t('hlOffBody')}</p>
          <Button variant="primary" icon="settings" onClick={onOpenSettings}>
            {t('hlOpenSettings')}
          </Button>
        </div>
      </div>
    );
  }
  return <HealthOn />;
}

/** The Health page itself (Health is on). Two columns that scroll separately, one on narrow windows. */
function HealthOn() {
  const { t, locale } = useBloom();
  const { all, profile, ibd } = useHealth();
  const today = toISODate(new Date());
  const [date, setDate] = useState(today);
  const [wizard, setWizard] = useState(false);
  const isToday = date === today;
  const step = (n: number) => {
    const d = toISODate(addDays(parseISODate(date), n));
    if (d <= today) setDate(d);
  };
  const dayLabel = isToday
    ? t('today')
    : date === toISODate(addDays(new Date(), -1))
      ? t('hlYesterday')
      : parseISODate(date).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  const stats = bathroomStats(healthOf(all, 'bathroom'), date);
  const body = forDate(all, 'body', date);
  const goal = waterGoal(profile, { date, weightKg: latestWeight(all, date), ibd, liquidStools: stats.liquid, exerciseMin: body?.exerciseMin ?? null });

  return (
    <div className="page hl">
      <div className="wallet-top hl-top">
        <div className="wallet-month hl-day">
          <IconButton icon="chevronLeft" className="flip-rtl" label={t('prev')} onClick={() => step(-1)} />
          <span>{dayLabel}</span>
          <IconButton icon="chevronRight" className="flip-rtl" label={t('next')} disabled={isToday} onClick={() => step(1)} />
          {!isToday && (
            <button type="button" className="today-btn" onClick={() => setDate(today)}>
              {t('today')}
            </button>
          )}
        </div>
        <span className="spacer" />
        <span className="hl-private">
          <Icon name="lock" size={12} /> {t('hlPrivate')}
        </span>
      </div>
      <div className="wallet-body wl-two hl-two">
        <div className="wl-main">
          {!profile?.done && <SetupCard onStart={() => setWizard(true)} />}
          <CheckinCard date={date} isToday={isToday} goal={goal} />
        </div>
        <div className="wl-side">
          <ProfileCard goal={goal} date={date} onEdit={() => setWizard(true)} />
          <p className="hl-note">
            <Icon name="heartPulse" size={14} /> {t('hlNotAdvice')}
          </p>
        </div>
      </div>
      {wizard && <ProfileWizard onClose={() => setWizard(false)} />}
    </div>
  );
}
