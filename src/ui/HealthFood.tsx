// Food tab: meals and (separately) small snacks, with calories from the
// built-in Israeli Ministry of Health food list (offline) and, if turned on,
// Open Food Facts products and barcodes (online). Totals for the day.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { StringKey } from '../i18n/strings';
import { platform } from '../platform/api';
import { newMeta } from '../shared/db';
import { autoTags, forGrams, OFF_FIELDS, packWeight, parseOff, piecesToGrams, pieceWeight, searchIL, validBarcode, type FoodProduct, type FoodsIL } from '../shared/food';
import { addDays, parseISODate, toISODate } from '../shared/dates';
import { FOOD_TAGS, forDate, healthOf } from '../shared/health';
import { foodSeries, type FoodMetric } from '../shared/healthExtras';
import type { HealthFood, HealthFoodPack, ISODate } from '../shared/types';
import { Button, Field, Icon, IconButton, Modal, Segmented } from './common';
import { CardHead, LineChart, NumBox, Pills, Tip, useHealth, useWaterFmt } from './healthUi';
import { DaySummary } from './HealthDay';
import { useBloom } from './store';

const MEALS: HealthFood['meal'][] = ['breakfast', 'lunch', 'dinner'];
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
  const items = healthOf(all, 'food').filter((f) => f.date === date);
  const by = (k: Kind) => items.filter((f) => kindOf(f) === k).sort((a, b) => (k === 'meal' ? MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) : 0) || a.time.localeCompare(b.time));
  const meals = by('meal');
  const snacks = by('snack');
  const drinks = by('drink');
  return (
    <div className="wallet-body wl-two hl-two">
      <div className="wl-main">
        <section className="w-card hl-food">
          <CardHead sticker="restaurant" title={t('hlMeals')} />
          <FoodAdd date={date} isToday={isToday} kind="meal" />
          {meals.length === 0 ? <EmptyFood /> : <FoodList list={meals} onEdit={setEditing} />}
        </section>
        <section className="w-card hl-food hl-snacks">
          <CardHead sticker="coffee" title={t('hlSnacks')} tip={t('hlSnacksSub')} />
          <FoodAdd date={date} isToday={isToday} kind="snack" />
          {snacks.length > 0 && <FoodList list={snacks} chips onEdit={setEditing} />}
        </section>
        <section className="w-card hl-food hl-drinks">
          <CardHead sticker="party" title={t('hlDrinks')} tip={t('hlDrinksSub')} />
          <FoodAdd date={date} isToday={isToday} kind="drink" />
          {drinks.length > 0 && <FoodList list={drinks} chips onEdit={setEditing} />}
        </section>
      </div>
      <div className="wl-side">
        <TotalsCard meals={meals} snacks={snacks} drinks={drinks} />
        <WaterTodayCard date={date} goalMl={goalMl} />
        <FoodHistoryCard date={date} />
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
  return (
    <section className="w-card hl-food-hist">
      <CardHead sticker="idea" title={t('hlFoodHistory')} />
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
          />
          <p className="hl-legend-line">
            <i className="dot" /> {name} · {t('hlFoodPerDay')} {points.length >= 3 && <><i className="dash" /> {t('hlTrendLine')}</>}
            {avg != null && <span className="hl-legend-avg">{t('hlAvg', { v: fmt(avg) })}</span>}
          </p>
        </div>
      )}
      {day && <DaySummary date={day} onClose={() => setDay(null)} />}
    </section>
  );
}

function EmptyFood() {
  const { t } = useBloom();
  return <p className="empty-note">{t('hlNoFood')}</p>;
}

const tagName = (x: string, t: ReturnType<typeof useBloom>['t']) => ((FOOD_TAGS as readonly string[]).includes(x) ? t(`hlTag_${x}` as StringKey) : x);

function FoodList({ list, chips, onEdit }: { list: HealthFood[]; chips?: boolean; onEdit: (f: HealthFood) => void }) {
  const { t, locale } = useBloom();
  const kcal = (f: HealthFood) => (f.kcal != null ? t('hlKcal', { n: f.kcal.toLocaleString(locale) }) : '');
  const amount = (f: HealthFood) =>
    f.pieces && f.grams
      ? t('hlPiecesAmount', { n: f.pieces.toLocaleString(locale), g: Math.round(f.grams).toLocaleString(locale) })
      : f.grams
        ? kindOf(f) === 'drink'
          ? t('hlMl', { n: f.grams })
          : t('hlGrams', { n: f.grams })
        : '';
  if (chips)
    return (
      <ul className="hl-snack-list">
        {list.map((f) => (
          <li key={f.id} className="hl-snack">
            <button type="button" className="hl-snack-edit" title={t('hlEditFood')} onClick={() => onEdit(f)}>
              <span dir="auto">{f.text}</span>
              {f.grams ? <span className="muted">{amount(f)}</span> : null}
              {f.kcal != null && <b>{kcal(f)}</b>}
            </button>
            <button type="button" aria-label={t('delete')} title={t('delete')} onClick={() => void platform.remove('health', f.id)}>
              ×
            </button>
          </li>
        ))}
      </ul>
    );
  return (
    <ul className="hl-list">
      {list.map((f) => (
        <li key={f.id} className="hl-food-item">
          <span className="hl-food-meal">{t(`hlMeal_${f.meal}` as StringKey)}</span>
          <button type="button" className="hl-food-text" dir="auto" title={t('hlEditFood')} onClick={() => onEdit(f)}>
            {f.text}
            {f.grams ? <span className="muted small">{amount(f)}</span> : null}
            {f.tags.map((x) => (
              <span key={x} className="hl-tag">
                {tagName(x, t)}
              </span>
            ))}
          </button>
          {f.kcal != null && <span className="hl-food-kcal">{kcal(f)}</span>}
          <IconButton icon="close" label={t('delete')} onClick={() => void platform.remove('health', f.id)} />
        </li>
      ))}
    </ul>
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
      <span className="hl-total-kcal">{t('hlKcal', { n: kcal.toLocaleString(locale) })}</span>
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

/** Small "Food today" card for the Today tab (opens the Food tab). */
export function FoodSummaryCard({ date, onOpen }: { date: ISODate; onOpen: () => void }) {
  const { t, locale } = useBloom();
  const { all } = useHealth();
  const items = healthOf(all, 'food').filter((f) => f.date === date);
  const snacks = items.filter((f) => kindOf(f) === 'snack').length;
  const drinks = items.filter((f) => kindOf(f) === 'drink').length;
  const kcal = items.reduce((a, f) => a + (f.kcal ?? 0), 0);
  return (
    <button type="button" className="w-card hl-food-sum" onClick={onOpen}>
      <CardHead sticker="cooking" title={t('hlFoodToday')}>
        <span className="hl-food-sum-kcal">{t('hlKcal', { n: Math.round(kcal).toLocaleString(locale) })}</span>
      </CardHead>
      <span className="w-card-sub">{items.length ? t('hlFoodCounts3', { m: items.length - snacks - drinks, s: snacks, d: drinks }) : t('hlNoFood')}</span>
    </button>
  );
}

// ---------------------------------------------------------------- edit a logged item

export function FoodEditor({ init, onClose }: { init: HealthFood; onClose: () => void }) {
  const { t, save, del, locale } = useBloom();
  const [f, setF] = useState(init);
  const kind = kindOf(init);
  const [tagsOpen, setTagsOpen] = useState(false);
  const setGrams = (grams: number | null) => {
    if (f.per100 && grams) setF({ ...f, grams, pieces: null, pieceG: null, ...forGrams(f.per100, grams) });
    else setF({ ...f, grams, pieces: null, pieceG: null });
  };
  const setPieces = (pieces: number | null) => {
    if (!pieces || !f.pieceG) return setF({ ...f, pieces });
    const grams = piecesToGrams(pieces, f.pieceG);
    setF({ ...f, pieces, grams, ...(f.per100 ? forGrams(f.per100, grams) : {}) });
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
        {kind === 'meal' && (
          <Pills label={t('hlMeals')} value={f.meal} onChange={(v) => v && setF({ ...f, meal: v })} options={MEALS.map((x) => ({ value: x, label: t(`hlMeal_${x}` as StringKey) }))} />
        )}
        <div className="hl-form-row">
          {f.pieceG ? (
            <Field label={t('hlByPieces')}>
              <NumBox value={f.pieces ?? null} onChange={setPieces} min={0.5} max={500} step={0.5} unit={t('hlUnitPcs')} label={t('hlByPieces')} />
            </Field>
          ) : null}
          <Field label={kind === 'drink' ? t('hlAmountMl') : t('hlPortion')}>
            <NumBox value={f.grams ?? null} onChange={setGrams} min={1} max={5000} unit={kind === 'drink' ? t('hlUnitMl') : t('hlUnitG')} label={t('hlPortion')} />
          </Field>
          <Field label={t('hlKcalManual')}>
            <NumBox value={f.kcal ?? null} onChange={(kcal) => setF({ ...f, kcal, per100: null })} min={0} max={10000} unit={t('hlKcalUnit')} label={t('hlKcalManual')} />
          </Field>
        </div>
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

export function FoodAdd({ date, isToday, kind, onAdded }: { date: ISODate; isToday: boolean; kind: Kind; onAdded?: () => void }) {
  const { t, locale, save, settings } = useBloom();
  const lang = settings.language;
  const drink = kind === 'drink';
  const [text, setText] = useState('');
  // Your own short name for the picked product ("XL"); the search box keeps the full title.
  const [title, setTitle] = useState('');
  const [db, setDb] = useState<FoodsIL | null>(null);
  const [online, setOnline] = useState<FoodProduct[] | 'busy' | 'loading' | null>(null);
  const [pick, setPick] = useState<FoodProduct | null>(null);
  const [grams, setGrams] = useState<number | null>(drink ? 250 : 100);
  const [manualKcal, setManualKcal] = useState<number | null>(null);
  const [meal, setMeal] = useState<HealthFood['meal']>(() => mealFor(new Date().getHours()));
  const [tags, setTags] = useState<string[]>([]);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [scan, setScan] = useState(false);
  const [open, setOpen] = useState(false);
  // How much: grams, a number of pieces ("5 cookies") or part of the box.
  const { all } = useHealth();
  const [mode, setMode] = useState<'grams' | 'pieces' | 'box'>('grams');
  const [pieces, setPieces] = useState<number | null>(1);
  const [frac, setFrac] = useState(0.5);
  const [boxOpen, setBoxOpen] = useState(false);
  const mineOf = (p: FoodProduct) => healthOf(all, 'foodpack').find((x) => x.productId === p.id) ?? null;
  const mine = pick ? mineOf(pick) : null;
  const piece = pick && !drink ? pieceWeight(pick, mine) : null;
  const pack = pick && !drink ? packWeight(pick, mine) : null;
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
    setGrams(p.portions[0]?.grams ?? (drink ? 250 : 100));
    setTags(autoTags(p, drink));
    setOpen(false);
    // Counted foods (cookies, crackers…) start in pieces when one piece's weight is known.
    const w = drink ? null : pieceWeight(p, mineOf(p));
    setMode(w && w.source !== 'typical' ? 'pieces' : 'grams');
    setPieces(1);
    setFrac(0.5);
    setBoxOpen(false);
  };
  const reset = () => {
    setText('');
    setPick(null);
    setGrams(drink ? 250 : 100);
    setManualKcal(null);
    setTags([]);
    setOnline(null);
    setTagsOpen(false);
    setMode('grams');
    setBoxOpen(false);
    setTitle('');
  };
  const useGrams =
    mode === 'pieces' ? (piece && pieces ? piecesToGrams(pieces, piece.grams) : null) : mode === 'box' ? (pack ? Math.round(pack * frac * 10) / 10 : null) : grams;
  const n = pick && useGrams ? forGrams(pick, useGrams) : null;
  const ok = !!text.trim();
  const add = () => {
    if (!ok) return;
    const item: HealthFood = {
      ...newMeta(),
      kind: 'food',
      date,
      time: isToday ? nowTime() : '',
      meal: kind === 'drink' ? 'drink' : kind === 'snack' ? 'snack' : meal,
      snack: kind === 'snack',
      text: (pick && title.trim()) || text.trim(),
      product: pick ? text.trim() : undefined,
      tags,
      grams: pick ? useGrams : null,
      kcal: n ? n.kcal : manualKcal,
      protein: n?.protein ?? null,
      fat: n?.fat ?? null,
      carbs: n?.carbs ?? null,
      per100: pick ? { kcal: pick.kcal, protein: pick.protein, fat: pick.fat, carbs: pick.carbs } : null,
      source: pick ? pick.source : manualKcal != null ? 'manual' : undefined,
      productId: pick?.id,
      pieces: pick && mode === 'pieces' && piece ? pieces : null,
      pieceG: pick && mode === 'pieces' && piece ? piece.grams : null,
    };
    save('health', item);
    reset();
    onAdded?.();
  };
  // Real products (online, with a brand) first, then the general database entries.
  const results = [...(Array.isArray(online) ? online.slice(0, 6) : []), ...local];
  const isWater = drink && /^(water|מים)$/i.test(text.trim());
  const portions = drink ? [250, 330, 500] : [50, 100, 200];

  return (
    <>
    <form
      className="hl-food-add"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      {kind === 'meal' && <Pills label={t('hlMeals')} value={meal} onChange={(v) => v && setMeal(v)} options={MEALS.map((x) => ({ value: x, label: t(`hlMeal_${x}` as StringKey) }))} />}
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
      {pick && <NutritionLabel p={pick} grams={useGrams} drink={drink} pieces={mode === 'pieces' && piece ? pieces : null} />}
      {pick && !drink && (
        <Segmented
          label={t('hlPortion')}
          value={mode}
          onChange={(m) => {
            setMode(m);
            setBoxOpen(false);
          }}
          options={[
            { value: 'grams' as const, label: t('hlByGrams') },
            { value: 'pieces' as const, label: t('hlByPieces') },
            { value: 'box' as const, label: t('hlByBox') },
          ]}
        />
      )}
      {pick ? (
        <div className="hl-portion">
          {mode === 'pieces' ? (
            <>
              <NumBox value={pieces} onChange={setPieces} min={0.5} max={500} step={0.5} unit={t('hlUnitPcs')} label={t('hlByPieces')} />
              {piece ? (
                <span className="hl-piece-info">
                  {t('hlPieceEach', { g: piece.grams.toLocaleString(locale) })}
                  <small className={`hl-piece-src ${piece.source}`}>{t(piece.source === 'yours' ? 'hlPieceYours' : piece.source === 'label' ? 'hlPieceLabel' : 'hlPieceTypical')}</small>
                </span>
              ) : (
                <span className="hl-piece-info muted">{t('hlPieceUnknown')}</span>
              )}
            </>
          ) : mode === 'box' ? (
            <>
              <div className="hl-pills">
                {[
                  [0.25, '¼'],
                  [1 / 3, '⅓'],
                  [0.5, '½'],
                  [0.75, '¾'],
                  [1, t('hlWholeBox')],
                ].map(([v, label]) => (
                  <button type="button" key={String(v)} className={frac === v ? 'active' : ''} onClick={() => setFrac(v as number)}>
                    {label}
                  </button>
                ))}
              </div>
              {pack ? <span className="hl-piece-info muted">{t('hlOfBox', { g: pack.toLocaleString(locale) })}</span> : <span className="hl-piece-info muted">{t('hlBoxUnknown')}</span>}
            </>
          ) : (
            <>
          <NumBox value={grams} onChange={setGrams} min={1} max={5000} unit={drink ? t('hlUnitMl') : t('hlUnitG')} label={t('hlPortion')} />
          <div className="hl-pills">
            {[...pick.portions.slice(0, 4).map((p) => ({ label: `${p.label} (${t(drink ? 'hlMl' : 'hlGrams', { n: p.grams })})`, grams: p.grams })), ...portions.map((g) => ({ label: t(drink ? 'hlMl' : 'hlGrams', { n: g }), grams: g }))].map((p, i) => (
              <button type="button" key={i} className={grams === p.grams ? 'active' : ''} onClick={() => setGrams(p.grams)} dir="auto">
                {p.label}
              </button>
            ))}
          </div>
            </>
          )}
          {mode !== 'grams' && (
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
          </div>
        )
      )}
      {pick && !drink && mode !== 'grams' && (boxOpen || (mode === 'pieces' ? !piece : !pack)) && (
        <MyBox key={pick.id} product={pick} mine={mine} onSaved={() => setBoxOpen(false)} />
      )}
      {text.trim() && <TagPicker tags={tags} open={tagsOpen} onOpen={setTagsOpen} onChange={setTags} />}
      <div className="hl-food-actions">
        {(pick || text) && (
          <Button variant="ghost" onClick={reset}>
            {t('cancel')}
          </Button>
        )}
        <Button variant="primary" icon="plus" disabled={!ok} onClick={add}>
          {kind === 'drink' ? t('hlAddDrink') : kind === 'snack' ? t('hlAddSnack') : t('hlAddFood')}
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

function NutritionLabel({ p, grams, drink, pieces }: { p: FoodProduct; grams: number | null; drink: boolean; pieces: number | null }) {
  const { t, locale } = useBloom();
  const n = grams ? forGrams(p, grams) : null;
  const num = (x: number) => (Math.round(x * 10) / 10).toLocaleString(locale);
  const scaled = (v?: number) => (v != null && grams ? num((v * grams) / 100) : null);
  const g = t('hlGramsUnit');
  const amount = !grams
    ? null
    : pieces
      ? t('hlPiecesAmount', { n: pieces.toLocaleString(locale), g: Math.round(grams).toLocaleString(locale) })
      : drink
        ? t('hlMl', { n: Math.round(grams).toLocaleString(locale) })
        : t('hlGrams', { n: num(grams) });
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
