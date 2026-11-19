// Small, dependency-free date helpers working in local wall-clock time.
import type { ISODate, LocalDateTime } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function toLocalDateTime(d: Date): LocalDateTime {
  return `${toISODate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function parseLocal(s: LocalDateTime): Date {
  const [date, time = '00:00'] = s.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function addMonths(d: Date, n: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + n, 1, d.getHours(), d.getMinutes());
  const last = daysInMonth(r.getFullYear(), r.getMonth());
  r.setDate(Math.min(d.getDate(), last));
  return r;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function startOfWeek(d: Date, weekStart: 0 | 1): Date {
  const s = startOfDay(d);
  const diff = (s.getDay() - weekStart + 7) % 7;
  return addDays(s, -diff);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** 6 weeks × 7 days covering the month, starting on the configured week start. */
export function monthGrid(year: number, month: number, weekStart: 0 | 1): Date[] {
  const first = startOfWeek(new Date(year, month, 1), weekStart);
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

export function timeOf(s: LocalDateTime): string {
  return s.split('T')[1] ?? '00:00';
}

export function dateOf(s: LocalDateTime): ISODate {
  return s.slice(0, 10);
}

/** Whole days between two dates (b - a), ignoring DST shifts. */
export function dayDiff(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}
