// Kitchen (owner, Nov 2026): one meal idea at a time, picked by rules from
// Bloom's own recipe database (no AI). Layout "Mix A + B" (owner chose):
// ONE idea card (picture, name, "35 min · 520 kcal · 46 g protein", Cook it /
// Other, ⓘ why), a small "I'm craving… · My fridge" line, and four small
// buttons: Recipes, Plan, Shopping, Taste, each opening its own window.
// Logic: src/shared/kitchen.ts (tested). Data: src/data/recipes.ts +
// ingredients.ts (lazy chunks, with the MoH food database).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { StringKey } from '../i18n/strings';
import { newMeta } from '../shared/db';
import { addDays, toISODate } from '../shared/dates';
import type { Ingredient } from '../data/ingredients';
import type { Cuisine, Recipe } from '../data/recipes';
import type { FoodsIL } from '../shared/food';
import { energyGoal, healthOf, latestWeight, macroGoals } from '../shared/health';
import {
  ALLERGIES,
  dishGrade,
  isStaple,
  kitchenAmount,
  kosherClock,
  kosherOf,
  kosherProblem,
  plantGrams,
  planWeek,
  recipeNutrition,
  scaleRecipe,
  shoppingNeeds,
  slotFor,
  suggest,
  sumNutrients,
  type Slot,
  type Suggestion,
  type Taste,
  type Why,
} from '../shared/kitchen';
import { markOf } from '../shared/nutrition';
import type { HealthFood, HealthKitchen, HealthMyRecipe } from '../shared/types';
import { Button, Icon, IconButton, Modal, Segmented, Toggle } from './common';
import { DISH_ART } from './dishArt';
import { loadFoodsIL } from './HealthFood';
import { NumBox, Pills, Popover, useHealth } from './healthUi';
import { StickerArt } from './Stickers';
import { useBloom } from './store';

// ---------------------------------------------------------------- data

interface Lib {
  recipes: Recipe[];
  ing: Map<string, Ingredient>;
  list: Ingredient[];
  db: FoodsIL;
}
let libP: Promise<Lib> | null = null;
const loadLib = () =>
  (libP ??= Promise.all([import('../data/recipes'), import('../data/ingredients'), loadFoodsIL()]).then(([r, i, db]) => ({
    recipes: r.RECIPES,
    ing: i.INGREDIENT,
    list: i.INGREDIENTS,
    db,
  })));
function useLib() {
  const [lib, setLib] = useState<Lib | null>(null);
  useEffect(() => {
    void loadLib().then(setLib);
  }, []);
  return lib;
}

type KitchenState = Omit<HealthKitchen, keyof import('../shared/types').SyncMeta | 'kind'>;
const DEFAULT_K: KitchenState = {
  cuisines: [],
  spice: 1,
  never: [],
  allergies: [],
  rated: {},
  maxTime: null,
  level: null,
  batch: false,
  batchMeals: 4,
  plan: {},
  have: [],
  out: [],
  setup: false,
};

/** The one Kitchen record (newest wins) and a saver. */
function useKitchen() {
  const { save } = useBloom();
  const { all } = useHealth();
  const rec = useMemo(() => healthOf(all, 'kitchen').sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null, [all]);
  const k: KitchenState = { ...DEFAULT_K, ...(rec ?? {}) };
  const latest = useRef(rec);
  latest.current = rec;
  const update = (patch: Partial<KitchenState>) => {
    const base: HealthKitchen = latest.current ?? { ...newMeta(), visibility: 'private', kind: 'kitchen', ...DEFAULT_K };
    const next = { ...base, ...patch, visibility: 'private' as const };
    latest.current = next;
    save('health', next);
  };
  return { k, update };
}

const myToRecipe = (m: HealthMyRecipe): Recipe => ({
  id: `my:${m.id}`,
  he: m.name,
  en: m.name,
  meal: m.meal.length ? m.meal : ['lunch', 'dinner'],
  cuisine: 'home',
  method: 'pan',
  time: m.time,
  level: m.level,
  servings: Math.max(1, m.servings),
  art: 'plate',
  ing: m.ing,
  steps: m.steps.filter((x) => x.trim()).map((x) => ({ he: x, en: x })),
  tags: ['mine'],
});

const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const nowTime = () => hhmm(Date.now());
const mealFor = (h: number): HealthFood['meal'] => (h < 11 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner');

/** What the suggestion engine needs from the Health records. */
function useDay() {
  const { all, profile, ibd } = useHealth();
  const today = toISODate(new Date());
  return useMemo(() => {
    const foods = healthOf(all, 'food');
    const yest = toISODate(addDays(new Date(), -1));
    const week = toISODate(addDays(new Date(), -7));
    const todays = foods.filter((f) => f.date === today);
    const sum = (k: 'kcal' | 'protein' | 'fiber') => todays.reduce((a, f) => a + (f[k] ?? 0), 0);
    const recent = foods
      .filter((f) => f.productId?.startsWith('kitchen:') && f.date >= week)
      .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time))
      .map((f) => f.productId!.slice(8));
    const w = latestWeight(all, today);
    const g = energyGoal(profile, w, { ibd });
    const m = g ? macroGoals(g) : null;
    return {
      today: { kcal: sum('kcal'), protein: sum('protein'), fiber: sum('fiber'), foods: todays },
      yesterday: foods.filter((f) => f.date === yest),
      recent,
      goals: m ? { kcal: m.kcal, protein: m.protein, fiber: m.fiber } : null,
      weightKg: w,
    };
  }, [all, profile, ibd, today]);
}

function useNames() {
  const { settings } = useBloom();
  const he = settings.language === 'he';
  return {
    he,
    rn: (r: Pick<Recipe, 'he' | 'en'>) => (he ? r.he : r.en),
    iname: (i: Ingredient | undefined, id: string) => (i ? (he ? i.he : i.en) : id),
  };
}

export function DishArt({ kind, size }: { kind: string; size: number }) {
  const svg = DISH_ART[kind] ?? DISH_ART.plate;
  return (
    <svg viewBox="-4 -4 72 72" width={size} height={size} aria-hidden="true">
      <g filter="url(#bloom-sticker)" dangerouslySetInnerHTML={{ __html: svg }} />
    </svg>
  );
}

const CRAVES = ['schnitzel', 'shawarma', 'burger', 'pizza', 'pasta', 'fries', 'falafel', 'sabich', 'sweet', 'chocolate'] as const;
const CUISINES: Cuisine[] = ['israeli', 'middle-eastern', 'north-african', 'mediterranean', 'italian', 'asian', 'mexican', 'home'];

// ---------------------------------------------------------------- the Kitchen tab

export function KitchenTab() {
  const { t, locale } = useBloom();
  const lib = useLib();
  const { k } = useKitchen();
  const { all } = useHealth();
  const day = useDay();
  const { rn } = useNames();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(i);
  }, []);
  const [crave, setCrave] = useState<string | null>(null);
  const [fridge, setFridge] = useState<string[] | null>(null);
  const [skip, setSkip] = useState(0);
  const [win, setWin] = useState<null | 'recipes' | 'plan' | 'shop' | 'taste' | 'crave' | 'fridge'>(null);
  const [view, setView] = useState<Suggestion | Recipe | null>(null);
  const [why, setWhy] = useState(false);
  const mine = useMemo(() => healthOf(all, 'myrecipe').map(myToRecipe), [all]);
  const recipes = useMemo(() => (lib ? [...lib.recipes, ...mine] : []), [lib, mine]);
  const taste: Taste = { cuisines: k.cuisines as Cuisine[], spice: k.spice, never: k.never, allergies: k.allergies, rated: k.rated, maxTime: k.maxTime, level: k.level };
  const list = useMemo(
    () =>
      lib
        ? suggest({ recipes, ing: lib.ing, db: lib.db, now, today: day.today, yesterday: day.yesterday, recentRecipes: day.recent, goals: day.goals, weightKg: day.weightKg, taste, crave, fridge })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lib, recipes, now, day, JSON.stringify(taste), crave, fridge],
  );
  useEffect(() => setSkip(0), [crave, fridge]);
  const cur = list.length ? list[skip % list.length] : null;
  const kcalLeft = day.goals ? day.goals.kcal - day.today.kcal : null;
  const slot: Slot = slotFor(now, kcalLeft);
  const clock = kosherClock([...day.yesterday, ...day.today.foods], now);
  const n = (v: number) => Math.round(v).toLocaleString(locale);

  if (!lib) return <div className="wallet-body kt"><p className="muted kt-loading">{t('ktLoading')}</p></div>;

  return (
    <div className="wallet-body kt">
      <div className="kt-center">
        {!k.setup && (
          <button type="button" className="kt-setup" onClick={() => setWin('taste')}>
            <StickerArt kind="idea" size={22} /> {t('ktSetupAsk')}
          </button>
        )}
        <div className="card kt-idea">
          <p className="kt-slot">
            {crave ? t('ktCraving', { x: t(`ktCrave_${crave}` as StringKey) }) : fridge ? t('ktFromFridge') : t(`ktSlot_${slot}` as StringKey)}
            {(crave || fridge) && (
              <button type="button" className="kt-x" aria-label={t('close')} onClick={() => (setCrave(null), setFridge(null))}>
                <Icon name="close" size={12} />
              </button>
            )}
          </p>
          {cur ? (
            <>
              <button type="button" className="kt-art" onClick={() => setView(cur)} aria-label={rn(cur.recipe)}>
                <DishArt kind={cur.recipe.art} size={120} />
              </button>
              <h2 className="kt-name">{rn(cur.recipe)}</h2>
              <p className="kt-meta">
                {t('ktMin', { n: cur.recipe.time })} · {t('hlKcal', { n: n(cur.serving.kcal) })} · {t('ktProtein', { n: n(cur.serving.protein) })}
                <MarkDot grade={cur.grade} />
              </p>
              {cur.missing && cur.missing.length > 0 && (
                <p className="kt-missing">{t('ktMissing', { x: cur.missing.map((id) => (lib.ing.get(id) ? (locale.startsWith('he') ? lib.ing.get(id)!.he : lib.ing.get(id)!.en) : id)).join(', ') })}</p>
              )}
              <div className="kt-actions">
                <Button variant="primary" onClick={() => setView(cur)}>
                  {t('ktCookIt')}
                </Button>
                <Button variant="ghost" icon="repeat" onClick={() => setSkip((s) => s + 1)}>
                  {t('ktOther')}
                </Button>
                <span className="kt-why-wrap">
                  <button type="button" className="kt-why" aria-label={t('ktWhy')} title={t('ktWhy')} onClick={() => setWhy((w) => !w)}>
                    i
                  </button>
                  {why && (
                    <Popover onClose={() => setWhy(false)} className="kt-why-pop">
                      <b>{t('ktWhy')}</b>
                      <ul>
                        {cur.why.slice(0, 5).map((w) => (
                          <li key={w}>{whyText(t, w, clock)}</li>
                        ))}
                        {cur.why.length === 0 && <li>{t('ktWhy_fits')}</li>}
                      </ul>
                      {cur.swapped.length > 0 && <p className="muted small">{swapText(t, cur.swapped, lib.ing, locale)}</p>}
                    </Popover>
                  )}
                </span>
              </div>
            </>
          ) : (
            <div className="kt-empty">
              <p>{t('ktNothing')}</p>
              <Button size="sm" variant="ghost" onClick={() => setWin('taste')}>
                {t('ktTaste')}
              </Button>
            </div>
          )}
          {(clock.noDairyUntil || clock.noMeatUntil) && (
            <p className="kt-kosher">
              <Icon name="clock" size={13} /> {clock.noDairyUntil ? t('ktDairyFrom', { t: hhmm(clock.noDairyUntil) }) : t('ktMeatFrom', { t: hhmm(clock.noMeatUntil!) })}
            </p>
          )}
          <p className="kt-links">
            <button type="button" onClick={() => setWin('crave')}>
              {t('ktCravingLink')}
            </button>
            <span aria-hidden="true">·</span>
            <button type="button" onClick={() => setWin('fridge')}>
              {t('ktFridge')}
            </button>
          </p>
        </div>
        <nav className="kt-tools" aria-label={t('ktKitchen')}>
          {(
            [
              ['recipes', 'cooking', 'ktRecipes'],
              ['plan', 'calendar', 'ktPlan'],
              ['shop', 'groceries', 'ktShopping'],
              ['taste', 'flowers', 'ktTaste'],
            ] as const
          ).map(([id, st, label]) => (
            <button type="button" key={id} onClick={() => setWin(id)}>
              {st === 'calendar' ? <Icon name="calendar" size={22} /> : <StickerArt kind={st} size={30} />}
              <span>{t(label)}</span>
            </button>
          ))}
        </nav>
      </div>

      {win === 'crave' && (
        <Modal title={t('ktCravingTitle')} onClose={() => setWin(null)} width={420} className="kt-win">
          <p className="muted small">{t('ktCravingHint')}</p>
          <div className="kt-chips">
            {CRAVES.map((c) => (
              <button type="button" key={c} className="kt-chip" onClick={() => (setCrave(c), setFridge(null), setWin(null))}>
                {t(`ktCrave_${c}` as StringKey)}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {win === 'fridge' && <FridgeWindow lib={lib} start={fridge ?? k.have} onClose={() => setWin(null)} onShow={(ids) => (setFridge(ids), setCrave(null), setWin(null))} />}
      {win === 'taste' && <TasteWindow lib={lib} onClose={() => setWin(null)} />}
      {win === 'recipes' && <RecipesWindow lib={lib} recipes={recipes} onOpen={(r) => setView(r)} onClose={() => setWin(null)} />}
      {win === 'plan' && <PlanWindow lib={lib} recipes={recipes} onOpen={(r) => setView(r)} onClose={() => setWin(null)} />}
      {win === 'shop' && <ShoppingWindow lib={lib} recipes={recipes} onClose={() => setWin(null)} />}
      {view && <RecipeView lib={lib} item={view} onClose={() => setView(null)} />}
    </div>
  );
}

function MarkDot({ grade }: { grade: Suggestion['grade'] }) {
  const { t } = useBloom();
  const m = markOf(grade);
  if (!m) return null;
  return <span className={`hl-dot ${m}`} role="img" aria-label={t(m === 'healthy' ? 'hlMarkHealthy' : 'hlMarkLess')} title={t(m === 'healthy' ? 'hlMarkHealthy' : 'hlMarkLess')} />;
}

function whyText(t: ReturnType<typeof useBloom>['t'], w: Why, clock: ReturnType<typeof kosherClock>) {
  if (w === 'noDairy' && clock.noDairyUntil) return t('ktWhy_noDairy', { t: hhmm(clock.noDairyUntil) });
  if (w === 'noMeat' && clock.noMeatUntil) return t('ktWhy_noMeat', { t: hhmm(clock.noMeatUntil) });
  return t(`ktWhy_${w}` as StringKey);
}

function swapText(t: ReturnType<typeof useBloom>['t'], swapped: [string, string | null][], ing: Map<string, Ingredient>, locale: string) {
  const he = locale.startsWith('he');
  const nm = (id: string) => (ing.get(id) ? (he ? ing.get(id)!.he : ing.get(id)!.en) : id);
  return swapped.map(([a, b]) => (b ? t('ktSwapped', { a: nm(a), b: nm(b) }) : t('ktLeftOut', { a: nm(a) }))).join(' · ');
}

// ---------------------------------------------------------------- recipe window

function RecipeView({ lib, item, onClose }: { lib: Lib; item: Suggestion | Recipe; onClose: () => void }) {
  const { t, locale } = useBloom();
  const { k, update } = useKitchen();
  const { rn, iname } = useNames();
  const sug = 'recipe' in item ? item : null;
  const base = sug ? sug.recipe : (item as Recipe);
  const [cook, setCook] = useState(false);
  const [never, setNever] = useState<string | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const meals = k.batch ? Math.max(1, k.batchMeals) : base.servings;
  const r = scaleRecipe(base, meals);
  const { serving } = recipeNutrition(lib.db, r, lib.ing);
  const grade = dishGrade(serving, plantGrams(r, lib.ing) / r.servings);
  const kosher = kosherOf(r, lib.ing);
  const rated = k.rated[base.id];
  const rate = (v: 1 | -1) => {
    const next = { ...k.rated };
    if (next[base.id] === v) delete next[base.id];
    else next[base.id] = v;
    update({ rated: next });
  };
  if (cook) return <CookMode lib={lib} recipe={r} grade={grade} onClose={onClose} />;
  return (
    <Modal title={rn(base)} onClose={onClose} width={560} className="kt-view">
      <div className="kt-view-head">
        <DishArt kind={base.art} size={76} />
        <div>
          <p className="kt-meta">
            {t('ktMin', { n: base.time })} · {t(`ktLevel_${base.level}` as StringKey)} · <span className={`kt-kosher-tag ${kosher}`}>{t(`ktKosher_${kosher}` as StringKey)}</span>
            <MarkDot grade={grade} />
          </p>
          <div className="kt-batch">
            <Toggle checked={k.batch} onChange={(v) => update({ batch: v })} label={t('ktBatch')} />
            {k.batch ? (
              <NumBox value={k.batchMeals} onChange={(v) => v && update({ batchMeals: Math.min(20, Math.max(1, Math.round(v))) })} min={1} max={20} step={1} label={t('ktMeals')} unit={t('ktMeals')} />
            ) : (
              <span className="muted small">{t('ktServings', { n: base.servings })}</span>
            )}
          </div>
        </div>
      </div>
      <NutGrid n={serving} />
      <p className="muted small kt-per">{t('ktPerServing')}</p>
      {sug && sug.swapped.length > 0 && <p className="kt-swaps small">{swapText(t, sug.swapped, lib.ing, locale)}</p>}
      <h3 className="kt-h">{t('ktIngredients')}</h3>
      <ul className="kt-ing">
        {r.ing.map(([id, g]) => {
          const i = lib.ing.get(id);
          return (
            <li key={id}>
              {never === id ? (
                <span className="kt-never-ask">
                  {t('ktNeverAsk', { x: iname(i, id) })}
                  <Button size="sm" variant="danger" onClick={() => (update({ never: [...new Set([...k.never, id])] }), setNever(null))}>
                    {t('ktNeverYes')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setNever(null)}>
                    {t('cancel')}
                  </Button>
                </span>
              ) : (
                <>
                  <span className="kt-ing-name">{iname(i, id)}</span>
                  <span className="kt-ing-amt">{amountLabel(t, i, g, locale)}</span>
                  <button type="button" className="kt-ing-never" aria-label={t('ktNeverBtn', { x: iname(i, id) })} title={t('ktNeverBtn', { x: iname(i, id) })} onClick={() => setNever(id)}>
                    <Icon name="close" size={12} />
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <h3 className="kt-h">{t('ktSteps')}</h3>
      <ol className="kt-steps">
        {r.steps.map((s, i) => (
          <li key={i}>
            {locale.startsWith('he') ? s.he : s.en}
            {s.min ? (
              <span className="kt-timer-tag">
                <Icon name="clock" size={12} /> {t('ktMin', { n: s.min })}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
      <div className="kt-view-foot">
        <span className="kt-rate">
          <button type="button" className={rated === 1 ? 'on' : ''} aria-pressed={rated === 1} onClick={() => rate(1)}>
            <Icon name="heart" size={15} /> {t('ktLike')}
          </button>
          <button type="button" className={rated === -1 ? 'on bad' : ''} aria-pressed={rated === -1} onClick={() => rate(-1)}>
            {t('ktNotForMe')}
          </button>
        </span>
        <span className="spacer" />
        <span className="kt-plan-wrap">
          <Button size="sm" variant="ghost" icon="calendar" onClick={() => setPlanOpen((o) => !o)}>
            {t('ktAddPlan')}
          </Button>
        </span>
        <Button variant="primary" icon="play" onClick={() => setCook(true)}>
          {t('ktStart')}
        </Button>
      </div>
      {planOpen && (
        <div className="kt-chips kt-plan-days" role="group" aria-label={t('ktAddPlan')}>
          {Array.from({ length: 7 }, (_, d) => toISODate(addDays(new Date(), d))).map((d) => {
            const has = (k.plan[d] ?? []).includes(base.id);
            return (
              <button
                type="button"
                key={d}
                className={`kt-chip ${has ? 'on' : ''}`}
                aria-pressed={has}
                onClick={() => update({ plan: { ...k.plan, [d]: has ? (k.plan[d] ?? []).filter((x) => x !== base.id) : [...(k.plan[d] ?? []), base.id] } })}
              >
                {dayName(t, d, locale)}
              </button>
            );
          })}
        </div>
      )}
      {base.id.startsWith('my:') && <MyRecipeActions id={base.id.slice(3)} lib={lib} onDone={onClose} />}
    </Modal>
  );
}

function MyRecipeActions({ id, lib, onDone }: { id: string; lib: Lib; onDone: () => void }) {
  const { t, save } = useBloom();
  const { all } = useHealth();
  const [edit, setEdit] = useState(false);
  const m = healthOf(all, 'myrecipe').find((x) => x.id === id);
  if (!m) return null;
  return (
    <p className="kt-my-actions">
      <Button size="sm" variant="ghost" icon="pen" onClick={() => setEdit(true)}>
        {t('ktEdit')}
      </Button>
      <Button size="sm" variant="ghost" icon="trash" onClick={() => (save('health', { ...m, deletedAt: Date.now() }), onDone())}>
        {t('delete')}
      </Button>
      {edit && <MyRecipeEditor lib={lib} item={m} onClose={() => (setEdit(false), onDone())} />}
    </p>
  );
}

function NutGrid({ n, sugars }: { n: { kcal: number; protein: number; carbs: number; fat: number; fiber: number; sugars: number }; sugars?: boolean }) {
  const { t, locale } = useBloom();
  const f = (v: number) => Math.round(v).toLocaleString(locale);
  const cells: [number, StringKey][] = [
    [n.kcal, 'ktKcalShort'],
    [n.protein, 'ktProteinShort'],
    [n.carbs, 'ktCarbsShort'],
    ...(sugars ? ([[n.sugars, 'ktSugarsShort']] as [number, StringKey][]) : []),
    [n.fat, 'ktFatShort'],
    [n.fiber, 'ktFiberShort'],
  ];
  return (
    <div className={`kt-nut ${sugars ? 'six' : ''}`} aria-label={t('ktPerServing')}>
      {cells.map(([v, k]) => (
        <span key={k}>
          <b>{f(v)}</b>
          {t(k)}
        </span>
      ))}
    </div>
  );
}

const dayName = (t: ReturnType<typeof useBloom>['t'], d: string, locale: string) =>
  d === toISODate(new Date()) ? t('today') : d === toISODate(addDays(new Date(), 1)) ? t('ktTomorrow') : new Date(`${d}T12:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' });

function amountLabel(t: ReturnType<typeof useBloom>['t'], i: Ingredient | undefined, g: number, locale: string) {
  const a = kitchenAmount(i, g);
  const num = (x: number) => {
    const whole = Math.floor(x);
    const frac = x - whole;
    const f = frac === 0.25 ? '¼' : frac === 0.5 ? '½' : frac === 0.75 ? '¾' : frac ? String(Math.round(frac * 100) / 100).slice(1) : '';
    return `${whole || !f ? whole.toLocaleString(locale) : ''}${f}`;
  };
  if (a.unit === 'piece') {
    const word = locale.startsWith('he') ? i?.pieceHe : i?.pieceEn;
    return `${num(a.n)} × ${word ?? ''} · ${t('hlGrams', { n: a.grams })}`;
  }
  if (a.unit === 'tsp' || a.unit === 'tbsp') return `${num(a.n)} ${t(a.unit === 'tsp' ? 'ktTsp' : 'ktTbsp')}`;
  if (a.unit === 'ml') return t('hlMl', { n: a.n.toLocaleString(locale) });
  return t('hlGrams', { n: a.n.toLocaleString(locale) });
}

// ---------------------------------------------------------------- cook mode

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((at) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.28);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.3);
    });
    setTimeout(() => void ctx.close(), 1500);
    navigator.vibrate?.([200, 100, 200]);
  } catch {
    /* no sound */
  }
}

function CookMode({ lib, recipe, grade, onClose }: { lib: Lib; recipe: Recipe; grade: Suggestion['grade']; onClose: () => void }) {
  const { t, locale, save } = useBloom();
  const { rn, iname } = useNames();
  // Step -1 = "get ready" (ingredients), steps.length = done / log it.
  const [step, setStep] = useState(-1);
  const [left, setLeft] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [portions, setPortions] = useState<number>(1);
  const [logged, setLogged] = useState(false);
  const s = step >= 0 && step < recipe.steps.length ? recipe.steps[step] : null;
  useEffect(() => {
    setRunning(false);
    setLeft(s?.min ? s.min * 60 : null);
  }, [step, s?.min]);
  useEffect(() => {
    if (!running) return;
    const end = Date.now() + (left ?? 0) * 1000;
    const i = setInterval(() => {
      const l = Math.max(0, Math.round((end - Date.now()) / 1000));
      setLeft(l);
      if (l === 0) {
        setRunning(false);
        beep();
      }
    }, 250);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);
  const log = () => {
    const n = sumNutrients(lib.db, recipe.ing, lib.ing);
    const per = n.grams / recipe.servings;
    const k = portions / recipe.servings;
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const kosher = kosherOf(recipe, lib.ing);
    const h = new Date().getHours();
    const snack = recipe.meal.every((m) => m === 'snack') || slotFor(new Date()) === 'snack';
    const per100 = (v: number) => (n.grams ? r1((v / n.grams) * 100) : 0);
    const tags = [
      ...(recipe.tags?.includes('fried') ? ['fried'] : []),
      ...(kosher === 'dairy' ? ['dairy'] : []),
      ...(recipe.ing.some(([id]) => lib.ing.get(id)?.group === 'meat') ? ['redmeat'] : []),
      ...(n.grams && (n.fiber / n.grams) * 100 >= 6 ? ['fiber'] : []),
    ];
    const food: HealthFood = {
      ...newMeta(),
      visibility: 'private',
      kind: 'food',
      date: toISODate(new Date()),
      time: nowTime(),
      meal: snack ? 'snack' : mealFor(h),
      snack,
      label: snack ? 'snack' : 'meal',
      text: rn(recipe),
      tags,
      grams: Math.round(per * portions),
      kcal: Math.round(n.kcal * k),
      protein: r1(n.protein * k),
      fat: r1(n.fat * k),
      carbs: r1(n.carbs * k),
      sugars: r1(n.sugars * k),
      fiber: r1(n.fiber * k),
      satFat: r1(n.satFat * k),
      sodium: Math.round(n.sodium * k),
      per100: { kcal: per100(n.kcal), protein: per100(n.protein), fat: per100(n.fat), carbs: per100(n.carbs), sugars: per100(n.sugars), fiber: per100(n.fiber), satFat: per100(n.satFat), sodium: per100(n.sodium) },
      source: 'recipe',
      productId: `kitchen:${recipe.id}`,
      // A home-made portion is an estimate (the pot is shared by eye).
      exact: false,
      grade,
      red: [],
      kosher,
    };
    save('health', food);
    setLogged(true);
  };
  const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  return (
    <Modal title={rn(recipe)} onClose={onClose} width={640} className="kt-cook">
      <div className="kt-cook-dots" aria-hidden="true">
        {[-1, ...recipe.steps.map((_, i) => i)].map((i) => (
          <i key={i} className={i === step ? 'on' : i < step ? 'done' : ''} />
        ))}
      </div>
      {step === -1 && (
        <div className="kt-cook-body">
          <h3>{t('ktGetReady')}</h3>
          <ul className="kt-ing kt-ing-check">
            {recipe.ing.map(([id, g]) => (
              <li key={id}>
                <label>
                  <input type="checkbox" />
                  <span className="kt-ing-name">{iname(lib.ing.get(id), id)}</span>
                  <span className="kt-ing-amt">{amountLabel(t, lib.ing.get(id), g, locale)}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      {s && (
        <div className="kt-cook-body">
          <p className="kt-cook-n">{t('ktStepN', { n: step + 1, of: recipe.steps.length })}</p>
          <p className="kt-cook-text">{locale.startsWith('he') ? s.he : s.en}</p>
          {left != null && (
            <div className={`kt-cook-timer ${left === 0 ? 'end' : ''}`}>
              <b>{fmt(left)}</b>
              <Button size="sm" variant={running ? 'ghost' : 'primary'} icon={running ? 'clock' : 'play'} onClick={() => setRunning((x) => !x)}>
                {running ? t('ktPause') : left === 0 ? t('ktDoneTimer') : t('ktStartTimer')}
              </Button>
              <Button size="sm" variant="ghost" icon="repeat" onClick={() => (setRunning(false), setLeft((s.min ?? 0) * 60))}>
                {t('ktReset')}
              </Button>
            </div>
          )}
        </div>
      )}
      {step === recipe.steps.length && (
        <div className="kt-cook-body kt-cook-end">
          <StickerArt kind="done" size={56} />
          {logged ? (
            <p className="kt-cook-text">{t('ktLogged')}</p>
          ) : (
            <>
              <p className="kt-cook-text">{t('ktBonAppetit')}</p>
              <p className="muted small">{t('ktHowMuch')}</p>
              <Pills value={portions} onChange={(v) => v && setPortions(v)} label={t('ktHowMuch')} options={[0.5, 1, 1.5, 2].map((v) => ({ value: v, label: t('ktPortions', { n: v.toLocaleString(locale) }) }))} />
              <Button variant="primary" icon="plus" onClick={log}>
                {t('ktLogFood')}
              </Button>
            </>
          )}
        </div>
      )}
      <div className="kt-cook-nav">
        <Button variant="ghost" icon="chevronLeft" className="flip-rtl-icon" disabled={step === -1} onClick={() => setStep((x) => x - 1)}>
          {t('prev')}
        </Button>
        <span className="spacer" />
        {step < recipe.steps.length ? (
          <Button variant="primary" onClick={() => setStep((x) => x + 1)}>
            {step === -1 ? t('ktLetsCook') : step === recipe.steps.length - 1 ? t('ktFinish') : t('next')}
          </Button>
        ) : (
          <Button variant="soft" onClick={onClose}>
            {t('close')}
          </Button>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- recipes list

function RecipeRow({ lib, r, onOpen, right }: { lib: Lib; r: Recipe; onOpen: () => void; right?: ReactNode }) {
  const { t, locale } = useBloom();
  const { rn } = useNames();
  const s = recipeNutrition(lib.db, r, lib.ing).serving;
  return (
    <div className="kt-row">
      <button type="button" className="kt-row-main" onClick={onOpen}>
        <DishArt kind={r.art} size={40} />
        <span>
          <b>{rn(r)}</b>
          <small>
            {t('ktMin', { n: r.time })} · {t('hlKcal', { n: Math.round(s.kcal).toLocaleString(locale) })} · {t('ktProtein', { n: Math.round(s.protein) })}
          </small>
        </span>
      </button>
      {right}
    </div>
  );
}

function RecipesWindow({ lib, recipes, onOpen, onClose }: { lib: Lib; recipes: Recipe[]; onOpen: (r: Recipe) => void; onClose: () => void }) {
  const { t } = useBloom();
  const { rn } = useNames();
  const { k } = useKitchen();
  const [q, setQ] = useState('');
  const [meal, setMeal] = useState<Slot | 'mine' | 'liked' | null>(null);
  const [quick, setQuick] = useState(false);
  const [easy, setEasy] = useState(false);
  const [create, setCreate] = useState(false);
  const words = q.trim().toLowerCase();
  const shown = recipes.filter(
    (r) =>
      (!words || `${r.he} ${r.en}`.toLowerCase().includes(words) || r.ing.some(([id]) => `${lib.ing.get(id)?.he} ${lib.ing.get(id)?.en}`.toLowerCase().includes(words))) &&
      (!meal || (meal === 'mine' ? r.id.startsWith('my:') : meal === 'liked' ? k.rated[r.id] === 1 : r.meal.includes(meal))) &&
      (!quick || r.time <= 25) &&
      (!easy || r.level === 1),
  );
  return (
    <Modal title={t('ktRecipes')} onClose={onClose} width={560} className="kt-win kt-recipes">
      <div className="kt-search">
        <Icon name="search" size={15} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ktSearchRecipes')} aria-label={t('ktSearchRecipes')} />
      </div>
      <div className="kt-chips kt-filters">
        {(['breakfast', 'lunch', 'dinner', 'snack', 'liked', 'mine'] as const).map((m) => (
          <button type="button" key={m} className={`kt-chip ${meal === m ? 'on' : ''}`} aria-pressed={meal === m} onClick={() => setMeal(meal === m ? null : m)}>
            {t(`ktF_${m}` as StringKey)}
          </button>
        ))}
        <button type="button" className={`kt-chip ${quick ? 'on' : ''}`} aria-pressed={quick} onClick={() => setQuick(!quick)}>
          {t('ktF_quick')}
        </button>
        <button type="button" className={`kt-chip ${easy ? 'on' : ''}`} aria-pressed={easy} onClick={() => setEasy(!easy)}>
          {t('ktF_easy')}
        </button>
      </div>
      <div className="kt-list">
        {shown
          .slice()
          .sort((a, b) => rn(a).localeCompare(rn(b)))
          .map((r) => (
            <RecipeRow key={r.id} lib={lib} r={r} onOpen={() => onOpen(r)} />
          ))}
        {shown.length === 0 && <p className="muted small">{t('ktNoRecipes')}</p>}
      </div>
      <Button variant="ghost" icon="plus" onClick={() => setCreate(true)}>
        {t('ktMyRecipeNew')}
      </Button>
      {create && <MyRecipeEditor lib={lib} onClose={() => setCreate(false)} />}
    </Modal>
  );
}

// ---------------------------------------------------------------- my recipe editor

function IngredientSearch({ lib, onPick, placeholder, exclude = [] }: { lib: Lib; onPick: (i: Ingredient) => void; placeholder: string; exclude?: string[] }) {
  const [q, setQ] = useState('');
  const { iname } = useNames();
  const w = q.trim().toLowerCase();
  const hits = w ? lib.list.filter((i) => !exclude.includes(i.id) && `${i.he} ${i.en}`.toLowerCase().includes(w)).slice(0, 8) : [];
  return (
    <div className="kt-ing-search">
      <div className="kt-search">
        <Icon name="search" size={15} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      </div>
      {hits.length > 0 && (
        <div className="kt-hits">
          {hits.map((i) => (
            <button type="button" key={i.id} onClick={() => (onPick(i), setQ(''))}>
              {iname(i, i.id)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MyRecipeEditor({ lib, item, onClose }: { lib: Lib; item?: HealthMyRecipe; onClose: () => void }) {
  const { t, save } = useBloom();
  const { iname } = useNames();
  const [name, setName] = useState(item?.name ?? '');
  const [servings, setServings] = useState(item?.servings ?? 2);
  const [time, setTime] = useState(item?.time ?? 30);
  const [level, setLevel] = useState<1 | 2 | 3>(item?.level ?? 1);
  const [meal, setMeal] = useState<HealthMyRecipe['meal']>(item?.meal ?? ['lunch', 'dinner']);
  const [ing, setIng] = useState<[string, number][]>(item?.ing ?? []);
  const [steps, setSteps] = useState((item?.steps ?? []).join('\n'));
  const n = sumNutrients(lib.db, ing, lib.ing);
  const per = (v: number) => Math.round(v / Math.max(1, servings));
  const problem = kosherProblem({ ing }, lib.ing);
  const ok = name.trim() && ing.length > 0 && problem !== 'meat+dairy';
  const doSave = () => {
    if (!ok) return;
    save('health', {
      ...(item ?? { ...newMeta(), kind: 'myrecipe' as const }),
      visibility: 'private',
      name: name.trim(),
      servings: Math.max(1, servings),
      time: Math.max(1, time),
      level,
      meal,
      ing,
      steps: steps.split('\n').map((x) => x.trim()).filter(Boolean),
    } as HealthMyRecipe);
    onClose();
  };
  return (
    <Modal
      title={item ? t('ktMyRecipeEdit') : t('ktMyRecipeNew')}
      onClose={onClose}
      width={540}
      className="kt-win kt-my"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="primary" disabled={!ok} onClick={doSave}>
            {t('save')}
          </Button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">{t('ktRecipeName')}</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="kt-my-row">
        <NumBox value={servings} onChange={(v) => v && setServings(Math.round(v))} min={1} max={20} step={1} label={t('ktServingsLabel')} unit={t('ktMeals')} />
        <NumBox value={time} onChange={(v) => v && setTime(Math.round(v))} min={1} max={600} step={5} label={t('ktTime')} unit={t('ktMinShort')} />
      </div>
      <Segmented value={level} onChange={(v) => setLevel(v)} label={t('ktLevel')} options={([1, 2, 3] as const).map((v) => ({ value: v, label: t(`ktLevel_${v}` as StringKey) }))} />
      <div className="kt-chips">
        {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((m) => (
          <button type="button" key={m} className={`kt-chip ${meal.includes(m) ? 'on' : ''}`} aria-pressed={meal.includes(m)} onClick={() => setMeal(meal.includes(m) ? meal.filter((x) => x !== m) : [...meal, m])}>
            {t(`ktF_${m}` as StringKey)}
          </button>
        ))}
      </div>
      <h3 className="kt-h">{t('ktIngredients')}</h3>
      <ul className="kt-ing">
        {ing.map(([id, g], idx) => (
          <li key={id}>
            <span className="kt-ing-name">{iname(lib.ing.get(id), id)}</span>
            <NumBox value={g} onChange={(v) => setIng(ing.map((x, j) => (j === idx ? [id, Math.max(0, v ?? 0)] : x)))} min={0} max={5000} step={5} label={iname(lib.ing.get(id), id)} unit={t('ktG')} />
            <IconButton icon="trash" label={t('delete')} onClick={() => setIng(ing.filter((_, j) => j !== idx))} />
          </li>
        ))}
      </ul>
      <IngredientSearch lib={lib} placeholder={t('ktAddIngredient')} exclude={ing.map(([id]) => id)} onPick={(i) => setIng([...ing, [i.id, i.piece ?? 100]])} />
      {problem === 'meat+dairy' && <p className="kt-warn small">{t('ktMeatDairy')}</p>}
      {ing.length > 0 && (
        <>
          <NutGrid n={{ ...n, kcal: per(n.kcal), protein: per(n.protein), carbs: per(n.carbs), fat: per(n.fat), fiber: per(n.fiber), sugars: per(n.sugars) }} sugars />
          <p className="muted small kt-per">{t('ktPerServing')}</p>
        </>
      )}
      <label className="field">
        <span className="field-label">{t('ktStepsHint')}</span>
        <textarea rows={5} value={steps} onChange={(e) => setSteps(e.target.value)} />
      </label>
    </Modal>
  );
}

// ---------------------------------------------------------------- taste

function TasteWindow({ lib, onClose }: { lib: Lib; onClose: () => void }) {
  const { t } = useBloom();
  const { k, update } = useKitchen();
  const { iname } = useNames();
  useEffect(() => {
    if (!k.setup) update({ setup: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggle = (list: string[], x: string) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  return (
    <Modal title={t('ktTaste')} onClose={onClose} width={520} className="kt-win kt-taste">
      <h3 className="kt-h">{t('ktCuisines')}</h3>
      <div className="kt-chips">
        {CUISINES.map((c) => (
          <button type="button" key={c} className={`kt-chip ${k.cuisines.includes(c) ? 'on' : ''}`} aria-pressed={k.cuisines.includes(c)} onClick={() => update({ cuisines: toggle(k.cuisines, c) })}>
            {t(`ktCu_${c}` as StringKey)}
          </button>
        ))}
      </div>
      <h3 className="kt-h">{t('ktSpice')}</h3>
      <Segmented value={k.spice} onChange={(v) => update({ spice: v })} label={t('ktSpice')} options={([0, 1, 2] as const).map((v) => ({ value: v, label: t(`ktSpice_${v}` as StringKey) }))} />
      <h3 className="kt-h">{t('ktAvoid')}</h3>
      <div className="kt-chips">
        {Object.keys(ALLERGIES).map((a) => (
          <button type="button" key={a} className={`kt-chip ${k.allergies.includes(a) ? 'on bad' : ''}`} aria-pressed={k.allergies.includes(a)} onClick={() => update({ allergies: toggle(k.allergies, a) })}>
            {t(`ktAl_${a}` as StringKey)}
          </button>
        ))}
      </div>
      <h3 className="kt-h">{t('ktNeverList')}</h3>
      <div className="kt-chips">
        {k.never.map((id) => (
          <span key={id} className="kt-chip on bad">
            {iname(lib.ing.get(id), id)}
            <button type="button" aria-label={t('delete')} onClick={() => update({ never: k.never.filter((x) => x !== id) })}>
              <Icon name="close" size={11} />
            </button>
          </span>
        ))}
        {k.never.length === 0 && <span className="muted small">{t('ktNeverNone')}</span>}
      </div>
      <IngredientSearch lib={lib} placeholder={t('ktNeverAdd')} exclude={k.never} onPick={(i) => update({ never: [...k.never, i.id] })} />
      <h3 className="kt-h">{t('ktTimeLimit')}</h3>
      <Segmented
        value={k.maxTime ?? 0}
        onChange={(v) => update({ maxTime: v || null })}
        label={t('ktTimeLimit')}
        options={[0, 20, 40, 60].map((v) => ({ value: v, label: v ? t('ktUpTo', { n: v }) : t('ktAny') }))}
      />
      <h3 className="kt-h">{t('ktLevel')}</h3>
      <Segmented
        value={k.level ?? 0}
        onChange={(v) => update({ level: (v || null) as KitchenState['level'] })}
        label={t('ktLevel')}
        options={[0, 1, 2].map((v) => ({ value: v, label: v ? t(v === 1 ? 'ktOnlyEasy' : 'ktUpToMedium') : t('ktAny') }))}
      />
    </Modal>
  );
}

// ---------------------------------------------------------------- my fridge

function FridgeWindow({ lib, start, onClose, onShow }: { lib: Lib; start: string[]; onClose: () => void; onShow: (ids: string[]) => void }) {
  const { t } = useBloom();
  const { iname } = useNames();
  const [sel, setSel] = useState<string[]>(start.filter((id) => !isStaple(lib.ing.get(id))));
  const groups: [string, (i: Ingredient) => boolean][] = [
    ['ktG_protein', (i) => ['poultry', 'meat', 'fish', 'egg'].includes(i.group)],
    ['ktG_dairy', (i) => i.group === 'dairy'],
    ['ktG_veg', (i) => i.group === 'veg' || i.group === 'fruit'],
    ['ktG_grain', (i) => i.group === 'grain' || i.group === 'legume'],
  ];
  return (
    <Modal
      title={t('ktFridgeTitle')}
      onClose={onClose}
      width={560}
      className="kt-win kt-fridge"
      footer={
        <>
          <span className="muted small">{t('ktFridgeStaples')}</span>
          <span className="spacer" />
          <Button variant="primary" disabled={!sel.length} onClick={() => onShow(sel)}>
            {t('ktShowIdeas')}
          </Button>
        </>
      }
    >
      {groups.map(([label, f]) => (
        <div key={label}>
          <h3 className="kt-h">{t(label as StringKey)}</h3>
          <div className="kt-chips">
            {lib.list
              .filter((i) => f(i) && !isStaple(i))
              .map((i) => (
                <button type="button" key={i.id} className={`kt-chip ${sel.includes(i.id) ? 'on' : ''}`} aria-pressed={sel.includes(i.id)} onClick={() => setSel(sel.includes(i.id) ? sel.filter((x) => x !== i.id) : [...sel, i.id])}>
                  {iname(i, i.id)}
                </button>
              ))}
          </div>
        </div>
      ))}
    </Modal>
  );
}

// ---------------------------------------------------------------- week plan

function PlanWindow({ lib, recipes, onOpen, onClose }: { lib: Lib; recipes: Recipe[]; onOpen: (r: Recipe) => void; onClose: () => void }) {
  const { t, locale } = useBloom();
  const { k, update } = useKitchen();
  const { rn } = useNames();
  const day = useDay();
  const [adding, setAdding] = useState<string | null>(null);
  const days = Array.from({ length: 7 }, (_, d) => toISODate(addDays(new Date(), d)));
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const taste: Taste = { cuisines: k.cuisines as Cuisine[], spice: k.spice, never: k.never, allergies: k.allergies, rated: k.rated, maxTime: k.maxTime, level: k.level };
  // Fill empty days with a varied dinner each (planWeek in kitchen.ts).
  const fill = () => update({ plan: planWeek({ recipes, ing: lib.ing, db: lib.db, goals: day.goals, weightKg: day.weightKg, taste }, days, k.plan) });
  // Old days drop off the plan.
  useEffect(() => {
    const old = Object.keys(k.plan).filter((d) => d < days[0]);
    if (old.length) update({ plan: Object.fromEntries(Object.entries(k.plan).filter(([d]) => d >= days[0])) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Modal title={t('ktPlan')} onClose={onClose} width={560} className="kt-win kt-plan">
      <div className="kt-plan-top">
        <Button size="sm" variant="ghost" icon="sparkle" onClick={fill}>
          {t('ktFillWeek')}
        </Button>
      </div>
      {days.map((d) => (
        <div key={d} className="kt-plan-day">
          <h3 className="kt-h">{dayName(t, d, locale)}</h3>
          {(k.plan[d] ?? []).map((id, idx) => {
            const r = byId.get(id);
            if (!r) return null;
            return (
              <RecipeRow
                key={`${id}-${idx}`}
                lib={lib}
                r={r}
                onOpen={() => onOpen(r)}
                right={<IconButton icon="close" label={t('delete')} onClick={() => update({ plan: { ...k.plan, [d]: (k.plan[d] ?? []).filter((_, j) => j !== idx) } })} />}
              />
            );
          })}
          {adding === d ? (
            <div className="kt-plan-pick">
              {recipes
                .slice()
                .sort((a, b) => rn(a).localeCompare(rn(b)))
                .map((r) => (
                  <button type="button" key={r.id} onClick={() => (update({ plan: { ...k.plan, [d]: [...(k.plan[d] ?? []), r.id] } }), setAdding(null))}>
                    {rn(r)}
                  </button>
                ))}
            </div>
          ) : (
            <button type="button" className="kt-plan-add" onClick={() => setAdding(d)}>
              <Icon name="plus" size={13} /> {t('ktAddDish')}
            </button>
          )}
        </div>
      ))}
    </Modal>
  );
}

// ---------------------------------------------------------------- shopping + pantry

function ShoppingWindow({ lib, recipes, onClose }: { lib: Lib; recipes: Recipe[]; onClose: () => void }) {
  const { t, locale } = useBloom();
  const { k, update } = useKitchen();
  const { iname } = useNames();
  const [homeOpen, setHomeOpen] = useState(false);
  const today = toISODate(new Date());
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const planned = Object.entries(k.plan)
    .filter(([d]) => d >= today)
    .flatMap(([, ids]) => ids.map((id) => byId.get(id)).filter((r): r is Recipe => !!r))
    .map((r) => (k.batch ? scaleRecipe(r, Math.max(1, k.batchMeals)) : r));
  const needs = shoppingNeeds(planned);
  // To buy: planned and not at home (staples count as at home unless marked out), plus everything marked out.
  const toBuy = [...new Set([...[...needs.keys()].filter((id) => !k.have.includes(id) && !isStaple(lib.ing.get(id))), ...k.out])];
  const aisles = ['produce', 'meat', 'fish', 'dairy', 'bakery', 'dry', 'cans', 'frozen', 'spices', 'oils'] as const;
  const bought = (id: string) => update({ have: [...new Set([...k.have, id])], out: k.out.filter((x) => x !== id) });
  const ranOut = (id: string) => update({ out: [...new Set([...k.out, id])], have: k.have.filter((x) => x !== id) });
  return (
    <Modal title={t('ktShopping')} onClose={onClose} width={520} className="kt-win kt-shop">
      {planned.length === 0 && k.out.length === 0 && <p className="muted small">{t('ktShopEmpty')}</p>}
      {aisles.map((a) => {
        const items = toBuy.filter((id) => (lib.ing.get(id)?.aisle ?? 'dry') === a);
        if (!items.length) return null;
        return (
          <div key={a}>
            <h3 className="kt-h">{t(`ktAisle_${a}` as StringKey)}</h3>
            <ul className="kt-shop-list">
              {items.map((id) => {
                const i = lib.ing.get(id);
                const g = needs.get(id);
                return (
                  <li key={id}>
                    <button type="button" className="kt-tick" aria-label={t('ktBought', { x: iname(i, id) })} title={t('ktBought', { x: iname(i, id) })} onClick={() => bought(id)}>
                      <Icon name="check" size={13} />
                    </button>
                    <span className="kt-ing-name">{iname(i, id)}</span>
                    {k.out.includes(id) && <span className="kt-out-pill">{t('ktOut')}</span>}
                    <span className="kt-ing-amt">{g ? amountLabel(t, i, g, locale) : ''}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      <IngredientSearch lib={lib} placeholder={t('ktAddToList')} exclude={toBuy} onPick={(i) => ranOut(i.id)} />
      <button type="button" className="kt-home-toggle" aria-expanded={homeOpen} onClick={() => setHomeOpen(!homeOpen)}>
        <Icon name={homeOpen ? 'minus' : 'plus'} size={13} /> {t('ktAtHome', { n: k.have.length })}
      </button>
      {homeOpen && (
        <ul className="kt-shop-list kt-home">
          {k.have.map((id) => (
            <li key={id}>
              <span className="kt-ing-name">{iname(lib.ing.get(id), id)}</span>
              <Button size="sm" variant="ghost" onClick={() => ranOut(id)}>
                {t('ktRanOut')}
              </Button>
            </li>
          ))}
          {k.have.length === 0 && <li className="muted small">{t('ktHomeEmpty')}</li>}
        </ul>
      )}
    </Modal>
  );
}
