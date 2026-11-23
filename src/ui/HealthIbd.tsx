// IBD / Crohn's part of the Health tab: bathroom log, symptoms, daily score
// (Harvey-Bradshaw for Crohn's, partial Mayo-style for UC) and flare marking.
// Only rendered when IBD is on for this computer.
import { useState } from 'react';
import type { StringKey } from '../i18n/strings';
import { newMeta } from '../shared/db';
import { parseISODate } from '../shared/dates';
import { bathroomStats, bloodLevel, forDate, HBI_COMPLICATIONS, healthOf, ibdDayScore, isNightTime, SCCAI_EXTRACOLONIC } from '../shared/health';
import type { FlareMark, HealthBathroom, HealthIbdDay, ISODate } from '../shared/types';
import { Button, Field, Icon, IconButton, Modal, Toggle } from './common';
import { Pills, Tip, useHealth } from './healthUi';
import { useBloom } from './store';

const pad = (n: number) => String(n).padStart(2, '0');
const nowTime = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function emptyIbdDay(date: ISODate): HealthIbdDay {
  return { ...newMeta(), kind: 'ibdday', date, wellbeing: null, pain: null, fatigue: null, mass: null, complications: [], liquidStools: null, bleeding: null, flare: 'none' };
}

export function IbdCard({ date, isToday }: { date: ISODate; isToday: boolean }) {
  const { t, locale, save, toast } = useBloom();
  const { all, profile } = useHealth();
  // Always open when IBD is on; the side button can minimize it (remembered on this computer).
  const [min, setMin] = useState(() => {
    try {
      return localStorage.getItem('bloom-ibd-min') === '1';
    } catch {
      return false;
    }
  });
  const toggleMin = () => {
    setMin(!min);
    try {
      localStorage.setItem('bloom-ibd-min', min ? '0' : '1');
    } catch {
      /* ignore */
    }
  };
  const [editing, setEditing] = useState<{ b: HealthBathroom; isNew: boolean } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const log = healthOf(all, 'bathroom')
    .filter((b) => b.date === date)
    .sort((a, b) => a.time.localeCompare(b.time));
  const stats = bathroomStats(log, date);
  const rec = forDate(all, 'ibdday', date);
  const cur = rec ?? emptyIbdDay(date);
  const set = (p: Partial<HealthIbdDay>) => save('health', { ...cur, ...p });
  const score = ibdDayScore(profile, rec, stats);
  const lvl = (prefix: string, n: number) => Array.from({ length: n }, (_, v) => ({ value: v, label: t(`${prefix}_${v}` as StringKey) }));
  const newVisit = () => setEditing({ b: { ...newMeta(), kind: 'bathroom', date, time: isToday ? nowTime() : '12:00', bristol: 4, urgency: 0, blood: false, bloodLevel: 0, pain: 0, notes: '' }, isNew: true });

  return (
    <section className="w-card hl-ibd">
      <div className="w-card-head">
        <h3>
          {isToday ? t('hlIbdToday') : t('hlIbdDay', { d: parseISODate(date).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' }) })}
        </h3>
        <div className="hl-head-actions">
          {score.any && (
            <Tip
              text={[
                score.kind === 'hbi' && profile?.ostomy !== 'ostomy' ? t('hlLiquidFromLog', { n: stats.liquid }) : '',
                score.kind === 'uc' ? t('hlSccaiFromLog') : '',
                t('hlScoreNote'),
                profile?.ostomy === 'ostomy' ? t('hlScoreOstomy') : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            >
              <span className={`hl-score lvl-${score.level}`}>
                {score.kind === 'uc' ? t('hlScoreUc', { n: score.score }) : t('hlScoreHbi', { n: score.score })} · {t(`hlLvl_${score.level}` as StringKey)}
              </span>
            </Tip>
          )}
          <IconButton icon={min ? 'plus' : 'minus'} label={min ? t('hlExpand') : t('hlMinimize')} className="hl-min-btn" onClick={toggleMin} aria-expanded={!min} />
        </div>
      </div>
      {min ? (
        <button type="button" className="hl-ibd-mini" onClick={toggleMin}>
          {stats.total > 0 ? t('hlBathSummaryDay', { n: stats.total, l: stats.liquid, b: stats.blood }) : t('hlNoBathroom')}
          {cur.wellbeing != null && <> · {t(`hlWell_${cur.wellbeing}` as StringKey)}</>}
        </button>
      ) : (
        <>

      {/* bathroom log */}
      <div className="hl-ibd-block">
        <div className="hl-ibd-sub">
          <span className="hl-row-label">{t('hlBathroom')}</span>
          {stats.total > 0 && <span className="muted small">{t(isToday ? 'hlBathSummary' : 'hlBathSummaryDay', { n: stats.total, l: stats.liquid, b: stats.blood })}</span>}
          <span className="spacer" />
          <Button size="sm" icon="plus" onClick={newVisit}>
            {t('hlAddBathroom')}
          </Button>
        </div>
        <div className="hl-quick-bristol" role="group" aria-label={t('hlQuickLog')}>
          <span className="muted small">{t('hlQuickLog')}</span>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <button
              type="button"
              key={n}
              className={`hl-qb b${n}`}
              title={t(`hlBristol_${n}` as StringKey)}
              aria-label={`${n} · ${t(`hlBristol_${n}` as StringKey)}`}
              onClick={() => {
                const b: HealthBathroom = { ...newMeta(), kind: 'bathroom', date, time: isToday ? nowTime() : '12:00', bristol: n, urgency: 0, blood: false, bloodLevel: 0, pain: 0, notes: '' };
                save('health', b);
                toast(t('hlLogged', { n }), { label: t('hlAddDetails'), run: () => setEditing({ b, isNew: false }) });
              }}
            >
              {n}
            </button>
          ))}
        </div>
        {log.length === 0 ? (
          <p className="empty-note">{t('hlNoBathroom')}</p>
        ) : (
          <ul className="hl-bath-list">
            {log.map((b) => (
              <li key={b.id}>
                <button type="button" className={`hl-bath b${b.bristol}`} onClick={() => setEditing({ b, isNew: false })} title={t(`hlBristol_${b.bristol}` as StringKey)}>
                  <span className="hl-dose-time" dir="ltr">
                    {b.time}
                  </span>
                  <span className="hl-bristol">{b.bristol}</span>
                  {b.urgency > 0 && <span className="hl-bath-mark">!{'!'.repeat(b.urgency - 1)}</span>}
                  {bloodLevel(b) > 0 && <Icon name="drop" size={12} className={`hl-blood ${bloodLevel(b) === 1 ? 'trace' : ''}`} />}
                  {(b.night ?? isNightTime(b.time)) && <span className="hl-bath-night" title={t('hlNight')}>☾</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* symptoms */}
      <div className="hl-ibd-block">
        <span className="hl-row-label">{t('hlSymptoms')}</span>
        <div className="hl-rows">
          <div className="hl-row wide">
            <span className="hl-row-label">{t('hlWellbeing')}</span>
            <Pills label={t('hlWellbeing')} value={cur.wellbeing} onChange={(wellbeing) => set({ wellbeing })} options={lvl('hlWell', 5)} />
          </div>
          <div className="hl-row wide">
            <span className="hl-row-label">{t('hlAbdPain')}</span>
            <Pills label={t('hlAbdPain')} value={cur.pain} onChange={(pain) => set({ pain })} options={lvl('hlLevel', 4)} />
          </div>
          <div className="hl-row wide">
            <span className="hl-row-label">{t('hlFatigue')}</span>
            <Pills label={t('hlFatigue')} value={cur.fatigue} onChange={(fatigue) => set({ fatigue })} options={lvl('hlLevel', 4)} />
          </div>
          {(
            <div className="hl-row wide">
              {/* Half hidden: a button that opens the list (shows what's picked). */}
              <button type="button" className="hl-toggle-btn" aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}>
                <Icon name="chevronRight" size={14} className="hl-chev" /> {t('hlComplications')}
                {cur.complications.length > 0 && <span className="hl-tag ibd">{cur.complications.length}</span>}
              </button>
              {moreOpen && (
              <div className="hl-pills" role="group" aria-label={t('hlComplications')}>
                {/* UC (SCCAI) counts only the four extra-intestinal problems. */}
                {(profile?.ibdType === 'uc' ? SCCAI_EXTRACOLONIC : HBI_COMPLICATIONS).map((c) => {
                  const on = cur.complications.includes(c);
                  return (
                    <button
                      type="button"
                      key={c}
                      aria-pressed={on}
                      className={on ? 'active' : ''}
                      onClick={() => set({ complications: on ? cur.complications.filter((x) => x !== c) : [...cur.complications, c] })}
                    >
                      {t(`hlComp_${c}` as StringKey)}
                    </button>
                  );
                })}
                {/* Anything else that happened: typed in, kept for the report. */}
                {cur.complications
                  .filter((c) => !(HBI_COMPLICATIONS as readonly string[]).includes(c))
                  .map((c) => (
                    <button type="button" key={c} aria-pressed className="active hl-custom-pill" dir="auto" title={t('hlRemoveCustom')} onClick={() => set({ complications: cur.complications.filter((x) => x !== c) })}>
                      {c} ×
                    </button>
                  ))}
                <form
                  className="hl-custom-add"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const v = custom.trim();
                    if (v && !cur.complications.includes(v)) set({ complications: [...cur.complications, v] });
                    setCustom('');
                  }}
                >
                  <input dir="auto" value={custom} placeholder={t('hlOtherProblem')} aria-label={t('hlOtherProblem')} onChange={(e) => setCustom(e.target.value)} />
                  {custom.trim() && <button type="submit">+</button>}
                </form>
              </div>
              )}
            </div>
          )}
          <div className="hl-row wide">
            <span className="hl-row-label">{t('hlFlareMark')}</span>
            <Pills<FlareMark>
              className="hl-flare-pills"
              label={t('hlFlareMark')}
              value={cur.flare}
              onChange={(flare) => set({ flare: flare ?? 'none' })}
              options={(['none', 'mild', 'flare'] as FlareMark[]).map((v) => ({ value: v, label: t(`hlFlare_${v}` as StringKey) }))}
            />
          </div>
        </div>
        {(stats.frank > 0 || stats.maxPain >= 3 || (cur.pain ?? 0) >= 3 || score.level === 'severe' || (cur.wellbeing ?? 0) >= 4) && (
          <p className="hl-redflag" role="note">
            <Icon name="bell" size={14} /> {t('hlRedFlag')}
          </p>
        )}
      </div>
        </>
      )}
      {editing && <BathroomEditor init={editing.b} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </section>
  );
}

export function BathroomEditor({ init, isNew, onClose }: { init: HealthBathroom; isNew: boolean; onClose: () => void }) {
  const { t, save, del } = useBloom();
  const [b, setB] = useState(init);
  const commit = () => {
    save('health', { ...b, notes: b.notes.trim() });
    onClose();
  };
  const lvl = (n: number) => Array.from({ length: n }, (_, v) => ({ value: v, label: t(`hlLevel_${v}` as StringKey) }));
  return (
    <Modal
      title={t('hlEditBathroom')}
      onClose={onClose}
      width={500}
      className="hl-ibd-modal"
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
          <Button variant="primary" onClick={commit}>
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
        <Field label={t('hlTime')}>
          <input type="time" dir="ltr" className="hl-time-in" value={b.time} onChange={(e) => e.target.value && setB({ ...b, time: e.target.value })} />
        </Field>
        <div className="field">
          <span className="field-label">{t('hlBristol')}</span>
          <div className="hl-bristol-grid" role="radiogroup" aria-label={t('hlBristol')}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <button type="button" key={n} role="radio" aria-checked={b.bristol === n} className={`b${n} ${b.bristol === n ? 'active' : ''}`} onClick={() => setB({ ...b, bristol: n })}>
                <strong>{n}</strong>
                <span>{t(`hlBristol_${n}` as StringKey)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="field-label">{t('hlUrgency')}</span>
          <Pills
            label={t('hlUrgency')}
            value={b.urgency}
            onChange={(urgency) => setB({ ...b, urgency: urgency ?? 0 })}
            options={[0, 1, 2, 3].map((v) => ({ value: v, label: t(`hlUrg_${v}` as StringKey) }))}
          />
        </div>
        <div className="field">
          <span className="field-label">{t('hlPain')}</span>
          <Pills label={t('hlPain')} value={b.pain} onChange={(pain) => setB({ ...b, pain: pain ?? 0 })} options={lvl(4)} />
        </div>
        <div className="field">
          <span className="field-label">{t('hlBlood')}</span>
          <Pills
            label={t('hlBlood')}
            value={bloodLevel(b)}
            onChange={(v) => setB({ ...b, bloodLevel: v ?? 0, blood: (v ?? 0) > 0 })}
            options={[0, 1, 2].map((v) => ({ value: v, label: t(`hlBlood_${v}` as StringKey) }))}
          />
        </div>
        <Toggle checked={b.night ?? isNightTime(b.time)} label={t('hlNight')} onChange={(night) => setB({ ...b, night })} />
        <Field label={t('hlNote')}>
          <input dir="auto" value={b.notes} onChange={(e) => setB({ ...b, notes: e.target.value })} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
