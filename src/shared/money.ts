// Wallet: the money math (pure functions, easy to test).
//
// What the Wallet is for:
//  - A monthly spending limit, and every purchase typed in, to see how much
//    of it is already spent ("how much am I wasting this month").
//  - Repeating payments (card fees, rent, subscriptions) that count toward
//    every month automatically, plus a clear list of subscriptions.
//  - Savings goals. Shared goals collect money from both partners: each
//    "add money" is its own record, so the total always syncs correctly.
// Private items live on the main page; shared items only on the Shared page.
import type { ISODate, MoneyDeposit, MoneyGoal, MoneyItem, MoneyLimit, MoneyRecurring, MoneySpend, Visibility } from './types';

const of = <K extends MoneyItem['kind']>(items: MoneyItem[], kind: K, vis: Visibility) =>
  items.filter((x): x is Extract<MoneyItem, { kind: K }> => x.kind === kind && !x.deletedAt && x.visibility === vis);

export const limitOf = (items: MoneyItem[], vis: Visibility): MoneyLimit | undefined =>
  of(items, 'limit', vis).sort((a, b) => b.updatedAt - a.updatedAt)[0];
export const spendsOf = (items: MoneyItem[], vis: Visibility) => of(items, 'spend', vis);
export const recurringOf = (items: MoneyItem[], vis: Visibility) => of(items, 'recurring', vis);
export const goalsOf = (items: MoneyItem[], vis: Visibility) => of(items, 'goal', vis);
/** Deposits of a goal (whatever their own visibility says, they follow the goal). */
export const depositsOf = (items: MoneyItem[], goalId: string): MoneyDeposit[] =>
  items
    .filter((x): x is MoneyDeposit => x.kind === 'deposit' && !x.deletedAt && x.goalId === goalId)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

export const monthKey = (d: ISODate) => d.slice(0, 7);
const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (y: number, m1: number) => new Date(y, m1, 0).getDate(); // m1 = 1..12

/** The day this payment is charged in `month` (YYYY-MM), or null if not charged that month. */
export function chargeDateIn(r: MoneyRecurring, month: string): ISODate | null {
  const [y, m] = month.split('-').map(Number);
  const [, sm, sd] = r.startDate.split('-').map(Number);
  if (r.cycle === 'yearly' && m !== sm) return null;
  const date = `${y}-${pad(m)}-${pad(Math.min(sd, daysIn(y, m)))}`;
  if (date < r.startDate) return null;
  if (r.endDate && date > r.endDate) return null;
  return date;
}

export interface Charge {
  rec: MoneyRecurring;
  date: ISODate;
}
export function chargesIn(items: MoneyItem[], vis: Visibility, month: string): Charge[] {
  const out: Charge[] = [];
  for (const rec of recurringOf(items, vis)) {
    const date = chargeDateIn(rec, month);
    if (date) out.push({ rec, date });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface MonthSpending {
  spends: MoneySpend[];
  charges: Charge[];
  total: number;
  spendTotal: number;
  chargeTotal: number;
}
export function monthSpending(items: MoneyItem[], vis: Visibility, month: string): MonthSpending {
  const spends = spendsOf(items, vis)
    .filter((s) => monthKey(s.date) === month)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const charges = chargesIn(items, vis, month);
  const spendTotal = round(spends.reduce((s, x) => s + x.amount, 0));
  const chargeTotal = round(charges.reduce((s, x) => s + x.rec.amount, 0));
  return { spends, charges, spendTotal, chargeTotal, total: round(spendTotal + chargeTotal) };
}

export interface LimitStatus {
  limit: number;
  spent: number;
  left: number; // negative = over
  ratio: number;
  state: 'ok' | 'close' | 'over';
}
export function limitStatus(limit: number, spent: number): LimitStatus {
  const ratio = limit > 0 ? spent / limit : 0;
  return { limit, spent, left: round(limit - spent), ratio, state: ratio > 1 ? 'over' : ratio >= 0.8 ? 'close' : 'ok' };
}

/** Next charge on or after `today`, or null if it was cancelled before that. */
export function nextCharge(r: MoneyRecurring, today: ISODate): ISODate | null {
  const [y, m] = today.split('-').map(Number);
  for (let i = 0; i < 13; i++) {
    const d = new Date(y, m - 1 + i, 1);
    const date = chargeDateIn(r, `${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    if (date && date >= today) return date;
    if (r.endDate && `${d.getFullYear()}-${pad(d.getMonth() + 1)}` > monthKey(r.endDate)) return null;
  }
  return null;
}

/** Every day this payment was charged, from its start up to `until` (inclusive). */
export function chargeDates(r: MoneyRecurring, until: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const [sy, sm] = r.startDate.split('-').map(Number);
  const last = r.endDate && r.endDate < until ? r.endDate : until;
  for (let i = 0; ; i++) {
    const d = new Date(sy, sm - 1 + i, 1);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    if (key > monthKey(last)) break;
    const date = chargeDateIn(r, key);
    if (date && date <= last) out.push(date);
  }
  return out;
}

const dayBefore = (d: ISODate) => {
  const [y, m, dd] = d.split('-').map(Number);
  const x = new Date(y, m - 1, dd - 1);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

/** True when an edit changes what is charged (price, how often, or on which day). */
export const changesCharges = (a: MoneyRecurring, b: MoneyRecurring) => a.amount !== b.amount || a.cycle !== b.cycle || a.startDate !== b.startDate;

/**
 * Change a payment "from now on" and keep its history:
 *  - the old version stops after today (what was already charged stays in
 *    its months; nothing more is counted under the old price / schedule),
 *  - a new version starts at its first charge on or after today.
 * So switching monthly -> yearly stops the monthly charges right away and
 * counts the full yearly price once, on its renewal date.
 */
export function splitFromNow(old: MoneyRecurring, edited: MoneyRecurring, today: ISODate, meta: { id: string; createdAt: number; updatedAt: number }): [MoneyRecurring, MoneyRecurring] {
  const start = edited.startDate >= today ? edited.startDate : (nextCharge({ ...edited, endDate: null }, today) ?? today);
  // Old version: charges up to today stay; if the new one charges today, the old one stops yesterday (no double charge).
  const stop = start <= today ? dayBefore(start) : today;
  const ended: MoneyRecurring = {
    ...old,
    replacedBy: meta.id,
    title: edited.title,
    note: edited.note,
    subscription: edited.subscription,
    visibility: edited.visibility,
    endDate: old.endDate && old.endDate < stop ? old.endDate : stop,
  };
  const next: MoneyRecurring = { ...edited, ...meta, startDate: start, replacedBy: null };
  return [ended, next];
}

/**
 * When an existing monthly payment becomes yearly, the yearly renewal should
 * be its next payment date (not the month it first started in).
 */
export function yearlyStartFor(r: MoneyRecurring, today: ISODate): ISODate {
  if (r.cycle !== 'monthly') return r.startDate;
  return nextCharge({ ...r, endDate: null }, today) ?? r.startDate;
}

/** A payment plus the earlier parts it continues (after price changes), oldest first. */
export function paymentChain(items: MoneyItem[], r: MoneyRecurring): MoneyRecurring[] {
  const all = items.filter((x): x is MoneyRecurring => x.kind === 'recurring' && !x.deletedAt);
  const chain = [r];
  for (let cur = r, guard = 0; guard < 50; guard++) {
    const prev = all.find((x) => x.replacedBy === cur.id);
    if (!prev) break;
    chain.unshift(prev);
    cur = prev;
  }
  return chain;
}

/** The current part of a payment (follows price changes forward). */
export function latestPart(items: MoneyItem[], r: MoneyRecurring): MoneyRecurring {
  let cur = r;
  for (let guard = 0; cur.replacedBy && guard < 50; guard++) {
    const next = items.find((x): x is MoneyRecurring => x.kind === 'recurring' && !x.deletedAt && x.id === cur.replacedBy);
    if (!next) break;
    cur = next;
  }
  return cur;
}

/** Every payment made so far for this payment (all its parts), newest first. */
export function paymentHistory(items: MoneyItem[], r: MoneyRecurring, today: ISODate): { date: ISODate; amount: number }[] {
  return paymentChain(items, r)
    .flatMap((x) => chargeDates(x, today).map((date) => ({ date, amount: x.amount })))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Still running (a payment cancelled today already counts as cancelled; an old price part never does). */
export const isActive = (r: MoneyRecurring, today: ISODate) => !r.replacedBy && (!r.endDate || r.endDate > today);

/**
 * What the running payments cost: `monthly` = every-month payments only
 * (yearly ones are NOT spread over the months); `yearly` = the full cost of a
 * whole year (monthly × 12 + each yearly payment once).
 */
export function recurringTotals(list: MoneyRecurring[]): { monthly: number; yearly: number } {
  let monthly = 0;
  let yearlyOnly = 0;
  for (const r of list) {
    if (r.cycle === 'monthly') monthly += r.amount;
    else yearlyOnly += r.amount;
  }
  return { monthly: round(monthly), yearly: round(monthly * 12 + yearlyOnly) };
}

export interface YearSpending {
  year: number;
  /** Spent per month, Jan..Dec (purchases + payments charged that month). */
  byMonth: number[];
  /** Sum of the month totals (for the current year: January up to this month). */
  total: number;
  spendTotal: number;
  chargeTotal: number;
}
/** A year's spending. For the current year, months after this one don't count yet ("so far"). */
export function yearSpending(items: MoneyItem[], vis: Visibility, year: number, today: ISODate): YearSpending {
  const byMonth: number[] = [];
  let spendTotal = 0;
  let chargeTotal = 0;
  const thisMonth = monthKey(today);
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${pad(m)}`;
    if (key > thisMonth) {
      byMonth.push(0);
      continue;
    }
    // Same numbers as each month's own total, so the two always agree.
    const ms = monthSpending(items, vis, key);
    spendTotal += ms.spendTotal;
    chargeTotal += ms.chargeTotal;
    byMonth.push(ms.total);
  }
  return { year, byMonth, spendTotal: round(spendTotal), chargeTotal: round(chargeTotal), total: round(spendTotal + chargeTotal) };
}

export function goalSaved(items: MoneyItem[], goal: MoneyGoal): number {
  return round(depositsOf(items, goal.id).reduce((s, d) => s + d.amount, 0));
}

/** Total each person put into a goal, biggest first. */
export function savedByPerson(items: MoneyItem[], goal: MoneyGoal): { by: string; amount: number }[] {
  const m = new Map<string, number>();
  for (const d of depositsOf(items, goal.id)) m.set(d.by, (m.get(d.by) ?? 0) + d.amount);
  return [...m.entries()].map(([by, amount]) => ({ by, amount: round(amount) })).sort((a, b) => b.amount - a.amount);
}

/** How much to put aside each month to reach the goal by its date (null without a date). */
export function goalMonthly(goal: MoneyGoal, saved: number, today: Date): number | null {
  if (!goal.targetDate) return null;
  const left = goal.target - saved;
  if (left <= 0) return 0;
  const [y, m] = goal.targetDate.split('-').map(Number);
  const months = (y - today.getFullYear()) * 12 + (m - 1 - today.getMonth());
  return round(left / Math.max(1, months));
}

export const round = (n: number) => Math.round(n * 100) / 100;

export function formatMoney(n: number, currency: string, locale: string, compact = false): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: compact || Number.isInteger(n) ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/**
 * v4: the Wallet was simplified. Old items are converted in place (same ids,
 * so sync updates them) and things that no longer exist get a tombstone.
 *  - expenses -> purchases; money put into a goal -> deposits
 *  - a goal's "already saved" -> a first deposit
 *  - accounts, budgets and income -> removed
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateMoneyToV4(list: any[], now = Date.now()): MoneyItem[] {
  const out: MoneyItem[] = [];
  const bump = (x: { updatedAt?: number }) => Math.max(now, (x.updatedAt ?? 0) + 1);
  for (const x of list) {
    if (!x || typeof x !== 'object') continue;
    const meta = { id: x.id, createdAt: x.createdAt ?? now, deletedAt: x.deletedAt ?? null, ownerId: x.ownerId ?? 'local', visibility: x.visibility === 'shared' ? 'shared' : 'private' } as const;
    const gone = { ...meta, kind: 'spend', title: '', amount: 0, date: '1970-01-01', note: '', updatedAt: bump(x), deletedAt: x.deletedAt ?? now } as MoneySpend;
    switch (x.kind) {
      case 'txn':
        if (x.type === 'expense') out.push({ ...meta, updatedAt: bump(x), kind: 'spend', title: x.note || '', amount: Number(x.amount) || 0, date: x.date, note: '' });
        else if (x.type === 'saving' && x.goalId) out.push({ ...meta, updatedAt: bump(x), kind: 'deposit', goalId: x.goalId, amount: Number(x.amount) || 0, date: x.date, by: '', byUid: null });
        else out.push(gone);
        break;
      case 'goal':
        out.push({ ...meta, updatedAt: bump(x), kind: 'goal', name: x.name ?? '', emoji: x.emoji ?? '🎯', target: Number(x.target) || 0, targetDate: x.targetDate ?? null });
        if (!x.deletedAt && Number(x.startSaved) > 0) {
          const d = new Date(x.createdAt ?? now);
          out.push({ ...meta, id: `${x.id}-start`, updatedAt: now, createdAt: x.createdAt ?? now, kind: 'deposit', goalId: x.id, amount: Number(x.startSaved), date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, by: '', byUid: null });
        }
        break;
      case 'account':
      case 'budget':
        out.push(gone);
        break;
      default:
        out.push(x as MoneyItem);
    }
  }
  return out;
}
