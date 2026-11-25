// Owner (Nov 2026): a reminder that repeats while the last one is still
// unanswered shows as ONE card with "Missed N", not a pile.
import { describe, expect, it } from 'vitest';
import type { FiredAlert } from './types';
import { healthNudgesBetween, stackAlerts } from './alerts';
import { DEFAULT_SETTINGS } from './types';

const at = (kind: FiredAlert['kind'], sourceId: string, h: number): FiredAlert => ({
  key: `${sourceId}@${h}`,
  sourceId,
  kind,
  title: '',
  when: `2026-11-25T${String(h).padStart(2, '0')}:00`,
  dueAt: h * 3600000,
  minutesBefore: 0,
  sound: 'builtin:chime',
});

describe('one card per series', () => {
  it('5 hours of water nudges = one card, "missed 4"', () => {
    let shown: FiredAlert[] = [];
    for (let h = 10; h <= 14; h++) shown = stackAlerts(shown, [at('water', 'water', h)]);
    expect(shown).toHaveLength(1);
    expect(shown[0].when).toBe('2026-11-25T14:00');
    expect(shown[0].missed).toBe(4);
  });

  it('many at once (PC was asleep) also become one, newest kept', () => {
    const shown = stackAlerts([], [at('water', 'water', 12), at('water', 'water', 10), at('water', 'water', 11)]);
    expect(shown.map((a) => [a.when.slice(11), a.missed])).toEqual([['12:00', 2]]);
  });

  it('different series stay separate; the same alert never counts twice', () => {
    let shown = stackAlerts([], [at('med', 'pill-a', 9), at('med', 'pill-b', 9), at('event', 'dentist', 9)]);
    shown = stackAlerts(shown, [at('med', 'pill-a', 9), at('med', 'pill-a', 21)]);
    expect(shown).toHaveLength(3);
    expect(shown.find((a) => a.sourceId === 'pill-a')?.missed).toBe(1);
    expect(shown.find((a) => a.sourceId === 'pill-b')?.missed).toBeUndefined();
  });

  it('nothing missed = no count', () => {
    expect(stackAlerts([], [at('water', 'water', 10)])[0].missed).toBeUndefined();
  });
});

describe('water reminder hours (owner: 09:00 to 00:00 by default)', () => {
  const day = (h: number, m = 0) => new Date(2026, 10, 25, h, m).getTime();
  const nudges = (from?: string, to?: string) =>
    healthNudgesBetween({ settings: { ...DEFAULT_SETTINGS, healthEnabled: true, healthWaterNudge: true, healthWaterFrom: from, healthWaterTo: to }, health: [] } as never, day(0), day(23, 59) + 60_000).map((a) => a.when);

  it('default: only between 09:00 and midnight, the midnight one on the next date', () => {
    const w = nudges();
    expect(w.length).toBeGreaterThan(3);
    expect(w.every((x) => x.slice(11) > '09:00' || x.startsWith('2026-11-26T00:00'))).toBe(true);
    expect(w.filter((x) => x.startsWith('2026-11-25')).every((x) => x.slice(11) >= '09:00')).toBe(true);
  });

  it('own hours from Settings', () => {
    const w = nudges('10:00', '18:00').filter((x) => x.startsWith('2026-11-25'));
    expect(w.length).toBeGreaterThan(1);
    expect(w.every((x) => x.slice(11) > '10:00' && x.slice(11) <= '18:00')).toBe(true);
  });
});
