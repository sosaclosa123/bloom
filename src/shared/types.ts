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

export interface SyncMeta {
  id: string;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
  deletedAt?: number | null;
  ownerId: string; // "local" until accounts exist
  visibility: 'shared' | 'private';
}

export type Repeat = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';

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

/** Everything written *on* a day (the "Day Card"). */
export interface DayEntry extends SyncMeta {
  date: ISODate; // one entry per date
  status: DayStatus | null;
  headline: string;
  cards: NoteCard[];
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

export type HolidaySet = 'none' | 'jewish' | 'christian' | 'both';
export type Language = 'en' | 'he';
export type ThemeMode = 'system' | 'light' | 'dark';
export type GameModeSetting = 'auto' | 'always' | 'off';

export interface Settings {
  language: Language;
  theme: ThemeMode;
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
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'en',
  theme: 'system',
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
};

export interface Collections {
  events: CalendarEvent[];
  days: DayEntry[];
  reminders: Reminder[];
  countdowns: Countdown[];
  sounds: SoundMeta[];
  journal: JournalEntry[];
}

export type CollectionName = keyof Collections;
export type RecordOf<C extends CollectionName> = Collections[C][number];

export interface Snapshot extends Collections {
  schemaVersion: number;
  settings: Settings;
  deviceId: string;
}

export const SCHEMA_VERSION = 3;

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
