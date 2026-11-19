// Wallet: categories and the money math (pure functions, easy to test).
//
// Approach (common, proven personal-finance practice):
//  - Track every expense and income with a category.
//  - Split spending into NEEDS (essentials) and WANTS (discretionary), plus
//    SAVINGS — compared against the 50 / 30 / 20 guideline.
//  - Monthly budget per category, with progress against it.
//  - Savings goals (e.g. a house together, a car) with a target, progress and
//    how much to put aside per month to get there on time.
//  - Accounts (bank, cash, card, savings) so "how much money do I have" is one number.
//  - Every item is private or shared, so a couple can keep a joint plan
//    alongside personal ones.
import type { ISODate, MoneyAccount, MoneyBudget, MoneyGoal, MoneyGroup, MoneyItem, MoneyTxn } from './types';

export interface Category {
  id: string;
  emoji: string;
  group: MoneyGroup | 'income';
  en: string;
  he: string;
}

export const EXPENSE_CATEGORIES: Category[] = [
  { id: 'home', emoji: '🏠', group: 'need', en: 'Rent & home', he: 'שכירות ובית' },
  { id: 'groceries', emoji: '🛒', group: 'need', en: 'Groceries', he: 'סופר' },
  { id: 'bills', emoji: '💡', group: 'need', en: 'Bills', he: 'חשבונות' },
  { id: 'transport', emoji: '🚗', group: 'need', en: 'Transport', he: 'תחבורה' },
  { id: 'health', emoji: '💊', group: 'need', en: 'Health', he: 'בריאות' },
  { id: 'insurance', emoji: '🛡️', group: 'need', en: 'Insurance', he: 'ביטוח' },
  { id: 'education', emoji: '📚', group: 'need', en: 'Education', he: 'לימודים' },
  { id: 'eating', emoji: '🍽️', group: 'want', en: 'Eating out', he: 'מסעדות' },
  { id: 'shopping', emoji: '🛍️', group: 'want', en: 'Shopping', he: 'קניות' },
  { id: 'fun', emoji: '🎉', group: 'want', en: 'Fun & hobbies', he: 'בילויים ותחביבים' },
  { id: 'gaming', emoji: '🎮', group: 'want', en: 'Gaming', he: 'גיימינג' },
  { id: 'subscriptions', emoji: '📺', group: 'want', en: 'Subscriptions', he: 'מנויים' },
  { id: 'travel', emoji: '✈️', group: 'want', en: 'Travel', he: 'טיולים' },
  { id: 'gifts', emoji: '🎁', group: 'want', en: 'Gifts', he: 'מתנות' },
  { id: 'beauty', emoji: '💅', group: 'want', en: 'Beauty', he: 'טיפוח' },
  { id: 'other', emoji: '📦', group: 'want', en: 'Other', he: 'אחר' },
];

export const INCOME_CATEGORIES: Category[] = [
  { id: 'salary', emoji: '💼', group: 'income', en: 'Salary', he: 'משכורת' },
  { id: 'side', emoji: '🧾', group: 'income', en: 'Side income', he: 'הכנסה נוספת' },
  { id: 'gift-in', emoji: '🎁', group: 'income', en: 'Gift', he: 'מתנה' },
  { id: 'refund', emoji: '↩️', group: 'income', en: 'Refund', he: 'החזר' },
  { id: 'other-in', emoji: '💰', group: 'income', en: 'Other', he: 'אחר' },
];

const ALL = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
export const categoryOf = (id: string): Category => ALL.find((c) => c.id === id) ?? EXPENSE_CATEGORIES[EXPENSE_CATEGORIES.length - 1];

export type Scope = 'all' | 'private' | 'shared';
export function inScope<T extends MoneyItem>(items: T[], scope: Scope): T[] {
  return items.filter((x) => !x.deletedAt && (scope === 'all' || x.visibility === scope));
}

const of = <K extends MoneyItem['kind']>(items: MoneyItem[], kind: K) =>
  items.filter((x): x is Extract<MoneyItem, { kind: K }> => x.kind === kind && !x.deletedAt);

export const accounts = (items: MoneyItem[]) => of(items, 'account');
export const txns = (items: MoneyItem[]) => of(items, 'txn');
export const budgets = (items: MoneyItem[]) => of(items, 'budget');
export const goals = (items: MoneyItem[]) => of(items, 'goal');

export const monthKey = (d: ISODate) => d.slice(0, 7);

/** Current balance of an account: its starting balance plus/minus its transactions. */
export function accountBalance(acc: MoneyAccount, all: MoneyTxn[]): number {
  let b = acc.startBalance;
  for (const t of all) {
    if (t.accountId !== acc.id) continue;
    b += t.type === 'income' ? t.amount : -t.amount;
  }
  return round(b);
}

export function goalSaved(goal: MoneyGoal, all: MoneyTxn[]): number {
  return round(goal.startSaved + all.filter((t) => t.type === 'saving' && t.goalId === goal.id).reduce((s, t) => s + t.amount, 0));
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

export interface MonthSummary {
  income: number;
  spent: number;
  saved: number;
  needs: number;
  wants: number;
  byCategory: { id: string; amount: number }[];
}

export function monthSummary(all: MoneyTxn[], month: string): MonthSummary {
  const s: MonthSummary = { income: 0, spent: 0, saved: 0, needs: 0, wants: 0, byCategory: [] };
  const cat = new Map<string, number>();
  for (const t of all) {
    if (monthKey(t.date) !== month) continue;
    if (t.type === 'income') s.income += t.amount;
    else if (t.type === 'saving') s.saved += t.amount;
    else {
      s.spent += t.amount;
      if (categoryOf(t.category).group === 'need') s.needs += t.amount;
      else s.wants += t.amount;
      cat.set(t.category, (cat.get(t.category) ?? 0) + t.amount);
    }
  }
  s.byCategory = [...cat.entries()].map(([id, amount]) => ({ id, amount: round(amount) })).sort((a, b) => b.amount - a.amount);
  s.income = round(s.income);
  s.spent = round(s.spent);
  s.saved = round(s.saved);
  s.needs = round(s.needs);
  s.wants = round(s.wants);
  return s;
}

export interface BudgetStatus {
  budget: MoneyBudget;
  spent: number;
  left: number;
  ratio: number; // spent / limit
  state: 'ok' | 'close' | 'over';
}

export function budgetStatus(list: MoneyBudget[], all: MoneyTxn[], month: string): BudgetStatus[] {
  const sum = monthSummary(all, month);
  return list.map((b) => {
    const spent = sum.byCategory.find((c) => c.id === b.category)?.amount ?? 0;
    const ratio = b.monthly > 0 ? spent / b.monthly : 0;
    return { budget: b, spent, left: round(b.monthly - spent), ratio, state: ratio > 1 ? 'over' : ratio >= 0.8 ? 'close' : 'ok' };
  });
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
