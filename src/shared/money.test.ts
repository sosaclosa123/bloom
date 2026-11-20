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
  chargeDates,
  splitFromNow,
  yearlyStartFor,
  paymentHistory,
  latestPart,
  isActive,
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

describe('wallet: payment history', () => {
  const netflix = rec({ amount: 50, startDate: '2026-08-05' });

  it('cancelling keeps the months already paid and stops after', () => {
    const cancelled = { ...netflix, endDate: '2026-11-19' }; // cancelled on the 19th, after the 5th was paid
    expect(chargeDateIn(cancelled, '2026-11')).toBe('2026-11-05');
    expect(chargeDateIn(cancelled, '2026-12')).toBeNull();
    expect(chargeDates(cancelled, '2027-03-01')).toEqual(['2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05']);
    // cancelled on the 3rd, before November's charge: November is not paid
    expect(chargeDateIn({ ...netflix, endDate: '2026-11-03' }, '2026-11')).toBeNull();
  });

  it('a new price applies from now on, past months keep the old one', () => {
    const meta = { id: 'new', createdAt: 9, updatedAt: 9 };
    const [ended, next] = splitFromNow(netflix, { ...netflix, amount: 60 }, '2026-11-19', meta);
    expect(ended).toMatchObject({ amount: 50, endDate: '2026-11-19' }); // stops after today
    expect(next).toMatchObject({ id: 'new', amount: 60, startDate: '2026-12-05', endDate: null });
    const items: MoneyItem[] = [ended, next];
    expect(monthSpending(items, 'private', '2026-10').total).toBe(50);
    expect(monthSpending(items, 'private', '2026-11').total).toBe(50);
    expect(monthSpending(items, 'private', '2026-12').total).toBe(60);
    expect(monthSpending(items, 'private', '2027-01').total).toBe(60);
    // Only the new part is "running" (no double counting in the totals).
    expect(isActive(ended, '2026-11-19')).toBe(false);
    expect(isActive(next, '2026-11-19')).toBe(true);
    expect(recurringTotals([ended, next].filter((r) => isActive(r, '2026-11-19'))).monthly).toBe(60);
    // One history for the whole payment, old and new price parts together.
    expect(latestPart(items, ended).id).toBe('new');
    expect(paymentHistory(items, next, '2027-01-10').map((h) => `${h.date}:${h.amount}`)).toEqual([
      '2027-01-05:60',
      '2026-12-05:60',
      '2026-11-05:50',
      '2026-10-05:50',
      '2026-09-05:50',
      '2026-08-05:50',
    ]);
  });

  it('a split never re-opens a payment that was already cancelled', () => {
    const old = { ...netflix, endDate: '2026-09-10' };
    const [ended] = splitFromNow(old, { ...old, amount: 60 }, '2026-11-19', { id: 'n', createdAt: 1, updatedAt: 1 });
    expect(ended.endDate).toBe('2026-09-10');
  });
});

describe('wallet: switching monthly <-> yearly', () => {
  const meta = { id: 'y', createdAt: 9, updatedAt: 9 };
  const netflix = rec({ amount: 55, startDate: '2026-03-05' }); // monthly on the 5th

  it('monthly -> yearly: monthly charges stop now, the yearly one is counted once on its renewal', () => {
    const today = '2026-11-20';
    const yearlyFrom = yearlyStartFor(netflix, today);
    expect(yearlyFrom).toBe('2026-12-05'); // the next payment date
    const [ended, next] = splitFromNow(netflix, { ...netflix, cycle: 'yearly', amount: 500, startDate: yearlyFrom }, today, meta);
    const items: MoneyItem[] = [ended, next];
    expect(monthSpending(items, 'private', '2026-11').total).toBe(55); // already paid on the 5th
    expect(monthSpending(items, 'private', '2026-12').total).toBe(500); // renewal
    for (const m of ['2027-01', '2027-02', '2027-06', '2027-11']) expect(monthSpending(items, 'private', m).total).toBe(0);
    expect(monthSpending(items, 'private', '2027-12').total).toBe(500);
    expect(recurringTotals([next])).toEqual({ monthly: 0, yearly: 500 });
  });

  it('yearly -> monthly: monthly charges start from the next payment day', () => {
    const domain = rec({ amount: 120, cycle: 'yearly', startDate: '2025-04-10' });
    const today = '2026-11-20';
    const [ended, next] = splitFromNow(domain, { ...domain, cycle: 'monthly', amount: 12 }, today, meta);
    const items: MoneyItem[] = [ended, next];
    expect(monthSpending(items, 'private', '2026-04').total).toBe(120); // past yearly payment kept
    expect(monthSpending(items, 'private', '2026-11').total).toBe(0); // next monthly day is 10 Dec
    expect(monthSpending(items, 'private', '2026-12').total).toBe(12);
    expect(monthSpending(items, 'private', '2027-04').total).toBe(12); // no more yearly charge
  });

  it('no double charge when the new schedule charges today', () => {
    const r = rec({ amount: 50, startDate: '2026-01-20' }); // monthly on the 20th
    const [ended, next] = splitFromNow(r, { ...r, amount: 60 }, '2026-11-20', meta);
    expect(monthSpending([ended, next], 'private', '2026-11').total).toBe(60);
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
