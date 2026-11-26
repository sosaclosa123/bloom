// Food tab: meals and (separately) small snacks, with calories from the
// built-in Israeli Ministry of Health food list (offline) and, if turned on,
// Open Food Facts products and barcodes (online). Totals for the day.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { StringKey } from '../i18n/strings';
import { platform } from '../platform/api';
import { newMeta } from '../shared/db';
import { amountUnits, foodKey, healthMark, nutrientsFor, startGrams, unitGrams, type AmountUnit, autoTags, FOOD_LABELS, forGrams, itemForGrams, itemOf, labelOf, OFF_FIELDS, parseOff, recipeFood, recipeTotals, searchIL, validBarcode, type FoodProduct, type FoodsIL } from '../shared/food';
import { markOf } from '../shared/nutrition';
import { addDays, parseISODate, toISODate } from '../shared/dates';
import { calorieBalance, dayBalance, energyGoal, energySummary, FOOD_TAGS, forDate, healthOf, LOW_DAY_SHARE, latestWeight } from '../shared/health';
import { foodSeries, type FoodMetric } from '../shared/healthExtras';
import type { CalorieGoal, CaloriePace, FoodLabel, HealthFood, HealthFoodPack, HealthFoodPref, HealthRecipe, ISODate, RecipeItem } from '../shared/types';
import { Button, Field, Icon, IconButton, Modal, Segmented } from './common';
import { CardHead, LineChart, NumBox, Pills, Popover, requestHealthRedo, Tip, useHealth, useWaterFmt } from './healthUi';
import { EnergyNotes } from './HealthProfile';
import { DaySummary } from './HealthDay';
import { useBloom } from './store';

const mealFor = (h: number): HealthFood['meal'] => (h < 11 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner');
const OFF = 'https://world.openfoodfacts.org';

let ilCache: Promise<FoodsIL> | null = null;
/** The offline food list is loaded only when Food is opened (it's large). */
export function loadFoodsIL(): Promise<FoodsIL> {
  ilCache ??= import('../data/foods-il.json').then((m) => m.default as unknown as FoodsIL);
  return ilCache;
}

export async function offBarcode(code: string, lang: 'en' | 'he'): Promise<FoodProduct | null | 'error'> {
  try {
    const r = await fetch(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
    if (r.status === 404) return null;
    if (!r.ok) return 'error';
    const j = (await r.json()) as { status?: number; product?: Record<string, unknown> };
    return j.status === 1 ? parseOff(j.product, lang) : null;
  } catch {
    return 'error';
  }
}

async function offSearch(q: string, lang: 'en' | 'he'): Promise<FoodProduct[] | 'error'> {
  try {
    const r = await fetch(`${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&json=1&page_size=15&fields=${OFF_FIELDS}`);
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return 'error'; // busy / rate-limited
    const j = (await r.json()) as { products?: Record<string, unknown>[] };
    return (j.products ?? []).map((p) => parseOff(p, lang)).filter((p): p is FoodProduct => !!p);
  } catch {
    return 'error';
  }
}

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// ---------------------------------------------------------------- the Food tab

export type Kind = 'meal' | 'snack' | 'drink';
const kindOf = (f: HealthFood): Kind => (f.meal === 'drink' ? 'drink' : f.snack || f.meal === 'snack' ? 'snack' : 'meal');

export function FoodTab({ date, isToday, goalMl }: { date: ISODate; isToday: boolean; goalMl: number }) {
  const { t } = useBloom();
  const { all } = useHealth();
  const [editing, setEditing] = useState<HealthFood | null>(null);
  const items = healthOf(all, 'food')
    .filter((f) => f.date === date)
    .sort((a, b) => a.time.localeCompare(b.time) || a.createdAt - b.createdAt);
  const by = (k: Kind) => items.filter((f) => kindOf(f) === k);
  return (
    <div className="wallet-body wl-two hl-two">
      <div className="wl-main">
        {/* One box to add any food; the pill (meal, snack, drink, healthy...) is picked in it. */}
        <section className="w-card hl-food">
          <CardHead sticker="restaurant" title={t('hlAddFoodTitle')} />
          <FoodAdd date={date} isToday={isToday} />
          <MyMealsChips date={date} isToday={isToday} />
        </section>
        {/* All food of the day in one list, a pill on every line. */}
        <section className="w-card hl-food">
          <CardHead sticker="cooking" title={isToday ? t('hlTodayFood') : t('hlDayFood')} />
          {items.length === 0 ? <EmptyFood /> : <FoodList list={items} onEdit={setEditing} />}
        </section>
      </div>
      <div className="wl-side">
        <TotalsCard meals={by('meal')} snacks={by('snack')} drinks={by('drink')} />
        <WaterTodayCard date={date} goalMl={goalMl} />
        <MyMealsCard date={date} isToday={isToday} />
        <FoodHistoryCard date={date} />
        <CalorieBalanceCard date={date} />
      </div>
      {editing && <FoodEditor init={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- history line (same LineChart as Trends)

function FoodHistoryCard({ date }: { date: ISODate }) {
  const { t, locale } = useBloom();
  const { all } = useHealth();
  const [range, setRange] = useState<7 | 30 | 90 | 365 | 0>(30);
  const [metric, setMetric] = useState<FoodMetric>('kcal');
  const [day, setDay] = useState<ISODate | null>(null);
  const from = range === 0 ? '0000-01-01' : toISODate(addDays(parseISODate(date), -(range - 1)));
  const points = useMemo(() => foodSeries(all, metric, from, date), [all, metric, from, date]);
  const fmt = (v: number) => (metric === 'kcal' ? t('hlKcal', { n: Math.round(v).toLocaleString(locale) }) : t('hlGrams', { n: (Math.round(v * 10) / 10).toLocaleString(locale) }));
  const metrics: { value: FoodMetric; label: string }[] = [
    { value: 'kcal', label: t('hlLblCalories') },
    { value: 'carbs', label: t('hlLblCarbs') },
    { value: 'fat', label: t('hlLblFat') },
    { value: 'protein', label: t('hlLblProtein') },
  ];
  const name = metrics.find((x) => x.value === metric)?.label ?? '';
  const avg = points.length ? points.reduce((a, p) => a + p.value, 0) / points.length : null;
  // Calorie + protein goal from the health questions (sources in shared/health.ts).
  const { profile, ibd } = useHealth();
  const goal = energyGoal(profile, latestWeight(all, date), { ibd });
  const [editGoal, setEditGoal] = useState(false);
  const kcalPoints = useMemo(() => (metric === 'kcal' ? points : foodSeries(all, 'kcal', from, date)), [metric, points, all, from, date]);
  const sum = goal ? energySummary(kcalPoints, goal, toISODate(new Date())) : null;
  const n = (v: number) => Math.round(v).toLocaleString(locale);
  const signed = (v: number) => (v > 0 ? `+${n(v)}` : v < 0 ? `−${n(-v)}` : '0');
  const chartGoal =
    goal && metric === 'kcal'
      ? { value: goal.target, label: t('hlGoalLine', { v: n(goal.target) }) }
      : goal && metric === 'protein'
        ? { value: goal.protein, label: t('hlGoalLine', { v: t('hlGrams', { n: goal.protein }) }) }
        : undefined;
  const chartRef = goal && metric === 'kcal' && Math.abs(goal.burn - goal.target) >= 10 ? { value: goal.burn, label: t('hlKeepLine', { v: n(goal.burn) }) } : undefined;
  return (
    <section className="w-card hl-food-hist">
      <CardHead sticker="idea" title={t('hlFoodHistory')} />
      {goal ? (
        <div className="hl-cal-goal">
          <div className="hl-cal-goal-main">
            <span className="hl-goal-label">
              {t('hlCalGoal')} · {t(`hlGoal_${goal.goal}` as StringKey)}
            </span>
            <Tip text={t('hlCalGoalWhy', { b: n(goal.bmr), burn: n(goal.burn) })}>
              <strong className="hl-num-font">{t('hlKcalPerDay', { n: n(goal.target) })}</strong>
            </Tip>
            <span className="muted small">{t('hlProteinGoal', { n: n(goal.protein) })}</span>
          </div>
          <button type="button" className="link-btn" onClick={() => setEditGoal(true)}>
            {t('hlGoalChange')}
          </button>
          <EnergyNotes goal={goal} />
        </div>
      ) : (
        <div className="hl-cal-goal">
          <span className="muted small">{t('hlNoGoal')}</span>
          <button type="button" className="link-btn" onClick={() => requestHealthRedo()}>
            {t('hlStart')}
          </button>
        </div>
      )}
      <Segmented
        value={range}
        onChange={setRange}
        label={t('hlFoodHistory')}
        options={[
          { value: 7, label: t('hlWeek') },
          { value: 30, label: t('hlNDays', { n: 30 }) },
          { value: 90, label: t('hlNDays', { n: 90 }) },
          { value: 365, label: t('hlYear') },
          { value: 0, label: t('hlFromStart') },
        ]}
      />
      <Pills className="hl-metric-pills" label={t('hlFoodHistory')} value={metric} onChange={(v) => v && setMetric(v)} options={metrics} />
      {points.length === 0 ? (
        <p className="empty-note hl-chart-empty">{t('hlNoData')}</p>
      ) : (
        <div className="hl-chart-box">
          <LineChart
            onPick={setDay}
            dateLabel={(d) => parseISODate(d).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            label={`${t('hlFoodHistory')}: ${name}`}
            points={points}
            fmt={fmt}
            goal={chartGoal}
            refLine={chartRef}
          />
          <p className="hl-legend-line">
            <i className="dot" /> {name} · {t('hlFoodPerDay')} {points.length >= 3 && <><i className="dash" /> {t('hlTrendLine')}</>}
            {avg != null && <span className="hl-legend-avg">{t('hlAvg', { v: fmt(avg) })}</span>}
          </p>
        </div>
      )}
      {goal && sum && metric === 'kcal' && (
        <>
          <div className="hl-cal-sum">
            <span>
              <b>{n(sum.avg)}</b>
              {t('hlAvgDay')}
            </span>
            <span>
              <b dir="ltr">{signed(sum.vsBurn)}</b>
              {t('hlVsBurn')}
            </span>
            <span>
              <b>
                <bdi dir="ltr">
                  {sum.kgPerWeek > 0 ? '+' : sum.kgPerWeek < 0 ? '−' : ''}
                  {Math.abs(sum.kgPerWeek).toLocaleString(locale)}
                </bdi>{' '}
                {t('hlUnitKg')}
              </b>
              {t('hlPerWeekKg')}
            </span>
          </div>
          <p className="muted small hl-cal-days">{sum.days < 3 ? t('hlFewDays') : t('hlDaysLogged', { n: sum.days })}</p>
        </>
      )}
      {goal && <p className="muted small hl-cal-src">{t('hlGoalSources')} · {t('hlNotAdvice')}</p>}
      {day && <DaySummary date={day} onClose={() => setDay(null)} />}
      {editGoal && <GoalEditor onClose={() => setEditGoal(false)} />}
    </section>
  );
}

// ---------------------------------------------------------------- calorie balance (owner, Nov 2026)

/** Is this balance good for the person's goal? (lose: deficit; gain: surplus; keep/recomp: about even) */
function balanceTone(goal: CalorieGoal, v: number): 'good' | 'bad' | 'neutral' {
  if (goal === 'lose') return v <= -100 ? 'good' : v >= 100 ? 'bad' : 'neutral';
  if (goal === 'gain') return v >= 100 ? 'good' : v <= -100 ? 'bad' : 'neutral';
  return Math.abs(v) < 250 ? 'good' : 'bad';
}

/**
 * What you ate minus what you burn, per day: over = gaining, under = losing,
 * and by how much; a line chart of it (0 = keep weight, dashed = your goal).
 * Today and days with too little logged are left out of averages.
 */
function CalorieBalanceCard({ date }: { date: ISODate }) {
  const { t, locale } = useBloom();
  const { all, profile, ibd } = useHealth();
  const [range, setRange] = useState<7 | 30 | 90 | 365 | 0>(7);
  const [day, setDay] = useState<ISODate | null>(null);
  const today = toISODate(new Date());
  const goal = energyGoal(profile, latestWeight(all, date), { ibd });
  const from = range === 0 ? '0000-01-01' : toISODate(addDays(parseISODate(date), -(range - 1)));
  const kcal = useMemo(() => foodSeries(all, 'kcal', from, date), [all, from, date]);
  const eatenOn = (d: ISODate) => foodSeries(all, 'kcal', d, d)[0]?.value ?? null;
  const n = (v: number) => Math.round(Math.abs(v)).toLocaleString(locale);
  const signed = (v: number) => (v > 0 ? `+${n(v)}` : v < 0 ? `−${n(v)}` : '0');
  if (!goal) {
    return (
      <section className="w-card hl-balance">
        <CardHead sticker="important" title={t('hlBalTitle')} />
        <div className="hl-cal-goal">
          <span className="muted small">{t('hlNoGoal')}</span>
          <button type="button" className="link-btn" onClick={() => requestHealthRedo()}>
            {t('hlStart')}
          </button>
        </div>
      </section>
    );
  }
  const bal = calorieBalance(kcal, goal, today);
  const isToday = date === today;
  const eaten = eatenOn(date);
  const prevDate = toISODate(addDays(parseISODate(date), -1));
  const prev = dayBalance(eatenOn(prevDate), goal.burn);
  const stateText = (b: ReturnType<typeof dayBalance>) =>
    b.state === 'none' ? t('hlBalNone') : b.state === 'partial' ? t('hlBalPartial') : b.state === 'surplus' ? t('hlBalSurplus') : b.state === 'deficit' ? t('hlBalDeficit') : t('hlBalEven');
  const DayBox = ({ label, b }: { label: string; b: ReturnType<typeof dayBalance> }) => (
    <div className={`hl-bal-box ${b.state === 'surplus' || b.state === 'deficit' || b.state === 'even' ? balanceTone(goal.goal, b.value) : 'muted-box'}`}>
      <span className="hl-bal-label">{label}</span>
      <b className="hl-num-font" dir="ltr">
        {b.state === 'none' ? '—' : t('hlKcal', { n: signed(b.value) })}
      </b>
      <span className="hl-bal-state">{stateText(b)}</span>
    </div>
  );
  // Today (not over yet): how much is left before it turns into a surplus, and the goal.
  const todayLeft = goal.burn - (eaten ?? 0);
  const goalLeft = goal.target - (eaten ?? 0);
  const todayPill =
    goal.goal === 'gain'
      ? goalLeft > 0
        ? { tone: 'neutral', text: t('hlBalToGo', { n: n(goalLeft) }) }
        : { tone: 'good', text: t('hlBalOnTrack') }
      : goalLeft >= 0
        ? { tone: 'good', text: t('hlBalOnTrack') }
        : { tone: 'bad', text: t('hlBalOverGoal', { n: n(-goalLeft) }) };
  const goalLabel = t(`hlGoal_${goal.goal}` as StringKey);
  return (
    <section className="w-card hl-balance">
      <CardHead sticker="important" title={t('hlBalTitle')} />
      <p className="muted small hl-bal-burn">
        {t('hlBalBurn', { burn: n(goal.burn), bmr: n(goal.bmr), act: t(`hlAct_${profile?.activity ?? 'sedentary'}` as StringKey) })} · {t('hlBalGoal', { g: goal.goal === 'lose' || goal.goal === 'gain' ? `${goalLabel} (${signed(bal.goal)})` : goalLabel })}
      </p>
      <div className="hl-bal-boxes">
        {isToday ? (
          <div className={`hl-bal-box ${todayPill.tone}`}>
            <span className="hl-bal-label">{t('hlBalToday')}</span>
            <b className="hl-num-font" dir="ltr">
              {n(eaten ?? 0)} / {n(goal.burn)}
            </b>
            <span className="hl-bal-state">{todayLeft >= 0 ? t('hlBalLeft', { n: n(todayLeft) }) : t('hlBalOverKeep', { n: n(-todayLeft) })}</span>
            <span className={`hl-bal-pill ${todayPill.tone}`}>{todayPill.text}</span>
          </div>
        ) : (
          <DayBox label={t('hlBalThatDay')} b={dayBalance(eaten, goal.burn)} />
        )}
        <DayBox label={isToday ? t('hlBalYesterday') : t('hlBalDayBefore')} b={prev} />
      </div>
      <Segmented
        value={range}
        onChange={setRange}
        label={t('hlBalTitle')}
        options={[
          { value: 7, label: t('hlWeek') },
          { value: 30, label: t('hlNDays', { n: 30 }) },
          { value: 90, label: t('hlNDays', { n: 90 }) },
          { value: 365, label: t('hlYear') },
          { value: 0, label: t('hlFromStart') },
        ]}
      />
      {bal.days.length === 0 ? (
        <p className="empty-note hl-chart-empty">{t('hlNoData')}</p>
      ) : (
        <div className="hl-chart-box">
          <LineChart
            onPick={setDay}
            dateLabel={(d) => parseISODate(d).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
            label={t('hlBalTitle')}
            points={bal.days}
            fmt={(v) => t('hlKcal', { n: signed(v) })}
            refLine={{ value: 0, label: t('hlBalZero') }}
            goal={bal.goal !== 0 ? { value: bal.goal, label: t('hlGoalLine', { v: signed(bal.goal) }) } : undefined}
          />
          <p className="hl-legend-line">{t('hlBalLegend')}</p>
        </div>
      )}
      {bal.avg != null && (
        <div className="hl-cal-sum">
          <span className={`hl-bal-${balanceTone(goal.goal, bal.avg)}`}>
            <b dir="ltr">{t('hlKcal', { n: signed(bal.avg) })}</b>
            {t('hlAvgDay')}
          </span>
          <span className={`hl-bal-${balanceTone(goal.goal, bal.avg)}`}>
            <b>
              <bdi dir="ltr">
                {bal.kgPerWeek! > 0 ? '+' : bal.kgPerWeek! < 0 ? '−' : ''}
                {Math.abs(bal.kgPerWeek!).toLocaleString(locale)}
              </bdi>{' '}
              {t('hlUnitKg')}
            </b>
            {t('hlPerWeekKg')}
          </span>
          <span>
            <b>{bal.days.length}</b>
            {t('hlBalDays')}
          </span>
        </div>
      )}
      <p className="muted small hl-cal-days">
        {t('hlBalNote')}
        {bal.skipped > 0 && <> {t('hlBalSkipped', { n: bal.skipped, k: n(goal.burn * LOW_DAY_SHARE) })}</>}
      </p>
      <p className="muted small hl-cal-src">
        {t('hlGoalSources')} · {t('hlNotAdvice')}
      </p>
      {day && <DaySummary date={day} onClose={() => setDay(null)} />}
    </section>
  );
}

/** Change the calorie goal + pace (same answers as in the health questions). */
function GoalEditor({ onClose }: { onClose: () => void }) {
  const { t, locale } = useBloom();
  const { profile, ibd, saveProfile, all } = useHealth();
  const [goal, setGoal] = useState<CalorieGoal>(profile?.goal ?? 'keep');
  const [pace, setPace] = useState<CaloriePace>(profile?.pace ?? 'normal');
  const preview = energyGoal({ ...(profile ?? {}), goal, pace }, latestWeight(all, toISODate(new Date())), { ibd });
  return (
    <Modal
      title={t('hlCalGoal')}
      onClose={onClose}
      width={460}
      footer={
        <>
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (profile) {
                const { id: _i, createdAt: _c, updatedAt: _u, deletedAt: _d, ownerId: _o, visibility: _v, ...rest } = profile;
                saveProfile({ ...rest, goal, pace: goal === 'lose' || goal === 'gain' ? pace : null });
              }
              onClose();
            }}
          >
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="hl-form">
        <Pills label={t('hlQGoal')} value={goal} onChange={(v) => v && setGoal(v)} options={(['lose', 'keep', 'gain', 'recomp'] as const).map((x) => ({ value: x, label: t(`hlGoal_${x}` as StringKey) }))} />
        {goal === 'lose' && (
          <Pills label={t('hlQPace')} value={pace} onChange={(v) => v && setPace(v)} options={(['gentle', 'normal', 'fast'] as const).map((x) => ({ value: x, label: t(`hlPaceLose_${x}` as StringKey) }))} />
        )}
        {goal === 'gain' && (
          <Pills label={t('hlQPace')} value={pace === 'fast' ? 'fast' : 'normal'} onChange={(v) => v && setPace(v)} options={(['normal', 'fast'] as const).map((x) => ({ value: x, label: t(`hlPaceGain_${x}` as StringKey) }))} />
        )}
        {preview && (
          <p className="hl-cal-preview">
            <strong className="hl-num-font">{t('hlKcalPerDay', { n: preview.target.toLocaleString(locale) })}</strong>
            <span className="muted small"> · {t('hlProteinGoal', { n: preview.protein.toLocaleString(locale) })}</span>
          </p>
        )}
        {preview && <EnergyNotes goal={preview} />}
      </div>
    </Modal>
  );
}

function EmptyFood() {
  const { t } = useBloom();
  return <p className="empty-note">{t('hlNoFood')}</p>;
}

/** Protein grams as shown everywhere: one decimal at most ("78.5", "20"). */
export const proteinNum = (g: number, locale: string) => (Math.round(g * 10) / 10).toLocaleString(locale);

/** "12.5 g protein" */
export function proteinText(g: number, t: ReturnType<typeof useBloom>['t'], locale: string) {
  return t('hlProtein', { n: proteinNum(g, locale) });
}

/** The colored pill on a food's line (Meal, Snack, Drink, Healthy, Treat, Fast food); tap to change it. */
export function FoodPill({ food, editable = true }: { food: HealthFood; editable?: boolean }) {
  const { t, save } = useBloom();
  const [open, setOpen] = useState(false);
  const l = labelOf(food);
  if (!editable) return <span className={`hl-pill lbl-${l}`}>{t(`hlLbl_${l}` as StringKey)}</span>;
  return (
    <span className="hl-pill-wrap">
      <button
        type="button"
        className={`hl-pill lbl-${l}`}
        data-pop-anchor
        aria-haspopup="dialog"
        aria-expanded={open}
        title={t('hlLblPick')}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        {t(`hlLbl_${l}` as StringKey)}
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)} className="hl-pill-pop">
          <span className="hl-goal-label">{t('hlLblPick')}</span>
          <LabelPills
            value={l}
            onChange={(label) => {
              save('health', withLabel(food, label));
              setOpen(false);
            }}
          />
        </Popover>
      )}
    </span>
  );
}

/**
 * Healthy / less healthy as one small dot on the line (owner chose): green,
 * orange, or none (in between). Automatic from the Nutri-Score grade; tap to
 * choose yourself, remembered for that food from then on.
 */
export function HealthDot({ food, editable = true }: { food: HealthFood; editable?: boolean }) {
  const { t, save } = useBloom();
  const { all } = useHealth();
  const [open, setOpen] = useState(false);
  const prefs = healthOf(all, 'foodpref');
  const m = healthMark(food, prefs);
  const label = m.mark === 'healthy' ? t('hlMarkHealthy') : m.mark === 'less' ? t('hlMarkLess') : t('hlMarkNone');
  const choose = (healthy: 'healthy' | 'less' | null) => {
    const key = foodKey(food);
    const mine = prefs.find((p) => p.key === key);
    const base: HealthFoodPref = mine ?? { ...newMeta(), visibility: 'private', kind: 'foodpref', key, name: food.product ?? food.text };
    save('health', { ...base, healthy });
    setOpen(false);
  };
  const dot = <span className={`hl-dot ${m.mark ?? 'none'} ${m.own ? 'own' : ''}`} aria-hidden="true" />;
  if (!editable) return <span className="hl-dot-wrap" title={label}>{dot}</span>;
  return (
    <span className="hl-dot-wrap">
      <button
        type="button"
        className="hl-dot-btn"
        data-pop-anchor
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${t('hlMarkTitle')}: ${label}`}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
      >
        {dot}
      </button>
      {open && (
        <Popover onClose={() => setOpen(false)} className="hl-dot-pop">
          <span className="hl-goal-label">{t('hlMarkTitle')}</span>
          <div className="hl-dot-picks" role="radiogroup" aria-label={t('hlMarkTitle')}>
            {(['healthy', 'less'] as const).map((x) => (
              <button type="button" key={x} role="radio" aria-checked={m.own && m.mark === x} className={m.own && m.mark === x ? 'on' : ''} onClick={(e) => (e.stopPropagation(), choose(x))}>
                <span className={`hl-dot ${x}`} aria-hidden="true" /> {x === 'healthy' ? t('hlMarkHealthy') : t('hlMarkLess')}
              </button>
            ))}
            <button type="button" role="radio" aria-checked={!m.own} className={!m.own ? 'on' : ''} onClick={(e) => (e.stopPropagation(), choose(null))}>
              {t('hlMarkAuto', { g: m.auto ? m.auto.toUpperCase() : '–' })}
            </button>
          </div>
          <span className="muted small">{t('hlMarkHint')}</span>
        </Popover>
      )}
    </span>
  );
}

/** A food with a new pill (Drink / Snack also set what kind of eating it was). */
function withLabel(f: HealthFood, label: FoodLabel): HealthFood {
  const meal: HealthFood['meal'] = label === 'drink' ? 'drink' : label === 'snack' ? 'snack' : f.meal === 'drink' || f.meal === 'snack' ? mealFor(Number(f.time.slice(0, 2)) || 12) : f.meal;
  return { ...f, label, meal, snack: label === 'snack' };
}

/** The 6 pills to pick from. */
export function LabelPills({ value, onChange }: { value: FoodLabel; onChange: (l: FoodLabel) => void }) {
  const { t } = useBloom();
  return (
    <div className="hl-pill-picks" role="radiogroup" aria-label={t('hlLblPick')}>
      {FOOD_LABELS.map((x) => (
        <button type="button" key={x} role="radio" aria-checked={value === x} className={`hl-pill lbl-${x} ${value === x ? 'on' : ''}`} onClick={(e) => (e.stopPropagation(), onChange(x))}>
          {t(`hlLbl_${x}` as StringKey)}
        </button>
      ))}
    </div>
  );
}

/**
 * Food rows as neat columns (owner chose "C"): meal | food + amount | kcal |
 * protein | edit/delete. Units once in the header, so nothing stacks.
 * Used by the Food tab, Today's log and the day pop-up (phone and PC).
 */
export function FoodTable({
  items,
  onRow,
  name,
  action,
  pillEdit = true,
}: {
  items: HealthFood[];
  /** The whole row is a button (Today's food). */
  onRow?: (f: HealthFood) => void;
  /** The pill can be tapped to change it. */
  pillEdit?: boolean;
  /** Custom food cell (e.g. a button with tags); default = name + amount. */
  name?: (f: HealthFood) => ReactNode;
  action?: (f: HealthFood) => ReactNode;
}) {
  const { t, locale } = useBloom();
  const amount = (f: HealthFood) => (f.recipe ? `${t('hlMyMealTag')}${f.recipe.portions !== 1 ? ` · ×${f.recipe.portions.toLocaleString(locale)}` : ''}` : foodAmount(f, t, locale));
  const cells = (f: HealthFood) => (
    <>
      <span className="hl-ft-meal">
        <HealthDot food={f} editable={pillEdit} />
        <FoodPill food={f} editable={pillEdit} />
      </span>
      <span className="hl-ft-name">
        {name ? (
          name(f)
        ) : (
          <>
            <bdi>{f.text}</bdi>
            {amount(f) ? <small className="hl-ft-amount"> {amount(f)}</small> : null}
          </>
        )}
        {/* Narrow screens: the amount goes under the name. */}
        {amount(f) ? <small className="hl-ft-sub">{amount(f)}</small> : null}
      </span>
      <span className="hl-ft-num hl-ft-kcal">{f.kcal != null ? Math.round(f.kcal).toLocaleString(locale) : '–'}</span>
      <span className="hl-ft-num hl-ft-protein">{f.protein != null ? t('hlGrams', { n: proteinNum(f.protein, locale) }) : '–'}</span>
      <span className="hl-ft-act">{action?.(f)}</span>
    </>
  );
  return (
    <div className="hl-ftable-wrap">
    <div className="hl-ftable" role="table">
      <div className="hl-ft-row hl-ft-head" role="row">
        <span />
        <span>{t('hlFtFood')}</span>
        <span className="hl-ft-num">{t('hlKcalUnit')}</span>
        <span className="hl-ft-num">{t('hlLblProtein')}</span>
        <span />
      </div>
      {items.map((f) =>
        onRow ? (
          // A row you can tap (not a <button>: the pill inside is its own button).
          <div
            key={f.id}
            role="row"
            tabIndex={0}
            className="hl-ft-row hl-ft-click"
            title={t('hlEditFood')}
            onClick={() => onRow(f)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget && (e.preventDefault(), onRow(f))}
          >
            {cells(f)}
          </div>
        ) : (
          <div key={f.id} role="row" className="hl-ft-row">
            {cells(f)}
          </div>
        ),
      )}
    </div>
    </div>
  );
}

/** "200 g", "250 ml", "5 pieces (60 g)", "≈ 2 tablespoons (26 g)". */
export function foodAmount(f: HealthFood, t: ReturnType<typeof useBloom>['t'], locale: string) {
  if (!f.grams) return '';
  // Older drinks kept their ml in grams.
  const ml = f.ml ?? (kindOf(f) === 'drink' && !f.unit && !f.pieces ? f.grams : null);
  return amountText({ grams: f.grams, ml, qty: f.qty ?? f.pieces ?? null, unit: f.unit ?? (f.pieces ? 'piece' : null), exact: f.exact }, t, locale);
}

const fmtQty = (n: number, locale: string) => (n === 0.5 ? '½' : n === 0.25 ? '¼' : n === 0.75 ? '¾' : n === 1.5 ? '1½' : (Math.round(n * 100) / 100).toLocaleString(locale));

/** An amount in words; "≈" in front of estimates. */
export function amountText(a: { grams: number; ml?: number | null; qty?: number | null; unit?: string | null; exact?: boolean }, t: ReturnType<typeof useBloom>['t'], locale: string) {
  const g = Math.round(a.grams).toLocaleString(locale);
  const body =
    a.ml != null
      ? t('hlMl', { n: Math.round(a.ml).toLocaleString(locale) })
      : a.unit === 'piece' && a.qty
        ? t('hlPiecesAmount', { n: fmtQty(a.qty, locale), g })
        : a.unit === 'box' && a.qty
          ? t('hlBoxAmount', { n: fmtQty(a.qty, locale), g })
          : a.unit && a.unit !== 'g' && a.unit !== 'ml' && a.qty
            ? t('hlUnitAmount', { n: fmtQty(a.qty, locale), u: a.unit, g })
            : t('hlGrams', { n: g });
  return a.exact === false ? `≈ ${body}` : body;
}

/** A unit in the amount menu: "g", "ml", "pieces (12 g each)", "box (300 g)", "tablespoon (13 g)". */
function unitName(u: AmountUnit, t: ReturnType<typeof useBloom>['t'], locale: string) {
  const each = u.gramsEach != null ? (Math.round(u.gramsEach * 10) / 10).toLocaleString(locale) : '';
  if (u.kind === 'g') return t('hlUnitG');
  if (u.kind === 'ml') return t('hlUnitMl');
  if (u.kind === 'piece') return t('hlUnitPieceEach', { g: each });
  if (u.kind === 'box') return t('hlUnitBoxOf', { g: each });
  return `${u.label} (${t('hlGrams', { n: each })})`;
}

const tagName = (x: string, t: ReturnType<typeof useBloom>['t']) => ((FOOD_TAGS as readonly string[]).includes(x) ? t(`hlTag_${x}` as StringKey) : x);

function FoodList({ list, chips, onEdit }: { list: HealthFood[]; chips?: boolean; onEdit: (f: HealthFood) => void }) {
  const { t, locale } = useBloom();
  const kcal = (f: HealthFood) => (f.kcal != null ? t('hlKcal', { n: f.kcal.toLocaleString(locale) }) : '');
  const amount = (f: HealthFood) => foodAmount(f, t, locale);
  if (chips)
    return (
      <ul className="hl-snack-list">
        {list.map((f) => (
          <li key={f.id} className="hl-snack">
            <button type="button" className="hl-snack-edit" title={t('hlEditFood')} onClick={() => onEdit(f)}>
              <span dir="auto">{f.text}</span>
              {f.grams ? <span className="muted">{amount(f)}</span> : null}
              {f.kcal != null && <b>{kcal(f)}</b>}
              {f.protein != null && <span className="hl-protein">{proteinText(f.protein, t, locale)}</span>}
            </button>
            <button type="button" aria-label={t('delete')} title={t('delete')} onClick={() => void platform.remove('health', f.id)}>
              ×
            </button>
          </li>
        ))}
      </ul>
    );
  return (
    <FoodTable
      items={list}
      name={(f) => (
        <button type="button" className="hl-food-text" title={t('hlEditFood')} onClick={() => onEdit(f)}>
          <bdi>{f.text}</bdi>
          {f.recipe ? <small className="hl-ft-amount"> {t('hlMyMealTag')}</small> : f.grams ? <small className="hl-ft-amount"> {amount(f)}</small> : null}
          {f.tags.map((x) => (
            <span key={x} className="hl-tag">
              {tagName(x, t)}
            </span>
          ))}
        </button>
      )}
      action={(f) => <IconButton icon="close" label={t('delete')} onClick={() => void platform.remove('health', f.id)} />}
    />
  );
}

function TotalsCard({ meals, snacks, drinks }: { meals: HealthFood[]; snacks: HealthFood[]; drinks: HealthFood[] }) {
  const { t, locale, settings } = useBloom();
  const sum = (xs: HealthFood[], k: 'kcal' | 'protein' | 'fat' | 'carbs') => Math.round(xs.reduce((a, f) => a + (f[k] ?? 0), 0) * 10) / 10;
  const allItems = [...meals, ...snacks, ...drinks];
  const kcal = sum(allItems, 'kcal');
  const unknown = allItems.filter((f) => f.kcal == null).length;
  const part = (xs: HealthFood[]) => (kcal ? (sum(xs, 'kcal') / kcal) * 100 : 0);
  return (
    <section className="w-card hl-totals">
      <CardHead title={t('hlFoodTotal')} tip={settings.healthFoodOnline ? t('hlFoodSourceOnline') : t('hlFoodSourceOffline')} />
      <div className="hl-total-line">
        <span className="hl-total-kcal">{t('hlKcal', { n: kcal.toLocaleString(locale) })}</span>
        <span className="hl-total-protein">{proteinText(sum(allItems, 'protein'), t, locale)}</span>
      </div>
      {kcal > 0 && (
        <div className="hl-kcal-bar" aria-hidden="true">
          <span className="meals" style={{ width: `${part(meals)}%` }} />
          <span className="snacks" style={{ width: `${part(snacks)}%` }} />
          <span className="drinks" style={{ width: `${part(drinks)}%` }} />
        </div>
      )}
      <p className="w-card-sub hl-kcal-split">
        <span>
          <i className="meals" /> {t('hlMeals')} {sum(meals, 'kcal').toLocaleString(locale)}
        </span>
        <span>
          <i className="snacks" /> {t('hlSnacks')} {sum(snacks, 'kcal').toLocaleString(locale)}
        </span>
        <span>
          <i className="drinks" /> {t('hlDrinks')} {sum(drinks, 'kcal').toLocaleString(locale)}
        </span>
      </p>
      <div className="hl-macros">
        {(['protein', 'carbs', 'fat'] as const).map((k) => (
          <span key={k}>
            <b>{t('hlGrams', { n: sum(allItems, k).toLocaleString(locale) })}</b>
            {t(`hlMacro_${k}` as StringKey)}
          </span>
        ))}
      </div>
      {unknown > 0 && <p className="muted small hl-score-note">{t('hlFoodUnknown', { n: unknown })}</p>}
    </section>
  );
}

/** Water for the day (logged on the Today tab), shown under the calories. */
function WaterTodayCard({ date, goalMl }: { date: ISODate; goalMl: number }) {
  const { t } = useBloom();
  const { all } = useHealth();
  const fmt = useWaterFmt();
  const ml = forDate(all, 'checkin', date)?.waterMl ?? 0;
  return (
    <section className="w-card hl-water-mini">
      <span className="hl-tile-label">
        <Icon name="drop" size={13} /> {t('hlWater')}
      </span>
      <span className="hl-water-mini-amount">
        {fmt(ml)} <small>{t('hlOfGoal', { v: fmt(goalMl) })}</small>
      </span>
      <div className="hl-water-bar" aria-hidden="true">
        <span style={{ width: `${Math.min(100, (ml / goalMl) * 100)}%` }} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- edit a logged item

export function FoodEditor({ init, onClose }: { init: HealthFood; onClose: () => void }) {
  const { t, save, del, locale } = useBloom();
  const [f, setF] = useState(init);
  const kind = kindOf(init);
  const [tagsOpen, setTagsOpen] = useState(false);
  // The amount is changed in the line's own unit (ml, pieces, cups… or grams); nutrition follows.
  const legacyMl = kind === 'drink' && f.ml == null && !f.unit && !f.pieces ? f.grams : null;
  const amount = f.ml ?? legacyMl ?? f.qty ?? f.pieces ?? f.grams ?? null;
  const each = f.grams && amount ? f.grams / amount : 1;
  const amountUnitLabel = f.ml != null || legacyMl != null ? t('hlUnitMl') : f.unit === 'piece' || f.pieces ? t('hlUnitPcs') : f.unit === 'box' ? t('hlUnitBox') : f.unit ? f.unit : t('hlUnitG');
  const setAmount = (v: number | null) => {
    if (!v) return setF({ ...f, ...(f.ml != null ? { ml: v } : f.qty != null ? { qty: v } : f.pieces ? { pieces: v } : { grams: v }) });
    const grams = Math.round(v * each * 10) / 10;
    const next: HealthFood = { ...f, grams, ...(f.ml != null ? { ml: v } : {}), ...(f.qty != null ? { qty: v } : {}), ...(f.pieces ? { pieces: v } : {}) };
    setF(f.per100 ? { ...next, ...nutrientsFor(f.per100, grams) } : next);
  };
  // A corrected protein amount is kept per 100 g too, so changing the portion keeps it.
  const setProtein = (protein: number | null) => {
    if (protein != null && f.per100 && f.grams) setF({ ...f, protein, per100: { ...f.per100, protein: Math.round((protein / f.grams) * 1000) / 10 } });
    else setF({ ...f, protein });
  };
  const ok = !!f.text.trim();
  return (
    <Modal
      title={t('hlEditFood')}
      onClose={onClose}
      width={480}
      footer={
        <>
          <Button
            variant="ghost"
            icon="trash"
            onClick={() => {
              del('health', init);
              onClose();
            }}
          >
            {t('delete')}
          </Button>
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!ok}
            onClick={() => {
              save('health', { ...f, text: f.text.trim() });
              onClose();
            }}
          >
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="hl-form">
        <Field label={t('hlShowAs')}>
          <input dir="auto" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
        </Field>
        {f.product && f.product !== f.text && (
          <p className="muted small hl-product-of" dir="auto">
            {t('hlProductIs', { p: f.product })}
          </p>
        )}
        <div className="field">
          <span className="field-label">{t('hlLblPick')}</span>
          <LabelPills value={labelOf(f)} onChange={(l) => setF(withLabel(f, l))} />
        </div>
        {f.recipe && (
          <>
            <Pills
              label={t('hlPortionsN')}
              value={f.recipe.portions}
              onChange={(v) => v && setF({ ...f, ...recipeFood({ id: f.recipe!.id, name: f.text, label: labelOf(f), items: f.recipe!.items }, v) })}
              options={[0.5, 1, 1.5, 2, 3].map((x) => ({ value: x, label: `×${x.toLocaleString(locale)}` }))}
            />
            <div className="field">
              <span className="field-label">{t('hlInside')}</span>
              <ul className="hl-meal-inside">
                {f.recipe.items.map((i, k) => (
                  <li key={k}>
                    <bdi>{i.text}</bdi>
                    <small>{i.grams ? t(i.drink ? 'hlMl' : 'hlGrams', { n: Math.round(i.grams * f.recipe!.portions) }) : ''}</small>
                    <b>{i.kcal != null ? t('hlKcal', { n: Math.round(i.kcal * f.recipe!.portions).toLocaleString(locale) }) : '–'}</b>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
        {!f.recipe && <div className="hl-form-row">
          <Field label={t('hlPortion')}>
            <NumBox value={amount} onChange={setAmount} min={f.qty != null || f.pieces ? 0.25 : 1} max={5000} step={f.qty != null || f.pieces ? 0.25 : 1} unit={amountUnitLabel} label={t('hlPortion')} />
          </Field>
          <Field label={t('hlKcalManual')}>
            <NumBox value={f.kcal ?? null} onChange={(kcal) => setF({ ...f, kcal, per100: null })} min={0} max={10000} unit={t('hlKcalUnit')} label={t('hlKcalManual')} />
          </Field>
          <Field label={<Tip text={t('hlProteinFixHint')}>{t('hlProteinFix')}</Tip>}>
            <NumBox value={f.protein ?? null} onChange={setProtein} min={0} max={1000} step={0.5} unit={t('hlUnitG')} label={t('hlProteinFix')} />
          </Field>
        </div>}
        {f.kcal != null && f.protein != null && (
          <span className="hl-portion-kcal">{t('hlMacroShort', { p: (f.protein ?? 0).toLocaleString(locale), c: (f.carbs ?? 0).toLocaleString(locale), f: (f.fat ?? 0).toLocaleString(locale) })}</span>
        )}
        <Field label={t('hlTime')}>
          <input type="time" dir="ltr" className="hl-time-in" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
        </Field>
        <TagPicker tags={f.tags} open={tagsOpen} onOpen={setTagsOpen} onChange={(tags) => setF({ ...f, tags })} />
      </div>
    </Modal>
  );
}

/** Food tags, picked automatically; a folded section to change them. */
function TagPicker({ tags, open, onOpen, onChange }: { tags: string[]; open: boolean; onOpen: (v: boolean) => void; onChange: (t: string[]) => void }) {
  const { t } = useBloom();
  return (
    <div className="hl-tagpick">
      <button type="button" className="hl-toggle-btn" aria-expanded={open} onClick={() => onOpen(!open)}>
        <Icon name="chevronRight" size={14} className="hl-chev" /> {t('hlTagsTitle')}
        {tags.length > 0 && <span className="hl-tagpick-now">{tags.map((x) => tagName(x, t)).join(' · ')}</span>}
      </button>
      {open && (
        <div className="hl-pills hl-food-tags" role="group" aria-label={t('hlTagsTitle')}>
          {FOOD_TAGS.map((x) => {
            const on = tags.includes(x);
            return (
              <button type="button" key={x} aria-pressed={on} className={on ? 'active' : ''} onClick={() => onChange(on ? tags.filter((y) => y !== x) : [...tags, x])}>
                {tagName(x, t)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- add food: search, portion, barcode

const offCache = new Map<string, FoodProduct[]>();

/**
 * Search / barcode / type a food and its amount. Normally saves it to the day
 * with the chosen pill; with `onItem` it hands it over instead (building a
 * meal in "My meals").
 */
export function FoodAdd({ date, isToday, onAdded, onItem }: { date: ISODate; isToday: boolean; onAdded?: () => void; onItem?: (i: RecipeItem) => void }) {
  const { t, locale, save, settings } = useBloom();
  const lang = settings.language;
  const [label, setLabel] = useState<FoodLabel>('meal');
  const kind: Kind = onItem ? 'meal' : label === 'drink' ? 'drink' : label === 'snack' ? 'snack' : 'meal';
  const drink = kind === 'drink';
  const [text, setText] = useState('');
  // Your own short name for the picked product ("XL"); the search box keeps the full title.
  const [title, setTitle] = useState('');
  const [db, setDb] = useState<FoodsIL | null>(null);
  const [online, setOnline] = useState<FoodProduct[] | 'busy' | 'loading' | null>(null);
  const [pick, setPick] = useState<FoodProduct | null>(null);
  const [grams, setGrams] = useState<number | null>(drink ? 250 : 100);
  const [manualKcal, setManualKcal] = useState<number | null>(null);
  const [manualProtein, setManualProtein] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [scan, setScan] = useState(false);
  const [open, setOpen] = useState(false);
  // How much: one number + one unit (owner chose): g, ml, pieces, the box, or a cup / spoon / slice from the data.
  const { all } = useHealth();
  const [qty, setQty] = useState<number | null>(100);
  const [unitKey, setUnitKey] = useState('g');
  const [boxOpen, setBoxOpen] = useState(false);
  const mineOf = (p: FoodProduct) => healthOf(all, 'foodpack').find((x) => x.productId === p.id) ?? null;
  const mine = pick ? mineOf(pick) : null;
  const units = pick ? amountUnits(pick, mine) : [];
  const unit = units.find((u) => u.key === unitKey) ?? units[0] ?? null;
  useEffect(() => {
    void loadFoodsIL().then(setDb);
  }, []);
  const local = useMemo(() => (db && !pick ? searchIL(db, text, lang, 8, { drinks: drink }) : []), [db, text, lang, pick, drink]);
  // Online on: real products are looked up by themselves after a short pause in typing.
  useEffect(() => {
    setOnline(null);
    const q = text.trim();
    if (!settings.healthFoodOnline || pick || q.length < 3) return;
    const key = `${lang}:${q.toLowerCase()}`;
    if (offCache.has(key)) {
      setOnline(offCache.get(key)!);
      return;
    }
    const timer = setTimeout(async () => {
      setOnline('loading');
      const r = await offSearch(q, lang);
      if (r !== 'error') offCache.set(key, r);
      setOnline(r === 'error' ? 'busy' : r);
    }, 900);
    return () => clearTimeout(timer);
  }, [text, settings.healthFoodOnline, pick, lang]);

  const choose = (p: FoodProduct) => {
    // The name you gave this product last time comes back.
    const last = healthOf(all, 'food')
      .filter((f) => f.productId === p.id && f.product && f.text !== f.product)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    setTitle(last?.text ?? '');
    setPick(p);
    setText(p.brand ? `${p.name} (${p.brand})` : p.name);
    setGrams(startGrams(p));
    setTags(autoTags(p, drink || !!p.liquid));
    setOpen(false);
    // Liquids start in ml; counted foods (cookies…) in pieces when one piece's weight is known; else grams.
    const us = amountUnits(p, mineOf(p));
    if (p.liquid) {
      setUnitKey('ml');
      setQty(250);
    } else if (us.some((u) => u.key === 'piece' && u.exact && (u.gramsEach ?? 0) >= 5)) {
      // Counted foods (cookies, crackers) start at 1 piece; tiny pieces (a Bamba puff) start at a normal portion instead.
      setUnitKey('piece');
      setQty(1);
    } else {
      setUnitKey('g');
      setQty(startGrams(p));
    }
    setBoxOpen(false);
  };
  const reset = () => {
    setText('');
    setPick(null);
    setGrams(drink ? 250 : 100);
    setManualKcal(null);
    setManualProtein(null);
    setTags([]);
    setOnline(null);
    setTagsOpen(false);
    setUnitKey('g');
    setQty(100);
    setBoxOpen(false);
    setTitle('');
  };
  const useGrams = pick ? unitGrams(qty, unit) : grams;
  const n = pick && useGrams ? nutrientsFor(pick, useGrams) : null;
  const ok = !!text.trim();
  const add = () => {
    if (!ok) return;
    const item: HealthFood = {
      ...newMeta(),
      kind: 'food',
      date,
      time: isToday ? nowTime() : '',
      meal: kind === 'drink' ? 'drink' : kind === 'snack' ? 'snack' : isToday ? mealFor(new Date().getHours()) : 'lunch',
      snack: kind === 'snack',
      label,
      text: (pick && title.trim()) || text.trim(),
      product: pick ? text.trim() : undefined,
      tags,
      grams: pick ? useGrams : null,
      kcal: n ? n.kcal : manualKcal,
      protein: n ? n.protein : manualProtein,
      fat: n?.fat ?? null,
      carbs: n?.carbs ?? null,
      sugars: n?.sugars ?? null,
      fiber: n?.fiber ?? null,
      satFat: n?.satFat ?? null,
      sodium: n?.sodium ?? null,
      per100: pick
        ? { kcal: pick.kcal, protein: pick.protein, fat: pick.fat, carbs: pick.carbs, sugars: pick.sugars ?? null, fiber: pick.fiber ?? null, satFat: pick.satFat ?? null, sodium: pick.sodium ?? null }
        : null,
      source: pick ? pick.source : manualKcal != null || manualProtein != null ? 'manual' : undefined,
      productId: pick?.id,
      ml: pick && unit?.kind === 'ml' ? qty : null,
      qty: pick && unit && unit.kind !== 'g' && unit.kind !== 'ml' ? qty : null,
      unit: pick && unit ? (unit.kind === 'portion' ? (unit.label ?? null) : unit.kind === 'piece' || unit.kind === 'box' ? unit.kind : null) : null,
      pieces: pick && unit?.kind === 'piece' ? qty : null,
      pieceG: pick && unit?.kind === 'piece' ? unit.gramsEach : null,
      // Measured = exact; a cup / spoon / typical piece / typed-in number = an estimate (≈).
      exact: pick ? !!unit?.exact : false,
      grade: pick?.grade ?? null,
      red: pick?.red ?? [],
    };
    if (onItem) onItem({ ...itemOf(item), drink });
    else save('health', item);
    reset();
    onAdded?.();
  };
  // Real products (online, with a brand) first, then the general database entries.
  const results = [...(Array.isArray(online) ? online.slice(0, 6) : []), ...local];
  const isWater = drink && /^(water|מים)$/i.test(text.trim());

  return (
    <>
    <form
      className="hl-food-add"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      {!onItem && <LabelPills value={label} onChange={setLabel} />}
      <div className="hl-food-row">
        <div className="hl-food-search">
          <input
            dir="auto"
            value={text}
            placeholder={kind === 'drink' ? t('hlDrinkPlaceholder') : kind === 'snack' ? t('hlSnackPlaceholder') : t('hlFoodSearchPlaceholder')}
            aria-label={kind === 'drink' ? t('hlDrinkPlaceholder') : kind === 'snack' ? t('hlSnackPlaceholder') : t('hlFoodSearchPlaceholder')}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onChange={(e) => {
              setText(e.target.value);
              setPick(null);
              setOpen(true);
            }}
          />
          {open && !pick && text.trim().length >= 2 && (
            <div className="hl-food-results" role="listbox">
              {isWater && <p className="hl-fr-empty">{t('hlWaterIsToday')}</p>}
              {results.map((p) => (
                <button type="button" role="option" aria-selected={false} key={p.id} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)}>
                  <span className="hl-fr-name" dir="auto">
                    {p.name}
                    {p.brand && <span className="muted"> · {p.brand}</span>}
                  </span>
                  <span className="hl-fr-kcal">{t(drink ? 'hlKcalPer100ml' : 'hlKcalPer100', { n: Math.round(p.kcal) })}</span>
                  <span className={`hl-fr-src ${p.source}`}>{p.source === 'il' ? t('hlSrcIL') : t('hlSrcOFF')}</span>
                </button>
              ))}
              {results.length === 0 && online !== 'loading' && !isWater && <p className="hl-fr-empty">{t('hlFoodNoMatch')}</p>}
              {settings.healthFoodOnline ? (
                online === 'loading' ? (
                  <p className="hl-fr-empty">{t('hlSearching')}</p>
                ) : online === 'busy' ? (
                  <p className="hl-fr-empty">{t('hlOnlineBusy')}</p>
                ) : null
              ) : (
                <p className="hl-fr-empty">{t('hlOnlineOffHint')}</p>
              )}
            </div>
          )}
        </div>
        <Button icon="search" variant="ghost" onClick={() => setScan(true)} title={t('hlScan')}>
          {t('hlScan')}
        </Button>
      </div>
      {pick && (
        <label className="hl-showas">
          <Tip text={t('hlShowAsTip')}>
            <span>{t('hlShowAs')}</span>
          </Tip>
          <input dir="auto" value={title} maxLength={60} placeholder={pick.name} onChange={(e) => setTitle(e.target.value)} aria-label={t('hlShowAs')} />
        </label>
      )}
      {pick && <NutritionLabel p={pick} grams={useGrams} liquid={!!pick.liquid} amount={useGrams ? amountText({ grams: useGrams, ml: unit?.kind === 'ml' ? qty : null, qty, unit: unit?.kind === 'portion' ? unit.label : unit?.kind, exact: unit?.exact }, t, locale) : null} />}
      {pick ? (
        <div className="hl-portion hl-amount">
          <NumBox value={qty} onChange={setQty} min={unit?.kind === 'g' || unit?.kind === 'ml' ? 1 : 0.25} max={unit?.kind === 'g' || unit?.kind === 'ml' ? 5000 : 500} step={unit?.kind === 'g' || unit?.kind === 'ml' ? 1 : 0.25} label={t('hlPortion')} />
          <select className="hl-unit" value={unit?.key ?? 'g'} aria-label={t('hlUnit')} onChange={(e) => {
            const next = units.find((u) => u.key === e.target.value);
            if (!next) return;
            // Keep about the same amount when switching between g and ml; other units start at 1.
            if ((next.kind === 'g' || next.kind === 'ml') && (unit?.kind === 'g' || unit?.kind === 'ml') && useGrams) setQty(Math.round(useGrams / (next.gramsEach || 1)));
            else if (next.kind !== 'g' && next.kind !== 'ml') setQty(1);
            setUnitKey(next.key);
          }}>
            {units.map((u) => (
              <option key={u.key} value={u.key}>
                {unitName(u, t, locale)}
              </option>
            ))}
          </select>
          <span className={`hl-exact ${unit?.exact ? 'yes' : 'est'}`}>{unit?.exact ? t('hlExact') : t('hlEstimate')}</span>
          {!pick.liquid && (
            <Tip text={t('hlMyBoxHint')}>
              <button type="button" className={`hl-mybox-btn ${boxOpen ? 'active' : ''}`} aria-expanded={boxOpen} onClick={() => setBoxOpen(!boxOpen)}>
                <Icon name="pen" size={13} /> {t('hlMyBox')}
              </button>
            </Tip>
          )}
        </div>
      ) : (
        text.trim() && (
          <div className="hl-portion">
            <Tip text={t('hlKcalManualHint')}>
              <NumBox value={manualKcal} onChange={setManualKcal} min={0} max={10000} unit={t('hlKcalUnit')} label={t('hlKcalManual')} />
            </Tip>
            <Tip text={t('hlKcalManualHint')}>
              <NumBox value={manualProtein} onChange={setManualProtein} min={0} max={1000} step={0.5} unit={t('hlProteinUnit')} label={t('hlProteinFix')} />
            </Tip>
          </div>
        )
      )}
      {pick && boxOpen && <MyBox key={pick.id} product={pick} mine={mine} onSaved={() => setBoxOpen(false)} />}
      {text.trim() && <TagPicker tags={tags} open={tagsOpen} onOpen={setTagsOpen} onChange={setTags} />}
      <div className="hl-food-actions">
        {(pick || text) && (
          <Button variant="ghost" onClick={reset}>
            {t('cancel')}
          </Button>
        )}
        <Button variant="primary" icon="plus" disabled={!ok} onClick={add}>
          {onItem ? t('hlAddToMeal') : kind === 'drink' ? t('hlAddDrink') : kind === 'snack' ? t('hlAddSnack') : t('hlAddFood')}
        </Button>
      </div>
      <button type="submit" hidden />
    </form>
    {scan && (
      <BarcodeModal
        onClose={() => setScan(false)}
        onFound={(p) => {
          choose(p);
          setScan(false);
        }}
      />
    )}
    </>
  );
}

// ---------------------------------------------------------------- the picked product, like the label on a package

function NutritionLabel({ p, grams, liquid, amount }: { p: FoodProduct; grams: number | null; liquid: boolean; amount: string | null }) {
  const { t, locale } = useBloom();
  const drink = liquid;
  const n = grams ? forGrams(p, grams) : null;
  const num = (x: number) => (Math.round(x * 10) / 10).toLocaleString(locale);
  const scaled = (v?: number) => (v != null && grams ? num((v * grams) / 100) : null);
  const g = t('hlGramsUnit');
  const rows: [string, string | null, boolean?][] = [
    [t('hlLblProtein'), n ? num(n.protein) : null],
    [t('hlLblCarbs'), n ? num(n.carbs) : null],
    ...(p.sugars ? [[t('hlLblSugars'), scaled(p.sugars), true] as [string, string | null, boolean]] : []),
    [t('hlLblFat'), n ? num(n.fat) : null],
    ...(p.fiber ? [[t('hlLblFiber'), scaled(p.fiber)] as [string, string | null]] : []),
  ];
  return (
    <div className="hl-label">
      <div className="hl-label-head">
        <div>
          <b className="hl-label-name" dir="auto">
            {p.name}
          </b>
          {p.brand && (
            <span className="hl-label-sub" dir="auto">
              {p.brand}
            </span>
          )}
        </div>
        {amount && <span className="hl-label-amt">{amount}</span>}
      </div>
      <div className="hl-label-cal">
        <span>{t('hlLblCalories')}</span>
        <b>{n ? n.kcal.toLocaleString(locale) : '–'}</b>
      </div>
      <dl className="hl-label-rows">
        {rows.map(([label, v, sub]) => (
          <div key={label} className={sub ? 'sub' : ''}>
            <dt>{label}</dt>
            <dd>{v != null ? `${v} ${g}` : '–'}</dd>
          </div>
        ))}
        <div className="per">
          <dt>{t(drink ? 'hlLblPer100ml' : 'hlLblPer100')}</dt>
          <dd>
            {Math.round(p.kcal).toLocaleString(locale)} {t('hlKcalUnit')}
          </dd>
        </div>
      </dl>
      {(markOf(p.grade) || (p.red?.length ?? 0) > 0) && (
        <div className="hl-label-marks">
          {markOf(p.grade) && (
            <span className={`hl-mark ${markOf(p.grade)}`}>
              <span className={`hl-dot ${markOf(p.grade)}`} aria-hidden="true" /> {markOf(p.grade) === 'healthy' ? t('hlMarkHealthy') : t('hlMarkLess')}
            </span>
          )}
          {/* Israeli Ministry of Health red labels. */}
          {p.red?.map((r) => (
            <span key={r} className="hl-red">
              {t(`hlRed_${r}` as StringKey)}
            </span>
          ))}
        </div>
      )}
      <span className="hl-label-src">{t(p.source === 'il' ? 'hlLblFromMoH' : 'hlLblFromOFF')}</span>
    </div>
  );
}

// ---------------------------------------------------------------- my box: weight + pieces, remembered per product

function MyBox({ product, mine, onSaved }: { product: FoodProduct; mine: HealthFoodPack | null; onSaved: () => void }) {
  const { t, save, locale } = useBloom();
  const [packG, setPackG] = useState<number | null>(mine?.packG ?? product.packG ?? null);
  const [count, setCount] = useState<number | null>(mine?.pieces ?? null);
  const each = packG && count ? Math.round((packG / count) * 10) / 10 : null;
  return (
    <div className="hl-mybox">
      <label>
        <span>{t('hlBoxWeight')}</span>
        <NumBox value={packG} onChange={setPackG} min={1} max={5000} unit={t('hlUnitG')} label={t('hlBoxWeight')} />
      </label>
      <label>
        <span>{t('hlBoxPieces')}</span>
        <NumBox value={count} onChange={setCount} min={1} max={1000} unit={t('hlUnitPcs')} label={t('hlBoxPieces')} />
      </label>
      {each != null && <span className="hl-piece-info">{t('hlPieceEach', { g: each.toLocaleString(locale) })}</span>}
      <Button
        size="sm"
        variant="primary"
        disabled={!packG}
        onClick={() => {
          const rec: HealthFoodPack = mine
            ? { ...mine, packG, pieces: count }
            : { ...newMeta(), kind: 'foodpack', productId: product.id, name: product.brand ? `${product.name} (${product.brand})` : product.name, packG, pieces: count };
          save('health', rec);
          onSaved();
        }}
      >
        {t('save')}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------- barcode: webcam, typed number or a photo

type ScanMode = 'camera' | 'type' | 'photo';

function BarcodeModal({ onClose, onFound }: { onClose: () => void; onFound: (p: FoodProduct) => void }) {
  const { t, settings, setSettings } = useBloom();
  const [mode, setMode] = useState<ScanMode>('camera');
  const [code, setCode] = useState('');
  const [state, setState] = useState<'idle' | 'looking' | 'notfound' | 'error' | 'nocamera' | 'badphoto'>('idle');
  const video = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);

  const lookup = async (c: string) => {
    if (busy.current) return;
    busy.current = true;
    setCode(c);
    setState('looking');
    const r = await offBarcode(c, settings.language);
    busy.current = false;
    if (r && r !== 'error') onFound(r);
    else setState(r === 'error' ? 'error' : 'notfound');
  };

  // Webcam: read barcodes continuously until one is found.
  useEffect(() => {
    if (mode !== 'camera' || !settings.healthFoodOnline) return;
    let stop: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(undefined, video.current!, (res) => {
          if (res && !busy.current) void lookup(res.getText());
        });
        if (cancelled) controls.stop();
        else stop = () => controls.stop();
      } catch {
        if (!cancelled) setState('nocamera');
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, settings.healthFoodOnline]);

  const fromPhoto = async (file: File) => {
    setState('looking');
    const url = URL.createObjectURL(file);
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const res = await new BrowserMultiFormatReader().decodeFromImageUrl(url);
      await lookup(res.getText());
    } catch {
      setState('badphoto');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return (
    <Modal title={t('hlScanTitle')} onClose={onClose} width={520} className="hl-scan">
      {!settings.healthFoodOnline ? (
        <div className="hl-scan-off">
          <p>{t('hlScanNeedsOnline')}</p>
          <Button variant="primary" onClick={() => setSettings({ healthFoodOnline: true })}>
            {t('hlTurnOnOnline')}
          </Button>
        </div>
      ) : (
        <div className="hl-form">
          <Segmented
            value={mode}
            onChange={(m) => {
              setMode(m);
              setState('idle');
            }}
            label={t('hlScan')}
            options={[
              { value: 'camera', label: t('hlScanCamera') },
              { value: 'type', label: t('hlScanType') },
              { value: 'photo', label: t('hlScanPhoto') },
            ]}
          />
          {mode === 'camera' && (
            <div className="hl-scan-video">
              <video ref={video} muted playsInline />
              <span className="hl-scan-frame" aria-hidden="true" />
            </div>
          )}
          {mode === 'type' && (
            <form
              className="hl-food-row"
              onSubmit={(e) => {
                e.preventDefault();
                if (validBarcode(code.trim())) void lookup(code.trim());
              }}
            >
              <input autoFocus inputMode="numeric" dir="ltr" value={code} placeholder="7290000066318" aria-label={t('hlScanType')} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              <Button variant="primary" disabled={!validBarcode(code.trim())} onClick={() => void lookup(code.trim())}>
                {t('hlFind')}
              </Button>
            </form>
          )}
          {mode === 'type' && code.length >= 8 && !validBarcode(code) && <p className="hl-q-warn">{t('hlBadBarcode')}</p>}
          {mode === 'photo' && (
            <label className="hl-scan-photo">
              <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && void fromPhoto(e.target.files[0])} />
              <Icon name="image" size={22} /> {t('hlScanPickPhoto')}
            </label>
          )}
          <p className={`hl-scan-state ${state}`} role="status">
            {state === 'looking'
              ? t('hlSearching')
              : state === 'notfound'
                ? t('hlBarcodeNotFound', { c: code })
                : state === 'error'
                  ? t('hlOnlineBusy')
                  : state === 'nocamera'
                    ? t('hlNoCamera')
                    : state === 'badphoto'
                      ? t('hlBadPhoto')
                      : mode === 'camera'
                        ? t('hlScanHint')
                        : ''}
          </p>
        </div>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- "My meals": fixed meals added in one tap (owner, Nov 2026)

/** Adds a saved meal to the day as one food line (its name, the foods inside, N portions). */
function useEatMeal(date: ISODate, isToday: boolean) {
  const { t, save, toast } = useBloom();
  return (r: HealthRecipe, portions = 1) => {
    const kind = r.label === 'drink' ? 'drink' : r.label === 'snack' ? 'snack' : null;
    save('health', {
      ...newMeta(),
      kind: 'food',
      date,
      time: isToday ? nowTime() : '',
      meal: kind ?? (isToday ? mealFor(new Date().getHours()) : 'lunch'),
      snack: kind === 'snack',
      tags: [],
      ...recipeFood(r, portions),
    });
    toast(t('hlMealAdded', { n: r.name }));
  };
}

/** One-tap chips under "Add food". */
export function MyMealsChips({ date, isToday, onAdded }: { date: ISODate; isToday: boolean; onAdded?: () => void }) {
  const { t, locale } = useBloom();
  const { all } = useHealth();
  const meals = healthOf(all, 'recipe').sort((a, b) => a.name.localeCompare(b.name));
  const eat = useEatMeal(date, isToday);
  const [create, setCreate] = useState(false);
  return (
    <div className="hl-meal-chips">
      <span className="hl-goal-label">{t('hlMyMeals')}</span>
      {meals.map((r) => (
        <button
          type="button"
          key={r.id}
          className={`hl-meal-chip lbl-${r.label}`}
          title={`${t('hlEat')}: ${r.name}`}
          onClick={() => {
            eat(r);
            onAdded?.();
          }}
        >
          <Icon name="plus" size={12} />
          <bdi>{r.name}</bdi>
          <b>{(recipeTotals(r.items).kcal ?? 0).toLocaleString(locale)}</b>
        </button>
      ))}
      <button type="button" className="hl-meal-chip new" onClick={() => setCreate(true)}>
        {t('hlCreateMeal')}
      </button>
      {create && <RecipeEditor onClose={() => setCreate(false)} />}
    </div>
  );
}

/** The list of saved meals: eat, edit, create. */
export function MyMealsCard({ date, isToday }: { date: ISODate; isToday: boolean }) {
  const { t, locale } = useBloom();
  const { all } = useHealth();
  const meals = healthOf(all, 'recipe').sort((a, b) => a.name.localeCompare(b.name));
  const eat = useEatMeal(date, isToday);
  const [edit, setEdit] = useState<HealthRecipe | 'new' | null>(null);
  return (
    <section className="w-card hl-meals-card">
      <CardHead sticker="restaurant" title={t('hlMyMeals')}>
        <button type="button" className="link-btn" onClick={() => setEdit('new')}>
          + {t('hlCreateMeal')}
        </button>
      </CardHead>
      {meals.length === 0 && <p className="empty-note">{t('hlNoMeals')}</p>}
      <ul className="hl-meals-list">
        {meals.map((r) => {
          const tot = recipeTotals(r.items);
          return (
            <li key={r.id}>
              <button type="button" className="hl-meals-name" title={t('hlEditMeal')} onClick={() => setEdit(r)}>
                <span className={`hl-pill lbl-${r.label}`}>{t(`hlLbl_${r.label}` as StringKey)}</span>
                <span>
                  <bdi>{r.name}</bdi>
                  <small>
                    {t('hlMealFoods', { n: r.items.length })}
                    {tot.grams ? ` · ${t('hlGrams', { n: Math.round(tot.grams).toLocaleString(locale) })}` : ''}
                    {tot.protein != null ? ` · ${proteinText(tot.protein, t, locale)}` : ''}
                  </small>
                </span>
              </button>
              <b className="hl-meals-kcal">{(tot.kcal ?? 0).toLocaleString(locale)}</b>
              <Button size="sm" variant="primary" icon="plus" onClick={() => eat(r)}>
                {t('hlEat')}
              </Button>
            </li>
          );
        })}
      </ul>
      {edit && <RecipeEditor init={edit === 'new' ? undefined : edit} onClose={() => setEdit(null)} />}
    </section>
  );
}

/** Create / edit a fixed meal: name, pill, foods with amounts; everything is added up. */
function RecipeEditor({ init, onClose }: { init?: HealthRecipe; onClose: () => void }) {
  const { t, locale, save, del } = useBloom();
  const [name, setName] = useState(init?.name ?? '');
  const [label, setLabel] = useState<FoodLabel>(init?.label ?? 'meal');
  const [items, setItems] = useState<RecipeItem[]>(init?.items ?? []);
  const tot = recipeTotals(items);
  const ok = !!name.trim() && items.length > 0;
  const g = (v: number | null) => (v == null ? '–' : t('hlGrams', { n: (Math.round(v * 10) / 10).toLocaleString(locale) }));
  return (
    <Modal
      title={init ? t('hlEditMeal') : t('hlCreateMeal')}
      onClose={onClose}
      width={560}
      className="hl-recipe"
      footer={
        <>
          {init && (
            <Button
              variant="ghost"
              icon="trash"
              onClick={() => {
                del('health', init);
                onClose();
              }}
            >
              {t('hlDeleteMeal')}
            </Button>
          )}
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!ok}
            onClick={() => {
              save('health', { ...(init ?? { ...newMeta(), kind: 'recipe' as const }), name: name.trim(), label, items });
              onClose();
            }}
          >
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="hl-form">
        <Field label={t('hlMealName')}>
          <input dir="auto" value={name} maxLength={60} placeholder={t('hlMealNamePh')} onChange={(e) => setName(e.target.value)} />
        </Field>
        <FoodAdd date={toISODate(new Date())} isToday onItem={(i) => setItems((xs) => [...xs, i])} />
        {items.length === 0 ? (
          <p className="empty-note">{t('hlMealEmpty')}</p>
        ) : (
          <ul className="hl-recipe-items">
            {items.map((i, k) => (
              <li key={k}>
                <bdi className="hl-recipe-name">{i.text}</bdi>
                <NumBox
                  value={i.grams}
                  onChange={(v) => v && setItems((xs) => xs.map((x, j) => (j === k ? itemForGrams(x, v) : x)))}
                  min={1}
                  max={5000}
                  unit={i.drink ? t('hlUnitMl') : t('hlUnitG')}
                  label={i.text}
                />
                <b className="hl-recipe-kcal">{i.kcal != null ? i.kcal.toLocaleString(locale) : '–'}</b>
                <IconButton icon="close" label={t('delete')} onClick={() => setItems((xs) => xs.filter((_, j) => j !== k))} />
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && (
          <div className="field">
            <span className="field-label">{t('hlWholeMeal')}</span>
            <div className="hl-cal-sum hl-recipe-tot">
              <span>
                <b>{(tot.kcal ?? 0).toLocaleString(locale)}</b>
                {t('hlKcalUnit')}
              </span>
              <span>
                <b>{g(tot.protein)}</b>
                {t('hlMacro_protein')}
              </span>
              <span>
                <b>{g(tot.grams)}</b>
                {t('hlTotalG')}
              </span>
              <span>
                <b>{g(tot.carbs)}</b>
                {t('hlMacro_carbs')}
              </span>
              <span>
                <b>{g(tot.sugars)}</b>
                {t('hlSugarsL')}
              </span>
              <span>
                <b>{g(tot.fat)}</b>
                {t('hlMacro_fat')}
              </span>
            </div>
          </div>
        )}
        <div className="field">
          <span className="field-label">{t('hlLblPick')}</span>
          <LabelPills value={label} onChange={setLabel} />
        </div>
      </div>
    </Modal>
  );
}
