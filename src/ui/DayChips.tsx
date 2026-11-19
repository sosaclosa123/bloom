// The little chips that show what's written on a day, right on the calendar:
//   📖 journal (opens the journal pop-up)   ☑ 2/5 to-dos   📝 2 notes   🔔 reminders
// Shared by the month grid and the week header so they always look the same.
import type { DayEntry, JournalEntry } from '../shared/types';
import type { ReminderOccurrence } from './calendarData';
import { Icon } from './common';
import { hasContent } from './Journal';
import { useBloom } from './store';

interface Props {
  entry?: DayEntry;
  journal?: JournalEntry;
  reminders?: ReminderOccurrence[];
  onOpenJournal: () => void;
  compact?: boolean;
}

export function DayChips({ entry, journal, reminders = [], onOpenJournal, compact }: Props) {
  const { t } = useBloom();
  const cards = entry?.cards ?? [];
  const todos = cards.filter((c) => c.kind === 'checklist').flatMap((c) => c.items.filter((i) => i.text.trim()));
  const doneCount = todos.filter((i) => i.done).length;
  const notes = cards.filter((c) => c.kind === 'text' && c.text.trim());
  const noteEmoji = notes.find((n) => n.emoji)?.emoji;
  const hasJournal = hasContent(journal);

  if (!hasJournal && todos.length === 0 && notes.length === 0 && reminders.length === 0) return null;

  return (
    <div className={`day-chips ${compact ? 'compact' : ''}`}>
      {hasJournal && (
        <button
          type="button"
          className="chip-day chip-journal"
          title={t('journalOpen')}
          aria-label={t('journalOpen')}
          onClick={(e) => {
            e.stopPropagation();
            onOpenJournal();
          }}
        >
          <span aria-hidden="true">📖</span>
          {!compact && <span className="chip-label">{t('journal')}</span>}
          {journal!.photos.length > 0 && (
            <span className="chip-sub">
              <Icon name="image" size={10} />
              {journal!.photos.length}
            </span>
          )}
        </button>
      )}
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
        <span className="chip-day chip-note" title={t('notesCount', { n: notes.length })}>
          <span aria-hidden="true">{noteEmoji ?? '📝'}</span>
          {notes.length > 1 && notes.length}
        </span>
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
