// Food tab: meals and (separately) small snacks, with calories from the
// built-in Israeli Ministry of Health food list (offline) and, if turned on,
// Open Food Facts products and barcodes (online). Totals for the day.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { StringKey } from '../i18n/strings';
import { platform } from '../platform/api';
import { newMeta } from '../shared/db';
import { forGrams, OFF_FIELDS, parseOff, searchIL, validBarcode, type FoodProduct, type FoodsIL } from '../shared/food';
import { FOOD_TAGS, healthOf } from '../shared/health';
import type { HealthFood, ISODate } from '../shared/types';
import { Button, Icon, IconButton, Modal, Segmented } from './common';
import { CardHead, NumBox, Pills, Tip, useHealth } from './healthUi';
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

export function FoodTab({ date, isToday }: { date: ISODate; isToday: boolean }) {
  const { all } = useHealth();
  const items = healthOf(all, 'food').filter((f) => f.date === date);
  const meals = items.filter((f) => !f.snack && f.meal !== 'snack').sort((a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) || a.time.localeCompare(b.time));
  const snacks = items.filter((f) => f.snack || f.meal === 'snack').sort((a, b) => a.time.localeCompare(b.time));
  return (
    <div className="wallet-body wl-two hl-two">
      <div className="wl-main">
        <MealsCard date={date} isToday={isToday} list={meals} />
        <SnacksCard date={date} isToday={isToday} list={snacks} />
      </div>
      <div className="wl-side">
        <TotalsCard meals={meals} snacks={snacks} />
      </div>
    </div>
  );
}


function MealsCard({ date, isToday, list }: { date: ISODate; isToday: boolean; list: HealthFood[] }) {
  const { t } = useBloom();
  return (
    <section className="w-card hl-food">
      <CardHead sticker="restaurant" title={t('hlMeals')} />
      <FoodAdd date={date} isToday={isToday} snack={false} />
      {list.length === 0 ? <p className="empty-note">{t('hlNoFood')}</p> : <FoodList list={list} />}
    </section>
  );
}

function SnacksCard({ date, isToday, list }: { date: ISODate; isToday: boolean; list: HealthFood[] }) {
  const { t } = useBloom();
  return (
    <section className="w-card hl-food hl-snacks">
      <CardHead sticker="coffee" title={t('hlSnacks')} tip={t('hlSnacksSub')} />
      <FoodAdd date={date} isToday={isToday} snack />
      {list.length > 0 && <FoodList list={list} chips />}
    </section>
  );
}

const tagName = (x: string, t: ReturnType<typeof useBloom>['t']) => ((FOOD_TAGS as readonly string[]).includes(x) ? t(`hlTag_${x}` as StringKey) : x);

function FoodList({ list, chips }: { list: HealthFood[]; chips?: boolean }) {
  const { t, locale } = useBloom();
  const kcal = (f: HealthFood) => (f.kcal != null ? t('hlKcal', { n: f.kcal.toLocaleString(locale) }) : '');
  if (chips)
    return (
      <ul className="hl-snack-list">
        {list.map((f) => (
          <li key={f.id} className="hl-snack">
            <span dir="auto">{f.text}</span>
            {f.grams ? <span className="muted">{t('hlGrams', { n: f.grams })}</span> : null}
            {f.kcal != null && <b>{kcal(f)}</b>}
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
          <span className="hl-food-text" dir="auto">
            {f.text}
            {f.grams ? <span className="muted small">{t('hlGrams', { n: f.grams })}</span> : null}
            {f.tags.map((x) => (
              <span key={x} className="hl-tag">
                {tagName(x, t)}
              </span>
            ))}
          </span>
          {f.kcal != null && <span className="hl-food-kcal">{kcal(f)}</span>}
          <IconButton icon="close" label={t('delete')} onClick={() => void platform.remove('health', f.id)} />
        </li>
      ))}
    </ul>
  );
}

function TotalsCard({ meals, snacks }: { meals: HealthFood[]; snacks: HealthFood[] }) {
  const { t, locale, settings } = useBloom();
  const sum = (xs: HealthFood[], k: 'kcal' | 'protein' | 'fat' | 'carbs') => Math.round(xs.reduce((a, f) => a + (f[k] ?? 0), 0) * 10) / 10;
  const allItems = [...meals, ...snacks];
  const kcal = sum(allItems, 'kcal');
  const unknown = allItems.filter((f) => f.kcal == null).length;
  const pMeals = kcal ? (sum(meals, 'kcal') / kcal) * 100 : 0;
  return (
    <section className="w-card hl-totals">
      <CardHead title={t('hlFoodTotal')} tip={settings.healthFoodOnline ? t('hlFoodSourceOnline') : t('hlFoodSourceOffline')} />
      <span className="hl-total-kcal">{t('hlKcal', { n: kcal.toLocaleString(locale) })}</span>
      {kcal > 0 && (
        <div className="hl-kcal-bar" aria-hidden="true">
          <span className="meals" style={{ width: `${pMeals}%` }} />
          <span className="snacks" style={{ width: `${100 - pMeals}%` }} />
        </div>
      )}
      <p className="w-card-sub">
        {t('hlMeals')} {sum(meals, 'kcal').toLocaleString(locale)} · {t('hlSnacks')} {sum(snacks, 'kcal').toLocaleString(locale)}
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

/** Small "Food today" card for the Today tab (opens the Food tab). */
export function FoodSummaryCard({ date, onOpen }: { date: ISODate; onOpen: () => void }) {
  const { t, locale } = useBloom();
  const { all } = useHealth();
  const items = healthOf(all, 'food').filter((f) => f.date === date);
  const snacks = items.filter((f) => f.snack || f.meal === 'snack').length;
  const kcal = items.reduce((a, f) => a + (f.kcal ?? 0), 0);
  return (
    <button type="button" className="w-card hl-food-sum" onClick={onOpen}>
      <CardHead sticker="cooking" title={t('hlFoodToday')}>
        <span className="hl-food-sum-kcal">{t('hlKcal', { n: Math.round(kcal).toLocaleString(locale) })}</span>
      </CardHead>
      <span className="w-card-sub">{items.length ? t('hlFoodCounts', { m: items.length - snacks, s: snacks }) : t('hlNoFood')}</span>
    </button>
  );
}

// ---------------------------------------------------------------- add food: search, portion, barcode

function FoodAdd({ date, isToday, snack }: { date: ISODate; isToday: boolean; snack: boolean }) {
  const { t, locale, save, settings } = useBloom();
  const lang = settings.language;
  const [text, setText] = useState('');
  const [db, setDb] = useState<FoodsIL | null>(null);
  const [online, setOnline] = useState<FoodProduct[] | 'busy' | 'loading' | null>(null);
  const [pick, setPick] = useState<FoodProduct | null>(null);
  const [grams, setGrams] = useState<number | null>(100);
  const [manualKcal, setManualKcal] = useState<number | null>(null);
  const [meal, setMeal] = useState<HealthFood['meal']>(() => mealFor(new Date().getHours()));
  const [tags, setTags] = useState<string[]>([]);
  const [scan, setScan] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void loadFoodsIL().then(setDb);
  }, []);
  const local = useMemo(() => (db && !pick ? searchIL(db, text, lang, 8) : []), [db, text, lang, pick]);
  useEffect(() => setOnline(null), [text]);

  const choose = (p: FoodProduct) => {
    setPick(p);
    setText(p.brand ? `${p.name} (${p.brand})` : p.name);
    setGrams(p.portions[0]?.grams ?? 100);
    setOpen(false);
  };
  const reset = () => {
    setText('');
    setPick(null);
    setGrams(100);
    setManualKcal(null);
    setTags([]);
    setOnline(null);
  };
  const searchOnline = async () => {
    if (!settings.healthFoodOnline || text.trim().length < 2) return;
    setOnline('loading');
    setOpen(true);
    const r = await offSearch(text.trim(), lang);
    setOnline(r === 'error' ? 'busy' : r);
  };
  const n = pick && grams ? forGrams(pick, grams) : null;
  const ok = !!text.trim();
  const add = () => {
    if (!ok) return;
    const item: HealthFood = {
      ...newMeta(),
      kind: 'food',
      date,
      time: isToday ? nowTime() : '',
      meal: snack ? 'snack' : meal,
      snack,
      text: text.trim(),
      tags: snack ? [] : tags,
      grams: pick ? grams : null,
      kcal: n ? n.kcal : manualKcal,
      protein: n?.protein ?? null,
      fat: n?.fat ?? null,
      carbs: n?.carbs ?? null,
      source: pick ? pick.source : manualKcal != null ? 'manual' : undefined,
      productId: pick?.id,
    };
    save('health', item);
    reset();
  };
  const results = [...local, ...(Array.isArray(online) ? online : [])];

  return (
    <>
    <form
      className="hl-food-add"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pick && settings.healthFoodOnline && online == null && text.trim().length >= 2 && !local.length) void searchOnline();
        else add();
      }}
    >
      {!snack && <Pills label={t('hlMeals')} value={meal} onChange={(v) => v && setMeal(v)} options={MEALS.map((x) => ({ value: x, label: t(`hlMeal_${x}` as StringKey) }))} />}
      <div className="hl-food-row">
        <div className="hl-food-search">
          <input
            dir="auto"
            value={text}
            placeholder={snack ? t('hlSnackPlaceholder') : t('hlFoodSearchPlaceholder')}
            aria-label={snack ? t('hlSnackPlaceholder') : t('hlFoodSearchPlaceholder')}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setText(e.target.value);
              setPick(null);
              setOpen(true);
            }}
          />
          {open && !pick && text.trim().length >= 2 && (
            <div className="hl-food-results" role="listbox">
              {results.map((p) => (
                <button type="button" role="option" aria-selected={false} key={p.id} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(p)}>
                  <span className="hl-fr-name" dir="auto">
                    {p.name}
                    {p.brand && <span className="muted"> · {p.brand}</span>}
                  </span>
                  <span className="hl-fr-kcal">{t('hlKcalPer100', { n: Math.round(p.kcal) })}</span>
                  <span className={`hl-fr-src ${p.source}`}>{p.source === 'il' ? t('hlSrcIL') : t('hlSrcOFF')}</span>
                </button>
              ))}
              {results.length === 0 && online !== 'loading' && <p className="hl-fr-empty">{t('hlFoodNoMatch')}</p>}
              {settings.healthFoodOnline ? (
                online === 'loading' ? (
                  <p className="hl-fr-empty">{t('hlSearching')}</p>
                ) : online === 'busy' ? (
                  <p className="hl-fr-empty">{t('hlOnlineBusy')}</p>
                ) : online == null ? (
                  <button type="button" className="hl-fr-more" onMouseDown={(e) => e.preventDefault()} onClick={() => void searchOnline()}>
                    <Icon name="search" size={14} /> {t('hlSearchOnline')}
                  </button>
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
      {pick ? (
        <div className="hl-portion">
          <NumBox value={grams} onChange={setGrams} min={1} max={5000} unit={t('hlUnitG')} label={t('hlPortion')} />
          <div className="hl-pills">
            {[...pick.portions.slice(0, 4).map((p) => ({ label: `${p.label} (${t('hlGrams', { n: p.grams })})`, grams: p.grams })), ...[50, 100, 200].map((g) => ({ label: t('hlGrams', { n: g }), grams: g }))].map((p, i) => (
              <button type="button" key={i} className={grams === p.grams ? 'active' : ''} onClick={() => setGrams(p.grams)} dir="auto">
                {p.label}
              </button>
            ))}
          </div>
          {n && (
            <span className="hl-portion-kcal">
              {t('hlKcal', { n: n.kcal.toLocaleString(locale) })} · {t('hlMacroShort', { p: n.protein, c: n.carbs, f: n.fat })}
            </span>
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
      {!snack && (
        <div className="hl-pills hl-food-tags" role="group" aria-label={t('hlFood')}>
          {FOOD_TAGS.map((x) => {
            const on = tags.includes(x);
            return (
              <button type="button" key={x} aria-pressed={on} className={on ? 'active' : ''} onClick={() => setTags(on ? tags.filter((y) => y !== x) : [...tags, x])}>
                {tagName(x, t)}
              </button>
            );
          })}
        </div>
      )}
      <div className="hl-food-actions">
        {(pick || text) && (
          <Button variant="ghost" onClick={reset}>
            {t('cancel')}
          </Button>
        )}
        <Button variant="primary" icon="plus" disabled={!ok} onClick={add}>
          {snack ? t('hlAddSnack') : t('hlAddFood')}
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
