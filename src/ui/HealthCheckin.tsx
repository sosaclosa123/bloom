// "Today" card (design A): tiles for water, mood, sleep and energy/stress.
// Tap a tile to change it; water has quick − / + glass buttons.
import { useState } from 'react';
import type { StringKey } from '../i18n/strings';
import { newMeta } from '../shared/db';
import { parseISODate } from '../shared/dates';
import { checkinFilled, forDate, sleepFromTimes, type WaterGoal } from '../shared/health';
import { sleepHours, streak } from '../shared/healthExtras';
import type { HealthCheckin, ISODate } from '../shared/types';
import { Icon, Segmented } from './common';
import { Pills, Popover, Tip, useHealth, useWaterFmt } from './healthUi';
import { StickerArt } from './Stickers';
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

type Pop = 'mood' | 'sleep' | 'energy' | null;

export function CheckinCard({ date, isToday, goal }: { date: ISODate; isToday: boolean; goal: WaterGoal }) {
  const { t, locale, save } = useBloom();
  const { all, profile, ibd } = useHealth();
  const fmt = useWaterFmt();
  const [pop, setPop] = useState<Pop>(null);
  const rec = forDate(all, 'checkin', date);
  const cur: HealthCheckin = rec ?? { ...newMeta(), kind: 'checkin', date, waterMl: 0, mood: null, sleepH: null, energy: null, stress: null };
  const set = (p: Partial<HealthCheckin>) => save('health', { ...cur, ...p });

  const glass = profile?.glassMl || 250;
  const glasses = Math.round(cur.waterMl / glass);
  const pct = Math.min(100, (cur.waterMl / goal.ml) * 100);
  const reached = cur.waterMl >= goal.ml;
  const sleep = sleepHours(cur);
  const [sleepMode, setSleepMode] = useState<'hours' | 'times'>(cur.bed || cur.wake ? 'times' : 'hours');
  const scale = (v: number) => ({ value: v, label: String(v) });
  const toggle = (p: Pop) => setPop((x) => (x === p ? null : p));
  // Streaks (only shown when there is one).
  const waterRun = isToday ? streak(all, date, ibd, (f) => f.waterMet) : 0;
  const medsRun = isToday ? streak(all, date, ibd, (f) => f.medsAll) : 0;

  return (
    <section className="w-card hl-today">
      <div className="w-card-head hl-head">
        <div className="hl-head-title">
          <div>
            <h3>
              <Tip text={t('hlTapTile')}>{isToday ? t('hlCheckinToday') : t('hlCheckinDay', { d: parseISODate(date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' }) })}</Tip>
            </h3>
          </div>
        </div>
        <div className="hl-head-actions">
          {waterRun >= 2 && (
            <span className="hl-streak water" title={t('hlStreakWater', { n: waterRun })}>
              <Icon name="drop" size={13} /> {waterRun}
            </span>
          )}
          {medsRun >= 2 && (
            <span className="hl-streak meds" title={t('hlStreakMeds', { n: medsRun })}>
              <StickerArt kind="pill" size={16} /> {medsRun}
            </span>
          )}
          <span className="hl-count" title={t('hlFilled')}>
            {checkinFilled(rec ? { ...rec, sleepH: sleep } : undefined)}/5
          </span>
        </div>
      </div>

      <div className="hl-tiles">
        {/* Water */}
        <div className={`hl-tile water ${reached ? 'reached' : ''}`}>
          <span className="hl-tile-label">
            <Icon name="drop" size={13} /> {t('hlWater')}
          </span>
          <span className="hl-tile-big">
            {fmt(cur.waterMl)} <small>{t('hlOfGoal', { v: fmt(goal.ml) })}</small>
          </span>
          <div className="hl-water-bar" role="progressbar" aria-label={t('hlWater')} aria-valuemin={0} aria-valuemax={goal.ml} aria-valuenow={cur.waterMl}>
            <span style={{ width: `${pct}%` }} />
          </div>
          <div className="hl-tile-row">
            <span className="hl-tile-sub">{reached ? t('hlGoalReached') : t('hlGlassN', { n: glasses })}</span>
            <button type="button" className="hl-mini-btn" aria-label={t('hlRemoveGlass')} title={t('hlRemoveGlass')} disabled={cur.waterMl <= 0} onClick={() => set({ waterMl: Math.max(0, cur.waterMl - glass) })}>
              −
            </button>
            <button type="button" className="hl-glass-add" onClick={() => set({ waterMl: cur.waterMl + glass })}>
              + {t('hlGlassShort', { n: glass })}
            </button>
          </div>
        </div>

        {/* Mood */}
        <div className="hl-tile-wrap">
          <button type="button" data-pop-anchor className={`hl-tile ${pop === 'mood' ? 'open' : ''}`} aria-expanded={pop === 'mood'} onClick={() => toggle('mood')}>
            <span className="hl-tile-label">{t('hlMood')}</span>
            <span className={`hl-tile-face ${cur.mood ? '' : 'empty'}`}>{cur.mood ? <MoodFace level={cur.mood} size={34} /> : <span className="hl-tile-q">?</span>}</span>
            <span className="hl-tile-sub">{cur.mood ? t(`hlMood_${cur.mood}` as StringKey) : t('hlTapToSet')}</span>
          </button>
          {pop === 'mood' && (
            <Popover onClose={() => setPop(null)}>
              <Pills
                className="hl-moods"
                label={t('hlMood')}
                value={cur.mood}
                onChange={(mood) => {
                  set({ mood });
                  setPop(null);
                }}
                options={[1, 2, 3, 4, 5].map((v) => ({ value: v, label: <MoodFace level={v} />, title: t(`hlMood_${v}` as StringKey) }))}
              />
            </Popover>
          )}
        </div>

        {/* Sleep */}
        <div className="hl-tile-wrap">
          <button type="button" data-pop-anchor className={`hl-tile ${pop === 'sleep' ? 'open' : ''}`} aria-expanded={pop === 'sleep'} onClick={() => toggle('sleep')}>
            <span className="hl-tile-label">{t('hlSleep')}</span>
            <span className="hl-tile-big">{sleep != null ? t('hlHours', { n: sleep.toLocaleString(locale) }) : <span className="hl-tile-q">?</span>}</span>
            <span className="hl-tile-sub" dir="ltr">
              {cur.bed && cur.wake ? `${cur.bed}–${cur.wake}` : sleep == null ? t('hlTapToSet') : ''}
            </span>
          </button>
          {pop === 'sleep' && (
            <Popover onClose={() => setPop(null)} className="hl-pop-sleep">
              <Segmented
                value={sleepMode}
                onChange={setSleepMode}
                label={t('hlSleep')}
                options={[
                  { value: 'hours', label: t('hlSleepHours') },
                  { value: 'times', label: t('hlSleepTimes') },
                ]}
              />
              {sleepMode === 'hours' ? (
                <Pills
                  label={t('hlSleep')}
                  value={cur.sleepH == null ? null : Math.round(Math.min(10, Math.max(4, cur.sleepH)))}
                  onChange={(sleepH) => {
                    set({ sleepH, bed: null, wake: null });
                    setPop(null);
                  }}
                  options={SLEEP.map((h) => ({ value: h, label: h === 4 ? '≤4' : h === 10 ? '10+' : String(h) }))}
                />
              ) : (
                <div className="hl-sleep-times">
                  <label>
                    <span className="field-label">{t('hlBedTime')}</span>
                    <input type="time" dir="ltr" value={cur.bed ?? ''} onChange={(e) => set({ bed: e.target.value || null, sleepH: e.target.value && cur.wake ? sleepFromTimes(e.target.value, cur.wake) : cur.sleepH })} />
                  </label>
                  <label>
                    <span className="field-label">{t('hlWakeTime')}</span>
                    <input type="time" dir="ltr" value={cur.wake ?? ''} onChange={(e) => set({ wake: e.target.value || null, sleepH: e.target.value && cur.bed ? sleepFromTimes(cur.bed, e.target.value) : cur.sleepH })} />
                  </label>
                  {sleep != null && <span className="hl-tile-sub">= {t('hlHours', { n: sleep.toLocaleString(locale) })}</span>}
                </div>
              )}
            </Popover>
          )}
        </div>

        {/* Energy + stress */}
        <div className="hl-tile-wrap">
          <button type="button" data-pop-anchor className={`hl-tile ${pop === 'energy' ? 'open' : ''}`} aria-expanded={pop === 'energy'} onClick={() => toggle('energy')}>
            <span className="hl-tile-label">
              {t('hlEnergy')} · {t('hlStress')}
            </span>
            <span className="hl-tile-big">
              {cur.energy ?? '–'} · {cur.stress ?? '–'}
            </span>
            <span className="hl-tile-sub">{cur.energy == null && cur.stress == null ? t('hlTapToSet') : t('hlOutOf5')}</span>
          </button>
          {pop === 'energy' && (
            <Popover onClose={() => setPop(null)} className="hl-pop-end">
              <span className="field-label">{t('hlEnergy')}</span>
              <Pills label={t('hlEnergy')} value={cur.energy} onChange={(energy) => set({ energy })} options={[1, 2, 3, 4, 5].map(scale)} />
              <span className="field-label">{t('hlStress')}</span>
              <Pills label={t('hlStress')} value={cur.stress} onChange={(stress) => set({ stress })} options={[1, 2, 3, 4, 5].map(scale)} />
              <span className="hl-tile-sub">{t('hlScaleLowHigh')}</span>
            </Popover>
          )}
        </div>
      </div>
    </section>
  );
}
