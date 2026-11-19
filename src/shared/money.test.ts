import { describe, expect, it } from 'vitest';
import { newMeta } from './db';
import { accountBalance, budgetStatus, goalMonthly, goalSaved, inScope, monthSummary } from './money';
import type { MoneyAccount, MoneyBudget, MoneyGoal, MoneyTxn } from './types';

const tx = (p: Partial<MoneyTxn>): MoneyTxn => ({ ...newMeta(), kind: 'txn', type: 'expense', amount: 0, category: 'other', date: '2026-11-10', note: '', accountId: null, goalId: null, ...p });

describe('wallet math', () => {
  const acc: MoneyAccount = { ...newMeta(), kind: 'account', name: 'Bank', type: 'bank', startBalance: 1000, emoji: '🏦' };
  const goal: MoneyGoal = { ...newMeta(), visibility: 'shared', kind: 'goal', name: 'House', emoji: '🏠', target: 100000, startSaved: 20000, targetDate: '2028-11-01' };
  const list = [
    tx({ type: 'income', amount: 8000, category: 'salary', accountId: acc.id }),
    tx({ amount: 2500, category: 'home', accountId: acc.id }),
    tx({ amount: 600.5, category: 'groceries', accountId: acc.id }),
    tx({ amount: 240, category: 'gaming' }),
    tx({ amount: 99.5, category: 'eating', date: '2026-10-30' }), // other month
    tx({ type: 'saving', amount: 1000, goalId: goal.id, category: 'other', accountId: acc.id }),
  ];

  it('summarises a month: needs, wants, savings, categories', () => {
    const s = monthSummary(list, '2026-11');
    expect(s).toMatchObject({ income: 8000, spent: 3340.5, saved: 1000, needs: 3100.5, wants: 240 });
    expect(s.byCategory[0]).toEqual({ id: 'home', amount: 2500 });
  });
  it('balances accounts and goals', () => {
    expect(accountBalance(acc, list)).toBe(1000 + 8000 - 2500 - 600.5 - 1000);
    expect(goalSaved(goal, list)).toBe(21000);
    expect(goalMonthly(goal, 21000, new Date(2026, 10, 19))).toBe(Math.round((79000 / 24) * 100) / 100);
  });
  it('tracks budgets', () => {
    const b: MoneyBudget = { ...newMeta(), kind: 'budget', category: 'gaming', monthly: 200 };
    const g: MoneyBudget = { ...newMeta(), kind: 'budget', category: 'groceries', monthly: 700 };
    const [gaming, groceries] = budgetStatus([b, g], list, '2026-11');
    expect(gaming).toMatchObject({ spent: 240, left: -40, state: 'over' });
    expect(groceries.state).toBe('close');
  });
  it('filters private / shared', () => {
    expect(inScope([goal, acc], 'shared')).toEqual([goal]);
    expect(inScope([goal, acc], 'private')).toEqual([acc]);
  });
});
