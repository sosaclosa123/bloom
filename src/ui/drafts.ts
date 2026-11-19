// Factories for new records with sensible defaults.
import { newMeta, uuid } from '../shared/db';
import type { CalendarEvent, Countdown, DayEntry, DayStatus, ISODate, NoteCard, Reminder, Settings } from '../shared/types';

export function newEvent(date: ISODate, settings: Settings, start = '09:00', end?: string): CalendarEvent {
  const [h, m] = start.split(':').map(Number);
  const endT = end ?? `${String(Math.min(23, h + 1)).padStart(2, '0')}:${h + 1 > 23 ? '59' : String(m).padStart(2, '0')}`;
  return {
    ...newMeta(),
    title: '',
    allDay: false,
    start: `${date}T${start}`,
    end: `${date}T${endT}`,
    color: 'lilac',
    notes: '',
    location: '',
    repeat: 'none',
    remindBefore: [...settings.defaultRemindBefore],
    sound: settings.defaultSound,
  };
}

export function newReminder(date: ISODate, settings: Settings, time?: string): Reminder {
  let t = time;
  if (!t) {
    const now = new Date();
    const next = new Date(now.getTime() + 60 * 60000);
    t = `${String(next.getHours()).padStart(2, '0')}:00`;
  }
  return { ...newMeta(), title: '', at: `${date}T${t}`, repeat: 'none', sound: settings.defaultSound, note: '' };
}

export function newCountdown(date: ISODate): Countdown {
  return { ...newMeta(), title: '', date, emoji: '💗', yearly: false };
}

export function newDayEntry(date: ISODate): DayEntry {
  return { ...newMeta(), date, status: null, headline: '', cards: [] };
}

export function newCard(kind: NoteCard['kind']): NoteCard {
  return {
    id: uuid(),
    kind,
    text: '',
    items: kind === 'checklist' ? [{ id: uuid(), text: '', done: false }] : [],
    emoji: '',
  };
}

export const STATUS_CYCLE: (DayStatus | null)[] = [null, 'free', 'some', 'packed'];
export function nextStatus(s: DayStatus | null): DayStatus | null {
  return STATUS_CYCLE[(STATUS_CYCLE.indexOf(s) + 1) % STATUS_CYCLE.length];
}

export const EVENT_COLORS = ['lilac', 'rose', 'peach', 'butter', 'mint', 'sky', 'sand'] as const;
export const CARD_EMOJIS = ['', '💗', '⭐', '🎂', '🎉', '✈️', '🏋️', '🍽️', '🛒', '💼', '📚', '🩺', '🎮', '🐾', '🌸', '☕', '🎵', '💡'];
export const COUNTDOWN_EMOJIS = ['💗', '💍', '🎂', '✈️', '🎉', '🏖️', '🎄', '🕎', '🎓', '🏠', '🌸', '⭐'];
export const REMIND_PRESETS = [0, 5, 10, 15, 30, 60, 120, 1440, 2880];
