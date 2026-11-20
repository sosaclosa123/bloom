import { describe, expect, it } from 'vitest';
import { newMeta, normalizeSnapshot } from './db';
import {
  chargeDateIn,
  goalMonthly,
  goalSaved,
  limitOf,
  limitStatus,
  migrateMoneyToV4,
  monthSpending,
  nextCharge,
  recurringTotals,
  yearSpending,
  savedByPerson,
} from './money';
import type { MoneyDeposit, MoneyGoal, MoneyItem, MoneyRecurring, MoneySpend } from './types';

const spend = (p: Partial<MoneySpend>): MoneySpend => ({ ...newMeta(), kind: 'spend', title: 'x', amount: 0, date: '2026-11-10', note: '', ...p });
const rec = (p: Partial<MoneyRecurring>): MoneyRecurring => ({
  ...newMeta(),
  kind: 'recurring',
  title: 'Netflix',
  amount: 50,
  cycle: 'monthly',
  startDate: '2026-01-31',
  endDate: null,
  subscription: true,
  note: '',
  ...p,
});
const dep = (goalId: string, amount: number, by: string, vis: 'private' | 'shared' = 'shared'): MoneyDeposit => ({
  ...newMeta(),
  visibility: vis,
  kind: 'deposit',
  goalId,
  amount,
  date: '2026-11-10',
  by,
  byUid: null,
});

describe('wallet: spending vs. the monthly limit', () => {
  const items: MoneyItem[] = [
    { ...newMeta(), kind: 'limit', amount: 1000 },
    spend({ amount: 120.5 }),
    spend({ amount: 300 }),
    spend({ amount: 99, date: '2026-10-30' }), // other month
    spend({ amount: 999, visibility: 'shared' }), // shared: not on my page
    spend({ amount: 40, deletedAt: 5 }), // deleted
    rec({ amount: 50 }), // monthly on the 31st -> 30 Nov
    rec({ title: 'Domain', amount: 60, cycle: 'yearly', startDate: '2025-11-02' }), // yearly, November
    rec({ title: 'Gym', amount: 150, cycle: 'monthly', startDate: '2026-12-01' }), // starts later
    rec({ title: 'Old', amount: 30, startDate: '2026-01-05', endDate: '2026-10-31' }), // cancelled
  ];

  it('adds purchases and the month’s repeating payments, private only', () => {
    const m = monthSpending(items, 'private', '2026-11');
    expect(m.spends.map((s) => s.amount)).toEqual([120.5, 300]);
    expect(m.charges.map((c) => [c.rec.title, c.date])).toEqual([
      ['Domain', '2026-11-02'],
      ['Netflix', '2026-11-30'],
    ]);
    expect(m.total).toBe(120.5 + 300 + 50 + 60);
    expect(monthSpending(items, 'shared', '2026-11').total).toBe(999);
  });

  it('compares with the limit', () => {
    const lim = limitOf(items, 'private')!.amount;
    expect(limitStatus(lim, 530.5)).toMatchObject({ left: 469.5, state: 'ok' });
    expect(limitStatus(lim, 850).state).toBe('close');
    expect(limitStatus(lim, 1200)).toMatchObject({ left: -200, state: 'over' });
    expect(limitOf(items, 'shared')).toBeUndefined();
  });

  it('charges on the right day, also in short months', () => {
    const r = rec({});
    expect(chargeDateIn(r, '2026-02')).toBe('2026-02-28');
    expect(chargeDateIn(r, '2025-12')).toBeNull(); // before it started
    expect(nextCharge(r, '2026-11-19')).toBe('2026-11-30');
    expect(nextCharge(rec({ endDate: '2026-11-10' }), '2026-11-19')).toBeNull();
  });
});

describe('wallet: yearly payments', () => {
  // A yearly payment renewed every December, plus a monthly one.
  const items: MoneyItem[] = [
    rec({ title: 'Antivirus', amount: 240, cycle: 'yearly', startDate: '2025-12-10' }),
    rec({ title: 'Spotify', amount: 20, cycle: 'monthly', startDate: '2026-01-15' }),
    spend({ amount: 100, date: '2026-03-02' }),
  ];

  it('counts only in its own month, never spread over the others', () => {
    expect(monthSpending(items, 'private', '2026-11').total).toBe(20); // just Spotify
    expect(monthSpending(items, 'private', '2026-12').total).toBe(260); // + Antivirus, in December only
    expect(monthSpending(items, 'private', '2026-12').charges.map((c) => c.date)).toEqual(['2026-12-10', '2026-12-15']);
  });

  it('shows what the running payments cost a month and a whole year', () => {
    const list = items.filter((x): x is MoneyRecurring => x.kind === 'recurring');
    expect(recurringTotals(list)).toEqual({ monthly: 20, yearly: 20 * 12 + 240 });
  });

  it('adds up a year from its months (so far, for the current year)', () => {
    const y = yearSpending(items, 'private', 2026, '2026-11-20');
    expect(y.byMonth).toEqual([20, 20, 120, 20, 20, 20, 20, 20, 20, 20, 20, 0]); // December not reached yet
    expect(y.total).toBe(y.byMonth.reduce((a, b) => a + b, 0));
    expect(y).toMatchObject({ spendTotal: 100, chargeTotal: 220 });
    const full = yearSpending(items, 'private', 2026, '2027-01-05'); // a past year: all 12 months
    expect(full.byMonth[11]).toBe(260);
    expect(full.total).toBe(100 + 20 * 12 + 240);
  });
});

describe('wallet: savings goals', () => {
  const house: MoneyGoal = { ...newMeta(), visibility: 'shared', kind: 'goal', name: 'House', emoji: '🏠', target: 100000, targetDate: '2028-11-01' };
  const items: MoneyItem[] = [house, dep(house.id, 500, 'Noa'), dep(house.id, 200, 'Ido'), dep(house.id, 300, 'Noa'), dep('other', 5, 'X')];

  it('sums everyone’s deposits', () => {
    expect(goalSaved(items, house)).toBe(1000);
    expect(savedByPerson(items, house)).toEqual([
      { by: 'Noa', amount: 800 },
      { by: 'Ido', amount: 200 },
    ]);
    expect(goalMonthly(house, 1000, new Date(2026, 10, 19))).toBe(Math.round((99000 / 24) * 100) / 100);
  });
});

describe('wallet: moving old data to the simpler Wallet (v4)', () => {
  const old = [
    { id: 'a', kind: 'account', name: 'Bank', type: 'bank', startBalance: 5, emoji: '🏦', createdAt: 1, updatedAt: 1, deletedAt: null, ownerId: 'local', visibility: 'private' },
    { id: 'b', kind: 'budget', category: 'fun', monthly: 300, createdAt: 1, updatedAt: 1, deletedAt: null, ownerId: 'local', visibility: 'private' },
    { id: 'e', kind: 'txn', type: 'expense', amount: 42, category: 'eating', date: '2026-11-03', note: 'Pizza', accountId: 'a', goalId: null, createdAt: 1, updatedAt: 1, deletedAt: null, ownerId: 'local', visibility: 'private' },
    { id: 'i', kind: 'txn', type: 'income', amount: 9000, category: 'salary', date: '2026-11-01', note: '', accountId: 'a', goalId: null, createdAt: 1, updatedAt: 1, deletedAt: null, ownerId: 'local', visibility: 'private' },
    { id: 'g', kind: 'goal', name: 'Trip', emoji: '✈️', target: 4000, startSaved: 250, targetDate: null, createdAt: 1, updatedAt: 1, deletedAt: null, ownerId: 'local', visibility: 'shared' },
    { id: 's', kind: 'txn', type: 'saving', amount: 100, category: 'other', date: '2026-11-04', note: '', accountId: null, goalId: 'g', createdAt: 1, updatedAt: 1, deletedAt: null, ownerId: 'local', visibility: 'shared' },
  ];
  const now = 1_000_000;
  const out = migrateMoneyToV4(old, now);
  const byId = (id: string) => out.find((x) => x.id === id)!;

  it('keeps purchases and savings, removes the rest (with tombstones for sync)', () => {
    expect(byId('e')).toMatchObject({ kind: 'spend', title: 'Pizza', amount: 42, date: '2026-11-03', deletedAt: null });
    expect(byId('s')).toMatchObject({ kind: 'deposit', goalId: 'g', amount: 100, visibility: 'shared' });
    expect(byId('g')).toMatchObject({ kind: 'goal', name: 'Trip', target: 4000 });
    expect(byId('g-start')).toMatchObject({ kind: 'deposit', goalId: 'g', amount: 250 });
    for (const id of ['a', 'b', 'i']) expect(byId(id).deletedAt).toBe(now);
    expect(out.every((x) => x.updatedAt >= now)).toBe(true);
  });

  it('runs once when an old file is opened', () => {
    const snap = normalizeSnapshot({ schemaVersion: 3, money: old });
    expect(goalSaved(snap.money, byId('g') as MoneyGoal)).toBe(350);
    expect(normalizeSnapshot(snap).money).toEqual(snap.money); // already v4: unchanged
  });
});
