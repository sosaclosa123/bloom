// Small pure helpers for the calendar and the Scheduled tab.
import type { StringKey } from '../i18n/strings';
import { everyOf } from './recurrence';
import type { CalendarEvent, ISODate } from './types';

/**
 * Countdowns that fall on `date` (shown on the calendar). Yearly ones (like a
 * birthday) show every year on the same day; 29 Feb shows on 28 Feb otherwise.
 */
export function countdownsOn<T extends { date: ISODate; yearly: boolean; deletedAt?: number | null }>(list: T[], date: ISODate): T[] {
  const [y, m, d] = date.split('-').map(Number);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return list.filter((c) => {
    if (c.deletedAt) return false;
    if (!c.yearly) return c.date === date;
    const [, cm, cd] = c.date.split('-').map(Number);
    if (cm === 2 && cd === 29 && !leap) return m === 2 && d === 28;
    return cm === m && cd === d;
  });
}

/** "Every week", "Every 2 weeks", "כל שבועיים"… */
export function repeatLabel(ev: CalendarEvent, t: (k: StringKey, v?: Record<string, string | number>) => string): string {
  const n = everyOf(ev.repeatEvery);
  if (n === 1 || ev.repeat === 'none') return t(`repeat_${ev.repeat}` as StringKey);
  const unit = ev.repeat === 'hebrewYearly' ? 'yearly' : ev.repeat;
  return t('repeatEveryN', { n, u: t(`repeatUnit_${unit}_n` as StringKey) });
}

