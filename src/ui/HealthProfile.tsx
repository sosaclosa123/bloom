// Health profile: the questionnaire (one question per screen, all skippable)
// and the profile card with the results (water goal, BMI).
import { useState, type ReactNode } from 'react';
import type { StringKey } from '../i18n/strings';
import { toISODate } from '../shared/dates';
import { bmi, emptyProfile, energyGoal, forDate, latestWeight, waterGoal, type EnergyGoal, type WaterGoal } from '../shared/health';
import { newMeta } from '../shared/db';
import type { CalorieGoal, CaloriePace, HealthActivity, HealthHot, HealthProfile, HealthSex, IbdOstomy, IbdType } from '../shared/types';

/**
 * Version of the questions. Raising it asks everyone again (answers kept and
 * shown, so it's quick): 2 = calorie goal + pace added (Nov 2026).
 */
export const PROFILE_VERSION = 2;
import { Button, Icon, Modal } from './common';
import { NumBox, Tip, useHealth, useWaterFmt } from './healthUi';
import { useBloom } from './store';

type Draft = Omit<HealthProfile, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'ownerId' | 'visibility'>;

interface Q {
  id: string;
  title: StringKey;
  hint?: StringKey;
  /** Shown only when this returns true. */
  when?: (d: Draft, ibd: boolean) => boolean;
  render: (d: Draft, set: (p: Partial<Draft>) => void) => ReactNode;
}

/** Which profile fields each question fills in. */
const FIELDS: Record<string, (keyof Draft)[]> = {
  age: ['age'],
  sex: ['sex'],
  height: ['heightCm'],
  weight: ['weightKg'],
  activity: ['activity'],
  exercise: ['exerciseMin'],
  goal: ['goal'],
  pace: ['pace'],
  hot: ['hot'],
  fluid: ['fluidLimit', 'fluidLimitMl'],
  glass: ['glassMl'],
  ibdType: ['ibdType'],
  ibdLocation: ['ibdLocation'],
  ibdMeds: ['ibdMeds'],
  ostomy: ['ostomy'],
  stools: ['typicalStools'],
  triggers: ['triggerFoods'],
};

function Choice<T extends string>({ value, options, onChange, prefix }: { value: T | null; options: T[]; onChange: (v: T) => void; prefix: string }) {
  const { t } = useBloom();
  return (
    <div className="radio-list hl-q-choices" role="radiogroup">
      {options.map((o) => (
        <label key={o} className={`radio-card ${value === o ? 'active' : ''}`}>
          <input type="radio" name={prefix} checked={value === o} onChange={() => onChange(o)} />
          {t(`${prefix}_${o}` as StringKey)}
        </label>
      ))}
    </div>
  );
}

function useQuestions(): Q[] {
  const { t } = useBloom();
  const text = (key: 'ibdLocation' | 'ibdMeds' | 'triggerFoods', label: StringKey, hint?: StringKey) => (d: Draft, set: (p: Partial<Draft>) => void) => (
    <textarea className="hl-q-text" dir="auto" rows={3} value={d[key]} aria-label={t(label)} placeholder={hint ? t(hint) : ''} onChange={(e) => set({ [key]: e.target.value })} />
  );
  return [
    { id: 'age', title: 'hlQAge', render: (d, set) => <NumBox autoFocus value={d.age} onChange={(age) => set({ age })} min={1} max={120} unit={t('hlUnitYears')} label={t('hlQAge')} /> },
    { id: 'sex', title: 'hlQSex', hint: 'hlQSexHint', render: (d, set) => <Choice<HealthSex> prefix="hlSex" value={d.sex} options={['female', 'male', 'other']} onChange={(sex) => set({ sex })} /> },
    { id: 'height', title: 'hlQHeight', render: (d, set) => <NumBox autoFocus value={d.heightCm} onChange={(heightCm) => set({ heightCm })} min={50} max={250} unit={t('hlUnitCm')} label={t('hlQHeight')} /> },
    { id: 'weight', title: 'hlQWeight', hint: 'hlQWeightHint', render: (d, set) => <NumBox autoFocus value={d.weightKg} onChange={(weightKg) => set({ weightKg })} min={10} max={400} step={0.1} unit={t('hlUnitKg')} label={t('hlQWeight')} /> },
    {
      id: 'activity',
      title: 'hlQActivity',
      render: (d, set) => <Choice<HealthActivity> prefix="hlAct" value={d.activity} options={['sedentary', 'light', 'active', 'very']} onChange={(activity) => set({ activity })} />,
    },
    { id: 'exercise', title: 'hlQExercise', render: (d, set) => <NumBox autoFocus value={d.exerciseMin} onChange={(exerciseMin) => set({ exerciseMin })} min={0} max={600} unit={t('hlUnitMin')} label={t('hlQExercise')} /> },
    {
      id: 'goal',
      title: 'hlQGoal',
      hint: 'hlQGoalHint',
      render: (d, set) => <Choice<CalorieGoal> prefix="hlGoal" value={d.goal ?? null} options={['lose', 'keep', 'gain', 'recomp']} onChange={(goal) => set({ goal, pace: goal === 'lose' || goal === 'gain' ? (d.pace ?? 'normal') : null })} />,
    },
    {
      id: 'pace',
      title: 'hlQPace',
      when: (d) => d.goal === 'lose' || d.goal === 'gain',
      render: (d, set) =>
        d.goal === 'gain' ? (
          <Choice<CaloriePace> prefix="hlPaceGain" value={d.pace === 'fast' ? 'fast' : 'normal'} options={['normal', 'fast']} onChange={(pace) => set({ pace })} />
        ) : (
          <Choice<CaloriePace> prefix="hlPaceLose" value={d.pace ?? 'normal'} options={['gentle', 'normal', 'fast']} onChange={(pace) => set({ pace })} />
        ),
    },
    { id: 'hot', title: 'hlQHot', hint: 'hlQHotHint', render: (d, set) => <Choice<HealthHot> prefix="hlHot" value={d.hot} options={['no', 'summer', 'yes']} onChange={(hot) => set({ hot })} /> },
    {
      id: 'fluid',
      title: 'hlQFluid',
      render: (d, set) => (
        <>
          <div className="radio-list hl-q-choices" role="radiogroup">
            {([false, true] as const).map((v) => (
              <label key={String(v)} className={`radio-card ${d.fluidLimit === v ? 'active' : ''}`}>
                <input type="radio" name="fluid" checked={d.fluidLimit === v} onChange={() => set({ fluidLimit: v })} />
                {t(v ? 'hlYes' : 'hlNo')}
              </label>
            ))}
          </div>
          {d.fluidLimit && (
            <div className="hl-q-sub">
              <p className="hl-q-warn">{t('hlFollowDoctor')}</p>
              <span className="field-label">{t('hlQFluidLimit')}</span>
              <NumBox value={d.fluidLimitMl} onChange={(fluidLimitMl) => set({ fluidLimitMl })} min={0} max={6000} step={50} unit={t('hlUnitMl')} label={t('hlQFluidLimit')} />
            </div>
          )}
        </>
      ),
    },
    {
      id: 'glass',
      title: 'hlQGlass',
      render: (d, set) => (
        <div className="hl-pills hl-q-glass" role="radiogroup" aria-label={t('hlQGlass')}>
          {[200, 250, 300, 350, 500].map((ml) => (
            <button type="button" key={ml} role="radio" aria-checked={d.glassMl === ml} className={d.glassMl === ml ? 'active' : ''} onClick={() => set({ glassMl: ml })}>
              {t('hlMl', { n: ml })}
            </button>
          ))}
        </div>
      ),
    },
    // IBD (only when IBD is on)
    { id: 'ibdType', title: 'hlQIbdType', when: (_, ibd) => ibd, render: (d, set) => <Choice<IbdType> prefix="hlIbd" value={d.ibdType} options={['crohns', 'uc', 'unsure']} onChange={(ibdType) => set({ ibdType })} /> },
    { id: 'ibdLocation', title: 'hlQIbdLocation', hint: 'hlQIbdLocationHint', when: (_, ibd) => ibd, render: text('ibdLocation', 'hlQIbdLocation', 'hlQIbdLocationHint') },
    { id: 'ibdMeds', title: 'hlQIbdMeds', hint: 'hlQIbdMedsHint', when: (_, ibd) => ibd, render: text('ibdMeds', 'hlQIbdMeds') },
    { id: 'ostomy', title: 'hlQOstomy', when: (_, ibd) => ibd, render: (d, set) => <Choice<IbdOstomy> prefix="hlOst" value={d.ostomy} options={['none', 'ostomy', 'colostomy', 'jpouch']} onChange={(ostomy) => set({ ostomy })} /> },
    { id: 'stools', title: 'hlQStools', when: (_, ibd) => ibd, render: (d, set) => <NumBox autoFocus value={d.typicalStools} onChange={(typicalStools) => set({ typicalStools })} min={0} max={30} unit={t('hlUnitPerDay')} label={t('hlQStools')} /> },
    { id: 'triggers', title: 'hlQTriggers', hint: 'hlQTriggersHint', when: (_, ibd) => ibd, render: text('triggerFoods', 'hlQTriggers', 'hlQTriggersHint') },
  ];
}

/** One question per screen. Every answer is saved right away; Skip leaves it empty. */
export function ProfileWizard({ onClose, restart }: { onClose: () => void; restart?: boolean }) {
  const { t } = useBloom();
  const { profile, ibd, saveProfile, all } = useHealth();
  const [draft, setDraft] = useState<Draft>(() => {
    const base = { ...emptyProfile(), ...(profile ?? {}) } as Draft & Partial<HealthProfile>;
    const { id: _i, createdAt: _c, updatedAt: _u, deletedAt: _d, ownerId: _o, visibility: _v, ...rest } = base;
    return rest as Draft;
  });
  const questions = useQuestions().filter((q) => !q.when || q.when(draft, ibd));
  // Not finished yet: carry on from the first question without an answer.
  const [i, setI] = useState(() => {
    // New questions were added since: go through all of them again (answers are kept).
    if (restart || profileComplete(profile, ibd) || (profile?.completed && (profile.qVersion ?? 1) < PROFILE_VERSION)) return 0;
    // General part already done (IBD was turned on later): go to the IBD questions.
    const IBD_IDS = ['ibdType', 'ibdLocation', 'ibdMeds', 'ostomy', 'stools', 'triggers'];
    const k = profile?.completed ? questions.findIndex((q) => IBD_IDS.includes(q.id)) : questions.findIndex((q) => !answered(draft, q.id));
    return k < 0 ? 0 : k;
  });
  const atEnd = i >= questions.length;
  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  // Only going through to the last question counts as filled in; closing early keeps the setup card.
  const { save } = useBloom();
  const commit = (d: Draft, last: boolean) => {
    saveProfile({ ...d, ...(last ? { completed: true, completedIbd: ibd || !!d.completedIbd, done: true, qVersion: PROFILE_VERSION } : {}) });
    // The weight from the questions also goes into today's Body log (so Body and the weight chart start from it).
    if (d.weightKg && d.weightKg !== profile?.weightKg) {
      const today = toISODate(new Date());
      const cur = forDate(all, 'body', today);
      save('health', cur ? { ...cur, weightKg: d.weightKg } : { ...newMeta(), kind: 'body', date: today, weightKg: d.weightKg, exerciseMin: null, steps: null });
    }
  };

  const next = () => {
    commit(draft, i + 1 >= questions.length);
    setI(i + 1);
  };
  const skip = () => {
    // Skip keeps this question's answer as it was before (a half-typed answer is dropped).
    const before = { ...emptyProfile(), ...(profile ?? {}) } as Draft;
    const d = { ...draft };
    for (const f of FIELDS[questions[i].id] ?? []) (d as Record<string, unknown>)[f] = before[f];
    setDraft(d);
    commit(d, i + 1 >= questions.length);
    setI(i + 1);
  };
  const close = () => {
    if (!atEnd) commit(draft, false);
    onClose();
  };

  const today = toISODate(new Date());
  const goal = waterGoal(draft, { date: today, ibd });
  const q = questions[i];

  return (
    <Modal
      title={atEnd ? t('hlResults') : t('hlSetupTitle')}
      onClose={close}
      width={500}
      className="hl-wizard"
      footer={
        atEnd ? (
          <Button variant="primary" onClick={close}>
            {t('hlDone')}
          </Button>
        ) : (
          <>
            {i > 0 && (
              <Button variant="ghost" onClick={() => setI(i - 1)}>
                {t('hlBack')}
              </Button>
            )}
            <span className="spacer" />
            <Button variant="ghost" onClick={skip}>
              {t('hlSkip')}
            </Button>
            <Button variant="primary" onClick={next}>
              {t('next')}
            </Button>
          </>
        )
      }
    >
      {atEnd ? (
        <div className="hl-results">
          <WaterGoalBlock goal={goal} />
          <BmiBlock heightCm={draft.heightCm} weightKg={draft.weightKg} age={draft.age} />
          <EnergyBlock goal={energyGoal(draft, draft.weightKg, { ibd })} />
          <p className="hl-note">
            <Icon name="heartPulse" size={14} /> {t('hlNotAdvice')}
          </p>
        </div>
      ) : (
        <form
          className="hl-q"
          key={q.id}
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
        >
          <div className="hl-q-progress" aria-hidden="true">
            <span style={{ width: `${((i + 1) / questions.length) * 100}%` }} />
          </div>
          <span className="hl-q-step">{t('hlStepOf', { n: i + 1, m: questions.length })}</span>
          <h3 className="hl-q-title">{t(q.title)}</h3>
          {q.hint && q.id !== 'ibdLocation' && q.id !== 'triggers' && <p className="hl-q-hint">{t(q.hint)}</p>}
          {q.render(draft, set)}
          <button type="submit" hidden />
        </form>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------- results

export function WaterGoalBlock({ goal, compact }: { goal: WaterGoal; compact?: boolean }) {
  const { t, locale } = useBloom();
  const fmt = useWaterFmt();
  const why = goal.parts
    .map((p, k) => {
      const n = p.ml.toLocaleString(locale);
      if (p.key === 'base') return `${n} ${t('hlWhyBase')}`;
      if (p.key === 'limit') return t('hlWhyLimit');
      return `${k > 0 ? '+' : ''}${n} ${t(`hlWhy${p.key[0].toUpperCase()}${p.key.slice(1)}` as StringKey)}`;
    })
    .join(' · ');
  return (
    <div className={`hl-goal ${compact ? 'compact' : ''}`}>
      <span className="hl-goal-icon" aria-hidden="true">
        <Icon name="drop" size={compact ? 18 : 22} />
      </span>
      <span className="hl-goal-text">
        <span className="hl-goal-label">{t('hlWaterGoal')}</span>
        {/* Why this amount + the drinks tip show on hover (1.3 s). */}
        <Tip
          text={
            <>
              <span dir="auto">{why}</span>
              {!goal.limited && (
                <>
                  <br />
                  {t('hlDrinksTip')}
                </>
              )}
            </>
          }
        >
          <strong className="hl-goal-ml">{t('hlWaterPerDay', { v: fmt(goal.ml) })}</strong>
        </Tip>
        {goal.needsLimit && <span className="hl-q-warn">{t('hlNeedsLimit')}</span>}
        {goal.notes.includes('ors') && <span className="hl-goal-tip strong">{t('hlOrsTip')}</span>}
        {goal.notes.includes('stoma') && <span className="hl-goal-tip strong">{t('hlStomaTip')}</span>}
      </span>
    </div>
  );
}

/** Calories a day for the goal + protein (from the health questions). */
export function EnergyBlock({ goal }: { goal: EnergyGoal | null }) {
  const { t, locale } = useBloom();
  if (!goal) return null;
  const n = (v: number) => v.toLocaleString(locale);
  return (
    <div className="hl-bmi hl-energy">
      <span className="hl-goal-label">{t('hlCalGoal')}</span>
      <Tip text={t('hlCalGoalWhy', { b: n(goal.bmr), burn: n(goal.burn) })}>
        <strong className="hl-num-font">{t('hlKcalPerDay', { n: n(goal.target) })}</strong>
        <span className="muted"> · {t(`hlGoal_${goal.goal}` as StringKey)}</span>
      </Tip>
      <span className="muted small">{t('hlProteinGoal', { n: n(goal.protein) })}</span>
      <EnergyNotes goal={goal} />
    </div>
  );
}

/** Safety notes for the calorie goal (always visible). */
export function EnergyNotes({ goal }: { goal: EnergyGoal }) {
  const { t } = useBloom();
  const notes = goal.notes.filter((x) => x !== 'noActivity');
  if (!notes.length) return null;
  return (
    <>
      {notes.map((x) => (
        <span key={x} className="hl-goal-tip strong">
          {t(`hlEnergyNote_${x}` as StringKey)}
        </span>
      ))}
    </>
  );
}

export function BmiBlock({ heightCm, weightKg, age }: { heightCm: number | null; weightKg: number | null; age: number | null }) {
  const { t, locale } = useBloom();
  const b = bmi(heightCm, weightKg, age);
  return (
    <div className="hl-bmi">
      <span className="hl-goal-label">{t('hlBmi')}</span>
      {b ? (
        <>
          <Tip text={t('hlBmiNote')}>
            <strong className="hl-num-font">{b.value.toLocaleString(locale)}</strong>
            {b.cat && <span className="muted"> · {t(`hlBmi_${b.cat}` as StringKey)}</span>}
          </Tip>
        </>
      ) : (
        <span className="muted small">{t('hlNoBmi')}</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- cards on the page

/** A question has an answer in the profile. */
function answered(d: Partial<Draft> | undefined, id: string): boolean {
  return (FIELDS[id] ?? []).some((f) => {
    const v = d?.[f];
    return f === 'glassMl' ? !!d?.completed : v != null && v !== '';
  });
}

/** Questionnaire gone through to the end (and the IBD part, when IBD is on). */
export function profileComplete(p: Partial<HealthProfile> | undefined, ibd: boolean): boolean {
  return !!p?.completed && (p.qVersion ?? 1) >= PROFILE_VERSION && (!ibd || !!p.completedIbd);
}

/** Shown until the questionnaire is gone through to the end. */
export function SetupCard({ onStart }: { onStart: () => void }) {
  const { t } = useBloom();
  const { profile, ibd } = useHealth();
  const qs = useQuestions().filter((q) => !q.when || q.when({ ...emptyProfile(), ...(profile ?? {}) } as Draft, ibd));
  const n = qs.filter((q) => answered(profile, q.id)).length;
  return (
    <section className="w-card hl-setup">
      <div className="hl-setup-icon" aria-hidden="true">
        <Icon name="heartPulse" size={26} />
      </div>
      <div className="hl-setup-text">
        <h3>{t('hlSetupTitle')}</h3>
        {profile?.completed && (profile.qVersion ?? 1) < PROFILE_VERSION ? (
          <p className="w-card-sub">{t('hlSetupNew')}</p>
        ) : (
          <>
            <p className="w-card-sub">{t('hlSetupBody')}</p>
            {n > 0 && <p className="hl-setup-progress">{t('hlAnswered', { n, m: qs.length })}</p>}
          </>
        )}
      </div>
      <div className="hl-setup-actions">
        <Button variant="primary" onClick={onStart}>
          {n > 0 ? t('hlContinue') : t('hlStart')}
        </Button>
      </div>
    </section>
  );
}

/** Water goal + BMI + a short summary, with "Edit profile". */
export function ProfileCard({ date, onEdit, goal }: { date: string; onEdit: () => void; goal: WaterGoal }) {
  const { t, locale } = useBloom();
  const { profile, all, ibd } = useHealth();
  const weight = latestWeight(all, date);
  const facts = [
    profile?.age != null ? t('hlAgeYears', { n: profile.age }) : null,
    profile?.heightCm ? `${profile.heightCm.toLocaleString(locale)} ${t('hlUnitCm')}` : null,
    weight ? `${weight.toLocaleString(locale)} ${t('hlUnitKg')}` : null,
    profile?.sex ? t(`hlSex_${profile.sex}` as StringKey) : null,
    ibd && profile?.ibdType ? t(`hlIbd_${profile.ibdType}` as StringKey) : null,
  ].filter(Boolean);
  return (
    <section className="w-card hl-profile">
      <div className="w-card-head">
        <div>
          <h3>{t('hlAbout')}</h3>
          {facts.length > 0 && <p className="w-card-sub">{facts.join(' · ')}</p>}
        </div>
        <button type="button" className="link-btn" onClick={onEdit}>
          {t('hlEditProfile')}
        </button>
      </div>
      <WaterGoalBlock goal={goal} compact />
      <BmiBlock heightCm={profile?.heightCm ?? null} weightKg={weight} age={profile?.age ?? null} />
    </section>
  );
}
