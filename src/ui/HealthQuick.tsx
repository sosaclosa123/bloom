// Today tab "Quick add": a side-scrolling row of buttons that add anything for
// the chosen day without leaving Today. Each opens the same editor the other
// tabs use and saves the same records, so Food / Medicines / Body & tests /
// IBD show it right away.
import { useEffect, useRef, useState } from 'react';
import type { StringKey } from '../i18n/strings';
import { newMeta } from '../shared/db';
import { dosesOn, forDate, healthOf, latestWeight } from '../shared/health';
import type { HealthBody, HealthFood, HealthTest, HealthVisit, ISODate } from '../shared/types';
import { Button, Field, Icon, Modal } from './common';
import { MedEditor, TestEditor, VisitEditor } from './HealthCards';
import { FoodAdd, FoodEditor, FoodTable, proteinNum } from './HealthFood';
import { BathroomEditor } from './HealthIbd';
import { CardHead, NumBox, useHealth, useWaterFmt } from './healthUi';
import { StickerArt } from './Stickers';
import { useBloom } from './store';

type Item = 'meal' | 'snack' | 'drink' | 'steps' | 'exercise' | 'weight' | 'med' | 'test' | 'visit' | 'bath';

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export function QuickAddCard({ date, isToday }: { date: ISODate; isToday: boolean }) {
  const { t } = useBloom();
  const { ibd } = useHealth();
  const [open, setOpen] = useState<Item | null>(null);
  const items: { id: Item; sticker: string; label: string }[] = [
    { id: 'meal', sticker: 'cooking', label: t('hlQA_meal') },
    { id: 'snack', sticker: 'groceries', label: t('hlQA_snack') },
    { id: 'drink', sticker: 'coffee', label: t('hlQA_drink') },
    { id: 'steps', sticker: 'run', label: t('hlSteps') },
    { id: 'exercise', sticker: 'gym', label: t('hlExercise') },
    { id: 'weight', sticker: 'yoga', label: t('hlWeight') },
    ...(ibd ? [{ id: 'bath' as Item, sticker: 'home', label: t('hlQA_bath') }] : []),
    { id: 'med', sticker: 'pill', label: t('hlQA_med') },
    { id: 'test', sticker: 'hospital', label: t('hlQA_test') },
    { id: 'visit', sticker: 'doctor', label: t('hlQA_visit') },
  ];
  const close = () => setOpen(null);
  // Mouse wheel scrolls the row sideways (forward = the reading direction).
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const rtl = getComputedStyle(el).direction === 'rtl';
      el.scrollBy({ left: rtl ? -e.deltaY : e.deltaY, behavior: 'smooth' });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  return (
    <section className="w-card hl-quick">
      <CardHead title={t('hlQuickAdd')} />
      <div ref={row} className="hl-quick-row" role="toolbar" aria-label={t('hlQuickAdd')}>
        {items.map((x) => (
          <button type="button" key={x.id} className="hl-quick-btn" onClick={() => setOpen(x.id)}>
            <StickerArt kind={x.sticker} size={26} />
            <span>{x.label}</span>
          </button>
        ))}
      </div>
      {(open === 'meal' || open === 'snack' || open === 'drink') && (
        <Modal title={t(`hlQA_${open}` as StringKey)} onClose={close} width={560} className="hl-quick-food">
          <FoodAdd date={date} isToday={isToday} kind={open} onAdded={close} />
        </Modal>
      )}
      {(open === 'steps' || open === 'exercise' || open === 'weight') && <BodyQuick field={open} date={date} onClose={close} />}
      {open === 'med' && (
        <MedEditor
          isNew
          onClose={close}
          init={{ ...newMeta(), kind: 'med', name: '', dose: '', times: ['08:00'], remind: true, active: true, supplement: false, every: 1, unit: 'day', startDate: date, sticker: 'pill' }}
        />
      )}
      {open === 'test' && <TestEditor isNew onClose={close} init={{ ...newMeta(), kind: 'test', date, name: '', value: null, unit: '', ibd: false, note: '' }} />}
      {open === 'visit' && <VisitEditor isNew onClose={close} init={{ ...newMeta(), kind: 'visit', date, doctor: '', notes: '', eventId: null }} />}
      {open === 'bath' && ibd && (
        <BathroomEditor
          isNew
          onClose={close}
          init={{ ...newMeta(), kind: 'bathroom', date, time: isToday ? nowTime() : '12:00', bristol: 4, urgency: 0, blood: false, bloodLevel: 0, pain: 0, notes: '' }}
        />
      )}
    </section>
  );
}

/** Steps / exercise: add to the day's total. Weight: the day's value. Same record as the Body tab. */
function BodyQuick({ field, date, onClose }: { field: 'steps' | 'exercise' | 'weight'; date: ISODate; onClose: () => void }) {
  const { t, locale, save } = useBloom();
  const { all } = useHealth();
  const rec = forDate(all, 'body', date);
  const cur: HealthBody = rec ?? { ...newMeta(), kind: 'body', date, weightKg: null, exerciseMin: null, steps: null };
  const key = field === 'steps' ? 'steps' : field === 'exercise' ? 'exerciseMin' : 'weightKg';
  const now = cur[key] ?? null;
  const [add, setAdd] = useState<number | null>(field === 'weight' ? (now ?? latestWeight(all, date)) : null);
  const chips = field === 'steps' ? [500, 1000, 2000, 5000] : field === 'exercise' ? [10, 20, 30, 60] : [];
  const unit = field === 'steps' ? '' : field === 'exercise' ? t('hlUnitMin') : t('hlUnitKg');
  const fmt = (v: number) => `${v.toLocaleString(locale)}${unit ? ` ${unit}` : ''}`;
  const result = field === 'weight' ? add : add != null ? (now ?? 0) + add : null;
  const ok = result != null && result > 0;
  return (
    <Modal
      title={field === 'steps' ? t('hlSteps') : field === 'exercise' ? t('hlExercise') : t('hlWeight')}
      onClose={onClose}
      width={400}
      footer={
        <>
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={!ok}
            onClick={() => {
              save('health', { ...cur, [key]: result });
              onClose();
            }}
          >
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="hl-form hl-quick-body">
        {field !== 'weight' && now != null && <p className="muted">{t('hlQA_now', { v: fmt(now) })}</p>}
        <div className="hl-portion">
          <NumBox
            value={add}
            onChange={setAdd}
            min={field === 'weight' ? 20 : 1}
            max={field === 'steps' ? 100000 : field === 'exercise' ? 1440 : 400}
            step={field === 'weight' ? 0.1 : 1}
            unit={field === 'steps' ? t('hlSteps') : unit}
            label={field === 'steps' ? t('hlSteps') : field === 'exercise' ? t('hlExercise') : t('hlWeight')}
            autoFocus
          />
          {chips.length > 0 && (
            <div className="hl-pills">
              {chips.map((c) => (
                <button type="button" key={c} dir="ltr" className={add === c ? 'active' : ''} onClick={() => setAdd(c)}>
                  +{c.toLocaleString(locale)}
                </button>
              ))}
            </div>
          )}
        </div>
        {field !== 'weight' && now != null && result != null && <p className="hl-portion-kcal">
            <bdi>= {fmt(result)}</bdi>
          </p>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------- Today's log: the whole day at a glance, click to edit

export function TodayLogCard({ date, isToday }: { date: ISODate; isToday: boolean }) {
  const { t, locale } = useBloom();
  const { all } = useHealth();
  const fmtWater = useWaterFmt();
  const [food, setFood] = useState<HealthFood | null>(null);
  const [test, setTest] = useState<HealthTest | null>(null);
  const [visit, setVisit] = useState<HealthVisit | null>(null);
  const [body, setBody] = useState(false);
  const meal = (m: HealthFood) => (m.meal === 'drink' ? t('hlQA_drink') : m.snack || m.meal === 'snack' ? t('hlQA_snack') : t(`hlMeal_${m.meal}` as StringKey));
  const order = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'];
  const foods = healthOf(all, 'food')
    .filter((f) => f.date === date)
    .sort((a, b) => order.indexOf(a.snack ? 'snack' : a.meal) - order.indexOf(b.snack ? 'snack' : b.meal) || a.time.localeCompare(b.time));
  const b = forDate(all, 'body', date);
  const tests = healthOf(all, 'test').filter((x) => x.date === date);
  const visits = healthOf(all, 'visit').filter((x) => x.date === date);
  const water = forDate(all, 'checkin', date)?.waterMl ?? 0;
  const doses = dosesOn(healthOf(all, 'med'), healthOf(all, 'taken'), date);
  const kcal = foods.reduce((a, f) => a + (f.kcal ?? 0), 0);
  const protein = foods.reduce((a, f) => a + (f.protein ?? 0), 0);
  const bodyBits = [
    b?.steps ? `${t('hlSteps')} ${b.steps.toLocaleString(locale)}` : null,
    b?.exerciseMin ? `${t('hlExercise')} ${b.exerciseMin} ${t('hlUnitMin')}` : null,
    b?.weightKg ? `${t('hlWeight')} ${b.weightKg.toLocaleString(locale)} ${t('hlUnitKg')}` : null,
  ].filter(Boolean);
  const empty = !foods.length && !bodyBits.length && !tests.length && !visits.length;
  const edit = <Icon name="pen" size={13} className="hl-log-edit" />;
  return (
    <section className="w-card hl-log">
      <CardHead sticker="important" title={isToday ? t('hlTodayLog') : t('hlDayLog')} tip={t('hlLogTip')} />
      <div className="hl-log-tot">
        <span>
          <b>{Math.round(kcal).toLocaleString(locale)}</b>
          {t('hlKcalUnit')}
        </span>
        <span>
          <b>{proteinNum(protein, locale)}</b>
          {t('hlProteinUnit')}
        </span>
        <span>
          <b>{fmtWater(water)}</b>
          {t('hlWater')}
        </span>
        <span>
          <b>{(b?.steps ?? 0).toLocaleString(locale)}</b>
          {t('hlSteps')}
        </span>
        <span>
          <b dir="ltr">{doses.length ? `${doses.filter((d) => d.taken).length}/${doses.length}` : '–'}</b>
          {t('hlTabMeds')}
        </span>
      </div>
      {empty && <p className="empty-note">{t('hlLogEmpty')}</p>}
      {foods.length > 0 && (
        <>
          <h4 className="hl-log-h">{t('hlFoodDrinks')}</h4>
          <FoodTable items={foods} label={meal} onRow={setFood} action={() => edit} />
        </>
      )}
      <h4 className="hl-log-h">{t('hlBody')}</h4>
      <ul className="hl-log-list">
        <li>
          <button type="button" onClick={() => setBody(true)}>
            <span className={`hl-log-text ${bodyBits.length ? '' : 'muted'}`}>{bodyBits.length ? bodyBits.join(' · ') : `${t('hlSteps')} · ${t('hlExercise')} · ${t('hlWeight')}`}</span>
            {edit}
          </button>
        </li>
      </ul>
      {(tests.length > 0 || visits.length > 0) && (
        <>
          <h4 className="hl-log-h">{t('hlTestsVisits')}</h4>
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
                  {edit}
                </button>
              </li>
            ))}
            {visits.map((v) => (
              <li key={v.id}>
                <button type="button" onClick={() => setVisit(v)}>
                  <StickerArt kind="doctor" size={18} />
                  <span className="hl-log-text">
                    <bdi>{v.doctor || t('hlQA_visit')}</bdi>
                    {(v.docs?.length ?? 0) > 0 && <small> · {v.docs!.length === 1 ? t('hlDocOne') : t('hlDocsN', { n: v.docs!.length })}</small>}
                  </span>
                  {edit}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {food && <FoodEditor init={food} onClose={() => setFood(null)} />}
      {test && <TestEditor init={test} isNew={false} onClose={() => setTest(null)} />}
      {visit && <VisitEditor init={visit} isNew={false} onClose={() => setVisit(null)} />}
      {body && <BodyEdit date={date} onClose={() => setBody(false)} />}
    </section>
  );
}

/** Steps, exercise and weight for the day in one window (same record as the Body tab). */
function BodyEdit({ date, onClose }: { date: ISODate; onClose: () => void }) {
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
