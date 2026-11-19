// The little chips that show what's written on a day, right on the calendar:
//   ☑ 2/5 to-dos   📝 notes (opens the note window)   🔔 reminders
// Shared by the month grid and the week header so they always look the same.
import type { DayEntry } from '../shared/types';
import type { ReminderOccurrence } from './calendarData';
import { Icon } from './common';
import { NoteIcon } from './NotePopover';
import { useBloom } from './store';

interface Props {
  entry?: DayEntry;
  reminders?: ReminderOccurrence[];
  onOpenNotes?: (anchor: HTMLElement) => void;
  compact?: boolean;
}

export function DayChips({ entry, reminders = [], onOpenNotes, compact }: Props) {
  const { t } = useBloom();
  const cards = entry?.cards ?? [];
  const todos = cards.filter((c) => c.kind === 'checklist').flatMap((c) => c.items.filter((i) => i.text.trim()));
  const doneCount = todos.filter((i) => i.done).length;
  const notes = cards.filter((c) => c.kind === 'text' && c.text.trim());

  if (todos.length === 0 && notes.length === 0 && reminders.length === 0) return null;

  return (
    <div className={`day-chips ${compact ? 'compact' : ''}`}>
      {todos.length > 0 && (
        <span
          className={`chip-day chip-todo ${doneCount === todos.length ? 'all-done' : ''}`}
          title={t('todosDone', { d: doneCount, n: todos.length })}
        >
          <Icon name="check" size={10} />
          {doneCount}/{todos.length}
        </span>
      )}
      {notes.length > 0 && (
        <button
          type="button"
          className="chip-day chip-note"
          data-note-anchor
          title={t('notesCount', { n: notes.length })}
          aria-label={t('notesCount', { n: notes.length })}
          onClick={(e) => {
            e.stopPropagation();
            onOpenNotes?.(e.currentTarget);
          }}
        >
          <NoteIcon size={13} />
          {notes.length > 1 && notes.length}
        </button>
      )}
      {reminders.length > 0 && (
        <span className="chip-day chip-bell" title={reminders.map((r) => r.reminder.title).join(' · ')}>
          <Icon name="bell" size={10} />
          {reminders.length > 1 && reminders.length}
        </span>
      )}
    </div>
  );
}
