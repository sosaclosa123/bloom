// Health extras: personal mini-goals, 7-day challenges, the sticker book,
// the monthly summary and the doctor report. Goals / challenges / sticker
// book are each turned on in Settings > Health (all off by default).
import { useEffect, useMemo, useState } from 'react';
import type { StringKey } from '../i18n/strings';
import { platform } from '../platform/api';
import { newMeta } from '../shared/db';
import { addDays, parseISODate, toISODate } from '../shared/dates';
import { healthOf } from '../shared/health';
import { badges, CHALLENGES, challengeDays, goalProgress, monthSummary, reportData, type Badge } from '../shared/healthExtras';
import type { HealthChallenge, HealthGoal, ISODate } from '../shared/types';
import { Button, Field, Icon, IconButton, Modal, Segmented } from './common';
import { CardHead, NumBox, StickerChoice, Tip, useHealth, useWaterFmt } from './healthUi';
import { StickerArt } from './Stickers';
import { useBloom } from './store';

const fmtDay = (d: ISODate, locale: string) => parseISODate(d).toLocaleDateString(locale, { day: 'numeric', month: 'short' });

// ---------------------------------------------------------------- personal mini-goals

export function GoalsCard({ date }: { date: ISODate }) {
  const { t, locale, save, settings } = useBloom();
  const { all } = useHealth();
  const [editing, setEditing] = useState<{ g: HealthGoal; isNew: boolean } | null>(null);
  const goals = healthOf(all, 'goal').filter((g) => g.active);
  const add = () =>
    setEditing({ g: { ...newMeta(), kind: 'goal', title: '', sticker: 'gym', target: 3, every: 1, unit: 'week', startDate: date, active: true }, isNew: true });
  return (
    <section className="w-card hl-goals">
      <CardHead sticker="idea" title={t('hlGoals')}>
        <Button size="sm" icon="plus" onClick={add}>
          {t('hlAddGoal')}
        </Button>
      </CardHead>
      {goals.length === 0 ? (
        <p className="empty-note">{t('hlNoGoals')}</p>
      ) : (
        <ul className="hl-goal-list">
          {goals.map((g) => {
            const p = goalProgress(all, g, date, settings.weekStart);
            const ticks = healthOf(all, 'tick').filter((x) => x.goalId === g.id && x.date >= p.start && x.date <= p.end);
            return (
              <li key={g.id} className={p.done ? 'done' : ''}>
                <span className="hl-goal-st" aria-hidden="true">
                  <StickerArt kind={g.sticker} size={34} />
                </span>
                <button type="button" className="hl-goal-main" onClick={() => setEditing({ g, isNew: false })}>
                  <span className="hl-goal-title" dir="auto">
                    {g.title || '—'}
                  </span>
                  <span className="hl-goal-period">
                    {p.done ? t('hlGoalDone') : `${repeatGoal(g, t)} · ${t('hlUntil', { d: fmtDay(p.end, locale) })}`}
                  </span>
                </button>
                <span className="hl-goal-dots" aria-label={`${p.count}/${g.target}`}>
                  {Array.from({ length: Math.min(g.target, 14) }, (_, i) => (
                    <i key={i} className={i < p.count ? 'on' : ''} />
                  ))}
                  {g.target > 14 && <b>{`${p.count}/${g.target}`}</b>}
                </span>
                <span className="hl-goal-btns">
                  <button type="button" className="hl-mini-btn" aria-label={t('hlRemoveTick')} title={t('hlRemoveTick')} disabled={!ticks.length} onClick={() => ticks.length && void platform.remove('health', ticks[ticks.length - 1].id)}>
                    −
                  </button>
                  <button type="button" className="hl-mini-btn plus" aria-label={t('hlAddTick')} title={t('hlAddTick')} onClick={() => save('health', { ...newMeta(), kind: 'tick', goalId: g.id, date })}>
                    +
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <GoalEditor init={editing.g} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </section>
  );
}

function repeatGoal(g: Pick<HealthGoal, 'target' | 'every' | 'unit'>, t: ReturnType<typeof useBloom>['t']) {
  const per = g.every === 1 ? t(`hlPer1_${g.unit}` as StringKey) : t(`hlPerN_${g.unit}` as StringKey, { n: g.every });
  return t('hlTimesPer', { n: g.target, per });
}

function GoalEditor({ init, isNew, onClose }: { init: HealthGoal; isNew: boolean; onClose: () => void }) {
  const { t, save, del } = useBloom();
  const [g, setG] = useState(init);
  const ok = !!g.title.trim() && g.target >= 1;
  const commit = () => {
    if (!ok) return;
    save('health', { ...g, title: g.title.trim() });
    onClose();
  };
  return (
    <Modal
      title={isNew ? t('hlAddGoal') : t('hlEditGoal')}
      onClose={onClose}
      width={480}
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
        <Field label={t('hlGoalWhat')}>
          <input autoFocus dir="auto" value={g.title} placeholder={t('hlGoalHint')} onChange={(e) => setG({ ...g, title: e.target.value })} />
        </Field>
        <div className="field">
          <span className="field-label">
            <Tip text={t('hlGoalResets')}>{t('hlGoalHowOften')}</Tip>
          </span>
          <div className="hl-repeat">
            <NumBox value={g.target} onChange={(v) => setG({ ...g, target: Math.max(1, Math.round(v ?? 1)) })} min={1} max={100} label={t('hlGoalHowOften')} />
            <span>{t('hlTimesEvery')}</span>
            <NumBox value={g.every} onChange={(v) => setG({ ...g, every: Math.max(1, Math.round(v ?? 1)) })} min={1} max={52} label={t('hlRepeat')} />
            <select value={g.unit} aria-label={t('hlRepeat')} onChange={(e) => setG({ ...g, unit: e.target.value as HealthGoal['unit'] })}>
              <option value="day">{t('hlUnitDays')}</option>
              <option value="week">{t('hlUnitWeeks')}</option>
              <option value="month">{t('hlUnitMonths')}</option>
            </select>
          </div>
        </div>
        <div className="field">
          <span className="field-label">{t('hlSticker')}</span>
          <StickerChoice value={g.sticker} onChange={(sticker) => setG({ ...g, sticker })} label={t('hlSticker')} />
        </div>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- 7-day challenges

export function ChallengesCard({ date }: { date: ISODate }) {
  const { t, locale, save } = useBloom();
  const { all, ibd } = useHealth();
  const [picking, setPicking] = useState(false);
  const today = toISODate(new Date());
  const list = healthOf(all, 'challenge')
    .map((c) => ({ c, r: challengeDays(all, c, today, ibd) }))
    .sort((a, b) => b.c.startDate.localeCompare(a.c.startDate));
  const active = list.filter((x) => x.r.status === 'active');
  const doneCount = list.filter((x) => x.r.status === 'done').length;
  const hasMeds = healthOf(all, 'med').some((m) => m.active);
  const recent = list.filter((x) => x.r.status !== 'active' && x.c.startDate >= toISODate(addDays(parseISODate(today), -14)));
  const toggleDay = (c: HealthChallenge, d: ISODate) =>
    save('health', { ...c, manualDays: c.manualDays.includes(d) ? c.manualDays.filter((x) => x !== d) : [...c.manualDays, d] });
  void date;
  return (
    <section className="w-card hl-challenges">
      <CardHead sticker="gift" title={t('hlChallenges')} tip={t('hlChallengesSub')} sub={doneCount ? t('hlChallengesDone', { n: doneCount }) : undefined}>
        <Button size="sm" icon="plus" onClick={() => setPicking(!picking)}>
          {t('hlStartChallenge')}
        </Button>
      </CardHead>
      {picking && (
        <ul className="hl-ch-pick">
          {CHALLENGES.filter((d) => !d.needsMeds || hasMeds).map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => {
                  save('health', { ...newMeta(), kind: 'challenge', challenge: d.id, startDate: today, manualDays: [], stopped: false } satisfies HealthChallenge);
                  setPicking(false);
                }}
              >
                <StickerArt kind={d.sticker} size={28} />
                <span>{t(`hlCh_${d.id}` as StringKey)}</span>
                <span className="muted small">{d.auto ? t('hlChAuto') : t('hlChManual')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {active.length === 0 && !picking && recent.length === 0 && <p className="empty-note">{t('hlNoChallenges')}</p>}
      {[...active, ...recent].map(({ c, r }) => {
        const def = CHALLENGES.find((x) => x.id === c.challenge);
        return (
          <div key={c.id} className={`hl-ch ${r.status}`}>
            <StickerArt kind={def?.sticker ?? 'gift'} size={32} />
            <div className="hl-ch-main">
              <span className="hl-goal-title">{t(`hlCh_${c.challenge}` as StringKey)}</span>
              <span className="hl-goal-period">
                {r.status === 'done' ? t('hlChWon') : r.status === 'missed' ? t('hlChMissed') : t('hlChDay', { n: Math.min(7, r.days.filter((d) => !d.future).length) })}
              </span>
            </div>
            <span className="hl-ch-dots">
              {r.days.map((d) => (
                <button
                  type="button"
                  key={d.date}
                  className={`${d.ok ? 'on' : ''} ${d.future ? 'future' : ''}`}
                  disabled={d.future || !!def?.auto || r.status !== 'active'}
                  title={fmtDay(d.date, locale)}
                  aria-label={fmtDay(d.date, locale)}
                  aria-pressed={d.ok}
                  onClick={() => toggleDay(c, d.date)}
                />
              ))}
            </span>
            {r.status === 'active' && <IconButton icon="close" label={t('hlChStop')} onClick={() => save('health', { ...c, stopped: true })} />}
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------- sticker book

const RING = ['#c8a27a', '#b9c2cc', '#e3b341', '#e59aa9', '#8fc6a6', '#8fb3e3', '#b79be6', '#f0a35b', '#6dd3d0'];

export function useBadges() {
  const { settings } = useBloom();
  const { all, ibd } = useHealth();
  const today = toISODate(new Date());
  return useMemo(() => (settings.healthStickerBook ? badges(all, today, ibd, settings.weekStart) : []), [all, today, ibd, settings.healthStickerBook, settings.weekStart]);
}

/** Small dimmed book button (top bar) + the book itself + a toast for newly earned badges. */
export function StickerBookButton() {
  const { t, toast } = useBloom();
  const list = useBadges();
  const [open, setOpen] = useState(false);
  const earned = list.filter((b) => b.earned);
  // Celebrate badges earned since last time (per computer).
  useEffect(() => {
    if (!list.length) return;
    let seen: string[] | null = null;
    try {
      seen = JSON.parse(localStorage.getItem('bloom-badges-seen') || 'null');
    } catch {
      /* ignore */
    }
    const ids = earned.map((b) => b.id);
    if (seen) {
      const fresh = earned.filter((b) => !seen!.includes(b.id));
      if (fresh.length) toast(t('hlBadgeNew', { name: badgeName(fresh[fresh.length - 1], t) }), { label: t('hlOpenBook'), run: () => setOpen(true) });
    }
    try {
      localStorage.setItem('bloom-badges-seen', JSON.stringify(ids));
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earned.length]);
  return (
    <>
      <button type="button" className="hl-book-btn" title={t('hlStickerBook')} aria-label={t('hlStickerBook')} onClick={() => setOpen(true)}>
        <Icon name="book" size={14} />
        <span>{earned.length}</span>
      </button>
      {open && <StickerBook list={list} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Tier text: "30 days logged" (the very first tier just says "The first one!"). */
function tierText(b: Badge, t: ReturnType<typeof useBloom>['t']) {
  return b.tier === 1 && b.level === 0 ? t('hlBdFirst') : t(`hlBd_${b.family.id}` as StringKey, { n: b.tier.toLocaleString() });
}

function badgeName(b: Badge, t: ReturnType<typeof useBloom>['t']) {
  return `${t(`hlBf_${b.family.id}` as StringKey)} · ${tierText(b, t)}`;
}

function StickerBook({ list, onClose }: { list: Badge[]; onClose: () => void }) {
  const { t, locale } = useBloom();
  const [show, setShow] = useState<'all' | 'earned'>('all');
  const earned = list.filter((b) => b.earned).length;
  const fams = [...new Set(list.map((b) => b.family.id))];
  return (
    <Modal title={t('hlStickerBook')} onClose={onClose} width={760} className="hl-book">
      <div className="hl-book-top">
        <span className="hl-book-count">{t('hlBookCount', { a: earned, b: list.length })}</span>
        <Segmented
          value={show}
          onChange={setShow}
          label={t('hlStickerBook')}
          options={[
            { value: 'all', label: t('hlAll') },
            { value: 'earned', label: t('hlEarned') },
          ]}
        />
      </div>
      {fams.map((f) => {
        const items = list.filter((b) => b.family.id === f && (show === 'all' || b.earned));
        if (!items.length) return null;
        return (
          <section key={f} className="hl-book-fam">
            <h4>
              {t(`hlBf_${f}` as StringKey)}
              {items[0].family.ibd && <span className="hl-tag ibd">IBD</span>}
            </h4>
            <div className="hl-book-grid">
              {items.map((b) => (
                <div key={b.id} className={`hl-badge ${b.earned ? 'earned' : 'locked'}`} style={{ ['--ring' as string]: RING[b.level % RING.length] }}>
                  <span className="hl-badge-art">
                    <StickerArt kind={b.family.sticker} size={44} />
                  </span>
                  <span className="hl-badge-name">{tierText(b, t)}</span>
                  <span className="hl-badge-sub">{b.earned ? fmtDay(b.earned, locale) + ' ' + b.earned.slice(0, 4) : `${Math.min(b.progress, b.tier)}/${b.tier}`}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </Modal>
  );
}

// ---------------------------------------------------------------- monthly summary

/** Shown in the first week of a month, for the month before (can be hidden). */
export function MonthSummaryCard({ always }: { always?: boolean }) {
  const { t, locale } = useBloom();
  const { all, ibd } = useHealth();
  const fmt = useWaterFmt();
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const month = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
  const key = `bloom-month-summary-${month}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  });
  const m = useMemo(() => monthSummary(all, month, ibd), [all, month, ibd]);
  if (m.daysLogged === 0 || (!always && (now.getDate() > 7 || hidden))) return null;
  const hide = () => {
    setHidden(true);
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* ignore */
    }
  };
  const rows: [string, string][] = [
    [t('hlSumDays'), String(m.daysLogged)],
    ...(m.avgWaterMl != null ? ([[t('hlSumWater'), `${fmt(m.avgWaterMl)} · ${t('hlSumGoalDays', { n: m.waterGoalDays })}`]] as [string, string][]) : []),
    ...(m.avgSleep != null ? ([[t('hlSleep'), t('hlHours', { n: m.avgSleep.toLocaleString(locale) })]] as [string, string][]) : []),
    ...(m.avgMood != null ? ([[t('hlMood'), `${m.avgMood.toLocaleString(locale)} / 5`]] as [string, string][]) : []),
    ...(m.medsPct != null ? ([[t('hlSumMeds'), `${m.medsPct}%`]] as [string, string][]) : []),
    ...(m.weightChange != null ? ([[t('hlWeight'), `⁦${m.weightChange > 0 ? '+' : ''}${m.weightChange.toLocaleString(locale)}⁩ ${t('hlUnitKg')}`]] as [string, string][]) : []),
    ...(ibd ? ([[t('hlSumFlares'), String(m.flareDays)]] as [string, string][]) : []),
  ];
  return (
    <section className="w-card hl-month">
      <CardHead sticker="flowers" title={t('hlSumTitle', { m: prev.toLocaleDateString(locale, { month: 'long' }) })}>
        {!always && <IconButton icon="close" label={t('close')} onClick={hide} />}
      </CardHead>
      <dl className="hl-sum">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ---------------------------------------------------------------- doctor report

/**
 * Prints only the report, on a clean white page: it's copied (with the app's
 * styles) into a hidden frame and printed from there. In the print dialog,
 * "Microsoft Print to PDF" saves it as a PDF.
 */
function printReport() {
  const report = document.getElementById('hl-report');
  if (!report) return;
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', width: '0', height: '0', border: '0', right: '0', bottom: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  const html = document.documentElement;
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join('');
  doc.open();
  doc.write(
    `<!doctype html><html lang="${html.lang}" dir="${html.dir}" data-theme="light" data-font-size="medium"><head><meta charset="utf-8"><base href="${document.baseURI}"><title>Bloom</title>${styles}` +
      `<style>body{background:#fff;margin:0;padding:18px 22px}#hl-report{position:static!important;visibility:visible!important}@page{margin:14mm}</style></head><body>${report.outerHTML}</body></html>`,
  );
  doc.close();
  const go = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  };
  // Wait for the styles and fonts in the frame.
  setTimeout(go, 400);
}

type Period = 7 | 30 | 90 | 'custom';

/** An organised summary for the doctor: last 30 days by default; 1 week, 90 days or any dates. Print / save as PDF. */
export function DoctorReport({ onClose }: { onClose: () => void }) {
  const { t, locale, settings } = useBloom();
  const { all, ibd, profile } = useHealth();
  const fmtWater = useWaterFmt();
  const today = toISODate(new Date());
  const [period, setPeriod] = useState<Period>(30);
  const [custom, setCustom] = useState({ from: toISODate(addDays(new Date(), -13)), to: today });
  const from = period === 'custom' ? (custom.from <= custom.to ? custom.from : custom.to) : toISODate(addDays(new Date(), -(period - 1)));
  const to = period === 'custom' ? (custom.from <= custom.to ? custom.to : custom.from) : today;
  const r = useMemo(() => reportData(all, from, to, ibd, settings.weekStart), [all, from, to, ibd, settings.weekStart]);
  const d = (x: ISODate, year = false) => parseISODate(x).toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
  const n = (x: number | null, unit = '') => (x == null ? '–' : `${x.toLocaleString(locale)}${unit}`);
  const meds = healthOf(all, 'med');
  const tests = healthOf(all, 'test')
    .filter((x) => x.date >= from && x.date <= to && (ibd || !x.ibd))
    .sort((a, b) => a.date.localeCompare(b.date));
  const weights = healthOf(all, 'body')
    .filter((b) => b.weightKg && b.date >= from && b.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date));
  const questions = healthOf(all, 'visit')
    .filter((v) => v.date >= today && (v.questions?.length ?? 0) > 0)
    .flatMap((v) => v.questions!);
  const facts = [
    profile?.age != null ? t('hlAgeYears', { n: profile.age }) : null,
    profile?.sex ? t(`hlSex_${profile.sex}` as StringKey) : null,
    ibd && profile?.ibdType ? t(`hlIbd_${profile.ibdType}` as StringKey) : null,
    ibd && profile?.ibdLocation ? profile.ibdLocation : null,
    ibd && profile?.ostomy && profile.ostomy !== 'none' ? t(`hlOst_${profile.ostomy}` as StringKey) : null,
  ].filter(Boolean);
  const level = (v: number | null, prefix: 'hlWell' | 'hlLevel') => (v == null ? '–' : `${v.toLocaleString(locale)} · ${t(`${prefix}_${Math.round(v)}` as StringKey)}`);

  return (
    <Modal
      title={t('hlReport')}
      onClose={onClose}
      width={820}
      className="hl-report-modal"
      footer={
        <>
          <div className="hl-report-range">
            <Segmented
              value={period}
              onChange={setPeriod}
              label={t('hlReport')}
              options={[
                { value: 7, label: t('hlWeekShort') },
                { value: 30, label: t('hlNDays', { n: 30 }) },
                { value: 90, label: t('hlNDays', { n: 90 }) },
                { value: 'custom', label: t('hlDates') },
              ]}
            />
            {period === 'custom' && (
              <span className="hl-report-dates">
                <input type="date" value={custom.from} max={today} aria-label={t('hlFromDate')} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} />
                <span>–</span>
                <input type="date" value={custom.to} max={today} aria-label={t('hlToDate')} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} />
              </span>
            )}
          </div>
          <span className="spacer" />
          <Button variant="primary" icon="note" onClick={printReport}>
            {t('hlPrint')}
          </Button>
        </>
      }
    >
      <article className="hl-report" id="hl-report">
        <header className="hl-rep-head">
          <h2>{t('hlReport')}</h2>
          <p>
            <b>
              {d(from, true)} – {d(to, true)}
            </b>
            {facts.length > 0 && <> · {facts.join(' · ')}</>}
          </p>
        </header>

        <section className="hl-rep-sum">
          <div>
            <span>{t('hlSumDays')}</span>
            <b>{r.daysLogged}</b>
          </div>
          {ibd && (
            <>
              <div>
                <span>{t('hlRepStoolsDay')}</span>
                <b>{n(r.stoolsPerDay)}</b>
              </div>
              <div>
                <span>{t('hlSumFlares')}</span>
                <b>{r.flareDays}</b>
              </div>
            </>
          )}
          {r.meds.length > 0 && (
            <div>
              <span>{t('hlSumMeds')}</span>
              <b>{Math.round((r.meds.reduce((a, m) => a + m.taken, 0) / Math.max(1, r.meds.reduce((a, m) => a + m.planned, 0))) * 100)}%</b>
            </div>
          )}
        </section>

        <h3>{t('hlRepWeekly')}</h3>
        <table className="hl-rep-table">
          <thead>
            <tr>
              <th>{t('hlRepWeek')}</th>
              {ibd ? (
                <>
                  <th>{t('hlRepStoolsDay')}</th>
                  <th>{t('hlRepLooseDay')}</th>
                  <th>{t('hlRepBloodDays')}</th>
                  <th>{t('hlRepFeeling')}</th>
                  <th>{t('hlAbdPain')}</th>
                  <th>{t('hlFatigue')}</th>
                  <th>{t('hlSumFlares')}</th>
                </>
              ) : (
                <>
                  <th>{t('hlWater')}</th>
                  <th>{t('hlSleep')}</th>
                  <th>{t('hlMood')}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {r.weeks.map((w) => (
              <tr key={w.start}>
                <th>
                  {d(w.start < from ? from : w.start)} – {d(w.end > to ? to : w.end)}
                </th>
                {ibd ? (
                  <>
                    <td>{n(w.stoolsPerDay)}</td>
                    <td>{n(w.loosePerDay)}</td>
                    <td>{w.bloodDays}</td>
                    <td>{level(w.wellbeing, 'hlWell')}</td>
                    <td>{level(w.pain, 'hlLevel')}</td>
                    <td>{level(w.fatigue, 'hlLevel')}</td>
                    <td>{w.flareDays}</td>
                  </>
                ) : (
                  <>
                    <td>{w.water != null ? fmtWater(w.water) : '–'}</td>
                    <td>{w.sleep != null ? t('hlHours', { n: w.sleep.toLocaleString(locale) }) : '–'}</td>
                    <td>{n(w.mood, ' / 5')}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {ibd && <p className="hl-rep-note">{t('hlRepScales')}</p>}

        {ibd && (
          <>
            <h3>{t('hlRepSymptoms')}</h3>
            {r.symptoms.length === 0 ? (
              <p>{t('hlRepNone')}</p>
            ) : (
              <table className="hl-rep-table small">
                <thead>
                  <tr>
                    <th>{t('hlRepSymptom')}</th>
                    <th>{t('hlRepFirst')}</th>
                    <th>{t('hlRepDays')}</th>
                  </tr>
                </thead>
                <tbody>
                  {r.symptoms.map((s) => (
                    <tr key={s.id}>
                      <th>{t(`hlComp_${s.id}` as StringKey)}</th>
                      <td>{d(s.first, true)}</td>
                      <td>{s.days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h3>{t('hlRepFlares')}</h3>
            <p>{r.flareRanges.length === 0 ? t('hlRepNone') : r.flareRanges.map((x) => (x.from === x.to ? d(x.from) : `${d(x.from)} – ${d(x.to)}`)).join(' · ')}</p>

            {r.daily.length > 0 && r.daily.length <= 31 && (
              <>
                <h3>{t('hlRepDaily')}</h3>
                <div className="hl-rep-days">
                  {r.daily.map((x) => (
                    <span key={x.date} className={x.flare ? 'flare' : ''}>
                      <b>{d(x.date)}</b> {x.stools}
                      {x.loose > 0 && <i> · {t('hlRepLooseN', { n: x.loose })}</i>}
                      {x.blood > 0 && <i> · {t('hlBlood')}</i>}
                    </span>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {r.meds.length > 0 && (
          <>
            <h3>{t('hlMeds')}</h3>
            <table className="hl-rep-table small">
              <tbody>
                {r.meds.map((x) => {
                  const m = meds.find((y) => y.id === x.id);
                  if (!m) return null;
                  return (
                    <tr key={x.id}>
                      <th dir="auto">
                        {m.name} {m.dose}
                      </th>
                      <td>{(m.every ?? 1) > 1 || (m.unit && m.unit !== 'day') ? t(`hlEveryN_${m.unit ?? 'day'}` as StringKey, { n: m.every ?? 1 }) : t('hlEvery1_day')} · {m.times.join(', ')}</td>
                      <td>{t('hlRepTakenOf', { a: x.taken, b: x.planned })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {weights.length > 0 && (
          <>
            <h3>{t('hlWeight')}</h3>
            <p>
              {weights.map((w) => `${d(w.date)}: ${w.weightKg} ${t('hlUnitKg')}`).join(' · ')}
            </p>
          </>
        )}

        {tests.length > 0 && (
          <>
            <h3>{t('hlTests')}</h3>
            <table className="hl-rep-table small">
              <tbody>
                {tests.map((x) => (
                  <tr key={x.id}>
                    <th dir="auto">{x.name}</th>
                    <td dir="ltr">
                      {x.value ?? ''} {x.unit}
                    </td>
                    <td>{d(x.date, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {questions.length > 0 && (
          <>
            <h3>{t('hlQuestions')}</h3>
            <ul>
              {questions.map((q) => (
                <li key={q.id} dir="auto">
                  {q.text}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="hl-report-note">{t('hlNotAdvice')}</p>
      </article>
    </Modal>
  );
}
