import { describe, expect, it } from 'vitest';
import { translate } from '../i18n/strings';
import { newMeta } from './db';
import type { CalendarEvent, Countdown } from './types';
import { countdownsOn, repeatLabel } from './schedule';

const cd = (p: Partial<Countdown>): Countdown => ({ ...newMeta(), title: 'x', date: '2026-12-01', emoji: '🎂', yearly: false, ...p });

describe('countdowns on the calendar', () => {
  it('one-time: only on its date; yearly: every year', () => {
    const trip = cd({ title: 'Trip', date: '2026-12-01' });
    const bday = cd({ title: 'Birthday', date: '1999-03-05', yearly: true });
    expect(countdownsOn([trip, bday], '2026-12-01')).toEqual([trip]);
    expect(countdownsOn([trip, bday], '2027-12-01')).toEqual([]);
    expect(countdownsOn([trip, bday], '2026-03-05')).toEqual([bday]);
    expect(countdownsOn([trip, bday], '2031-03-05')).toEqual([bday]);
  });
  it('29 February shows on 28 February in other years', () => {
    const leap = cd({ date: '2024-02-29', yearly: true });
    expect(countdownsOn([leap], '2026-02-28')).toEqual([leap]);
    expect(countdownsOn([leap], '2028-02-29')).toEqual([leap]);
    expect(countdownsOn([leap], '2028-02-28')).toEqual([]);
  });
  it('deleted ones are hidden', () => {
    expect(countdownsOn([cd({ deletedAt: 5 })], '2026-12-01')).toEqual([]);
  });
});

describe('repeat labels', () => {
  const ev = (p: Partial<CalendarEvent>) => ({ ...newMeta(), title: '', allDay: false, start: '', end: '', color: 'mint', notes: '', location: '', repeat: 'weekly', remindBefore: [], sound: '', ...p }) as CalendarEvent;
  const en = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('en', k, v);
  const he = (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('he', k, v);
  it('reads naturally', () => {
    expect(repeatLabel(ev({}), en)).toBe('Every week');
    expect(repeatLabel(ev({ repeatEvery: 2 }), en)).toBe('Every 2 weeks');
    expect(repeatLabel(ev({ repeat: 'daily', repeatEvery: 3 }), he)).toBe('כל 3 ימים');
  });
});
