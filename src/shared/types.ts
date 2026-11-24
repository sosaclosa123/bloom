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


// ---------------------------------------------------------------- health (Health tab)
//
// Health records are ALWAYS private: no share toggle, `visibility` is forced
// to 'private' on save, on load and in sync (see db.ts `asPrivateHealth` and
// the sync engine). They never show in Search, the calendar or Scheduled.

export type HealthSex = 'female' | 'male' | 'other';
export type HealthActivity = 'sedentary' | 'light' | 'active' | 'very';
export type HealthHot = 'no' | 'summer' | 'yes';
export type IbdType = 'crohns' | 'uc' | 'unsure';
/** 'ostomy' = ileostomy (kept as the stored value for older data). */
export type IbdOstomy = 'none' | 'ostomy' | 'colostomy' | 'jpouch';
export type FlareMark = 'none' | 'mild' | 'flare';

/** The personal questionnaire (one per person). Any answer can be skipped (null). */
export interface HealthProfile extends SyncMeta {
  kind: 'profile';
  age: number | null;
  sex: HealthSex | null;
  heightCm: number | null;
  weightKg: number | null;
  activity: HealthActivity | null;
  exerciseMin: number | null; // typical minutes of exercise per day
  hot: HealthHot | null;
  /** Kidney/heart condition that limits fluids: follow the doctor's limit. */
  fluidLimit: boolean | null;
  fluidLimitMl: number | null;
  glassMl: number; // size of one glass of water
  // IBD (only asked / shown when IBD is on)
  ibdType: IbdType | null;
  ibdLocation: string;
  ibdMeds: string;
  ostomy: IbdOstomy | null;
  typicalStools: number | null;
  triggerFoods: string;
  /** Old flag (set by closing or "Not now"); no longer used to hide the questionnaire. */
  done: boolean;
  /** Went through the questionnaire to the end (the setup card stays until then). */
  completed?: boolean;
  /** Also went through the IBD questions (asked again if IBD is turned on later). */
  completedIbd?: boolean;
  /** Version of the questions answered (new questions = everyone is asked again). */
  qVersion?: number;
  /** Calorie goal (Food tab) and how fast. */
  goal?: CalorieGoal | null;
  pace?: CaloriePace | null;
}
export type CalorieGoal = 'lose' | 'keep' | 'gain' | 'recomp';
export type CaloriePace = 'gentle' | 'normal' | 'fast';

/** Daily check-in, one per date. null = not answered. */
export interface HealthCheckin extends SyncMeta {
  kind: 'checkin';
  date: ISODate;
  waterMl: number;
  mood: number | null; // 1..5
  sleepH: number | null;
  energy: number | null; // 1..5
  stress: number | null; // 1..5
  /** Optional bed / wake-up times ("23:30", "07:00"); when both are set, sleepH is worked out from them. */
  bed?: string | null;
  wake?: string | null;
}

/** IBD day: Crohn's/UC symptoms (Harvey-Bradshaw answers), one per date. */
export interface HealthIbdDay extends SyncMeta {
  kind: 'ibdday';
  date: ISODate;
  wellbeing: number | null; // 0 very well .. 4 terrible
  pain: number | null; // 0 none .. 3 severe
  fatigue: number | null; // 0 none .. 3 severe
  mass: number | null; // 0 none .. 3 definite and tender
  complications: string[]; // HBI complication ids
  /** Liquid/soft stools; null = count from the bathroom log. */
  liquidStools: number | null;
  /** Old (no longer used): UC bleeding is taken from the bathroom log. */
  bleeding: number | null;
  flare: FlareMark;
}

/** One bathroom visit (IBD). */
export interface HealthBathroom extends SyncMeta {
  kind: 'bathroom';
  date: ISODate;
  time: string; // "08:30"
  bristol: number; // 1..7
  urgency: number; // 0 no rush, 1 had to hurry, 2 had to go right away, 3 didn't make it
  blood: boolean; // any blood (kept for older data; see bloodLevel)
  /** 0 none, 1 a trace, 2 obvious blood. */
  bloodLevel?: number;
  /** Woke up at night to go (default: 23:00-06:00). */
  night?: boolean;
  pain: number; // 0..3
  notes: string;
}

export interface HealthMed extends SyncMeta {
  kind: 'med';
  name: string;
  dose: string;
  times: string[]; // "08:00"
  remind: boolean;
  active: boolean;
  supplement: boolean;
  /** Repeats every N days/weeks/months from startDate (missing = every day). */
  every?: number;
  unit?: 'day' | 'week' | 'month';
  startDate?: ISODate;
  /** Sticker art shown for it (e.g. 'pill', 'injection'). */
  sticker?: string;
}

/** A dose taken (own record per dose, so two devices never overwrite each other). */
export interface HealthMedTaken extends SyncMeta {
  kind: 'taken';
  medId: string;
  date: ISODate;
  time: string; // planned time ("08:00"), or "" for an extra dose
}

export interface HealthFood extends SyncMeta {
  kind: 'food';
  date: ISODate;
  time: string;
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'drink';
  text: string;
  tags: string[];
  /** Small snacks are logged in their own area. */
  snack?: boolean;
  /** Portion and nutrition (when known). */
  grams?: number | null;
  kcal?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
  /** Per 100 g / 100 ml (so the amount can be changed later). */
  per100?: { kcal: number; protein: number; fat: number; carbs: number; sugars?: number | null } | null;
  /** Sugars for the amount (when the product data has them). */
  sugars?: number | null;
  /** The pill on the food's line (owner, Nov 2026). Old items: from meal / snack. */
  label?: FoodLabel | null;
  /** Eaten from "My meals": the meal's foods (for 1 portion) and how many portions. */
  recipe?: { id: string; portions: number; items: RecipeItem[] } | null;
  /** Where the numbers came from: Israeli MoH database, Open Food Facts, or typed in. */
  source?: 'il' | 'off' | 'manual' | 'recipe';
  productId?: string;
  /** The full product name it was picked from (text = your own "show as" name). */
  product?: string;
  /** Logged as a number of pieces ("5 cookies"); grams = pieces x pieceG. */
  pieces?: number | null;
  pieceG?: number | null;
}

/** "My box" for a product: its weight and how many pieces were in it (asked once, remembered). */
export type FoodLabel = 'meal' | 'snack' | 'drink' | 'healthy' | 'treat' | 'fast';

/** One food inside a saved meal ("My meals"), with its fixed amount. */
export interface RecipeItem {
  text: string;
  product?: string;
  productId?: string;
  grams: number | null;
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  sugars: number | null;
  per100: HealthFood['per100'];
  source?: HealthFood['source'];
  drink?: boolean;
}

/** A saved meal: fixed foods + amounts, added in one tap ("My meals"). */
export interface HealthRecipe extends SyncMeta {
  kind: 'recipe';
  name: string;
  label: FoodLabel;
  items: RecipeItem[];
}

export interface HealthFoodPack extends SyncMeta {
  kind: 'foodpack';
  productId: string;
  name: string;
  packG: number | null;
  pieces: number | null;
}

/** Body log for a date: weight and/or exercise. */
export interface HealthBody extends SyncMeta {
  kind: 'body';
  date: ISODate;
  weightKg: number | null;
  exerciseMin: number | null;
  steps: number | null;
}

/** Lab result. `ibd` tests (e.g. calprotectin) are hidden when IBD is off. */
export interface HealthTest extends SyncMeta {
  kind: 'test';
  date: ISODate;
  name: string;
  value: number | null;
  unit: string;
  ibd: boolean;
  note: string;
}

export interface HealthVisit extends SyncMeta {
  kind: 'visit';
  date: ISODate;
  doctor: string;
  notes: string;
  /** A (private) calendar event this visit belongs to. */
  eventId: string | null;
  /** Questions to ask at the visit (tick when asked). */
  questions?: { id: string; text: string; done: boolean }[];
  /** Attached documents (photos / PDFs), stored like journal photos. */
  docs?: PhotoRef[];
}

/** A personal mini-goal: `target` times every `every` day/week/month (resets each period). */
export interface HealthGoal extends SyncMeta {
  kind: 'goal';
  title: string;
  sticker: string;
  target: number;
  every: number;
  unit: 'day' | 'week' | 'month';
  startDate: ISODate;
  active: boolean;
}

/** One tick toward a mini-goal (own record per tick, sync-safe). */
export interface HealthGoalTick extends SyncMeta {
  kind: 'tick';
  goalId: string;
  date: ISODate;
}

/** A 7-day challenge the person started. Manual days are ticked by hand. */
export interface HealthChallenge extends SyncMeta {
  kind: 'challenge';
  challenge: string; // id from CHALLENGES
  startDate: ISODate;
  manualDays: ISODate[];
  /** Given up before the end. */
  stopped: boolean;
}

export type HealthItem =
  | HealthProfile
  | HealthCheckin
  | HealthIbdDay
  | HealthBathroom
  | HealthMed
  | HealthMedTaken
  | HealthFood
  | HealthFoodPack
  | HealthRecipe
  | HealthBody
  | HealthTest
  | HealthVisit
  | HealthGoal
  | HealthGoalTick
  | HealthChallenge;

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
  /** Small "Coming up" window in the corner when the PC starts. */
  startupGlance: boolean;
  closeToTray: boolean;
  defaultSound: string;
  defaultRemindBefore: number[];
  volume: number; // 0..1
  snoozeOptions: number[]; // minutes
  currency: string; // ISO code, e.g. ILS
  /** Custom color per month (Jan..Dec); null = default. */
  monthColors: (string | null)[];
  /** Health tab (this device only, off by default). */
  healthEnabled: boolean;
  /** IBD / Crohn's tracking inside Health (this device only, off by default). */
  healthIbd: boolean;
  /** Medication reminders show the medicine's name (off = just "Medication"). */
  healthMedNames: boolean;
  /** Health extras (this computer only, all off by default). */
  healthWaterNudge: boolean;
  /** Weekly weigh-in reminder: weekday 0-6 (Sunday = 0) or null = off. */
  healthWeighDay: number | null;
  healthStickerBook: boolean;
  healthGoals: boolean;
  healthChallenges: boolean;
  /** Look foods up online (Open Food Facts, barcodes). Off = built-in list only. */
  healthFoodOnline: boolean;
  /** Automatic weekly backups go to this folder (this computer only); null = off. */
  backupFolder: string | null;
  /** Account settings kept only on this device (the person chose "Only this device"). */
  localKeys?: string[];
  /** Account settings changed without asking "this device / all devices" again. */
  askOff?: string[];
  /** Phone: weekly automatic backup (on by default). */
  phoneBackup?: boolean;
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
  startupGlance: true,
  closeToTray: true,
  defaultSound: 'builtin:chime',
  defaultRemindBefore: [15],
  volume: 0.8,
  snoozeOptions: [10, 60],
  currency: 'ILS',
  monthColors: [],
  healthEnabled: false,
  healthIbd: false,
  healthMedNames: false,
  healthWaterNudge: false,
  healthWeighDay: null,
  healthStickerBook: false,
  healthGoals: false,
  healthChallenges: false,
  healthFoodOnline: false,
  backupFolder: null,
};

export interface Collections {
  events: CalendarEvent[];
  days: DayEntry[];
  reminders: Reminder[];
  countdowns: Countdown[];
  sounds: SoundMeta[];
  journal: JournalEntry[];
  money: MoneyItem[];
  /** Always private (never synced to the shared calendar). */
  health: HealthItem[];
}

export type CollectionName = keyof Collections;
export type RecordOf<C extends CollectionName> = Collections[C][number];

export interface Snapshot extends Collections {
  schemaVersion: number;
  settings: Settings;
  deviceId: string;
}

export const SCHEMA_VERSION = 5;

/** A reminder that fired — shown in the popup or the "missed while playing" inbox. */
export interface FiredAlert {
  key: string; // `${sourceId}@${occurrence}`
  sourceId: string;
  /** 'med' = a medication reminder from Health (title may be '' = just "Medication"). */
  kind: 'event' | 'reminder' | 'med' | 'water' | 'weigh';
  title: string;
  /** When the thing happens (event start / reminder time). */
  when: LocalDateTime;
  /** When the alert was due to fire. */
  dueAt: number;
  minutesBefore: number;
  sound: string;
  missedWhileGaming?: boolean;
}
