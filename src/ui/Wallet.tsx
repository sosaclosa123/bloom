// Wallet: how much I spend this month vs. my limit, repeating payments and
// subscriptions, and savings goals.
// "Mine" shows private items only; "Shared" shows only what was shared, in full,
// for both partners (e.g. a joint savings goal both of us add money to).
import { useMemo, useState, type ReactNode } from 'react';
import { newMeta } from '../shared/db';
import { parseISODate, toISODate } from '../shared/dates';
import {
  depositsOf,
  formatMoney,
  goalMonthly,
  goalSaved,
  goalsOf,
  isActive,
  limitOf,
  limitStatus,
  monthSpending,
  nextCharge,
  recurringTotals,
  changesCharges,
  latestPart,
  paymentChain,
  paymentHistory,
  splitFromNow,
  cancelledIn,
  yearlyStartFor,
  recurringOf,
  savedByPerson,
  yearSpending,
} from '../shared/money';
import type { ISODate, MoneyDeposit, MoneyGoal, MoneyItem, MoneyLimit, MoneyRecurring, MoneySpend, Visibility } from '../shared/types';
import { Button, Field, Icon, IconButton, Modal, Segmented, Toggle } from './common';
import { ShareToggle } from './editors';
import { useAlive, useBloom } from './store';
import { CountdownIcon, countdownSticker, GOAL_STICKERS, StickerArt } from './Stickers';
import { STICKERS } from './stickerDesigns';
import { useSync } from './sync';
import { isPhone } from '../platform/api';

type Editing =
  | { kind: 'spend'; item: MoneySpend; isNew: boolean }
  | { kind: 'recurring'; item: MoneyRecurring; isNew: boolean }
  | { kind: 'goal'; item: MoneyGoal; isNew: boolean }
  | null;

/** Phone Wallet = tabs (owner chose layout A); the PC keeps its two columns. */
type WalletTab = 'month' | 'year' | 'savings' | 'payments';
const WALLET_TABS: WalletTab[] = ['month', 'year', 'savings', 'payments'];

const todayISO = () => toISODate(new Date());
const pad = (n: number) => String(n).padStart(2, '0');

function useMoney() {
  const { settings, locale } = useBloom();
  const fmt = (n: number, compact = false) => formatMoney(n, settings.currency, locale, compact);
  const day = (d: ISODate, withYear = false) =>
    parseISODate(d).toLocaleDateString(locale, { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });
  return { fmt, day };
}

/** Name used on deposits so a shared goal shows who added what. */
function useMe() {
  const { state } = useSync();
  return { name: state.profile?.name ?? '', uid: state.user?.uid ?? null, inSpace: !!state.profile?.spaceId, signedIn: !!state.user };
}

export function WalletPage() {
  const { t, locale } = useBloom();
  const all = useAlive('money') as MoneyItem[];
  const me = useMe();
  const [side, setSide] = useState<Visibility>(() => (localStorage.getItem('bloom-wallet-side') === 'shared' ? 'shared' : 'private'));
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [editing, setEditing] = useState<Editing>(null);
  const [tab, setTab] = useState<WalletTab>(() => {
    try {
      const v = localStorage.getItem('bloom-wallet-tab') as WalletTab;
      return WALLET_TABS.includes(v) ? v : 'month';
    } catch {
      return 'month';
    }
  });
  const chooseTab = (v: WalletTab) => {
    setTab(v);
    try {
      localStorage.setItem('bloom-wallet-tab', v);
    } catch {
      /* ignore */
    }
  };
  const newPurchase = () => {
    const today = todayISO();
    const item: MoneySpend = { ...newMeta(), visibility: side, kind: 'spend', title: '', amount: 0, date: month === today.slice(0, 7) ? today : `${month}-01`, note: '' };
    setEditing({ kind: 'spend', item, isNew: true });
  };
  // Savings and payments don't depend on the month (phone tabs).
  const showMonth = !(isPhone && (tab === 'savings' || tab === 'payments'));

  const chooseSide = (v: Visibility) => {
    setSide(v);
    try {
      localStorage.setItem('bloom-wallet-side', v);
    } catch {
      /* ignore */
    }
  };
  const shiftMonth = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };
  const monthLabel = parseISODate(`${month}-01`).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const isThisMonth = month === todayISO().slice(0, 7);

  return (
    <div className="page wallet">
      <div className="wallet-top">
        <Segmented
          value={side}
          onChange={chooseSide}
          options={[
            { value: 'private', label: <><Icon name="lock" size={12} /> {t('wlMine')}</> },
            { value: 'shared', label: <><Icon name="people" size={13} /> {t('wlShared')}</> },
          ]}
        />
        <span className="spacer" />
        {showMonth && (
          <div className="wallet-month">
            <IconButton icon="chevronLeft" className="flip-rtl" label={t('prev')} onClick={() => shiftMonth(-1)} />
            <span>{monthLabel}</span>
            <IconButton icon="chevronRight" className="flip-rtl" label={t('next')} onClick={() => shiftMonth(1)} />
            {!isThisMonth && (
              <button type="button" className="today-btn" onClick={() => setMonth(todayISO().slice(0, 7))}>
                {t('today')}
              </button>
            )}
          </div>
        )}
      </div>

      {isPhone ? (
        <>
          <div className="wl-tabs">
            <Segmented
              value={tab}
              onChange={chooseTab}
              options={WALLET_TABS.map((v) => ({ value: v, label: t(({ month: 'wlTabMonth', year: 'wlTabYear', savings: 'wlTabSavings', payments: 'wlTabPayments' } as const)[v]) }))}
            />
          </div>
          <div className="wallet-body wl-phone">
            {side === 'shared' && <p className="wl-shared-hint">{me.inSpace ? t('wlSharedHint') : t('wlConnectHint')}</p>}
            {tab === 'month' && (
              <>
                <LimitCard all={all} side={side} month={month} />
                <Button variant="primary" icon="plus" className="wl-add-btn" onClick={newPurchase}>
                  {t('wlPurchase')}
                </Button>
                <SpendingList all={all} side={side} month={month} onEdit={setEditing} />
              </>
            )}
            {tab === 'year' && (
              <YearCard
                all={all}
                side={side}
                month={month}
                onPickMonth={(m) => {
                  setMonth(m);
                  chooseTab('month');
                }}
              />
            )}
            {tab === 'savings' && <GoalsCard all={all} side={side} onEdit={setEditing} />}
            {tab === 'payments' && <RecurringCard all={all} side={side} onEdit={setEditing} />}
          </div>
        </>
      ) : (
        /* Two sides that scroll separately: this month on the left (right in Hebrew), the bigger picture beside it. */
        <div className="wallet-body wl-two">
          <div className="wl-main">
            {side === 'shared' && <p className="wl-shared-hint">{me.inSpace ? t('wlSharedHint') : t('wlConnectHint')}</p>}
            <LimitCard all={all} side={side} month={month} />
            <QuickAdd side={side} month={month} />
            <SpendingList all={all} side={side} month={month} onEdit={setEditing} />
          </div>
          <div className="wl-side">
            <YearCard all={all} side={side} month={month} onPickMonth={setMonth} />
            <GoalsCard all={all} side={side} onEdit={setEditing} />
            <RecurringCard all={all} side={side} onEdit={setEditing} />
          </div>
        </div>
      )}

      {editing?.kind === 'spend' && <SpendEditor init={editing.item} isNew={editing.isNew} onClose={() => setEditing(null)} />}
      {editing?.kind === 'recurring' && <RecurringEditor init={editing.item} isNew={editing.isNew} onClose={() => setEditing(null)} />}
      {editing?.kind === 'goal' && <GoalEditor init={editing.item} isNew={editing.isNew} onClose={() => setEditing(null)} />}
    </div>
  );
}

function Card({ title, sub, action, children, className }: { title: string; sub?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`w-card ${className ?? ''}`}>
      <div className="w-card-head">
        <div>
          <h3>{title}</h3>
          {sub && <p className="w-card-sub">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- monthly limit

function LimitCard({ all, side, month }: { all: MoneyItem[]; side: Visibility; month: string }) {
  const { t, save } = useBloom();
  const { fmt } = useMoney();
  const limit = limitOf(all, side);
  const m = monthSpending(all, side, month);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(0);

  const commit = () => {
    if (draft > 0) {
      const item: MoneyLimit = limit ? { ...limit, amount: draft } : { ...newMeta(), visibility: side, kind: 'limit', amount: draft };
      save('money', item);
    }
    setEditing(false);
  };

  const now = new Date();
  const [y, mo] = month.split('-').map(Number);
  const isThisMonth = y === now.getFullYear() && mo === now.getMonth() + 1;
  const daysLeft = new Date(y, mo, 0).getDate() - now.getDate();
  const st = limit ? limitStatus(limit.amount, m.total) : null;

  return (
    <section className={`w-card wl-limit ${st?.state ?? ''}`}>
      <div className="wl-limit-main">
        <span className="wl-limit-label">{t('wlSpentThisMonth')}</span>
        <span className="wl-limit-spent" dir="ltr">
          {fmt(m.total)}
        </span>
        {limit && !editing && <span className="wl-limit-of">{t('wlOf', { a: fmt(limit.amount) })}</span>}
      </div>

      {editing ? (
        <form
          className="wl-limit-edit"
          onSubmit={(e) => {
            e.preventDefault();
            commit();
          }}
        >
          <Field label={t('wlLimit')}>
            <MoneyInput value={draft} onChange={setDraft} autoFocus />
          </Field>
          <Button variant="primary" disabled={!(draft > 0)} onClick={commit}>
            {t('save')}
          </Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>
            {t('cancel')}
          </Button>
        </form>
      ) : st ? (
        <>
          <div className="wl-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, st.ratio) * 100)}>
            <span style={{ width: `${Math.min(100, st.ratio * 100)}%` }} />
          </div>
          <div className="wl-limit-foot">
            <strong className="wl-left">{st.left >= 0 ? t('wlLeft', { a: fmt(st.left) }) : t('wlOver', { a: fmt(-st.left) })}</strong>
            {isThisMonth && <span className="muted">{daysLeft > 0 ? t('wlDaysLeft', { n: daysLeft }) : t('wlDayLeft')}</span>}
            <span className="spacer" />
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setDraft(limit!.amount);
                setEditing(true);
              }}
            >
              {t('wlEditLimit')}
            </button>
          </div>
        </>
      ) : (
        <div className="wl-limit-foot">
          <span className="muted">{t('wlLimitHint')}</span>
          <span className="spacer" />
          <Button
            variant="soft"
            size="sm"
            onClick={() => {
              setDraft(0);
              setEditing(true);
            }}
          >
            {t('wlSetLimit')}
          </Button>
        </div>
      )}

      {(m.spendTotal > 0 || m.chargeTotal > 0) && (
        <div className="wl-split">
          <span>
            {t('wlPurchases')} <b dir="ltr">{fmt(m.spendTotal)}</b>
          </span>
          <span>
            {t('wlPayments')} <b dir="ltr">{fmt(m.chargeTotal)}</b>
          </span>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- quick add a purchase

function QuickAdd({ side, month }: { side: Visibility; month: string }) {
  const { t, save } = useBloom();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState(0);
  const [amountKey, setAmountKey] = useState(0); // remount to clear the box
  const today = todayISO();
  const defaultDate = month === today.slice(0, 7) ? today : `${month}-01`;
  const [date, setDate] = useState(defaultDate);
  const [forMonth, setForMonth] = useState(month);
  if (forMonth !== month) {
    setForMonth(month);
    setDate(defaultDate);
  }
  const ok = !!title.trim() && amount > 0 && !!date;
  const add = () => {
    if (!ok) return;
    save('money', { ...newMeta(), visibility: side, kind: 'spend', title: title.trim(), amount, date, note: '' } satisfies MoneySpend);
    setTitle('');
    setAmount(0);
    setAmountKey((k) => k + 1);
  };
  return (
    <form
      className="w-card wl-quick"
      onSubmit={(e) => {
        e.preventDefault();
        add();
      }}
    >
      <input className="wl-quick-title" dir="auto" value={title} placeholder={t('wlWhatBought')} aria-label={t('wlWhatBought')} onChange={(e) => setTitle(e.target.value)} />
      <MoneyInput key={amountKey} value={amount} onChange={setAmount} label={t('wlAmount')} />
      <input type="date" value={date} aria-label={t('wlDate')} onChange={(e) => e.target.value && setDate(e.target.value)} />
      <Button variant="primary" icon="plus" disabled={!ok} onClick={add}>
        {t('wlAdd')}
      </Button>
      <button type="submit" hidden />
    </form>
  );
}

// ---------------------------------------------------------------- this month's list

function SpendingList({ all, side, month, onEdit }: { all: MoneyItem[]; side: Visibility; month: string; onEdit: (e: Editing) => void }) {
  const { t } = useBloom();
  const { fmt, day } = useMoney();
  const m = monthSpending(all, side, month);
  const rows = [
    ...m.spends.map((s) => ({ key: s.id, date: s.date, title: s.title, amount: s.amount, tag: null as string | null, cancelled: false, open: () => onEdit({ kind: 'spend', item: s, isNew: false }) })),
    ...m.charges.map((c) => ({
      key: `${c.rec.id}@${c.date}`,
      date: c.date,
      title: c.rec.title,
      amount: c.rec.amount,
      tag: c.rec.subscription ? t('wlSubscription') : c.rec.cycle === 'yearly' ? t('wlYearlyTag') : t('wlPaymentTag'),
      cancelled: false,
      open: () => onEdit({ kind: 'recurring', item: latestPart(all, c.rec), isNew: false }),
    })),
    // History only: payments cancelled before this charge (dimmed, not counted, not clickable).
    ...cancelledIn(all, side, month).map((c) => ({
      key: `x-${c.rec.id}@${c.date}`,
      date: c.date,
      title: c.rec.title,
      amount: c.rec.amount,
      tag: null as string | null,
      cancelled: true,
      open: () => {},
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Card title={t('wlList')}>
      {rows.length === 0 ? (
        <p className="empty-note">{t(isPhone ? 'wlEmptyPhone' : 'wlEmpty')}</p>
      ) : (
        <ul className="wl-rows">
          {rows.map((r) => (
            <li key={r.key}>
              {r.cancelled ? (
                <div className="wl-row cancelled" aria-disabled="true" title={t('wlCancelledNote')}>
                  <span className="wl-row-date">{day(r.date)}</span>
                  <span className="wl-x" aria-hidden="true">
                    <Icon name="close" size={12} />
                  </span>
                  {/* Name + pill together: on a narrow screen the pill goes under the name. */}
                  <span className="wl-row-main">
                    <span className="wl-row-title" dir="auto">
                      {r.title || '—'}
                    </span>
                    <span className="wl-tag cancelled">{t('wlCancelledTag')}</span>
                  </span>
                  <span className="wl-row-amount" dir="ltr">
                    {fmt(r.amount)}
                  </span>
                </div>
              ) : (
                <button type="button" className="wl-row" onClick={r.open}>
                  <span className="wl-row-date">{day(r.date)}</span>
                  <span className="wl-row-main">
                    <span className="wl-row-title" dir="auto">
                      {r.title || '—'}
                    </span>
                    {r.tag && (
                      <span className="wl-tag">
                        <Icon name="repeat" size={11} /> {r.tag}
                      </span>
                    )}
                  </span>
                  <span className="wl-row-amount" dir="ltr">
                    {fmt(r.amount)}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- the whole year

function YearCard({ all, side, month, onPickMonth }: { all: MoneyItem[]; side: Visibility; month: string; onPickMonth: (m: string) => void }) {
  const { t, locale } = useBloom();
  const { fmt } = useMoney();
  const today = todayISO();
  const year = Number(month.slice(0, 4));
  const isThisYear = year === Number(today.slice(0, 4));
  const ys = yearSpending(all, side, year, today);
  const fixed = recurringTotals(recurringOf(all, side).filter((r) => isActive(r, today)));
  const peak = Math.max(1, ...ys.byMonth);
  if (year > Number(today.slice(0, 4))) return null;
  return (
    <Card title={isThisYear ? `${t('wlYear')} · ${year}` : t('wlYearPast', { y: year })} sub={fixed.yearly > 0 ? t('wlYearFixed', { a: fmt(fixed.yearly) }) : undefined}>
      <div className="wl-year">
        <div className="wl-year-total">
          <span className="wl-limit-label">{isThisYear ? t('wlYearSoFar', { y: year }) : t('wlYearSpent', { y: year })}</span>
          <span className="wl-year-amount" dir="ltr">
            {fmt(ys.total)}
          </span>
          <span className="wl-split">
            <span>
              {t('wlPurchases')} <b dir="ltr">{fmt(ys.spendTotal)}</b>
            </span>
            <span>
              {t('wlPayments')} <b dir="ltr">{fmt(ys.chargeTotal)}</b>
            </span>
          </span>
        </div>
        <div className="wl-year-bars" role="list">
          {ys.byMonth.map((v, i) => {
            const key = `${year}-${pad(i + 1)}`;
            const label = new Date(year, i, 1).toLocaleDateString(locale, { month: 'short' });
            const future = key > today.slice(0, 7);
            return (
              <button
                type="button"
                role="listitem"
                key={key}
                className={`wl-ybar ${key === month ? 'active' : ''} ${future ? 'future' : ''}`}
                disabled={future}
                title={`${new Date(year, i, 1).toLocaleDateString(locale, { month: 'long' })}: ${fmt(v)}`}
                aria-label={`${label}: ${fmt(v)}`}
                onClick={() => onPickMonth(key)}
              >
                <span className="wl-ybar-track">
                  <span style={{ height: `${(v / peak) * 100}%` }} />
                </span>
                <span className="wl-ybar-label">
                  <span className="lbl-short">{label}</span>
                  <span className="lbl-narrow" aria-hidden="true">
                    {new Date(year, i, 1).toLocaleDateString(locale, { month: 'narrow' })}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- repeating payments & subscriptions

function RecurringCard({ all, side, onEdit }: { all: MoneyItem[]; side: Visibility; onEdit: (e: Editing) => void }) {
  const { t } = useBloom();
  const { fmt, day } = useMoney();
  const today = todayISO();
  const list = recurringOf(all, side).sort((a, b) => a.title.localeCompare(b.title));
  const active = list.filter((r) => isActive(r, today));
  // Parts replaced by a price change live on in their successor's history.
  const cancelled = list.filter((r) => !isActive(r, today) && !r.replacedBy);
  const subs = active.filter((r) => r.subscription);
  const totals = recurringTotals(active);
  const [showCancelled, setShowCancelled] = useState(false);
  const newRec = (): MoneyRecurring => ({ ...newMeta(), visibility: side, kind: 'recurring', title: '', amount: 0, cycle: 'monthly', startDate: today, endDate: null, subscription: true, note: '' });

  const row = (r: MoneyRecurring) => {
    const next = nextCharge(r, today);
    return (
      <li key={r.id}>
        <button type="button" className={`wl-rec ${isActive(r, today) ? '' : 'stopped'}`} onClick={() => onEdit({ kind: 'recurring', item: r, isNew: false })}>
          <span className="wl-rec-icon" aria-hidden="true">
            <StickerArt kind={r.subscription ? 'movie' : 'bills'} size={30} />
          </span>
          <span className="wl-rec-text">
            <span className="wl-rec-title" dir="auto">
              {r.title || '—'}
            </span>
            <span className="wl-rec-sub">
              {r.cycle === 'monthly' ? t('wlPerMonth', { a: fmt(r.amount) }) : t('wlPerYear', { a: fmt(r.amount) })}
              {isActive(r, today)
                ? next && <> · {t('wlNext', { d: day(next, r.cycle === 'yearly') })}</>
                : r.endDate && <> · {t('wlCancelledOn', { d: day(r.endDate, true) })}</>}
            </span>
          </span>
          {r.subscription && <span className="wl-tag">{t('wlSubscription')}</span>}
        </button>
      </li>
    );
  };

  return (
    <Card
      title={t('wlRecurring')}
      sub={
        active.length
          ? [t('wlRecTotals', { m: fmt(totals.monthly), y: fmt(totals.yearly) }), subs.length ? t(subs.length === 1 ? 'wlSubsCount1' : 'wlSubsCount', { n: subs.length }) : ''].filter(Boolean).join(' · ')
          : t('wlRecurringHint')
      }
      action={
        <Button variant="soft" size="sm" icon="plus" onClick={() => onEdit({ kind: 'recurring', item: newRec(), isNew: true })}>
          {t('wlAddPayment')}
        </Button>
      }
    >
      {active.length === 0 && cancelled.length === 0 && <p className="empty-note">{t('wlNoPayments')}</p>}
      {active.length > 0 && <ul className="wl-recs">{active.map(row)}</ul>}
      {cancelled.length > 0 && (
        <>
          <button type="button" className="more-toggle" aria-expanded={showCancelled} onClick={() => setShowCancelled((v) => !v)}>
            <Icon name="chevronRight" size={14} className={showCancelled ? 'rot90' : 'flip-rtl'} /> {t('wlCancelled', { n: cancelled.length })}
          </button>
          {showCancelled && <ul className="wl-recs">{cancelled.map(row)}</ul>}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- savings goals

function GoalsCard({ all, side, onEdit }: { all: MoneyItem[]; side: Visibility; onEdit: (e: Editing) => void }) {
  const { t } = useBloom();
  const goals = goalsOf(all, side).sort((a, b) => a.createdAt - b.createdAt);
  const newGoal = (): MoneyGoal => ({ ...newMeta(), visibility: side, kind: 'goal', name: '', emoji: side === 'shared' ? 'home' : 'bills', target: 0, targetDate: null });
  return (
    <Card
      title={t('wlGoals')}
      action={
        <Button variant="soft" size="sm" icon="plus" onClick={() => onEdit({ kind: 'goal', item: newGoal(), isNew: true })}>
          {t('wlAddGoal')}
        </Button>
      }
    >
      {goals.length === 0 ? (
        <p className="empty-note">{t('wlNoGoals')}</p>
      ) : (
        <div className="wl-goals">
          {goals.map((g) => (
            <GoalTile key={g.id} goal={g} all={all} onEdit={() => onEdit({ kind: 'goal', item: g, isNew: false })} />
          ))}
        </div>
      )}
    </Card>
  );
}

function GoalTile({ goal, all, onEdit }: { goal: MoneyGoal; all: MoneyItem[]; onEdit: () => void }) {
  const { t, save, locale } = useBloom();
  const { fmt } = useMoney();
  const me = useMe();
  const saved = goalSaved(all, goal);
  const ratio = goal.target > 0 ? Math.min(1, saved / goal.target) : 0;
  const monthlyNeed = goalMonthly(goal, saved, new Date());
  const people = goal.visibility === 'shared' ? savedByPerson(all, goal) : [];
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState(0);

  const add = () => {
    if (!(amount > 0)) return;
    const d: MoneyDeposit = { ...newMeta(), visibility: goal.visibility, kind: 'deposit', goalId: goal.id, amount, date: todayISO(), by: me.name, byUid: me.uid };
    save('money', d);
    setAmount(0);
    setAdding(false);
  };

  return (
    <div className="wl-goal">
      {/* The card itself fills up (left to right; right to left in Hebrew) as money is added. */}
      <span className="wl-goal-fill" style={{ width: `${ratio * 100}%` }} aria-hidden="true" />
      <button type="button" className="wl-goal-head" onClick={onEdit}>
        <span className="wl-goal-emoji" aria-hidden="true">
          <CountdownIcon value={goal.emoji} size={34} />
        </span>
        <span className="wl-goal-name" dir="auto">
          {goal.name || '—'}
        </span>
        <span className="wl-goal-pct">{Math.round(ratio * 100)}%</span>
      </button>
      <div className="wl-goal-amounts" dir="auto">
        {t('wlSavedOf', { a: fmt(saved), b: fmt(goal.target) })}
      </div>
      {people.length > 0 && (
        <div className="wl-people">
          {people.map((p) => (
            <span key={p.by} className="wl-person">
              {p.by || t('wlMe')} <b dir="ltr">{fmt(p.amount)}</b>
            </span>
          ))}
        </div>
      )}
      {saved >= goal.target && goal.target > 0 ? (
        <div className="wl-goal-hint done">{t('wlReached')}</div>
      ) : (
        monthlyNeed !== null &&
        goal.targetDate && (
          <div className="wl-goal-hint">
            {t('wlMonthlyHint', { a: fmt(monthlyNeed), d: parseISODate(goal.targetDate).toLocaleDateString(locale, { month: 'short', year: 'numeric' }) })}
          </div>
        )
      )}
      {adding ? (
        <form
          className="wl-goal-add"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <MoneyInput value={amount} onChange={setAmount} autoFocus label={t('wlAmount')} />
          <Button variant="primary" size="sm" disabled={!(amount > 0)} onClick={add}>
            {t('wlAdd')}
          </Button>
          <IconButton icon="close" label={t('cancel')} onClick={() => setAdding(false)} />
        </form>
      ) : (
        <Button variant="soft" size="sm" icon="plus" className="wl-goal-addbtn" onClick={() => setAdding(true)}>
          {t('wlAddMoney')}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- editors

function MoneyInput({ value, onChange, autoFocus, label }: { value: number; onChange: (n: number) => void; autoFocus?: boolean; label?: string }) {
  const { settings, locale } = useBloom();
  const [text, setText] = useState(value ? String(value) : '');
  const symbol = useMemo(() => {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency: settings.currency }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? '';
    } catch {
      return settings.currency;
    }
  }, [locale, settings.currency]);
  return (
    <div className="money-input" dir="ltr">
      <span>{symbol}</span>
      <input
        inputMode="decimal"
        autoFocus={autoFocus}
        value={text}
        placeholder="0"
        aria-label={label}
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.');
          setText(v);
          const n = Number(v);
          onChange(Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);
        }}
      />
    </div>
  );
}

function EditorShell({ title, isNew, onClose, onSave, onDelete, canSave, extra, children }: { title: string; isNew: boolean; onClose: () => void; onSave: () => void; onDelete: () => void; canSave: boolean; extra?: ReactNode; children: ReactNode }) {
  const { t } = useBloom();
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={480}
      footer={
        <>
          {!isNew && (
            <Button variant="danger" icon="trash" onClick={onDelete}>
              {t('delete')}
            </Button>
          )}
          {extra}
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="primary" disabled={!canSave} onClick={onSave}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSave) onSave();
        }}
      >
        {children}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function SpendEditor({ init, isNew = false, onClose }: { init: MoneySpend; isNew?: boolean; onClose: () => void }) {
  const { t, save, del } = useBloom();
  const [v, setV] = useState(init);
  const set = (p: Partial<MoneySpend>) => setV((x) => ({ ...x, ...p }));
  return (
    <EditorShell
      title={isNew ? t('wlNewPurchase') : t('wlEditPurchase')}
      isNew={isNew}
      onClose={onClose}
      onSave={() => {
        save('money', { ...v, title: v.title.trim() });
        onClose();
      }}
      onDelete={() => {
        del('money', init);
        onClose();
      }}
      canSave={!!v.title.trim() && v.amount > 0}
    >
      <input className="title-input" dir="auto" autoFocus value={v.title} placeholder={t('wlWhatBought')} onChange={(e) => set({ title: e.target.value })} />
      <div className="grid-2">
        <Field label={t('wlAmount')}>
          <MoneyInput value={v.amount} onChange={(amount) => set({ amount })} />
        </Field>
        <Field label={t('wlDate')}>
          <input type="date" value={v.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
        </Field>
      </div>
      <Field label={t('wlNote')}>
        <input dir="auto" value={v.note} onChange={(e) => set({ note: e.target.value })} />
      </Field>
      <ShareToggle value={v.visibility} onChange={(visibility) => set({ visibility })} />
    </EditorShell>
  );
}

function RecurringEditor({ init, isNew, onClose }: { init: MoneyRecurring; isNew: boolean; onClose: () => void }) {
  const { t, save, del, locale } = useBloom();
  const { fmt, day } = useMoney();
  const all = useAlive('money') as MoneyItem[];
  const [v, setV] = useState(init);
  const set = (p: Partial<MoneyRecurring>) => setV((x) => ({ ...x, ...p }));
  const today = todayISO();
  const active = isActive(init, today);
  const history = isNew ? [] : paymentHistory(all, init, today);
  const paid = Math.round(history.reduce((s, h) => s + h.amount, 0) * 100) / 100;
  // With payments already made, a new price/schedule applies from now on by
  // default, so past months keep what was really paid.
  const [keepPast, setKeepPast] = useState(true);
  const [armed, setArmed] = useState(false);
  const askKeep = history.length > 0 && changesCharges(init, v);
  const canSave = !!v.title.trim() && v.amount > 0 && !!v.startDate;

  const commit = (x: MoneyRecurring) => {
    const clean = { ...x, title: x.title.trim() };
    if (!isNew && history.length > 0 && keepPast && changesCharges(init, clean)) {
      const [ended, next] = splitFromNow(init, clean, today, newMeta());
      save('money', ended);
      save('money', next);
    } else save('money', clean);
    onClose();
  };
  // Cancel = stop the existing payment today; everything already paid stays.
  const cancel = () => {
    save('money', { ...init, title: v.title.trim() || init.title, note: v.note, subscription: v.subscription, visibility: v.visibility, endDate: today });
    onClose();
  };
  const resume = () => commit({ ...v, endDate: null });
  const remove = () => {
    if (history.length > 0 && !armed) {
      setArmed(true);
      return;
    }
    for (const part of paymentChain(all, init)) del('money', part);
    onClose();
  };

  return (
    <EditorShell
      title={isNew ? t('wlNewPayment') : t('wlEditPayment')}
      isNew={isNew}
      onClose={onClose}
      onSave={() => commit(v)}
      onDelete={remove}
      canSave={canSave}
      extra={
        !isNew &&
        !init.replacedBy &&
        (active ? (
          <Button variant="ghost" onClick={cancel}>
            {init.subscription ? t('wlStop') : t('wlStopPayment')}
          </Button>
        ) : (
          <Button variant="ghost" disabled={!canSave} onClick={resume}>
            {t('wlResume')}
          </Button>
        ))
      }
    >
      {armed && <p className="wl-warn" role="alert">{t('wlDeleteConfirm', { b: init.subscription ? t('wlStop') : t('wlStopPayment') })}</p>}
      <input className="title-input" dir="auto" autoFocus value={v.title} placeholder={t('wlPaymentPh')} onChange={(e) => set({ title: e.target.value })} />
      <div className="grid-2">
        <Field label={t('wlAmount')}>
          <MoneyInput value={v.amount} onChange={(amount) => set({ amount })} />
        </Field>
        <Field label={v.cycle === 'yearly' ? t('wlRenewsOn') : t('wlFirstCharge')}>
          <input type="date" value={v.startDate} onChange={(e) => e.target.value && set({ startDate: e.target.value })} />
        </Field>
      </div>
      <Segmented
        value={v.cycle}
        onChange={(cycle) => {
          // An existing monthly payment that becomes yearly renews on its next
          // payment date; switching back restores the original date.
          if (!isNew && cycle === 'yearly' && init.cycle === 'monthly' && v.startDate === init.startDate) set({ cycle, startDate: yearlyStartFor(init, today) });
          else if (!isNew && cycle === init.cycle && v.startDate === yearlyStartFor(init, today)) set({ cycle, startDate: init.startDate });
          else set({ cycle });
        }}
        options={[
          { value: 'monthly', label: t('wlEveryMonth') },
          { value: 'yearly', label: t('wlEveryYear') },
        ]}
      />
      {v.startDate && (
        <p className="wl-cycle-hint">
          {v.cycle === 'yearly'
            ? t('wlChargedYearly', { m: parseISODate(v.startDate).toLocaleDateString(locale, { month: 'long' }) })
            : t('wlChargedMonthly', { d: Number(v.startDate.slice(8, 10)) })}
        </p>
      )}
      <Toggle checked={v.subscription} label={
          <>
            <StickerArt kind="movie" size={20} /> {t('wlIsSubscription')}
          </>
        } onChange={(subscription) => set({ subscription })} />
      <Field label={t('wlNote')}>
        <input dir="auto" value={v.note} onChange={(e) => set({ note: e.target.value })} />
      </Field>
      {askKeep && <Toggle checked={keepPast} label={t('wlKeepPast')} onChange={setKeepPast} />}
      <ShareToggle value={v.visibility} onChange={(visibility) => set({ visibility })} />
      {!isNew && (
        <div className="wl-history">
          <span className="field-label">{t('wlPayHistory')}</span>
          {history.length === 0 ? (
            <p className="empty-note">{t('wlNoPaymentsYet')}</p>
          ) : (
            <>
              <p className="wl-paid">{t(history.length === 1 ? 'wlHistoryPaid1' : 'wlHistoryPaid', { a: fmt(paid), n: history.length })}</p>
              <ul className="wl-history-list">
                {history.map((h) => (
                  <li key={h.date}>
                    <span className="wl-row-title">{day(h.date, true)}</span>
                    <span className="wl-row-amount" dir="ltr">
                      {fmt(h.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </EditorShell>
  );
}


function GoalEditor({ init, isNew, onClose }: { init: MoneyGoal; isNew: boolean; onClose: () => void }) {
  const { t, save, del, settings } = useBloom();
  const { fmt, day } = useMoney();
  const all = useAlive('money') as MoneyItem[];
  const [v, setV] = useState(init);
  const set = (p: Partial<MoneyGoal>) => setV((x) => ({ ...x, ...p }));
  const deposits = isNew ? [] : depositsOf(all, init.id);
  return (
    <EditorShell
      title={isNew ? t('wlAddGoal') : t('wlEditGoal')}
      isNew={isNew}
      onClose={onClose}
      onSave={() => {
        save('money', { ...v, name: v.name.trim() });
        // The money in a goal moves with it between Mine and Shared.
        for (const d of deposits) if (d.visibility !== v.visibility) save('money', { ...d, visibility: v.visibility });
        onClose();
      }}
      onDelete={() => {
        for (const d of deposits) del('money', d);
        del('money', init);
        onClose();
      }}
      canSave={!!v.name.trim() && v.target > 0}
    >
      <input className="title-input" dir="auto" autoFocus value={v.name} placeholder={t('wlGoalPh')} onChange={(e) => set({ name: e.target.value })} />
      <div className="emoji-grid cd-sticker-grid">
        {GOAL_STICKERS.map((k) => (
          <button
            type="button"
            key={k}
            className={k === countdownSticker(v.emoji) ? 'active' : ''}
            title={settings.language === 'he' ? STICKERS[k].labelHe : STICKERS[k].label}
            aria-label={settings.language === 'he' ? STICKERS[k].labelHe : STICKERS[k].label}
            onClick={() => set({ emoji: k })}
          >
            <StickerArt kind={k} size={34} />
          </button>
        ))}
      </div>
      <div className="grid-2">
        <Field label={t('wlTarget')}>
          <MoneyInput value={v.target} onChange={(target) => set({ target })} />
        </Field>
        <Field label={t('wlTargetDate')}>
          <input type="date" value={v.targetDate ?? ''} onChange={(e) => set({ targetDate: e.target.value || null })} />
        </Field>
      </div>
      <ShareToggle value={v.visibility} onChange={(visibility) => set({ visibility })} />
      {deposits.length > 0 && (
        <div className="wl-history">
          <span className="field-label">{t('wlHistory')}</span>
          <ul>
            {deposits.map((d) => (
              <li key={d.id}>
                <span className="wl-row-date">{day(d.date, true)}</span>
                <span className="wl-row-title">{d.by || t('wlMe')}</span>
                <span className="wl-row-amount" dir="ltr">
                  {fmt(d.amount)}
                </span>
                <IconButton icon="trash" label={t('delete')} onClick={() => del('money', d)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </EditorShell>
  );
}
