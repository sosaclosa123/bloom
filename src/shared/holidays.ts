// Holidays shown in the calendar: Jewish (via Hebcal, fully offline),
// Christian (computed), or both.
import { HDate, HebrewCalendar, flags } from '@hebcal/core';
import { addDays, toISODate } from './dates';
import type { HolidaySet, ISODate, Language } from './types';

export interface Holiday {
  date: ISODate;
  name: string;
  tradition: 'jewish' | 'christian';
  major: boolean;
}

// Hebrew niqqud makes small labels hard to read; strip vowel points.
const stripNiqqud = (s: string) => s.replace(/[֑-ֽֿ-ׇ]/g, '');

const SKIP = flags.SPECIAL_SHABBAT | flags.SHABBAT_MEVARCHIM | flags.PARSHA_HASHAVUA | flags.DAF_YOMI | flags.OMER_COUNT;

function jewish(from: Date, to: Date, lang: Language, israel: boolean): Holiday[] {
  const events = HebrewCalendar.calendar({ start: from, end: to, il: israel, noSpecialShabbat: true });
  const out: Holiday[] = [];
  for (const ev of events) {
    const f = ev.getFlags();
    if (f & SKIP) continue;
    const desc = ev.getDesc();
    if (/Selichot/.test(desc)) continue;
    const major = Boolean(f & (flags.CHAG | flags.MAJOR_FAST)) || /Chanukah|Purim|Pesach|Sukkot|Shavuot/.test(desc);
    out.push({
      date: toISODate(ev.getDate().greg()),
      name: lang === 'he' ? stripNiqqud(ev.render('he')) : ev.render('en'),
      tradition: 'jewish',
      major,
    });
  }
  return out;
}

/** Western (Gregorian) Easter Sunday — anonymous Gregorian algorithm. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

const CHRISTIAN_NAMES: Record<string, [string, string]> = {
  newYear: ["New Year's Day", 'ראש השנה האזרחית'],
  epiphany: ['Epiphany', 'חג ההתגלות'],
  ashWed: ['Ash Wednesday', 'יום רביעי של האפר'],
  palm: ['Palm Sunday', 'יום ראשון של הדקלים'],
  goodFri: ['Good Friday', 'יום שישי הטוב'],
  easter: ['Easter', 'פסחא'],
  easterMon: ['Easter Monday', 'שני של פסחא'],
  ascension: ['Ascension Day', 'חג העלייה'],
  pentecost: ['Pentecost', 'חג השבועות הנוצרי'],
  allSaints: ["All Saints' Day", 'יום כל הקדושים'],
  xmasEve: ['Christmas Eve', 'ערב חג המולד'],
  xmas: ['Christmas', 'חג המולד'],
  boxing: ["St. Stephen's Day", 'יום סטפנוס הקדוש'],
};

function christian(from: Date, to: Date, lang: Language): Holiday[] {
  const out: Holiday[] = [];
  for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
    const e = easterSunday(y);
    const list: [string, Date, boolean][] = [
      ['newYear', new Date(y, 0, 1), true],
      ['epiphany', new Date(y, 0, 6), false],
      ['ashWed', addDays(e, -46), false],
      ['palm', addDays(e, -7), false],
      ['goodFri', addDays(e, -2), true],
      ['easter', e, true],
      ['easterMon', addDays(e, 1), false],
      ['ascension', addDays(e, 39), false],
      ['pentecost', addDays(e, 49), false],
      ['allSaints', new Date(y, 10, 1), false],
      ['xmasEve', new Date(y, 11, 24), false],
      ['xmas', new Date(y, 11, 25), true],
      ['boxing', new Date(y, 11, 26), false],
    ];
    for (const [key, date, major] of list) {
      if (date < from || date >= to) continue;
      const [en, he] = CHRISTIAN_NAMES[key];
      out.push({ date: toISODate(date), name: lang === 'he' ? he : en, tradition: 'christian', major });
    }
  }
  return out;
}

/** Holidays in [from, to), grouped by date. */
export function holidaysBetween(
  set: HolidaySet,
  from: Date,
  to: Date,
  lang: Language,
  israel = true,
): Map<ISODate, Holiday[]> {
  const list: Holiday[] = [];
  if (set === 'jewish' || set === 'both') list.push(...jewish(from, addDays(to, -1), lang, israel));
  if (set === 'christian' || set === 'both') list.push(...christian(from, to, lang));
  const map = new Map<ISODate, Holiday[]>();
  for (const h of list) {
    const arr = map.get(h.date) ?? [];
    arr.push(h);
    map.set(h.date, arr);
  }
  return map;
}

export function hebrewDateLabel(d: Date, lang: Language): string {
  const hd = new HDate(d);
  if (lang === 'he') {
    // "ט״ז בכסלו": day, then ב + month (year left out).
    const [day, ...month] = stripNiqqud(hd.renderGematriya(true)).replace(/\s*ת[א-ת]*[״"][א-ת]$/, '').split(' ');
    return `${day} ב${month.join(' ')}`;
  }
  return `${hd.getDate()} ${hd.getMonthName()}`;
}
