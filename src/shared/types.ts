// Bloom data model.
//
// Every stored record extends SyncMeta so a future sync server (phone + PC,
// shared couple calendar) can merge changes without restructuring data:
//  - `id` is a UUID, unique across devices
//  - `updatedAt` decides which copy wins in a merge (last write wins)
//  - `deletedAt` marks deletions ("tombstones") so they sync too
//  - `ownerId` / `visibility` prepare for a shared couple calendar

export type ISODate = string; // "2026-11-19"
export type LocalDateTime = string; // "2026-11-19T14:30" (wall-clock, local time)

export type Visibility = 'shared' | 'private';

export interface SyncMeta {
  id: string;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
  deletedAt?: number | null;
  ownerId: string; // "local" until accounts exist
  visibility: Visibility;
}

/** 'hebrewYearly' repeats every year on the same Hebrew date (e.g. ט״ז בכסלו). */
export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'hebrewYearly';

/** Day busyness: green = free, yellow = some plans, red = packed. */
export type DayStatus = 'free' | 'some' | 'packed';

export type EventColor = 'rose' | 'peach' | 'butter' | 'mint' | 'sky' | 'lilac' | 'sand';

export interface CalendarEvent extends SyncMeta {
  title: string;
  allDay: boolean;
  start: LocalDateTime; // for all-day events the time part is "00:00"
  end: LocalDateTime;
  color: EventColor;
  notes: string;
  location: string;
  repeat: Repeat;
  /** Repeat every N days/weeks/months/years (e.g. 2 = every 2 weeks). Missing = 1. */
  repeatEvery?: number;
  /** Stickers that repeat on every occurrence of this event (from the day they were added). */
  stickers?: PlacedSticker[];
  /** Minutes before start to remind. 0 = at start time. */
  remindBefore: number[];
  sound: string; // sound id (built-in or custom)
}

export interface NoteCard {
  id: string;
  kind: 'text' | 'checklist';
  text: string;
  items: { id: string; text: string; done: boolean }[];
  emoji: string; // shown as a tiny marker in the month cell ('' = dot)
}

/** A sticker placed on a day. Position is a fraction of the day's square (so it
 * follows the square when the window resizes); size is in pixels (fixed). */
export interface PlacedSticker {
  id: string;
  kind: string;
  x: number; // 0..1, center
  y: number; // 0..1, center
  size: number; // px
  rot: number; // degrees
  locked: boolean;
  /** Repeating stickers (kept on an event): first day shown, and days it was removed from. */
  from?: ISODate;
  skip?: ISODate[];
}

/** Everything written *on* a day (the "Day Card"). */
export interface DayEntry extends SyncMeta {
  date: ISODate; // one entry per date
  status: DayStatus | null;
  headline: string;
  cards: NoteCard[];
  stickers?: PlacedSticker[];
}

export interface Reminder extends SyncMeta {
  title: string;
  at: LocalDateTime;
  repeat: Repeat;
  sound: string;
  note: string;
}

export interface Countdown extends SyncMeta {
  title: string;
  date: ISODate;
  emoji: string;
  yearly: boolean; // e.g. anniversary, birthday
}

export interface SoundMeta extends SyncMeta {
  name: string;
  fileName: string; // stored in the app's sounds folder
}

/** A photo stored on the device; `fileName` lives in the app's photos folder. */
export interface PhotoRef {
  id: string;
  fileName: string;
  name: string;
}

/**
 * One journal entry per date. Private by default; each entry can be switched
 * to shared so a partner sees it once the couple calendar syncs.
 */
export interface JournalEntry extends SyncMeta {
  date: ISODate;
  text: string;
  photos: PhotoRef[];
}

// ---------------------------------------------------------------- money (Wallet tab)

// Private items show on the main Wallet page; shared ones only on the Shared page.

/** Monthly spending limit (one private, optionally one shared). */
export interface MoneyLimit extends SyncMeta {
  kind: 'limit';
  amount: number;
}
/** Something bought: what, how much, when. */
export interface MoneySpend extends SyncMeta {
  kind: 'spend';
  title: string;
  amount: number; // always positive
  date: ISODate;
  note: string;
}
/** A payment that repeats (card fee, rent, a subscription…). */
export interface MoneyRecurring extends SyncMeta {
  kind: 'recurring';
  title: string;
  amount: number;
  cycle: 'monthly' | 'yearly';
  /** First charge; later charges fall on the same day (clamped to short months). */
  startDate: ISODate;
  /** Last day it is charged (cancelled), or null while active. */
  endDate: ISODate | null;
  subscription: boolean;
  note: string;
  /** Set when the price/schedule changed "from now on": the record that continues this one. */
  replacedBy?: string | null;
}
export interface MoneyGoal extends SyncMeta {
  kind: 'goal';
  name: string;
  emoji: string;
  target: number;
  targetDate: ISODate | null;
}
/** Money put into a savings goal. Separate records, so two people adding at once never overwrite each other. */
export interface MoneyDeposit extends SyncMeta {
  kind: 'deposit';
  goalId: string;
  amount: number; // negative = taken out
  date: ISODate;
  by: string; // who added it (name shown on shared goals)
  byUid: string | null;
}
export type MoneyItem = MoneyLimit | MoneySpend | MoneyRecurring | MoneyGoal | MoneyDeposit;

export type HolidaySet = 'none' | 'jewish' | 'christian' | 'both';
export type Language = 'en' | 'he';
export type ThemeMode = 'system' | 'light' | 'dark';
export type FontSize = 'small' | 'medium' | 'large';
export type GameModeSetting = 'auto' | 'always' | 'off';

export interface Settings {
  language: Language;
  theme: ThemeMode;
  fontSize: FontSize;
  weekStart: 0 | 1; // 0 = Sunday
  holidays: HolidaySet;
  holidaysIsrael: boolean; // Israel vs diaspora Jewish calendar
  showHebrewDate: boolean;
  gameMode: GameModeSetting;
  gameModeSoftSound: boolean;
  startWithWindows: boolean;
  closeToTray: boolean;
  defaultSound: string;
  defaultRemindBefore: number[];
  volume: number; // 0..1
  snoozeOptions: number[]; // minutes
  currency: string; // ISO code, e.g. ILS
  /** Custom color per month (Jan..Dec); null = default. */
  monthColors: (string | null)[];
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  theme: 'system',
  fontSize: 'medium',
  weekStart: 0,
  holidays: 'jewish',
  holidaysIsrael: true,
  showHebrewDate: false,
  gameMode: 'auto',
  gameModeSoftSound: true,
  startWithWindows: true,
  closeToTray: true,
  defaultSound: 'builtin:chime',
  defaultRemindBefore: [15],
  volume: 0.8,
  snoozeOptions: [10, 60],
  currency: 'ILS',
  monthColors: [],
};

export interface Collections {
  events: CalendarEvent[];
  days: DayEntry[];
  reminders: Reminder[];
  countdowns: Countdown[];
  sounds: SoundMeta[];
  journal: JournalEntry[];
  money: MoneyItem[];
}

export type CollectionName = keyof Collections;
export type RecordOf<C extends CollectionName> = Collections[C][number];

export interface Snapshot extends Collections {
  schemaVersion: number;
  settings: Settings;
  deviceId: string;
}

export const SCHEMA_VERSION = 4;

/** A reminder that fired — shown in the popup or the "missed while playing" inbox. */
export interface FiredAlert {
  key: string; // `${sourceId}@${occurrence}`
  sourceId: string;
  kind: 'event' | 'reminder';
  title: string;
  /** When the thing happens (event start / reminder time). */
  when: LocalDateTime;
  /** When the alert was due to fire. */
  dueAt: number;
  minutesBefore: number;
  sound: string;
  missedWhileGaming?: boolean;
}
