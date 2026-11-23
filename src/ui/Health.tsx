// Health tab: private health tracking (optional IBD / Crohn's part).
// Everything here is always private (see db.ts `asPrivateHealth`) and only
// shows on a computer where Health is turned on in Settings.
import { useState } from 'react';
import { addDays, parseISODate, toISODate } from '../shared/dates';
import { bathroomStats, forDate, healthOf, waterGoal } from '../shared/health';
import { Button, Icon, IconButton, Toggle } from './common';
import { useHealth } from './healthUi';
import { BodyCard, MedsCard, TestsCard, VisitsCard } from './HealthCards';
import { CheckinCard } from './HealthCheckin';
import { IbdCard } from './HealthIbd';
import { ChallengesCard, DoctorReport, GoalsCard, MonthSummaryCard, StickerBookButton } from './HealthExtras';
import { FlareTimelineCard, FoodCard, InsightsCard, TrendsCard } from './HealthTrends';
import { profileComplete, ProfileCard, ProfileWizard, SetupCard } from './HealthProfile';
import { useBloom } from './store';

// ---------------------------------------------------------------- settings (per device)

export function HealthSettings() {
  const { t, settings, setSettings, locale } = useBloom();
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
          <Toggle checked={settings.healthMedNames} label={t('hlMedNames')} onChange={(healthMedNames) => setSettings({ healthMedNames })} />
          <p className="muted small">{t('hlMedNamesHint')}</p>
          <Toggle checked={settings.healthWaterNudge} label={t('hlSetWater')} onChange={(healthWaterNudge) => setSettings({ healthWaterNudge })} />
          <p className="muted small">{t('hlSetWaterHint')}</p>
          <label className="hl-set-row">
            <span>{t('hlSetWeigh')}</span>
            <select
              value={settings.healthWeighDay == null ? '' : String(settings.healthWeighDay)}
              onChange={(e) => setSettings({ healthWeighDay: e.target.value === '' ? null : Number(e.target.value) })}
            >
              <option value="">{t('hlOff')}</option>
              {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {new Date(2026, 2, 1 + n).toLocaleDateString(locale, { weekday: 'long' })}
                </option>
              ))}
            </select>
          </label>
          <h4 className="settings-h">{t('hlSetFun')}</h4>
          <Toggle checked={settings.healthGoals} label={t('hlSetGoals')} onChange={(healthGoals) => setSettings({ healthGoals })} />
          <Toggle checked={settings.healthChallenges} label={t('hlSetChallenges')} onChange={(healthChallenges) => setSettings({ healthChallenges })} />
          <Toggle checked={settings.healthStickerBook} label={t('hlSetBook')} onChange={(healthStickerBook) => setSettings({ healthStickerBook })} />
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
  const { t, locale, settings } = useBloom();
  const { all, profile, ibd } = useHealth();
  const [report, setReport] = useState(false);
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
  const goal = waterGoal(profile, { date, ibd, liquidStools: stats.liquid, exerciseMin: body?.exerciseMin ?? null });

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
        <Button size="sm" variant="ghost" icon="note" onClick={() => setReport(true)}>
          {t('hlReport')}
        </Button>
        {settings.healthStickerBook && <StickerBookButton />}
        <span className="hl-private">
          <Icon name="lock" size={12} /> {t('hlPrivate')}
        </span>
      </div>
      <div className="wallet-body wl-two hl-two">
        <div className="wl-main">
          {/* Stays until the questionnaire is filled in to the end. */}
          {!profileComplete(profile, ibd) && <SetupCard onStart={() => setWizard(true)} />}
          <CheckinCard date={date} isToday={isToday} goal={goal} />
          <MedsCard date={date} />
          {/* IBD parts exist only while IBD is on for this computer. */}
          {ibd && <IbdCard date={date} isToday={isToday} />}
          {settings.healthGoals && <GoalsCard date={date} />}
          {settings.healthChallenges && <ChallengesCard date={date} />}
          <FoodCard date={date} isToday={isToday} />
          <TrendsCard date={date} goal={goal} />
          {ibd && <FlareTimelineCard date={date} />}
          {ibd && <InsightsCard date={date} />}
        </div>
        <div className="wl-side">
          {isToday && <MonthSummaryCard />}
          <ProfileCard goal={goal} date={date} onEdit={() => setWizard(true)} />
          <BodyCard date={date} />
          <TestsCard />
          <VisitsCard />
          <p className="hl-note">
            <Icon name="heartPulse" size={14} /> {t('hlNotAdvice')}
          </p>
        </div>
      </div>
      {wizard && <ProfileWizard onClose={() => setWizard(false)} />}
      {report && <DoctorReport onClose={() => setReport(false)} />}
    </div>
  );
}
