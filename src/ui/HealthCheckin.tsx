// Daily check-in: one tap each for water, mood, sleep, energy and stress.
import type { StringKey } from '../i18n/strings';
import { newMeta } from '../shared/db';
import { parseISODate } from '../shared/dates';
import { checkinFilled, forDate, type WaterGoal } from '../shared/health';
import type { HealthCheckin, ISODate } from '../shared/types';
import { Icon } from './common';
import { Pills, useHealth, useWaterFmt } from './healthUi';
import { useBloom } from './store';

const SLEEP = [4, 5, 6, 7, 8, 9, 10];

/** Simple line face: 1 = sad .. 5 = big smile. */
export function MoodFace({ level, size = 22 }: { level: number; size?: number }) {
  const mouth = ['M8 16.5c1.8-2 6.2-2 8 0', 'M8.5 16c1.6-1 5.4-1 7 0', 'M8.5 15.5h7', 'M8.5 14.8c1.6 1.2 5.4 1.2 7 0', 'M8 14.2c1.8 2.4 6.2 2.4 8 0'][level - 1];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="10" r=".9" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r=".9" fill="currentColor" stroke="none" />
      <path d={mouth} />
    </svg>
  );
}

function Glass({ full }: { full: boolean }) {
  return (
    <svg width="20" height="24" viewBox="0 0 20 24" aria-hidden="true">
      <path d="M3 3h14l-1.6 17.2a2 2 0 0 1-2 1.8H6.6a2 2 0 0 1-2-1.8z" fill={full ? 'var(--hl-water)' : 'none'} fillOpacity={full ? 0.85 : 0} stroke="var(--hl-water)" strokeWidth="1.6" strokeLinejoin="round" />
      {full && <path d="M6 7.5h8" stroke="#fff" strokeOpacity=".55" strokeWidth="1.4" strokeLinecap="round" />}
    </svg>
  );
}

export function CheckinCard({ date, isToday, goal }: { date: ISODate; isToday: boolean; goal: WaterGoal }) {
  const { t, locale, save } = useBloom();
  const { all, profile } = useHealth();
  const fmt = useWaterFmt();
  const rec = forDate(all, 'checkin', date);
  const cur: HealthCheckin = rec ?? { ...newMeta(), kind: 'checkin', date, waterMl: 0, mood: null, sleepH: null, energy: null, stress: null };
  const set = (p: Partial<HealthCheckin>) => save('health', { ...cur, ...p });

  const glass = profile?.glassMl || 250;
  const glasses = Math.round(cur.waterMl / glass);
  const goalGlasses = Math.max(1, Math.ceil(goal.ml / glass));
  const shown = Math.min(16, Math.max(goalGlasses, glasses));
  const pct = Math.min(100, (cur.waterMl / goal.ml) * 100);
  const reached = cur.waterMl >= goal.ml;
  const scale = (v: number) => ({ value: v, label: String(v) });

  return (
    <section className="w-card hl-checkin">
      <div className="w-card-head">
        <h3>{isToday ? t('hlCheckinToday') : t('hlCheckinDay', { d: parseISODate(date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' }) })}</h3>
        <span className="hl-count" aria-hidden="true">
          {checkinFilled(rec)}/5
        </span>
      </div>

      <div className="hl-water">
        <div className="hl-water-head">
          <span className="hl-row-label">
            <Icon name="drop" size={15} /> {t('hlWater')}
          </span>
          <span className={`hl-water-amount ${reached ? 'reached' : ''}`}>
            {reached ? t('hlGoalReached') + ' · ' : ''}
            {t('hlWaterOf', { a: fmt(cur.waterMl), b: fmt(goal.ml) })}
          </span>
        </div>
        <div className="hl-water-bar" role="progressbar" aria-label={t('hlWater')} aria-valuemin={0} aria-valuemax={goal.ml} aria-valuenow={cur.waterMl}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="hl-glasses">
          {Array.from({ length: shown }, (_, k) => (
            <button
              type="button"
              key={k}
              className={`hl-glass ${k < glasses ? 'full' : ''}`}
              aria-label={t('hlGlassN', { n: k + 1 })}
              title={t('hlGlassN', { n: k + 1 })}
              // Tap a glass to fill up to it; tap the last full one to empty it.
              onClick={() => set({ waterMl: (k + 1 === glasses ? k : k + 1) * glass })}
            >
              <Glass full={k < glasses} />
            </button>
          ))}
          <span className="hl-glass-btns">
            <button type="button" className="hl-mini-btn" aria-label={t('hlRemoveGlass')} title={t('hlRemoveGlass')} disabled={cur.waterMl <= 0} onClick={() => set({ waterMl: Math.max(0, cur.waterMl - glass) })}>
              −
            </button>
            <button type="button" className="hl-mini-btn" aria-label={t('hlAddGlass')} title={t('hlAddGlass')} onClick={() => set({ waterMl: cur.waterMl + glass })}>
              +
            </button>
          </span>
        </div>
        <span className="hl-glass-note">
          {t('hlGlassN', { n: glasses })} · {t('hlMl', { n: glass })}
        </span>
      </div>

      <div className="hl-rows">
        <div className="hl-row">
          <span className="hl-row-label">{t('hlMood')}</span>
          <Pills
            className="hl-moods"
            label={t('hlMood')}
            value={cur.mood}
            onChange={(mood) => set({ mood })}
            options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: <MoodFace level={v} />, title: t(`hlMood_${v}` as StringKey) }))}
          />
          <span className="hl-row-value">{cur.mood ? t(`hlMood_${cur.mood}` as StringKey) : ''}</span>
        </div>
        <div className="hl-row">
          <span className="hl-row-label">{t('hlSleep')}</span>
          <Pills label={t('hlSleep')} value={cur.sleepH == null ? null : Math.round(Math.min(10, Math.max(4, cur.sleepH)))} onChange={(sleepH) => set({ sleepH })} options={SLEEP.map((h) => ({ value: h, label: h === 4 ? '≤4' : h === 10 ? '10+' : String(h) }))} />
          <span className="hl-row-value">{cur.sleepH != null ? t('hlHours', { n: cur.sleepH.toLocaleString(locale) }) : ''}</span>
        </div>
        <div className="hl-row">
          <span className="hl-row-label">{t('hlEnergy')}</span>
          <Pills label={t('hlEnergy')} value={cur.energy} onChange={(energy) => set({ energy })} options={[1, 2, 3, 4, 5].map(scale)} />
          <span className="hl-row-value muted">{t('hlScaleLowHigh')}</span>
        </div>
        <div className="hl-row">
          <span className="hl-row-label">{t('hlStress')}</span>
          <Pills label={t('hlStress')} value={cur.stress} onChange={(stress) => set({ stress })} options={[1, 2, 3, 4, 5].map(scale)} />
          <span className="hl-row-value muted">{t('hlScaleLowHigh')}</span>
        </div>
      </div>
    </section>
  );
}
