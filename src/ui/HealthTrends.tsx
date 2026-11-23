// Health trends (week / month bars), the 30-day IBD flare timeline, the food
// log and (IBD only) simple food & symptom insights.
import { useMemo, useState } from 'react';
import type { StringKey } from '../i18n/strings';
import { platform } from '../platform/api';
import { newMeta } from '../shared/db';
import { addDays, parseISODate, toISODate } from '../shared/dates';
import { FOOD_TAGS, foodInsights, forDate, healthOf, ibdScores, type WaterGoal } from '../shared/health';
import type { HealthFood, ISODate } from '../shared/types';
import { Button, Icon, IconButton, Segmented } from './common';
import { Pills, useHealth, useWaterFmt } from './healthUi';
import { useBloom } from './store';

const datesBack = (end: ISODate, n: number) => Array.from({ length: n }, (_, i) => toISODate(addDays(parseISODate(end), i - n + 1)));

type Metric = 'water' | 'sleep' | 'mood' | 'weight' | 'symptoms';

// ---------------------------------------------------------------- trends

export function TrendsCard({ date, goal }: { date: ISODate; goal: WaterGoal }) {
  const { t, locale } = useBloom();
  const { all, profile, ibd } = useHealth();
  const fmtWater = useWaterFmt();
  const [range, setRange] = useState<'week' | 'month'>('week');
  const [metric, setMetric] = useState<Metric>('water');
  const m: Metric = !ibd && metric === 'symptoms' ? 'water' : metric;
  const dates = useMemo(() => datesBack(date, range === 'week' ? 7 : 30), [date, range]);
  const scores = useMemo(() => (ibd ? ibdScores(all, profile, dates) : new Map()), [all, profile, dates, ibd]);

  const values = dates.map((d): number | null => {
    if (m === 'water') return forDate(all, 'checkin', d)?.waterMl || null;
    if (m === 'sleep') return forDate(all, 'checkin', d)?.sleepH ?? null;
    if (m === 'mood') return forDate(all, 'checkin', d)?.mood ?? null;
    if (m === 'weight') return forDate(all, 'body', d)?.weightKg ?? null;
    return scores.get(d)?.score ?? null;
  });
  const known = values.filter((v): v is number => v != null);
  const ref = m === 'water' ? goal.ml : m === 'sleep' ? 8 : null;
  const top = m === 'mood' ? 5 : Math.max(1, ref ?? 0, ...known);
  // Weight: bars show the change within the period, not from zero.
  const lo = m === 'weight' && known.length ? Math.min(...known) - 1 : 0;
  const height = (v: number) => Math.max(4, ((v - lo) / Math.max(0.0001, top - lo)) * 100);
  const fmt = (v: number) =>
    m === 'water' ? fmtWater(v) : m === 'sleep' ? t('hlHours', { n: v.toLocaleString(locale, { maximumFractionDigits: 1 }) }) : m === 'weight' ? `${v.toLocaleString(locale)} ${t('hlUnitKg')}` : v.toLocaleString(locale, { maximumFractionDigits: 1 });
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
  const label = (d: ISODate, i: number) => {
    const day = parseISODate(d);
    if (range === 'week') return day.toLocaleDateString(locale, { weekday: 'narrow' });
    return i % 5 === 4 || i === 0 ? String(day.getDate()) : '';
  };
  const metrics: { value: Metric; label: string }[] = [
    { value: 'water', label: t('hlWater') },
    { value: 'sleep', label: t('hlSleep') },
    { value: 'mood', label: t('hlMood') },
    { value: 'weight', label: t('hlWeight') },
    ...(ibd ? [{ value: 'symptoms' as Metric, label: t('hlTrendSymptoms') }] : []),
  ];

  return (
    <section className="w-card hl-trends">
      <div className="w-card-head">
        <h3>{t('hlTrends')}</h3>
        <Segmented
          value={range}
          onChange={setRange}
          label={t('hlTrends')}
          options={[
            { value: 'week', label: t('hlWeek') },
            { value: 'month', label: t('hlMonth') },
          ]}
        />
      </div>
      <Pills className="hl-metric-pills" label={t('hlTrends')} value={m} onChange={(v) => v && setMetric(v)} options={metrics} />
      {known.length === 0 ? (
        <p className="empty-note hl-chart-empty">{t('hlNoData')}</p>
      ) : (
        <>
          <div className={`hl-chart r-${range} m-${m}`} role="img" aria-label={`${t('hlTrends')}: ${metrics.find((x) => x.value === m)?.label}`}>
            {ref != null && ref <= top && (
              <span className="hl-chart-ref-area" aria-hidden="true">
                <span className="hl-chart-ref" style={{ bottom: `${height(ref)}%` }}>
                  <span>{t('hlGoalLine', { v: fmt(ref) })}</span>
                </span>
              </span>
            )}
            {dates.map((d, i) => {
              const v = values[i];
              const flare = m === 'symptoms' ? scores.get(d)?.flare : null;
              return (
                <span key={d} className="hl-col" title={`${parseISODate(d).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}${v != null ? ' · ' + fmt(v) : ''}`}>
                  <span className="hl-bar-wrap">{v != null && <span className={`hl-bar ${flare ? 'flare-' + flare : ''} ${d === date ? 'sel' : ''}`} style={{ height: `${height(v)}%` }} />}</span>
                  <span className="hl-col-label">{label(d, i)}</span>
                </span>
              );
            })}
          </div>
          {avg != null && <p className="w-card-sub">{t('hlAvg', { v: fmt(Math.round(avg * 10) / 10) })}</p>}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- IBD: 30-day flare timeline

export function FlareTimelineCard({ date }: { date: ISODate }) {
  const { t, locale } = useBloom();
  const { all, profile } = useHealth();
  const dates = useMemo(() => datesBack(date, 30), [date]);
  const scores = useMemo(() => ibdScores(all, profile, dates), [all, profile, dates]);
  const top = Math.max(8, ...[...scores.values()].map((s) => s.score));
  const flareDays = [...scores.values()].filter((s) => s.flare).length;
  return (
    <section className="w-card hl-ibd hl-timeline">
      <div className="w-card-head">
        <h3>{t('hlFlareTimeline')}</h3>
        <span className={`hl-score ${flareDays ? 'lvl-moderate' : 'lvl-remission'}`}>
          {flareDays === 0 ? t('hlNoFlares') : flareDays === 1 ? t('hlFlareDaysOne') : t('hlFlareDays', { n: flareDays })}
        </span>
      </div>
      <div className="hl-chart r-month timeline" role="img" aria-label={t('hlFlareTimeline')}>
        {dates.map((d, i) => {
          const s = scores.get(d);
          return (
            <span
              key={d}
              className="hl-col"
              title={`${parseISODate(d).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}${s ? ` · ${s.score} · ${t(`hlAct_${s.level}` as StringKey)}` : ''}`}
            >
              <span className="hl-bar-wrap">
                {s ? <span className={`hl-bar ${s.flare ? 'flare-' + s.flare : 'calm'}`} style={{ height: `${Math.max(8, (s.score / top) * 100)}%` }} /> : <span className="hl-bar none" />}
              </span>
              <span className="hl-col-label">{i % 5 === 4 || i === 0 ? parseISODate(d).getDate() : ''}</span>
            </span>
          );
        })}
      </div>
      <div className="hl-legend">
        <span>
          <i className="calm" /> {t('hlLegendCalm')}
        </span>
        <span>
          <i className="flare-flare" /> {t('hlLegendFlare')}
        </span>
        <span>
          <i className="none" /> {t('hlLegendNone')}
        </span>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- food log

const MEALS: HealthFood['meal'][] = ['breakfast', 'lunch', 'dinner', 'snack'];
const mealFor = (h: number): HealthFood['meal'] => (h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snack');

export function FoodCard({ date, isToday }: { date: ISODate; isToday: boolean }) {
  const { t, save } = useBloom();
  const { all } = useHealth();
  const [text, setText] = useState('');
  const [meal, setMeal] = useState<HealthFood['meal']>(() => mealFor(new Date().getHours()));
  const [tags, setTags] = useState<string[]>([]);
  const list = healthOf(all, 'food')
    .filter((f) => f.date === date)
    .sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) || a.time.localeCompare(b.time));
  const ok = !!text.trim() || tags.length > 0;
  const add = () => {
    if (!ok) return;
    const now = new Date();
    const time = isToday ? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` : '';
    save('health', { ...newMeta(), kind: 'food', date, time, meal, text: text.trim(), tags } satisfies HealthFood);
    setText('');
    setTags([]);
  };
  const tagName = (x: string) => ((FOOD_TAGS as readonly string[]).includes(x) ? t(`hlTag_${x}` as StringKey) : x);
  return (
    <section className="w-card hl-food">
      <div className="w-card-head">
        <h3>{t('hlFood')}</h3>
      </div>
      <form
        className="hl-food-add"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Pills label={t('hlFood')} value={meal} onChange={(v) => v && setMeal(v)} options={MEALS.map((x) => ({ value: x, label: t(`hlMeal_${x}` as StringKey) }))} />
        <div className="hl-food-row">
          <input dir="auto" value={text} placeholder={t('hlFoodPlaceholder')} aria-label={t('hlFoodPlaceholder')} onChange={(e) => setText(e.target.value)} />
          <Button variant="primary" icon="plus" disabled={!ok} onClick={add}>
            {t('hlAddFood')}
          </Button>
        </div>
        <div className="hl-pills hl-food-tags" role="group" aria-label={t('hlFood')}>
          {FOOD_TAGS.map((x) => {
            const on = tags.includes(x);
            return (
              <button type="button" key={x} aria-pressed={on} className={on ? 'active' : ''} onClick={() => setTags(on ? tags.filter((y) => y !== x) : [...tags, x])}>
                {tagName(x)}
              </button>
            );
          })}
        </div>
        <button type="submit" hidden />
      </form>
      {list.length === 0 ? (
        <p className="empty-note">{t('hlNoFood')}</p>
      ) : (
        <ul className="hl-list">
          {list.map((f) => (
            <li key={f.id} className="hl-food-item">
              <span className="hl-food-meal">{t(`hlMeal_${f.meal}` as StringKey)}</span>
              <span className="hl-food-text" dir="auto">
                {f.text}
                {f.tags.map((x) => (
                  <span key={x} className="hl-tag">
                    {tagName(x)}
                  </span>
                ))}
              </span>
              <IconButton icon="close" label={t('delete')} onClick={() => void platform.remove('health', f.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- IBD: food & symptoms

export function InsightsCard({ date }: { date: ISODate }) {
  const { t, locale } = useBloom();
  const { all, profile } = useHealth();
  const list = useMemo(() => foodInsights(all, profile, datesBack(date, 60)).slice(0, 4), [all, profile, date]);
  const tagName = (x: string) => ((FOOD_TAGS as readonly string[]).includes(x) ? t(`hlTag_${x}` as StringKey) : x);
  return (
    <section className="w-card hl-ibd hl-insights">
      <div className="w-card-head">
        <h3>{t('hlInsights')}</h3>
      </div>
      {list.length === 0 ? (
        <p className="empty-note">{t('hlInsightNone')}</p>
      ) : (
        <ul className="hl-list hl-insight-list">
          {list.map((x) => (
            <li key={x.tag} className={x.worse ? 'worse' : 'better'}>
              <Icon name={x.worse ? 'heartPulse' : 'sparkle'} size={15} />
              <span>
                {t(x.worse ? 'hlInsightWorse' : 'hlInsightBetter', {
                  tag: tagName(x.tag),
                  a: x.withAvg.toLocaleString(locale),
                  b: x.withoutAvg.toLocaleString(locale),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="muted small hl-score-note">{t('hlInsightNote')}</p>
    </section>
  );
}
