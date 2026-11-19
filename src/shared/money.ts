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

/** Still running (a payment cancelled today already counts as cancelled). */
export const isActive = (r: MoneyRecurring, today: ISODate) => !r.endDate || r.endDate > today;

/** What a payment costs per month on average (yearly ones spread over 12). */
export const perMonth = (r: MoneyRecurring) => round(r.cycle === 'monthly' ? r.amount : r.amount / 12);

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
