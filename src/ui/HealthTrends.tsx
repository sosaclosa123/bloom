// Health trends (line chart with a trend line: week / month / year / from the
// start), the 30-day IBD flare timeline and (IBD only) food & symptom insights.
import { useMemo, useState } from 'react';
import type { StringKey } from '../i18n/strings';
import { addDays, parseISODate, toISODate } from '../shared/dates';
import { FOOD_TAGS, foodInsights, type WaterGoal } from '../shared/health';
import { flareLine, ibdOn, ibdSeries, sleepHours, type IbdMetric } from '../shared/healthExtras';
import type { ISODate } from '../shared/types';
import { Icon, Segmented } from './common';
import { CardHead, LineChart, Pills, useHealth, useWaterFmt } from './healthUi';
import { DaySummary } from './HealthDay';
import { useBloom } from './store';

const datesBack = (end: ISODate, n: number) => Array.from({ length: n }, (_, i) => toISODate(addDays(parseISODate(end), i - n + 1)));

type Metric = 'water' | 'sleep' | 'mood' | 'weight' | 'symptoms';

// ---------------------------------------------------------------- trends

export function TrendsCard({ date, goal }: { date: ISODate; goal: WaterGoal }) {
  const { t, locale } = useBloom();
  const { all, ibd } = useHealth();
  const fmtWater = useWaterFmt();
  const [range, setRange] = useState<'week' | 'month' | 'year' | 'all'>('month');
  const [metric, setMetric] = useState<Metric>('water');
  const [day, setDay] = useState<ISODate | null>(null);
  const m: Metric = !ibd && metric === 'symptoms' ? 'water' : metric;

  // One value per day that has one (newest record wins), indexed once.
  const points = useMemo(() => {
    const byDate = new Map<ISODate, number>();
    const newest = new Map<ISODate, number>();
    const put = (d: ISODate, v: number | null | undefined, at: number) => {
      if (v == null || (m === 'water' && !v)) return;
      if ((newest.get(d) ?? -1) > at) return;
      newest.set(d, at);
      byDate.set(d, v);
    };
    if (m === 'symptoms') {
      const dates = new Set(all.filter((x) => x.kind === 'ibdday' || x.kind === 'bathroom').map((x) => (x as { date: ISODate }).date));
      for (const d of dates) {
        const s = ibdOn(all, d);
        if (s) byDate.set(d, s.score);
      }
    } else {
      for (const x of all) {
        if (m === 'weight' && x.kind === 'body') put(x.date, x.weightKg, x.updatedAt);
        if (x.kind !== 'checkin' || m === 'weight') continue;
        if (m === 'water') put(x.date, x.waterMl, x.updatedAt);
        if (m === 'sleep') put(x.date, sleepHours(x), x.updatedAt);
        if (m === 'mood') put(x.date, x.mood, x.updatedAt);
      }
    }
    const from = range === 'all' ? '0000-01-01' : toISODate(addDays(parseISODate(date), -(range === 'week' ? 6 : range === 'month' ? 29 : 364)));
    return [...byDate.entries()]
      .filter(([d]) => d >= from && d <= date)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([d, v]) => ({ date: d, value: v }));
  }, [all, m, range, date]);

  const fmt = (v: number) =>
    m === 'water'
      ? fmtWater(v)
      : m === 'sleep'
        ? t('hlHours', { n: (Math.round(v * 10) / 10).toLocaleString(locale) })
        : m === 'weight'
          ? `${(Math.round(v * 10) / 10).toLocaleString(locale)} ${t('hlUnitKg')}`
          : (Math.round(v * 10) / 10).toLocaleString(locale);
  const avg = points.length ? points.reduce((a, p) => a + p.value, 0) / points.length : null;
  const ref = m === 'water' ? goal.ml : m === 'sleep' ? 7 : null;
  const metrics: { value: Metric; label: string }[] = [
    { value: 'water', label: t('hlWater') },
    { value: 'sleep', label: t('hlSleep') },
    { value: 'mood', label: t('hlMood') },
    { value: 'weight', label: t('hlWeight') },
    ...(ibd ? [{ value: 'symptoms' as Metric, label: t('hlTrendSymptoms') }] : []),
  ];

  return (
    <section className="w-card hl-trends">
      <CardHead title={t('hlTrends')}>
        <Segmented
          value={range}
          onChange={setRange}
          label={t('hlTrends')}
          options={[
            { value: 'week', label: t('hlWeek') },
            { value: 'month', label: t('hlMonth') },
            { value: 'year', label: t('hlYear') },
            { value: 'all', label: t('hlFromStart') },
          ]}
        />
      </CardHead>
      <Pills className="hl-metric-pills" label={t('hlTrends')} value={m} onChange={(v) => v && setMetric(v)} options={metrics} />
      {points.length === 0 ? (
        <p className="empty-note hl-chart-empty">{t('hlNoData')}</p>
      ) : (
        <div className="hl-chart-box">
          <LineChart
            onPick={setDay}
            dateLabel={(d) => parseISODate(d).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            label={`${t('hlTrends')}: ${metrics.find((x) => x.value === m)?.label}`}
            points={points}
            fmt={fmt}
            fixed={m === 'mood' ? [1, 5] : undefined}
            goal={ref != null ? { value: ref, label: t('hlGoalLine', { v: fmt(ref) }) } : undefined}
          />
          <p className="hl-legend-line">
            <i className="dot" /> {metrics.find((x) => x.value === m)?.label} {points.length >= 3 && <><i className="dash" /> {t('hlTrendLine')}</>}
            {avg != null && <span className="hl-legend-avg">{t('hlAvg', { v: fmt(avg) })}</span>}
          </p>
        </div>
      )}
      {day && <DaySummary date={day} onClose={() => setDay(null)} />}
    </section>
  );
}

// ---------------------------------------------------------------- IBD history: line chart (same look as Trends)

export function FlareTimelineCard({ date }: { date: ISODate }) {
  const { t, locale } = useBloom();
  const { all } = useHealth();
  // 30 days by default; up to the whole history (no limit).
  const [range, setRange] = useState<30 | 90 | 365 | 0>(30);
  const [metric, setMetric] = useState<IbdMetric>('overall');
  const [day, setDay] = useState<ISODate | null>(null);
  const from = range === 0 ? '0000-01-01' : toISODate(addDays(parseISODate(date), -(range - 1)));
  const points = useMemo(() => ibdSeries(all, metric, from, date), [all, metric, from, date]);
  const flareDays = useMemo(() => ibdSeries(all, 'flare', from, date).filter((p) => ibdOn(all, p.date)?.flare).length, [all, from, date]);
  const kind = points.length ? (ibdOn(all, points[points.length - 1].date)?.kind ?? 'hbi') : 'hbi';
  const num = (v: number) => (Math.round(v * 10) / 10).toLocaleString(locale);
  const fmt = (v: number) =>
    metric === 'overall'
      ? t('hlOutOf10', { v: num(v) })
      : (metric === 'pain' || metric === 'tired') && Number.isInteger(v) && v >= 0 && v <= 3
        ? t(`hlLevel_${v}` as StringKey)
        : metric === 'feeling' && Number.isInteger(v) && v >= 0 && v <= 4
          ? t(`hlWell_${v}` as StringKey)
          : num(v);
  const metrics: { value: IbdMetric; label: string }[] = [
    { value: 'overall', label: t('hlIbdOverall') },
    { value: 'pain', label: t('hlAbdPain') },
    { value: 'feeling', label: t('hlIbdFeeling') },
    { value: 'tired', label: t('hlFatigue') },
    { value: 'flare', label: t('hlIbdFlareScore') },
  ];
  const name = metrics.find((x) => x.value === metric)?.label ?? '';
  const avg = points.length ? points.reduce((a, p) => a + p.value, 0) / points.length : null;
  return (
    <section className="w-card hl-ibd hl-timeline">
      <CardHead title={t('hlIbdHistory')}>
        <Segmented
          value={range}
          onChange={setRange}
          label={t('hlIbdHistory')}
          options={[
            { value: 30, label: t('hlNDays', { n: 30 }) },
            { value: 90, label: t('hlNDays', { n: 90 }) },
            { value: 365, label: t('hlYear') },
            { value: 0, label: t('hlFromStart') },
          ]}
        />
      </CardHead>
      <Pills className="hl-metric-pills" label={t('hlIbdHistory')} value={metric} onChange={(v) => v && setMetric(v)} options={metrics} />
      {points.length === 0 ? (
        <p className="empty-note hl-chart-empty">{t('hlNoData')}</p>
      ) : (
        <div className="hl-chart-box">
          <LineChart
            onPick={setDay}
            dateLabel={(d) => parseISODate(d).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            label={`${t('hlIbdHistory')}: ${name}`}
            points={points}
            fmt={fmt}
            fixed={metric === 'overall' ? [0, 10] : metric === 'feeling' ? [0, 4] : metric === 'pain' || metric === 'tired' ? [0, 3] : undefined}
            goal={metric === 'flare' ? { value: flareLine(kind), label: t('hlFlareFrom', { n: flareLine(kind) }) } : undefined}
          />
          <p className="hl-legend-line">
            <i className="dot" /> {name} {points.length >= 3 && <><i className="dash" /> {t('hlTrendLine')}</>}
            <span className="muted">· {t('hlIbdHigherWorse')}</span>
            {avg != null && <span className="hl-legend-avg">{t('hlAvg', { v: metric === 'overall' ? t('hlOutOf10', { v: num(avg) }) : num(avg) })}</span>}
          </p>
          <p className="hl-legend-line">
            <span className={`hl-score ${flareDays ? 'lvl-moderate' : 'lvl-remission'}`}>
              {flareDays === 0 ? t('hlNoFlares') : flareDays === 1 ? t('hlFlareDaysOne') : t('hlFlareDays', { n: flareDays })}
            </span>
          </p>
        </div>
      )}
      {day && <DaySummary date={day} onClose={() => setDay(null)} />}
    </section>
  );
}

// ---------------------------------------------------------------- food log

// ---------------------------------------------------------------- IBD: food & symptoms

export function InsightsCard({ date }: { date: ISODate }) {
  const { t, locale } = useBloom();
  const { all, profile } = useHealth();
  const list = useMemo(() => foodInsights(all, profile, datesBack(date, 60)).slice(0, 4), [all, profile, date]);
  const tagName = (x: string) => ((FOOD_TAGS as readonly string[]).includes(x) ? t(`hlTag_${x}` as StringKey) : x);
  return (
    <section className="w-card hl-ibd hl-insights">
      <CardHead title={t('hlInsights')} tip={t('hlInsightNote')} />
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
    </section>
  );
}
