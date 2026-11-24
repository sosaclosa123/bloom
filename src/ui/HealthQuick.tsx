// Health "Today" tab (owner chose layout A, Nov 2026): progress tiles,
// one list of the day's food, and the day's body numbers. Each section has
// its own "+ Add" (no Quick add row). Same records as the other tabs.
import { useState } from 'react';
import { newMeta } from '../shared/db';
import { dosesOn, energyGoal, forDate, healthOf, latestWeight, type WaterGoal } from '../shared/health';
import type { HealthBody, HealthTest, HealthVisit, ISODate, HealthFood } from '../shared/types';
import { Button, Field, Modal } from './common';
import { TestEditor, VisitEditor } from './HealthCards';
import { FoodAdd, FoodEditor, FoodTable, MyMealsChips, proteinNum } from './HealthFood';
import { CardHead, NumBox, useHealth, useWaterFmt } from './healthUi';
import { StickerArt } from './Stickers';
import { useBloom } from './store';

/** 4 progress tiles: calories, protein, water, medicines (goals from the health questions). */
export function TodayTiles({ date, water }: { date: ISODate; water: WaterGoal }) {
  const { t, locale } = useBloom();
  const { all, profile, ibd } = useHealth();
  const fmtWater = useWaterFmt();
  const foods = healthOf(all, 'food').filter((f) => f.date === date);
  const kcal = Math.round(foods.reduce((a, f) => a + (f.kcal ?? 0), 0));
  const protein = foods.reduce((a, f) => a + (f.protein ?? 0), 0);
  const ml = forDate(all, 'checkin', date)?.waterMl ?? 0;
  const doses = dosesOn(healthOf(all, 'med'), healthOf(all, 'taken'), date);
  const taken = doses.filter((d) => d.taken).length;
  const g = energyGoal(profile, latestWeight(all, date), { ibd });
  const tiles: { v: string; of: string | null; label: string; part: number | null }[] = [
    { v: kcal.toLocaleString(locale), of: g ? g.target.toLocaleString(locale) : null, label: t('hlKcalUnit'), part: g ? kcal / g.target : null },
    { v: proteinNum(protein, locale), of: g ? g.protein.toLocaleString(locale) : null, label: t('hlTilesProtein'), part: g ? protein / g.protein : null },
    { v: fmtWater(ml), of: fmtWater(water.ml), label: t('hlWater'), part: water.ml ? ml / water.ml : null },
    { v: doses.length ? `${taken}/${doses.length}` : '–', of: null, label: t('hlTabMeds'), part: doses.length ? taken / doses.length : null },
  ];
  return (
    <section className="w-card hl-tiles-card">
      <div className="hl-today-tiles">
        {tiles.map((x) => (
          <span key={x.label} className="hl-today-tile">
            <b dir="ltr">{x.v}</b>
            <small>{x.of ? `${t('hlOfGoal', { v: x.of })} ${x.label}` : x.label}</small>
            {x.part != null && (
              <i className={x.part > 1.05 ? 'over' : ''}>
                <u style={{ width: `${Math.min(100, x.part * 100)}%` }} />
              </i>
            )}
          </span>
        ))}
      </div>
    </section>
  );
}

/** The day's food in one list (pill on each line); "+ Add" opens the same add box as the Food tab. */
export function TodayFoodCard({ date, isToday }: { date: ISODate; isToday: boolean }) {
  const { t } = useBloom();
  const { all } = useHealth();
  const [add, setAdd] = useState(false);
  const [food, setFood] = useState<HealthFood | null>(null);
  const foods = healthOf(all, 'food')
    .filter((f) => f.date === date)
    .sort((a, b) => a.time.localeCompare(b.time) || a.createdAt - b.createdAt);
  return (
    <section className="w-card hl-today-food">
      <CardHead sticker="cooking" title={isToday ? t('hlTodayFood') : t('hlDayFood')}>
        <button type="button" className="link-btn" onClick={() => setAdd(true)}>
          + {t('hlAddFoodTitle')}
        </button>
      </CardHead>
      {foods.length === 0 ? <p className="empty-note">{t('hlNoFood')}</p> : <FoodTable items={foods} onRow={setFood} />}
      {add && (
        <Modal title={t('hlAddFoodTitle')} onClose={() => setAdd(false)} width={560} className="hl-quick-food">
          <FoodAdd date={date} isToday={isToday} onAdded={() => setAdd(false)} />
          <MyMealsChips date={date} isToday={isToday} onAdded={() => setAdd(false)} />
        </Modal>
      )}
      {food && <FoodEditor init={food} onClose={() => setFood(null)} />}
    </section>
  );
}

/** Steps, exercise, weight (+ tests and visits of that day). */
export function TodayBodyCard({ date }: { date: ISODate }) {
  const { t, locale } = useBloom();
  const { all } = useHealth();
  const [body, setBody] = useState(false);
  const [test, setTest] = useState<HealthTest | null>(null);
  const [visit, setVisit] = useState<HealthVisit | null>(null);
  const b = forDate(all, 'body', date);
  const tests = healthOf(all, 'test').filter((x) => x.date === date);
  const visits = healthOf(all, 'visit').filter((x) => x.date === date);
  const bits = [
    b?.steps ? `${t('hlSteps')} ${b.steps.toLocaleString(locale)}` : null,
    b?.exerciseMin ? `${t('hlExercise')} ${b.exerciseMin} ${t('hlUnitMin')}` : null,
    b?.weightKg ? `${t('hlWeight')} ${b.weightKg.toLocaleString(locale)} ${t('hlUnitKg')}` : null,
  ].filter(Boolean);
  return (
    <section className="w-card hl-today-body">
      <CardHead sticker="gym" title={t('hlBodyToday')}>
        <button type="button" className="link-btn" onClick={() => setBody(true)}>
          + {t('hlEditBody')}
        </button>
      </CardHead>
      <button type="button" className="hl-today-bodyline" onClick={() => setBody(true)}>
        {bits.length ? bits.join(' · ') : <span className="muted">{`${t('hlSteps')} · ${t('hlExercise')} · ${t('hlWeight')}`}</span>}
      </button>
      {(tests.length > 0 || visits.length > 0) && (
        <ul className="hl-log-list">
          {tests.map((x) => (
            <li key={x.id}>
              <button type="button" onClick={() => setTest(x)}>
                <StickerArt kind="hospital" size={18} />
                <span className="hl-log-text" dir="auto">
                  {x.name}
                </span>
                {x.value != null && (
                  <b dir="ltr">
                    {x.value} {x.unit}
                  </b>
                )}
              </button>
            </li>
          ))}
          {visits.map((v) => (
            <li key={v.id}>
              <button type="button" onClick={() => setVisit(v)}>
                <StickerArt kind="doctor" size={18} />
                <span className="hl-log-text">
                  <bdi>{v.doctor || t('hlQA_visit')}</bdi>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {body && <BodyEdit date={date} onClose={() => setBody(false)} />}
      {test && <TestEditor init={test} isNew={false} onClose={() => setTest(null)} />}
      {visit && <VisitEditor init={visit} isNew={false} onClose={() => setVisit(null)} />}
    </section>
  );
}

/** Steps, exercise and weight for the day in one window (same record as the Body tab). */
export function BodyEdit({ date, onClose }: { date: ISODate; onClose: () => void }) {
  const { t, save } = useBloom();
  const { all } = useHealth();
  const cur: HealthBody = forDate(all, 'body', date) ?? { ...newMeta(), kind: 'body', date, weightKg: null, exerciseMin: null, steps: null };
  const [f, setF] = useState(cur);
  return (
    <Modal
      title={t('hlEditBody')}
      onClose={onClose}
      width={420}
      footer={
        <>
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              save('health', f);
              onClose();
            }}
          >
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="hl-form">
        <Field label={t('hlSteps')}>
          <NumBox value={f.steps} onChange={(steps) => setF({ ...f, steps })} min={0} max={100000} label={t('hlSteps')} />
        </Field>
        <Field label={t('hlExercise')}>
          <NumBox value={f.exerciseMin} onChange={(exerciseMin) => setF({ ...f, exerciseMin })} min={0} max={1440} unit={t('hlUnitMin')} label={t('hlExercise')} />
        </Field>
        <Field label={t('hlWeight')}>
          <NumBox value={f.weightKg} onChange={(weightKg) => setF({ ...f, weightKg })} min={20} max={400} step={0.1} unit={t('hlUnitKg')} label={t('hlWeight')} />
        </Field>
      </div>
    </Modal>
  );
}
