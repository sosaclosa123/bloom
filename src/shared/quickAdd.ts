// "Quick add": turns a short sentence into an event.
//   "dinner fri 20:00 remind 1h"      -> Friday 20:00–21:00, reminder 60 min before
//   "gym tomorrow 7-8:30 every week"  -> repeating weekly
//   "ארוחת ערב מחר 20:00 תזכורת 30 דק" -> Hebrew works too
import { addDays, startOfDay, toISODate } from './dates';
import type { ISODate, Repeat } from './types';

export interface QuickAddResult {
  title: string;
  date: ISODate;
  start: string | null; // "HH:MM" or null for all-day
  end: string | null;
  remindBefore: number[] | null; // null = use default
  repeat: Repeat;
  /** Which parts were understood, for the live preview. */
  understood: string[];
}

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, sat: 6, saturday: 6,
  'ראשון': 0, 'שני': 1, 'שלישי': 2, 'רביעי': 3, 'חמישי': 4, 'שישי': 5, 'שבת': 6,
};

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5,
  jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9,
  nov: 10, november: 10, dec: 11, december: 11,
};

const pad = (n: number) => String(n).padStart(2, '0');
// Hebrew prefixes: "ב" (at/on), "ב-" — stripped from the start of a token.
const HE_PREFIX = '(?:ב-?|ה-?|ל-?)?';
// Word boundary that also works for Hebrew letters.
const B = '(?<![\\p{L}\\d])';
const E = '(?![\\p{L}\\d])';

function unitToMinutes(n: number, unit: string): number {
  const u = unit.toLowerCase();
  if (/^(d|day|days|יום|ימים)$/.test(u)) return n * 1440;
  if (/^(h|hr|hrs|hour|hours|שעה|שעות)$/.test(u)) return n * 60;
  return n;
}

function parseClock(h: string, m: string | undefined, ampm: string | undefined): string | null {
  let hh = Number(h);
  const mm = m ? Number(m) : 0;
  if (ampm) {
    const pm = ampm.toLowerCase().startsWith('p');
    if (hh === 12) hh = pm ? 12 : 0;
    else if (pm) hh += 12;
  }
  if (hh > 23 || mm > 59) return null;
  return `${pad(hh)}:${pad(mm)}`;
}

export function parseQuickAdd(input: string, now = new Date()): QuickAddResult {
  let s = ` ${input.trim()} `;
  const understood: string[] = [];
  const today = startOfDay(now);
  let date: Date | null = null;
  let start: string | null = null;
  let end: string | null = null;
  let remindBefore: number[] | null = null;
  let repeat: Repeat = 'none';

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = s.match(re);
    if (m && fn(m) !== false) s = s.replace(m[0], ' ');
  };

  // Repeat: "every week", "weekly", "כל שבוע"
  take(new RegExp(`${B}(?:every|each|כל)\\s+(day|week|month|year|יום|שבוע|חודש|שנה)${E}`, 'iu'), (m) => {
    const w = m[1].toLowerCase();
    repeat = /day|יום/.test(w) ? 'daily' : /week|שבוע/.test(w) ? 'weekly' : /month|חודש/.test(w) ? 'monthly' : 'yearly';
    understood.push('repeat');
  });
  take(new RegExp(`${B}(daily|weekly|monthly|yearly|annually)${E}`, 'iu'), (m) => {
    const w = m[1].toLowerCase();
    repeat = w === 'daily' ? 'daily' : w === 'weekly' ? 'weekly' : w === 'monthly' ? 'monthly' : 'yearly';
    understood.push('repeat');
  });

  // Reminder: "remind 1h", "remind me 30 min before", "תזכורת 30 דק"
  take(
    new RegExp(
      `${B}(?:remind(?:\\s+me)?|reminder|alert|תזכיר(?:\\s+לי)?|תזכורת)(?:\\s*(\\d+)?\\s*(m|min|mins|minutes?|h|hrs?|hours?|d|days?|דק(?:ות|׳|')?|שעה|שעות|יום|ימים))?(?:\\s+before|\\s+לפני)?${E}`,
      'iu',
    ),
    (m) => {
      // No amount ("remind") -> default reminder; unit without number ("שעה") -> 1 unit.
      remindBefore = m[2] ? [unitToMinutes(m[1] ? Number(m[1]) : 1, m[2])] : null;
      understood.push('reminder');
    },
  );

  // Time range: "14:00-15:30", "7-8:30pm", "8pm-10pm"
  take(
    new RegExp(
      `${B}${HE_PREFIX}(?:at\\s+)?(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?\\s*[-–]\\s*(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?${E}`,
      'iu',
    ),
    (m) => {
      if (!m[2] && !m[3] && !m[5] && !m[6]) return false; // "5-6" alone is ambiguous
      const a = parseClock(m[1], m[2], m[3] ?? m[6]);
      const b = parseClock(m[4], m[5], m[6]);
      if (!a || !b) return false;
      start = a;
      end = b;
      understood.push('time');
    },
  );
  // Single time: "20:00", "8pm", "at 8:30"
  if (!start) {
    take(new RegExp(`${B}${HE_PREFIX}(?:at\\s+)?(\\d{1,2}):(\\d{2})\\s*(am|pm)?${E}`, 'iu'), (m) => {
      start = parseClock(m[1], m[2], m[3]);
      if (!start) return false;
      understood.push('time');
    });
  }
  if (!start) {
    take(new RegExp(`${B}(?:at\\s+)?(\\d{1,2})\\s*(am|pm)${E}`, 'iu'), (m) => {
      start = parseClock(m[1], undefined, m[2]);
      if (!start) return false;
      understood.push('time');
    });
  }

  // Dates
  take(new RegExp(`${B}(today|tonight|היום|הערב)${E}`, 'iu'), () => {
    date = today;
    understood.push('date');
  });
  if (!date)
    take(new RegExp(`${B}(day after tomorrow|מחרתיים)${E}`, 'iu'), () => {
      date = addDays(today, 2);
      understood.push('date');
    });
  if (!date)
    take(new RegExp(`${B}(tomorrow|tmrw|tmr|מחר)${E}`, 'iu'), () => {
      date = addDays(today, 1);
      understood.push('date');
    });
  if (!date) {
    // "15/12", "15.12.2026", "ב-15/12"
    take(new RegExp(`${B}${HE_PREFIX}(?:on\\s+)?(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?${E}`, 'iu'), (m) => {
      const d = Number(m[1]);
      const mo = Number(m[2]) - 1;
      if (d < 1 || d > 31 || mo < 0 || mo > 11) return false;
      let y = m[3] ? Number(m[3]) : today.getFullYear();
      if (y < 100) y += 2000;
      let cand = new Date(y, mo, d);
      if (!m[3] && cand < today) cand = new Date(y + 1, mo, d);
      date = cand;
      understood.push('date');
    });
  }
  if (!date) {
    // "dec 15", "15 dec"
    const mon = Object.keys(MONTHS).join('|');
    const apply = (d: number, mo: number) => {
      let cand = new Date(today.getFullYear(), mo, d);
      if (cand < today) cand = new Date(today.getFullYear() + 1, mo, d);
      date = cand;
      understood.push('date');
    };
    take(new RegExp(`${B}(?:on\\s+)?(${mon})\\s+(\\d{1,2})(?:st|nd|rd|th)?${E}`, 'iu'), (m) => {
      apply(Number(m[2]), MONTHS[m[1].toLowerCase()]);
    });
    if (!date)
      take(new RegExp(`${B}(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${mon})${E}`, 'iu'), (m) => {
        apply(Number(m[1]), MONTHS[m[2].toLowerCase()]);
      });
  }
  if (!date) {
    // "fri", "next friday", "יום שישי", "בשישי"
    const names = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');
    take(new RegExp(`${B}(?:on\\s+)?(next\\s+)?(?:${HE_PREFIX}יום\\s+)?${HE_PREFIX}(${names})(?:\\s+הבא)?${E}`, 'iu'), (m) => {
      const target = WEEKDAYS[m[2].toLowerCase()];
      let diff = (target - today.getDay() + 7) % 7;
      if (m[1]) diff = diff === 0 ? 7 : diff;
      date = addDays(today, diff);
      understood.push('date');
    });
  }

  // Default end: one hour after start.
  if (start && !end) {
    const [h, m] = (start as string).split(':').map(Number);
    end = `${pad(Math.min(23, h + 1))}:${pad(h + 1 > 23 ? 59 : m)}`;
  }

  const title = s.replace(/\s+/g, ' ').replace(/\s+(at|on|ב)$/i, '').trim();
  return {
    title,
    date: toISODate((date as Date | null) ?? today),
    start,
    end,
    remindBefore,
    repeat,
    understood,
  };
}
