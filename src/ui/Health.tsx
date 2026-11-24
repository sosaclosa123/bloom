// Health tab: private health tracking (optional IBD / Crohn's part).
// Everything here is always private (see db.ts `asPrivateHealth`) and only
// shows on a computer where Health is turned on in Settings.
import { useEffect, useState } from 'react';
import { addDays, parseISODate, toISODate } from '../shared/dates';
import { bathroomStats, forDate, healthOf, waterGoal } from '../shared/health';
import { Button, Icon, IconButton, Toggle } from './common';
import { onHealthRedo, requestHealthRedo, takeHealthRedo, useHealth } from './healthUi';
import { FoodTab } from './HealthFood';
import { StickerArt } from './Stickers';
import { BodyCard, MedHistoryCards, MedsCard, TestsCard, VisitsCard } from './HealthCards';
import { CheckinCard } from './HealthCheckin';
import { IbdCard } from './HealthIbd';
import { TodayBodyCard, TodayFoodCard, TodayTiles } from './HealthQuick';
import { ChallengesCard, DoctorReport, GoalsCard, MonthSummaryCard, StickerBookButton } from './HealthExtras';
import { FlareTimelineCard, InsightsCard, TrendsCard } from './HealthTrends';
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
          <Toggle checked={settings.healthFoodOnline} label={t('hlSetFoodOnline')} onChange={(healthFoodOnline) => setSettings({ healthFoodOnline })} />
          <p className="muted small">{t('hlSetFoodOnlineHint')}</p>
          <div className="hl-set-row">
            <span>{t('hlRedoTitle')}</span>
            <Button size="sm" icon="repeat" onClick={() => requestHealthRedo()}>
              {t('hlRedo')}
            </Button>
          </div>
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
  const [wizard, setWizard] = useState<false | 'resume' | 'restart'>(() => (takeHealthRedo() ? 'restart' : false));
  const [tab, setTab] = useState<string>(() => {
    try {
      return localStorage.getItem('bloom-health-tab') || 'today';
    } catch {
      return 'today';
    }
  });
  useEffect(() => onHealthRedo(() => setWizard('restart')), []);
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

  // Owner (Nov 2026): fewer tabs; Body & tests and Trends are one "Body" tab.
  type Sub = 'today' | 'food' | 'meds' | 'body' | 'ibd' | 'goals';
  const subs: { id: Sub; label: string; sticker?: string; icon?: 'calendar' }[] = [
    { id: 'today', label: t('hlTabToday'), icon: 'calendar' },
    { id: 'food', label: t('hlFood'), sticker: 'cooking' },
    { id: 'meds', label: t('hlTabMeds'), sticker: 'pill' },
    { id: 'body', label: t('hlTabBody'), sticker: 'gym' },
    ...(ibd ? [{ id: 'ibd' as Sub, label: 'IBD' }] : []),
    ...(settings.healthGoals || settings.healthChallenges ? [{ id: 'goals' as Sub, label: t('hlTabGoals'), sticker: 'gift' }] : []),
  ];
  const sub: Sub = tab === 'trends' ? 'body' : subs.some((x) => x.id === tab) ? (tab as Sub) : 'today';
  const pickTab = (x: Sub) => {
    setTab(x);
    try {
      localStorage.setItem('bloom-health-tab', x);
    } catch {
      /* ignore */
    }
  };

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
      <div className="hl-subtabs" role="tablist">
        {subs.map((x) => (
          <button type="button" role="tab" key={x.id} aria-selected={sub === x.id} className={`${sub === x.id ? 'active' : ''} ${x.id === 'ibd' ? 'ibd' : ''}`} onClick={() => pickTab(x.id)}>
            {x.sticker ? <StickerArt kind={x.sticker} size={20} /> : x.icon ? <Icon name={x.icon} size={15} /> : null}
            {x.label}
          </button>
        ))}
      </div>
      {sub === 'food' ? (
        <FoodTab date={date} isToday={isToday} goalMl={goal.ml} />
      ) : (
        <div className="wallet-body wl-two hl-two">
          {sub === 'today' && (
            <>
              <div className="wl-main">
                {/* Stays until the questionnaire is filled in to the end. */}
                {!profileComplete(profile, ibd) && <SetupCard onStart={() => setWizard('resume')} />}
                {/* Layout A (owner, Nov 2026): tiles, check-in, medicines, one food list, body. */}
                <TodayTiles date={date} water={goal} />
                <CheckinCard date={date} isToday={isToday} goal={goal} />
                <MedsCard date={date} todayOnly />
                <TodayFoodCard date={date} isToday={isToday} />
                <TodayBodyCard date={date} />
              </div>
              <div className="wl-side">
                {isToday && <MonthSummaryCard />}
                {/* IBD parts exist only while IBD is on for this computer. */}
                {ibd && <IbdCard date={date} isToday={isToday} />}
                <Note />
              </div>
            </>
          )}
          {sub === 'meds' && (
            <>
              <div className="wl-main">
                <MedsCard date={date} />
                {/* One "taken / not taken" card per medicine, each with its own range and a taken button. */}
                <MedHistoryCards date={date} />
              </div>
              <div className="wl-side">
                <VisitsCard />
                <Note />
              </div>
            </>
          )}
          {sub === 'body' && (
            <>
              <div className="wl-main">
                <BodyCard date={date} />
                <TrendsCard date={date} goal={goal} />
                <TestsCard />
              </div>
              <div className="wl-side">
                <ProfileCard goal={goal} date={date} onEdit={() => setWizard('restart')} />
                <MonthSummaryCard always />
                <Note />
              </div>
            </>
          )}
          {sub === 'ibd' && ibd && (
            <>
              <div className="wl-main">
                <IbdCard date={date} isToday={isToday} />
                <FlareTimelineCard date={date} />
              </div>
              <div className="wl-side">
                <InsightsCard date={date} />
                <Note />
              </div>
            </>
          )}
          {sub === 'goals' && (
            <>
              <div className="wl-main">{settings.healthGoals && <GoalsCard date={date} />}</div>
              <div className="wl-side">{settings.healthChallenges && <ChallengesCard date={date} />}</div>
            </>
          )}
        </div>
      )}
      {wizard && <ProfileWizard restart={wizard === 'restart'} onClose={() => setWizard(false)} />}
      {report && <DoctorReport onClose={() => setReport(false)} />}
    </div>
  );
}

function Note() {
  const { t } = useBloom();
  return (
    <p className="hl-note">
      <Icon name="heartPulse" size={14} /> {t('hlNotAdvice')}
    </p>
  );
}
