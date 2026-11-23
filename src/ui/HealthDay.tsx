// One day at a glance (opened from a dot in Trends): check-in, water, food,
// medicines, body, IBD (only when IBD is on), tests and doctor-visit
// documents (only when there are some). Blurred, dimmed background.
import type { StringKey } from '../i18n/strings';
import { parseISODate } from '../shared/dates';
import { bathroomStats, dosesOn, forDate, HBI_COMPLICATIONS, healthOf } from '../shared/health';
import { dayFacts, ibdOn } from '../shared/healthExtras';
import type { ISODate } from '../shared/types';
import { Modal } from './common';
import { DocsList } from './HealthCards';
import { MoodFace } from './HealthCheckin';
import { useHealth, useWaterFmt } from './healthUi';
import { StickerArt } from './Stickers';
import { useBloom } from './store';

export function DaySummary({ date, onClose }: { date: ISODate; onClose: () => void }) {
  const { t, locale } = useBloom();
  const { all, ibd } = useHealth();
  const fmt = useWaterFmt();
  const f = dayFacts(all, date, ibd);
  const c = forDate(all, 'checkin', date);
  const body = forDate(all, 'body', date);
  const food = healthOf(all, 'food').filter((x) => x.date === date);
  const kcal = food.reduce((a, x) => a + (x.kcal ?? 0), 0);
  const doses = dosesOn(healthOf(all, 'med'), healthOf(all, 'taken'), date);
  const tests = healthOf(all, 'test').filter((x) => x.date === date && (ibd || !x.ibd));
  const visits = healthOf(all, 'visit').filter((v) => v.date === date && (v.docs?.length ?? 0) > 0);
  const score = ibd ? ibdOn(all, date) : null;
  const stats = bathroomStats(healthOf(all, 'bathroom'), date);
  const day = forDate(all, 'ibdday', date);
  const kind = (m: string) => (m === 'drink' ? t('hlDrinks') : m === 'snack' ? t('hlSnacks') : t(`hlMeal_${m}` as StringKey));
  const lvl = (prefix: string, v: number | null | undefined) => (v == null ? null : t(`${prefix}_${v}` as StringKey));

  return (
    <Modal title={parseISODate(date).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} onClose={onClose} width={620} className="hl-day-modal">
      <div className="hl-daysum">
        <section>
          <h4>{t('hlDayCheckin')}</h4>
          <dl className="hl-sum">
            <div>
              <dt>{t('hlWater')}</dt>
              <dd>
                {fmt(f.waterMl)} <small>{t('hlOfGoal', { v: fmt(f.waterGoalMl) })}</small>
              </dd>
            </div>
            {c?.mood != null && (
              <div>
                <dt>{t('hlMood')}</dt>
                <dd className="hl-daysum-mood">
                  <MoodFace level={c.mood} size={18} /> {t(`hlMood_${c.mood}` as StringKey)}
                </dd>
              </div>
            )}
            {f.sleepH != null && (
              <div>
                <dt>{t('hlSleep')}</dt>
                <dd>
                  {t('hlHours', { n: f.sleepH.toLocaleString(locale) })}
                  {c?.bed && c.wake && <small dir="ltr"> {c.bed}–{c.wake}</small>}
                </dd>
              </div>
            )}
            {(c?.energy != null || c?.stress != null) && (
              <div>
                <dt>
                  {t('hlEnergy')} · {t('hlStress')}
                </dt>
                <dd>
                  {c?.energy ?? '–'} · {c?.stress ?? '–'}
                </dd>
              </div>
            )}
          </dl>
        </section>

        {doses.length > 0 && (
          <section>
            <h4>{t('hlMeds')}</h4>
            <ul className="hl-daysum-list">
              {doses.map((d) => (
                <li key={d.med.id + d.time} className={d.taken ? 'ok' : 'miss'}>
                  <StickerArt kind={d.med.sticker || 'pill'} size={20} />
                  <span dir="ltr">{d.time}</span>
                  <span dir="auto">{d.med.name}</span>
                  <b>{d.taken ? `✓ ${t('hlTaken')}` : t('hlNotTaken')}</b>
                </li>
              ))}
            </ul>
          </section>
        )}

        {food.length > 0 && (
          <section>
            <h4>
              {t('hlFood')}
              {kcal > 0 && <> · {t('hlKcal', { n: Math.round(kcal).toLocaleString(locale) })}</>}
            </h4>
            <ul className="hl-daysum-list">
              {food.map((x) => (
                <li key={x.id}>
                  <span className="muted">{kind(x.meal)}</span>
                  <span dir="auto">{x.text}</span>
                  {x.kcal != null && <b>{t('hlKcal', { n: x.kcal.toLocaleString(locale) })}</b>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {body && (body.weightKg || body.exerciseMin || body.steps) ? (
          <section>
            <h4>{t('hlBody')}</h4>
            <p>
              {[
                body.weightKg ? `${body.weightKg.toLocaleString(locale)} ${t('hlUnitKg')}` : null,
                body.exerciseMin ? `${t('hlExercise')} ${body.exerciseMin} ${t('hlUnitMin')}` : null,
                body.steps ? `${t('hlSteps')} ${body.steps.toLocaleString(locale)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </section>
        ) : null}

        {ibd && score && (
          <section className="hl-daysum-ibd">
            <h4>
              IBD · {score.kind === 'uc' ? t('hlScoreUc', { n: score.score }) : t('hlScoreHbi', { n: score.score })} · {t(`hlLvl_${score.level}` as StringKey)}
              {score.flare && <span className="hl-tag ibd">{t(score.flare === 'flare' ? 'hlFlare_flare' : 'hlFlare_mild')}</span>}
            </h4>
            <p>
              {[
                t('hlBathSummaryDay', { n: stats.total, l: stats.liquid, b: stats.blood }),
                lvl('hlWell', day?.wellbeing),
                day?.pain != null ? `${t('hlAbdPain')}: ${lvl('hlLevel', day.pain)}` : null,
                day?.fatigue != null ? `${t('hlFatigue')}: ${lvl('hlLevel', day.fatigue)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
            {(day?.complications.length ?? 0) > 0 && (
              <p dir="auto">
                {day!.complications.map((x) => ((HBI_COMPLICATIONS as readonly string[]).includes(x) ? t(`hlComp_${x}` as StringKey) : x)).join(' · ')}
              </p>
            )}
          </section>
        )}

        {tests.length > 0 && (
          <section>
            <h4>{t('hlTests')}</h4>
            <ul className="hl-daysum-list">
              {tests.map((x) => (
                <li key={x.id}>
                  <span dir="auto">{x.name}</span>
                  <b dir="ltr">
                    {x.value ?? ''} {x.unit}
                  </b>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Doctor-visit documents: only when there are some. */}
        {visits.map((v) => (
          <section key={v.id}>
            <h4 dir="auto">
              {t('hlDocs')} · {v.doctor || t('hlDoctor')}
            </h4>
            <DocsList visit={v} />
          </section>
        ))}
      </div>
    </Modal>
  );
}
