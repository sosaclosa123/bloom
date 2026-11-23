// Health trackers: medications (+ private reminders), body, tests, doctor visits.
import { useMemo, useState } from 'react';
import type { StringKey } from '../i18n/strings';
import { platform } from '../platform/api';
import { newMeta, uuid } from '../shared/db';
import { addDays, parseISODate, toISODate } from '../shared/dates';
import { dosesOn, forDate, healthOf, latestWeight, medDueOn, nextMedDate, profileOf } from '../shared/health';
import type { CalendarEvent, HealthBody, HealthMed, HealthMedTaken, HealthTest, HealthVisit, ISODate } from '../shared/types';
import { Button, Field, Icon, IconButton, Modal, Segmented, Toggle } from './common';
import { newEvent } from './drafts';
import { CardHead, LineChart, NumBox, StickerChoice, Tip, useHealth } from './healthUi';
import { StickerArt } from './Stickers';
import { useBloom } from './store';

const weekdayName = (n: number, locale: string) => new Date(2026, 2, 1 + n).toLocaleDateString(locale, { weekday: 'long' }); // 1 Mar 2026 = Sunday

const fmtDay = (d: ISODate, locale: string, year = false) =>
  parseISODate(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });

function CheckBtn({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" className={`hl-check ${on ? 'on' : ''}`} role="checkbox" aria-checked={on} aria-label={label} title={label} onClick={onClick}>
      <Icon name="check" size={13} />
    </button>
  );
}

// ---------------------------------------------------------------- medications

export function MedsCard({ date, todayOnly }: { date: ISODate; todayOnly?: boolean }) {
  const { t, locale, save } = useBloom();
  const { all } = useHealth();
  const [editing, setEditing] = useState<{ med: HealthMed; isNew: boolean } | null>(null);
  const meds = healthOf(all, 'med');
  const taken = healthOf(all, 'taken');
  const doses = dosesOn(meds, taken, date);
  const asNeeded = meds.filter((m) => m.active && m.times.length === 0);
  const paused = todayOnly ? [] : meds.filter((m) => !m.active);
  // Not due this day (e.g. an injection every 2 weeks): shown with its next date.
  const later = (todayOnly ? [] : meds)
    .filter((m) => m.active && m.times.length && !medDueOn(m, date))
    .map((m) => ({ med: m, next: nextMedDate(m, date) }))
    .filter((x) => x.next)
    .sort((a, b) => a.next!.localeCompare(b.next!));

  const toggle = (med: HealthMed, time: string, rec: HealthMedTaken | undefined) => {
    if (rec) void platform.remove('health', rec.id);
    else save('health', { ...newMeta(), kind: 'taken', medId: med.id, date, time } satisfies HealthMedTaken);
  };
  const add = () =>
    setEditing({ med: { ...newMeta(), kind: 'med', name: '', dose: '', times: ['08:00'], remind: true, active: true, supplement: false, every: 1, unit: 'day', startDate: date, sticker: 'pill' }, isNew: true });
  const name = (med: HealthMed) => (
    <button type="button" className="hl-dose-name" onClick={() => setEditing({ med, isNew: false })}>
      <span dir="auto">{med.name || t('hlMedication')}</span>
      {med.dose && (
        <span className="muted" dir="auto">
          {med.dose}
        </span>
      )}
    </button>
  );
  const art = (med: HealthMed) => (
    <span className="hl-dose-st" aria-hidden="true">
      <StickerArt kind={med.sticker || (med.supplement ? 'plants' : 'pill')} size={26} />
    </span>
  );

  return (
    <section className="w-card hl-meds">
      <CardHead sticker="pill" title={todayOnly ? t('hlMedsToday') : t('hlMeds')}>
        <Button size="sm" icon="plus" onClick={add}>
          {t('hlAddMed')}
        </Button>
      </CardHead>
      {meds.length === 0 ? (
        <p className="empty-note">{t('hlNoMeds')}</p>
      ) : (
        <ul className="hl-dose-list">
          {doses.length === 0 && asNeeded.length === 0 && <li className="empty-note">{t('hlNoDoses')}</li>}
          {doses.map(({ med, time, taken: rec }) => (
            <li key={med.id + time} className={`hl-dose ${rec ? 'done' : ''}`}>
              <span className="up-bar" />
              <span className="hl-dose-time" dir="ltr">
                {time}
              </span>
              {art(med)}
              {name(med)}
              {med.supplement && <span className="hl-tag">{t('hlMedSupplement')}</span>}
              {(med.every ?? 1) > 1 || (med.unit && med.unit !== 'day') ? <span className="hl-tag">{repeatText(med, t)}</span> : null}
              {med.remind && <Icon name="bell" size={13} className="hl-dose-bell" />}
              <CheckBtn on={!!rec} label={rec ? t('hlTaken') : t('hlMarkTaken')} onClick={() => toggle(med, time, rec)} />
            </li>
          ))}
          {asNeeded.map((med) => {
            const count = taken.filter((x) => x.medId === med.id && x.date === date && x.time === '').length;
            return (
              <li key={med.id} className="hl-dose">
                <span className="up-bar" />
                <span className="hl-dose-time">{count > 0 ? `×${count}` : '–'}</span>
                {art(med)}
                {name(med)}
                {med.supplement && <span className="hl-tag">{t('hlMedSupplement')}</span>}
                <button type="button" className="hl-mini-btn" aria-label={t('hlMarkTaken')} title={t('hlMarkTaken')} onClick={() => toggle(med, '', undefined)}>
                  +
                </button>
              </li>
            );
          })}
          {later.map(({ med, next }) => (
            <li key={med.id} className="hl-dose later">
              <span className="up-bar" />
              <span className="hl-dose-time" />
              {art(med)}
              {name(med)}
              <span className="hl-tag">{t('hlNextOn', { d: fmtDay(next!, locale) })}</span>
            </li>
          ))}
          {paused.map((med) => (
            <li key={med.id} className="hl-dose paused">
              <span className="up-bar" />
              <span className="hl-dose-time" />
              {art(med)}
              {name(med)}
              <span className="hl-tag">{t('hlMedPaused')}</span>
            </li>
          ))}
        </ul>
      )}
      {editing && <MedEditor init={editing.med} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </section>
  );
}

/** "Every 2 weeks" etc. */
function repeatText(m: Pick<HealthMed, 'every' | 'unit'>, t: ReturnType<typeof useBloom>['t']) {
  const n = Math.max(1, m.every ?? 1);
  const u = m.unit ?? 'day';
  return n === 1 ? t(`hlEvery1_${u}` as StringKey) : t(`hlEveryN_${u}` as StringKey, { n });
}

export function MedEditor({ init, isNew, onClose }: { init: HealthMed; isNew: boolean; onClose: () => void }) {
  const { t, save, del, locale } = useBloom();
  const { all } = useHealth();
  const [m, setM] = useState(init);
  const set = (p: Partial<HealthMed>) => setM((x) => ({ ...x, ...p }));
  const ok = !!m.name.trim();
  const commit = () => {
    if (!ok) return;
    const times = [...new Set(m.times.filter((x) => /^\d\d:\d\d$/.test(x)))].sort();
    save('health', { ...m, name: m.name.trim(), dose: m.dose.trim(), times });
    onClose();
  };
  // Taken history: last 14 days (from when it was added).
  const history = useMemo(() => {
    if (isNew) return [];
    const taken = healthOf(all, 'taken');
    const first = toISODate(new Date(init.createdAt));
    const out: { date: ISODate; planned: number; done: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const date = toISODate(addDays(new Date(), -i));
      if (date < first) continue;
      if (!medDueOn(init, date)) continue;
      const done = taken.filter((x) => x.medId === init.id && x.date === date).length;
      out.push({ date, planned: init.times.length, done });
    }
    return out;
  }, [all, init, isNew]);

  return (
    <Modal
      title={isNew ? t('hlAddMed') : t('hlEditMed')}
      onClose={onClose}
      width={460}
      footer={
        <>
          {!isNew && (
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
          )}
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="primary" disabled={!ok} onClick={commit}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form
        className="hl-form"
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <Field label={t('hlMedName')}>
          <input autoFocus dir="auto" value={m.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label={t('hlMedDose')}>
          <input dir="auto" value={m.dose} placeholder={t('hlMedDoseHint')} onChange={(e) => set({ dose: e.target.value })} />
        </Field>
        <div className="field">
          <span className="field-label">{t('hlMedTimes')}</span>
          <div className="hl-times">
            {m.times.map((time, k) => (
              <span key={k} className="hl-time">
                <input type="time" dir="ltr" value={time} aria-label={t('hlTime')} onChange={(e) => set({ times: m.times.map((x, j) => (j === k ? e.target.value : x)) })} />
                <IconButton icon="close" label={t('delete')} onClick={() => set({ times: m.times.filter((_, j) => j !== k) })} />
              </span>
            ))}
            <Button size="sm" variant="ghost" icon="plus" onClick={() => set({ times: [...m.times, m.times.length ? '20:00' : '08:00'] })}>
              {t('hlAddTime')}
            </Button>
          </div>
        </div>
        <div className="field">
          <span className="field-label">{t('hlRepeat')}</span>
          <div className="hl-repeat">
            <span>{t('hlEveryWord')}</span>
            <NumBox value={m.every ?? 1} onChange={(v) => set({ every: Math.max(1, Math.round(v ?? 1)) })} min={1} max={365} label={t('hlRepeat')} />
            <select value={m.unit ?? 'day'} aria-label={t('hlRepeat')} onChange={(e) => set({ unit: e.target.value as HealthMed['unit'], startDate: m.startDate ?? toISODate(new Date()) })}>
              <option value="day">{t('hlUnitDays')}</option>
              <option value="week">{t('hlUnitWeeks')}</option>
              <option value="month">{t('hlUnitMonths')}</option>
            </select>
            {((m.every ?? 1) > 1 || (m.unit ?? 'day') !== 'day') && (
              <>
                <span>{t('hlFromDate')}</span>
                <input type="date" value={m.startDate ?? toISODate(new Date())} onChange={(e) => e.target.value && set({ startDate: e.target.value })} />
              </>
            )}
          </div>
        </div>
        <div className="field">
          <span className="field-label">{t('hlSticker')}</span>
          <StickerChoice value={m.sticker || 'pill'} onChange={(sticker) => set({ sticker })} label={t('hlSticker')} />
        </div>
        <Toggle checked={m.remind} label={t('hlMedRemind')} onChange={(remind) => set({ remind })} />
        <Toggle checked={m.supplement} label={t('hlMedSupplement')} onChange={(supplement) => set({ supplement })} />
        <Toggle checked={m.active} label={t('hlMedActive')} onChange={(active) => set({ active })} />
        {history.length > 0 && m.times.length > 0 && (
          <div className="field">
            <span className="field-label">{t('hlLast14')}</span>
            <div className="hl-history">
              {history.map((h) => (
                <span
                  key={h.date}
                  className={`hl-hist ${h.done >= h.planned ? 'all' : h.done > 0 ? 'some' : 'none'}`}
                  title={`${fmtDay(h.date, locale)} · ${h.done}/${h.planned}`}
                >
                  {h.done >= h.planned ? '✓' : ''}
                </span>
              ))}
            </div>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- body

export function BodyCard({ date }: { date: ISODate }) {
  const { t, locale, save, settings } = useBloom();
  const [chart, setChart] = useState(false);
  const [range, setRange] = useState<90 | 365 | 0>(90);
  const { all } = useHealth();
  const rec = forDate(all, 'body', date);
  const cur: HealthBody = rec ?? { ...newMeta(), kind: 'body', date, weightKg: null, exerciseMin: null, steps: null };
  // Filled in from your last weight / the health questions until you change it.
  const prefillWeight = cur.weightKg ?? latestWeight(all, date);
  const prefillExercise = cur.exerciseMin ?? profileOf(all)?.exerciseMin ?? null;
  const prefilled = (cur.weightKg == null && prefillWeight != null) || (cur.exerciseMin == null && prefillExercise != null);
  const set = (p: Partial<HealthBody>) => save('health', { ...cur, ...p });
  // Neutral change over about a month (no judgement).
  const weights = healthOf(all, 'body')
    .filter((b) => b.weightKg && b.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = weights[weights.length - 1];
  const monthAgo = toISODate(addDays(parseISODate(date), -30));
  const first = weights.find((b) => b.date >= monthAgo);
  const diff = last && first && first !== last ? Math.round((last.weightKg! - first.weightKg!) * 10) / 10 : null;

  return (
    <section className="w-card hl-body-card">
      <CardHead
        sticker="gym"
        title={t('hlBody')}
        sub={settings.healthWeighDay != null ? t('hlWeighEvery', { d: weekdayName(settings.healthWeighDay, locale) }) : undefined}
      />
      <div className="hl-body-grid">
        <label className="hl-mini-field">
          <span className="field-label">{prefilled ? <Tip text={t('hlPrefilled')}>{t('hlWeight')}</Tip> : t('hlWeight')}</span>
          <NumBox value={prefillWeight} onChange={(weightKg) => set({ weightKg })} min={10} max={400} step={0.1} unit={t('hlUnitKg')} label={t('hlWeight')} />
        </label>
        <label className="hl-mini-field">
          <span className="field-label">{t('hlExercise')}</span>
          <NumBox value={prefillExercise} onChange={(exerciseMin) => set({ exerciseMin })} min={0} max={1000} unit={t('hlUnitMin')} label={t('hlExercise')} />
        </label>
        <label className="hl-mini-field">
          <span className="field-label">{t('hlSteps')}</span>
          <NumBox value={cur.steps} onChange={(steps) => set({ steps })} min={0} max={200000} step={100} label={t('hlSteps')} />
        </label>
      </div>
      {diff != null && first && (
        <p className="w-card-sub">
          {t('hlWeightSince', { d: `\u2066${diff > 0 ? '+' : ''}${diff.toLocaleString(locale)}\u2069 ${t('hlUnitKg')}`, date: fmtDay(first.date, locale) })}
        </p>
      )}
      {weights.length > 0 && (
        <button type="button" className="hl-toggle-btn" aria-expanded={chart} onClick={() => setChart(!chart)}>
          <Icon name={chart ? 'chevronLeft' : 'chevronRight'} size={14} className="hl-chev" /> {chart ? t('hlHideWeightChart') : t('hlShowWeightChart')}
        </button>
      )}
      {chart && weights.length > 0 && (
        <div className="hl-chart-box">
          <Segmented
            value={range}
            onChange={setRange}
            label={t('hlWeight')}
            options={[
              { value: 90, label: t('hl3Months') },
              { value: 365, label: t('hlYear') },
              { value: 0, label: t('hlAll') },
            ]}
          />
          <LineChart
            label={t('hlWeight')}
            points={weights.filter((w) => !range || w.date >= toISODate(addDays(parseISODate(date), -range))).map((w) => ({ date: w.date, value: w.weightKg! }))}
            fmt={(v) => `${(Math.round(v * 10) / 10).toLocaleString(locale)} ${t('hlUnitKg')}`}
          />
          <p className="hl-legend-line">
            <i className="dot" /> {t('hlWeight')} <i className="dash" /> {t('hlTrendLine')}
          </p>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- tests

/** Common lab tests. `ibd` ones only show when IBD is on. */
export const TEST_PRESETS: { id: string; unit: string; ibd?: boolean }[] = [
  { id: 'hemoglobin', unit: 'g/dL' },
  { id: 'ferritin', unit: 'ng/mL' },
  { id: 'iron', unit: 'µg/dL' },
  { id: 'b12', unit: 'pg/mL' },
  { id: 'vitd', unit: 'ng/mL' },
  { id: 'crp', unit: 'mg/L' },
  { id: 'albumin', unit: 'g/dL' },
  { id: 'calprotectin', unit: 'µg/g', ibd: true },
];

export function TestsCard() {
  const { t, locale } = useBloom();
  const { all, ibd } = useHealth();
  const [editing, setEditing] = useState<{ test: HealthTest; isNew: boolean } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const tests = healthOf(all, 'test')
    .filter((x) => ibd || !x.ibd)
    .sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt);
  const shown = showAll ? tests : tests.slice(0, 5);
  const [hist, setHist] = useState(false);
  const names = [...new Set(tests.filter((x) => x.value != null).map((x) => x.name))];
  const [pick, setPick] = useState<string | null>(null);
  const chosen = pick && names.includes(pick) ? pick : names[0];
  const series = tests
    .filter((x) => x.name === chosen && x.value != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((x) => ({ date: x.date, value: x.value! }));
  const unit = tests.find((x) => x.name === chosen)?.unit ?? '';
  const add = () => setEditing({ test: { ...newMeta(), kind: 'test', date: toISODate(new Date()), name: '', value: null, unit: '', ibd: false, note: '' }, isNew: true });
  return (
    <section className="w-card hl-tests">
      <CardHead sticker="hospital" title={t('hlTests')}>
        <Button size="sm" icon="plus" onClick={add}>
          {t('hlAddTest')}
        </Button>
      </CardHead>
      {tests.length === 0 ? (
        <p className="empty-note">{t('hlNoTests')}</p>
      ) : (
        <ul className="hl-list">
          {shown.map((x) => (
            <li key={x.id}>
              <button type="button" className={`hl-item ${x.ibd ? 'ibd' : ''}`} onClick={() => setEditing({ test: x, isNew: false })}>
                <span className="hl-item-title" dir="auto">
                  {x.name || '—'}
                </span>
                {x.ibd && <span className="hl-tag ibd">{t('hlIbdTag')}</span>}
                <span className="hl-item-value" dir="ltr">
                  {x.value != null ? x.value.toLocaleString(locale) : ''} {x.unit}
                </span>
                <span className="hl-item-date">{fmtDay(x.date, locale, true)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {tests.length > 5 && (
        <button type="button" className="link-btn" onClick={() => setShowAll(!showAll)}>
          {showAll ? t('hlShowLess') : t('hlShowAll', { n: tests.length })}
        </button>
      )}
      {names.length > 0 && (
        <button type="button" className="hl-toggle-btn" aria-expanded={hist} onClick={() => setHist(!hist)}>
          <Icon name={hist ? 'chevronLeft' : 'chevronRight'} size={14} className="hl-chev" /> {hist ? t('hlHideHistory') : t('hlShowHistory')}
        </button>
      )}
      {hist && chosen && (
        <div className="hl-chart-box">
          <div className="hl-pills hl-metric-pills" role="radiogroup" aria-label={t('hlTests')}>
            {names.map((n) => (
              <button type="button" key={n} role="radio" aria-checked={n === chosen} className={n === chosen ? 'active' : ''} onClick={() => setPick(n)} dir="auto">
                {n}
              </button>
            ))}
          </div>
          <LineChart label={chosen} points={series} trend={series.length >= 3} fmt={(v) => `${v.toLocaleString(locale)} ${unit}`} />
          <ul className="hl-hist-list">
            {[...series].reverse().map((p) => (
              <li key={p.date}>
                <span className="hl-item-date">{fmtDay(p.date, locale, true)}</span>
                <span className="hl-item-value" dir="ltr">
                  {p.value.toLocaleString(locale)} {unit}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {editing && <TestEditor init={editing.test} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </section>
  );
}

export function TestEditor({ init, isNew, onClose }: { init: HealthTest; isNew: boolean; onClose: () => void }) {
  const { t, save, del } = useBloom();
  const { ibd } = useHealth();
  const [x, setX] = useState(init);
  const presets = TEST_PRESETS.filter((p) => ibd || !p.ibd);
  const label = (id: string) => t(`hlTest_${id}` as StringKey);
  const setName = (name: string) => {
    // A known test fills in its usual unit and whether it's an IBD test.
    const p = TEST_PRESETS.find((q) => [label(q.id), q.id].some((n) => n.toLowerCase() === name.trim().toLowerCase()));
    setX((cur) => ({ ...cur, name, unit: p && !cur.unit ? p.unit : cur.unit, ibd: p ? !!p.ibd : cur.ibd && !!name.trim() }));
  };
  const ok = !!x.name.trim() && !!x.date;
  const commit = () => {
    if (!ok) return;
    save('health', { ...x, name: x.name.trim(), unit: x.unit.trim() });
    onClose();
  };
  return (
    <Modal
      title={isNew ? t('hlAddTest') : t('hlEditTest')}
      onClose={onClose}
      width={440}
      footer={
        <>
          {!isNew && (
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
          )}
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="primary" disabled={!ok} onClick={commit}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form
        className="hl-form"
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <Field label={t('hlTestName')}>
          <input autoFocus dir="auto" list="hl-test-presets" value={x.name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <datalist id="hl-test-presets">
          {presets.map((p) => (
            <option key={p.id} value={label(p.id)} />
          ))}
        </datalist>
        <div className="hl-presets">
          {presets.map((p) => (
            <button type="button" key={p.id} className={`hl-tag-btn ${p.ibd ? 'ibd' : ''}`} onClick={() => setName(label(p.id))}>
              {label(p.id)}
            </button>
          ))}
        </div>
        <div className="hl-form-row">
          <Field label={t('hlTestValue')}>
            <NumBox value={x.value} onChange={(value) => setX({ ...x, value })} min={-100000} max={1000000} step={0.01} label={t('hlTestValue')} />
          </Field>
          <Field label={<Tip text={t('hlTestRangeHint')}>{t('hlTestUnit')}</Tip>}>
            <input dir="ltr" value={x.unit} onChange={(e) => setX({ ...x, unit: e.target.value })} />
          </Field>
        </div>

        <Field label={t('hlDate')}>
          <input type="date" value={x.date} onChange={(e) => e.target.value && setX({ ...x, date: e.target.value })} />
        </Field>
        <Field label={t('hlNote')}>
          <input dir="auto" value={x.note} onChange={(e) => setX({ ...x, note: e.target.value })} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- doctor visits

/**
 * Doctor visits: the complete history, never tied to the day shown above.
 * Newest first (upcoming on top); the list scrolls once it is long. Each
 * visit shows a document sticker when files are attached, or a plus to add.
 */
export function VisitsCard() {
  const { t, locale, save } = useBloom();
  const { all } = useHealth();
  const [editing, setEditing] = useState<{ visit: HealthVisit; isNew: boolean } | null>(null);
  const [docsOf, setDocsOf] = useState<HealthVisit | null>(null);
  const today = toISODate(new Date());
  const visits = healthOf(all, 'visit').sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const add = () => setEditing({ visit: { ...newMeta(), kind: 'visit', date: today, doctor: '', notes: '', eventId: null }, isNew: true });
  const addDocs = async (v: HealthVisit) => {
    const docs = await platform.addDocs();
    if (docs.length) save('health', { ...v, docs: [...(v.docs ?? []), ...docs] });
  };
  return (
    <section className="w-card hl-visits">
      <CardHead sticker="doctor" title={t('hlVisits')}>
        <Button size="sm" icon="plus" onClick={add}>
          {t('hlAddVisit')}
        </Button>
      </CardHead>
      {visits.length === 0 ? (
        <p className="empty-note">{t('hlNoVisits')}</p>
      ) : (
        <ul className="hl-list hl-visit-list">
          {visits.map((v) => {
            const n = v.docs?.length ?? 0;
            return (
              <li key={v.id} className={v.date >= today ? 'upcoming' : ''}>
                <button type="button" className="hl-item" onClick={() => setEditing({ visit: v, isNew: false })}>
                  <span className="hl-item-date hl-visit-date">{fmtDay(v.date, locale, true)}</span>
                  <span className="hl-item-title" dir="auto">
                    {v.doctor || t('hlDoctor')}
                  </span>
                  {v.date >= today && <span className="hl-tag">{t('hlUpcoming')}</span>}
                  {v.eventId && <Icon name="calendar" size={13} className="muted" />}
                  {(v.questions?.length ?? 0) > 0 && (
                    <span className="hl-tag">{t('hlQuestionsCount', { a: v.questions!.filter((q) => q.done).length, b: v.questions!.length })}</span>
                  )}
                  {v.notes && (
                    <span className="hl-item-note" dir="auto">
                      {v.notes}
                    </span>
                  )}
                </button>
                {n > 0 ? (
                  <button type="button" className="hl-doc-btn has" title={t('hlDocsN', { n })} aria-label={t('hlDocsN', { n })} onClick={() => setDocsOf(v)}>
                    <StickerArt kind="homework" size={28} />
                    <span className="hl-doc-count">{n}</span>
                  </button>
                ) : (
                  <button type="button" className="hl-doc-btn" title={t('hlAddDocs')} aria-label={t('hlAddDocs')} onClick={() => void addDocs(v)}>
                    <Icon name="plus" size={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editing && <VisitEditor init={editing.visit} isNew={editing.isNew} onClose={() => setEditing(null)} />}
      {docsOf && <DocsModal visit={visits.find((v) => v.id === docsOf.id) ?? docsOf} onClose={() => setDocsOf(null)} />}
    </section>
  );
}

/** A visit's documents: open (system viewer), add more, remove. */
export function DocsList({ visit, editable }: { visit: HealthVisit; editable?: boolean }) {
  const { t, save } = useBloom();
  const docs = visit.docs ?? [];
  return (
    <div className="hl-docs">
      {docs.length > 0 && (
        <ul className="hl-doc-list">
          {docs.map((d) => (
            <li key={d.id}>
              <button type="button" className="hl-doc" onClick={() => void platform.openDoc(d)} title={t('hlOpenDoc')}>
                <Icon name={/\.pdf$/i.test(d.fileName) ? 'note' : 'image'} size={15} />
                <span dir="auto">{d.name}</span>
              </button>
              {editable && <IconButton icon="close" label={t('delete')} onClick={() => save('health', { ...visit, docs: docs.filter((x) => x.id !== d.id) })} />}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <Button
          size="sm"
          variant="ghost"
          icon="plus"
          onClick={async () => {
            const more = await platform.addDocs();
            if (more.length) save('health', { ...visit, docs: [...docs, ...more] });
          }}
        >
          {t('hlAddDocs')}
        </Button>
      )}
    </div>
  );
}

function DocsModal({ visit, onClose }: { visit: HealthVisit; onClose: () => void }) {
  const { t, locale } = useBloom();
  return (
    <Modal title={`${visit.doctor || t('hlDoctor')} · ${fmtDay(visit.date, locale, true)}`} onClose={onClose} width={460}>
      <DocsList visit={visit} editable />
    </Modal>
  );
}

export function VisitEditor({ init, isNew, onClose }: { init: HealthVisit; isNew: boolean; onClose: () => void }) {
  const { t, save, del, snap, settings } = useBloom();
  const [v, setV] = useState(init);
  const linked = init.eventId ? snap.events.find((e) => e.id === init.eventId && !e.deletedAt) : undefined;
  const [time, setTime] = useState(linked && !linked.allDay ? linked.start.slice(11, 16) : '');
  const [toCal, setToCal] = useState(!!linked);
  const ok = !!v.date;
  const commit = () => {
    if (!ok) return;
    let eventId = linked?.id ?? null;
    if (toCal) {
      // A private calendar event for the visit (only if asked for).
      const title = v.doctor.trim() || t('hlDoctor');
      const fresh = newEvent(v.date, settings, time || '09:00');
      const ev: CalendarEvent = {
        ...(linked ?? fresh),
        title,
        allDay: !time,
        start: time ? fresh.start : `${v.date}T00:00`,
        end: time ? fresh.end : `${v.date}T23:59`,
        remindBefore: time ? (linked?.remindBefore ?? fresh.remindBefore) : [],
        visibility: 'private',
      };
      save('events', ev);
      eventId = ev.id;
    }
    save('health', { ...v, doctor: v.doctor.trim(), eventId: toCal ? eventId : null, questions: (v.questions ?? []).filter((q) => q.text.trim()) });
    onClose();
  };
  return (
    <Modal
      title={isNew ? t('hlAddVisit') : t('hlEditVisit')}
      onClose={onClose}
      width={440}
      footer={
        <>
          {!isNew && (
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
          )}
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="primary" disabled={!ok} onClick={commit}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form
        className="hl-form"
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <Field label={t('hlDoctor')}>
          <input autoFocus dir="auto" value={v.doctor} placeholder={t('hlDoctorHint')} onChange={(e) => setV({ ...v, doctor: e.target.value })} />
        </Field>
        <div className="hl-form-row">
          <Field label={t('hlDate')}>
            <input type="date" value={v.date} onChange={(e) => e.target.value && setV({ ...v, date: e.target.value })} />
          </Field>
          <Field label={t('hlTime')}>
            <input type="time" dir="ltr" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label={t('hlNote')}>
          <textarea dir="auto" rows={3} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
        </Field>
        <div className="field">
          <span className="field-label">{t('hlQuestions')}</span>
          <ul className="hl-q-list">
            {(v.questions ?? []).map((q) => (
              <li key={q.id}>
                <label className="check">
                  <input type="checkbox" checked={q.done} onChange={() => setV({ ...v, questions: v.questions!.map((x) => (x.id === q.id ? { ...x, done: !x.done } : x)) })} />
                  <span className="check-box">
                    <Icon name="check" size={12} />
                  </span>
                </label>
                <input
                  dir="auto"
                  value={q.text}
                  aria-label={t('hlQuestions')}
                  onChange={(e) => setV({ ...v, questions: v.questions!.map((x) => (x.id === q.id ? { ...x, text: e.target.value } : x)) })}
                />
                <IconButton icon="close" label={t('delete')} onClick={() => setV({ ...v, questions: v.questions!.filter((x) => x.id !== q.id) })} />
              </li>
            ))}
          </ul>
          <Button size="sm" variant="ghost" icon="plus" onClick={() => setV({ ...v, questions: [...(v.questions ?? []), { id: uuid(), text: '', done: false }] })}>
            {t('hlAddQuestion')}
          </Button>
        </div>
        <Toggle checked={toCal} label={linked ? t('hlInCalendar') : t('hlAddToCalendar')} onChange={setToCal} />
        <div className="field">
          <span className="field-label">{t('hlDocs')}</span>
          <div className="hl-docs">
            {(v.docs ?? []).length > 0 && (
              <ul className="hl-doc-list">
                {(v.docs ?? []).map((d) => (
                  <li key={d.id}>
                    <button type="button" className="hl-doc" onClick={() => void platform.openDoc(d)} title={t('hlOpenDoc')}>
                      <Icon name={/\.pdf$/i.test(d.fileName) ? 'note' : 'image'} size={15} />
                      <span dir="auto">{d.name}</span>
                    </button>
                    <IconButton icon="close" label={t('delete')} onClick={() => setV({ ...v, docs: (v.docs ?? []).filter((x) => x.id !== d.id) })} />
                  </li>
                ))}
              </ul>
            )}
            <Button size="sm" variant="ghost" icon="plus" onClick={async () => setV({ ...v, docs: [...(v.docs ?? []), ...(await platform.addDocs())] })}>
              {t('hlAddDocs')}
            </Button>
          </div>
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- medication history graph

/** One "Taken / not taken" card per medicine (active first), stacked. */
export function MedHistoryCards({ date }: { date: ISODate }) {
  const { all } = useHealth();
  const meds = healthOf(all, 'med').sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  return (
    <>
      {meds.map((m) => (
        <MedHistoryCard key={m.id} date={date} med={m} />
      ))}
    </>
  );
}

/** One medicine: one bar per day — taken (green), partly (light), missed (pink), not due (grey). */
function MedHistoryCard({ date, med }: { date: ISODate; med: HealthMed }) {
  const { t, locale, save } = useBloom();
  const { all } = useHealth();
  const [range, setRange] = useState<30 | 90 | 365 | 0>(30);
  const taken = healthOf(all, 'taken');
  const days = useMemo(() => {
    if (!med) return [];
    const first = med.startDate && med.startDate < toISODate(new Date(med.createdAt)) ? med.startDate : toISODate(new Date(med.createdAt));
    const n = range || Math.max(30, Math.round((parseISODate(date).getTime() - parseISODate(first).getTime()) / 86400000) + 1);
    const today = toISODate(new Date());
    return Array.from({ length: n }, (_, i) => {
      const d = toISODate(addDays(parseISODate(date), i - n + 1));
      // A paused medicine counts until it was paused (its last change).
      const until = med.active === false ? toISODate(new Date(med.updatedAt)) : '9999-12-31';
      const due = d >= first && d <= until && medDueOn(med, d) ? Math.max(1, med.times.length) : 0;
      const got = taken.filter((x) => x.medId === med.id && x.date === d).length;
      const state = due === 0 ? (got ? 'all' : 'none') : got >= due ? 'all' : got > 0 ? 'some' : d < today ? 'missed' : 'none';
      return { d, due, got, state };
    });
  }, [med, range, date, taken]);
  // The chosen day (top of the Health page) only: mark every planned dose taken, or undo.
  const isToday = date === toISODate(new Date());
  const doses = dosesOn([med], taken, date);
  const dayTaken = taken.filter((x) => x.medId === med.id && x.date === date);
  const done = doses.length ? doses.every((d) => d.taken) : dayTaken.length > 0;
  const dayName = parseISODate(date).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
  const markDay = () => {
    if (done) for (const x of dayTaken) void platform.remove('health', x.id);
    else if (doses.length) for (const d of doses) if (!d.taken) save('health', { ...newMeta(), kind: 'taken', medId: med.id, date, time: d.time } satisfies HealthMedTaken);
    else save('health', { ...newMeta(), kind: 'taken', medId: med.id, date, time: '' } satisfies HealthMedTaken);
  };
  const dueDays = days.filter((x) => x.due > 0 && x.d <= toISODate(new Date()));
  const okDays = dueDays.filter((x) => x.state === 'all').length;
  const label = (d: ISODate, i: number) => {
    const day = parseISODate(d);
    if (days.length <= 31) return i % 5 === 4 || i === 0 ? String(day.getDate()) : '';
    if (days.length <= 120) return day.getDate() === 1 ? day.toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : '';
    return day.getDate() === 1 && (days.length <= 400 ? day.getMonth() % 2 === 0 : day.getMonth() === 0) ? day.toLocaleDateString(locale, days.length <= 400 ? { month: 'short' } : { year: 'numeric' }) : '';
  };
  return (
    <section className="w-card hl-medhist">
      <CardHead
        sticker={med.sticker || (med.supplement ? 'plants' : 'pill')}
        title={<span dir="auto">{med.name || t('hlMedication')}</span>}
        sub={[med.dose, !med.active ? t('hlMedPaused') : null, t('hlMedHistory')].filter(Boolean).join(' · ')}
      >
        {dueDays.length > 0 && <span className="hl-score lvl-remission">{t('hlTakenDays', { a: okDays, b: dueDays.length })}</span>}
      </CardHead>
      <div className="hl-medhist-top">
        {med.active && (
          <button type="button" className={`hl-take-btn ${done ? 'on' : ''}`} aria-pressed={done} title={done ? t('hlTapToUndo') : undefined} onClick={markDay}>
            <Icon name="check" size={14} />
            {done ? (isToday ? t('hlTakenToday') : t('hlTakenOn', { d: dayName })) : isToday ? t('hlMarkTakenToday') : t('hlMarkTakenOn', { d: dayName })}
          </button>
        )}
        <Segmented
          value={range}
          onChange={setRange}
          label={t('hlMedHistory')}
          options={[
            { value: 30, label: t('hlNDays', { n: 30 }) },
            { value: 90, label: t('hlNDays', { n: 90 }) },
            { value: 365, label: t('hlYear') },
            { value: 0, label: t('hlFromStart') },
          ]}
        />
      </div>
      <div className={`hl-chart r-month timeline hl-adh ${days.length > 120 ? 'dense' : ''}`} role="img" aria-label={`${med.name} · ${t('hlMedHistory')}`}>
        {days.map((x, i) => (
          <span key={x.d} className="hl-col" title={`${parseISODate(x.d).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })} · ${x.due ? `${x.got}/${x.due}` : t('hlNotDue')}`}>
            <span className="hl-bar-wrap">
              <span className={`hl-bar adh-${x.state}`} />
            </span>
            <span className="hl-col-label">{label(x.d, i)}</span>
          </span>
        ))}
      </div>
      <div className="hl-legend">
        <span>
          <i className="adh-all" /> {t('hlTaken')}
        </span>
        <span>
          <i className="adh-some" /> {t('hlPartly')}
        </span>
        <span>
          <i className="adh-missed" /> {t('hlNotTaken')}
        </span>
        <span>
          <i className="none" /> {t('hlNotDue')}
        </span>
      </div>
    </section>
  );
}
