// Health trackers: medications (+ private reminders), body, tests, doctor visits.
import { useMemo, useState } from 'react';
import type { StringKey } from '../i18n/strings';
import { platform } from '../platform/api';
import { newMeta } from '../shared/db';
import { addDays, parseISODate, toISODate } from '../shared/dates';
import { dosesOn, forDate, healthOf } from '../shared/health';
import type { CalendarEvent, HealthBody, HealthMed, HealthMedTaken, HealthTest, HealthVisit, ISODate } from '../shared/types';
import { Button, Field, Icon, IconButton, Modal, Toggle } from './common';
import { newEvent } from './drafts';
import { NumBox, useHealth } from './healthUi';
import { useBloom } from './store';

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

export function MedsCard({ date }: { date: ISODate }) {
  const { t, save } = useBloom();
  const { all } = useHealth();
  const [editing, setEditing] = useState<{ med: HealthMed; isNew: boolean } | null>(null);
  const meds = healthOf(all, 'med');
  const taken = healthOf(all, 'taken');
  const doses = dosesOn(meds, taken, date);
  const asNeeded = meds.filter((m) => m.active && m.times.length === 0);
  const paused = meds.filter((m) => !m.active);

  const toggle = (med: HealthMed, time: string, rec: HealthMedTaken | undefined) => {
    if (rec) void platform.remove('health', rec.id);
    else save('health', { ...newMeta(), kind: 'taken', medId: med.id, date, time } satisfies HealthMedTaken);
  };
  const add = () => setEditing({ med: { ...newMeta(), kind: 'med', name: '', dose: '', times: ['08:00'], remind: true, active: true, supplement: false }, isNew: true });

  return (
    <section className="w-card hl-meds">
      <div className="w-card-head">
        <h3>
          <Icon name="pill" size={16} /> {t('hlMeds')}
        </h3>
        <Button size="sm" icon="plus" onClick={add}>
          {t('hlAddMed')}
        </Button>
      </div>
      {meds.length === 0 ? (
        <p className="empty-note">{t('hlNoMeds')}</p>
      ) : (
        <ul className="hl-list">
          {doses.length === 0 && asNeeded.length === 0 && <li className="empty-note">{t('hlNoDoses')}</li>}
          {doses.map(({ med, time, taken: rec }) => (
            <li key={med.id + time} className={`hl-dose ${rec ? 'done' : ''}`}>
              <CheckBtn on={!!rec} label={rec ? t('hlTaken') : t('hlMarkTaken')} onClick={() => toggle(med, time, rec)} />
              <span className="hl-dose-time" dir="ltr">
                {time}
              </span>
              <button type="button" className="hl-dose-name" onClick={() => setEditing({ med, isNew: false })}>
                <span dir="auto">{med.name || t('hlMedication')}</span>
                {med.dose && (
                  <span className="muted" dir="auto">
                    {med.dose}
                  </span>
                )}
              </button>
              {med.supplement && <span className="hl-tag">{t('hlMedSupplement')}</span>}
              {med.remind && <Icon name="bell" size={13} className="hl-dose-bell" />}
            </li>
          ))}
          {asNeeded.map((med) => {
            const count = taken.filter((x) => x.medId === med.id && x.date === date && x.time === '').length;
            return (
              <li key={med.id} className="hl-dose">
                <button type="button" className="hl-mini-btn" aria-label={t('hlMarkTaken')} title={t('hlMarkTaken')} onClick={() => toggle(med, '', undefined)}>
                  +
                </button>
                <span className="hl-dose-time">{count > 0 ? `×${count}` : ''}</span>
                <button type="button" className="hl-dose-name" onClick={() => setEditing({ med, isNew: false })}>
                  <span dir="auto">{med.name || t('hlMedication')}</span>
                  {med.dose && (
                    <span className="muted" dir="auto">
                      {med.dose}
                    </span>
                  )}
                </button>
                {med.supplement && <span className="hl-tag">{t('hlMedSupplement')}</span>}
              </li>
            );
          })}
          {paused.map((med) => (
            <li key={med.id} className="hl-dose paused">
              <span className="hl-dose-time" />
              <span className="hl-dose-time" />
              <button type="button" className="hl-dose-name" onClick={() => setEditing({ med, isNew: false })}>
                <span dir="auto">{med.name || t('hlMedication')}</span>
              </button>
              <span className="hl-tag">{t('hlMedPaused')}</span>
            </li>
          ))}
        </ul>
      )}
      {editing && <MedEditor init={editing.med} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </section>
  );
}

function MedEditor({ init, isNew, onClose }: { init: HealthMed; isNew: boolean; onClose: () => void }) {
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
  const { t, locale, save } = useBloom();
  const { all } = useHealth();
  const rec = forDate(all, 'body', date);
  const cur: HealthBody = rec ?? { ...newMeta(), kind: 'body', date, weightKg: null, exerciseMin: null, steps: null };
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
      <div className="w-card-head">
        <h3>{t('hlBody')}</h3>
      </div>
      <div className="hl-body-grid">
        <label className="hl-mini-field">
          <span className="field-label">{t('hlWeight')}</span>
          <NumBox value={cur.weightKg} onChange={(weightKg) => set({ weightKg })} min={10} max={400} step={0.1} unit={t('hlUnitKg')} label={t('hlWeight')} />
        </label>
        <label className="hl-mini-field">
          <span className="field-label">{t('hlExercise')}</span>
          <NumBox value={cur.exerciseMin} onChange={(exerciseMin) => set({ exerciseMin })} min={0} max={1000} unit={t('hlUnitMin')} label={t('hlExercise')} />
        </label>
        <label className="hl-mini-field">
          <span className="field-label">{t('hlSteps')}</span>
          <NumBox value={cur.steps} onChange={(steps) => set({ steps })} min={0} max={200000} step={100} label={t('hlSteps')} />
        </label>
      </div>
      {diff != null && first && (
        <p className="w-card-sub">
          {t('hlWeightSince', { d: `${diff > 0 ? '+' : ''}${diff.toLocaleString(locale)} ${t('hlUnitKg')}`, date: fmtDay(first.date, locale) })}
        </p>
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
  const add = () => setEditing({ test: { ...newMeta(), kind: 'test', date: toISODate(new Date()), name: '', value: null, unit: '', ibd: false, note: '' }, isNew: true });
  return (
    <section className="w-card hl-tests">
      <div className="w-card-head">
        <h3>{t('hlTests')}</h3>
        <Button size="sm" icon="plus" onClick={add}>
          {t('hlAddTest')}
        </Button>
      </div>
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
      {editing && <TestEditor init={editing.test} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </section>
  );
}

function TestEditor({ init, isNew, onClose }: { init: HealthTest; isNew: boolean; onClose: () => void }) {
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
          <Field label={t('hlTestUnit')}>
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

export function VisitsCard() {
  const { t, locale } = useBloom();
  const { all } = useHealth();
  const [editing, setEditing] = useState<{ visit: HealthVisit; isNew: boolean } | null>(null);
  const today = toISODate(new Date());
  const visits = healthOf(all, 'visit');
  const upcoming = visits.filter((v) => v.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const past = visits.filter((v) => v.date < today).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  const add = () => setEditing({ visit: { ...newMeta(), kind: 'visit', date: today, doctor: '', notes: '', eventId: null }, isNew: true });
  const row = (v: HealthVisit) => (
    <li key={v.id}>
      <button type="button" className="hl-item" onClick={() => setEditing({ visit: v, isNew: false })}>
        <span className="hl-item-title" dir="auto">
          {v.doctor || t('hlDoctor')}
        </span>
        {v.eventId && <Icon name="calendar" size={13} className="muted" />}
        <span className="hl-item-date">{fmtDay(v.date, locale, true)}</span>
        {v.notes && (
          <span className="hl-item-note" dir="auto">
            {v.notes}
          </span>
        )}
      </button>
    </li>
  );
  return (
    <section className="w-card hl-visits">
      <div className="w-card-head">
        <h3>{t('hlVisits')}</h3>
        <Button size="sm" icon="plus" onClick={add}>
          {t('hlAddVisit')}
        </Button>
      </div>
      {visits.length === 0 ? (
        <p className="empty-note">{t('hlNoVisits')}</p>
      ) : (
        <>
          {upcoming.length > 0 && (
            <>
              <span className="hl-sub">{t('hlUpcoming')}</span>
              <ul className="hl-list">{upcoming.map(row)}</ul>
            </>
          )}
          {past.length > 0 && <ul className="hl-list">{past.map(row)}</ul>}
        </>
      )}
      {editing && <VisitEditor init={editing.visit} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </section>
  );
}

function VisitEditor({ init, isNew, onClose }: { init: HealthVisit; isNew: boolean; onClose: () => void }) {
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
    save('health', { ...v, doctor: v.doctor.trim(), eventId: toCal ? eventId : null });
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
        <Toggle checked={toCal} label={linked ? t('hlInCalendar') : t('hlAddToCalendar')} onChange={setToCal} />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
