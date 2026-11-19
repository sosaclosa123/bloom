import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, parseISODate } from '../shared/dates';
import { hebrewDateLabel } from '../shared/holidays';
import type { EventOccurrence } from '../shared/recurrence';
import type { DayEntry, DayStatus, ISODate, NoteCard } from '../shared/types';
import { uuid } from '../shared/db';
import { formatDayTitle, formatTime, useRangeData, type ReminderOccurrence } from './calendarData';
import { Button, EditableText, Icon, IconButton } from './common';
import { CARD_EMOJIS, newCard, newDayEntry } from './drafts';
import { JournalPreview } from './Journal';
import { useAlive, useBloom } from './store';

interface Props {
  date: ISODate;
  onClose: () => void;
  onOpenEvent: (occ: EventOccurrence) => void;
  onNewEvent: (date: ISODate) => void;
  onOpenReminder: (r: ReminderOccurrence) => void;
  onNewReminder: (date: ISODate) => void;
  onOpenJournal: (date: ISODate) => void;
}

const STATUSES: { value: DayStatus; key: 'statusFree' | 'statusSome' | 'statusPacked' }[] = [
  { value: 'free', key: 'statusFree' },
  { value: 'some', key: 'statusSome' },
  { value: 'packed', key: 'statusPacked' },
];

export function DayDrawer({ date, onClose, onOpenEvent, onNewEvent, onOpenReminder, onNewReminder, onOpenJournal }: Props) {
  const { t, locale, settings, save, toast } = useBloom();
  const days = useAlive('days');
  const entry = useMemo(() => days.find((d) => d.date === date), [days, date]);
  const day = parseISODate(date);
  const range = useRangeData(day, addDays(day, 1));
  const occs = range.eventsByDay.get(date) ?? [];
  const rems = range.remindersByDay.get(date) ?? [];
  const hols = range.holidays.get(date) ?? [];
  const [focusCard, setFocusCard] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.scrim')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const update = (patch: Partial<DayEntry>) => {
    const base = entry ?? newDayEntry(date);
    save('days', { ...base, ...patch });
  };
  const updateCard = (card: NoteCard) => {
    const cards = entry?.cards ?? [];
    update({ cards: cards.map((c) => (c.id === card.id ? card : c)) });
  };
  const addCard = (kind: NoteCard['kind']) => {
    const card = newCard(kind);
    update({ cards: [...(entry?.cards ?? []), card] });
    setFocusCard(card.id);
  };
  const deleteCard = (card: NoteCard) => {
    const cards = entry?.cards ?? [];
    const idx = cards.findIndex((c) => c.id === card.id);
    update({ cards: cards.filter((c) => c.id !== card.id) });
    toast(t('deleted'), {
      label: t('undo'),
      run: () => {
        const now = days.find((d) => d.date === date);
        const list = [...(now?.cards ?? [])];
        list.splice(idx, 0, card);
        save('days', { ...(now ?? newDayEntry(date)), cards: list });
      },
    });
  };

  return (
    <aside className="drawer" aria-label={formatDayTitle(date, locale)}>
      <div className="drawer-head">
        <div>
          <h2>{formatDayTitle(date, locale)}</h2>
          <div className="drawer-sub">
            {settings.showHebrewDate || settings.language === 'he' ? hebrewDateLabel(day, settings.language) : day.getFullYear()}
          </div>
        </div>
        <IconButton icon="close" label={t('close')} onClick={onClose} />
      </div>

      {hols.length > 0 && (
        <div className="holiday-chips">
          {hols.map((h) => (
            <span key={h.name} className={`holiday-chip ${h.tradition}`}>
              {h.name}
            </span>
          ))}
        </div>
      )}

      <div className="drawer-body">
        <section className="drawer-section">
          <div className="section-label">{t('addToDay')}</div>
          <div className="add-tiles">
            {(
              [
                ['todo', '✅', t('tileTodo'), () => addCard('checklist')],
                ['note', '📝', t('tileNote'), () => addCard('text')],
                ['journal', '📖', t('tileJournal'), () => onOpenJournal(date)],
                ['event', '📅', t('tileEvent'), () => onNewEvent(date)],
                ['reminder', '🔔', t('tileReminder'), () => onNewReminder(date)],
              ] as const
            ).map(([id, emoji, label, run], i) => (
              <button type="button" key={id} className={`add-tile tile-${id}`} style={{ ['--i' as string]: i }} onClick={run}>
                <span className="add-tile-emoji" aria-hidden="true">
                  {emoji}
                </span>
                <span className="add-tile-label">{label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="drawer-section" id="journal">
          <div className="section-head">
            <span className="section-label">
              <Icon name="book" size={13} /> {t('journal')}
            </span>
          </div>
          <JournalPreview date={date} onOpen={() => onOpenJournal(date)} />
        </section>

        <section className="drawer-section">
          <div className="section-label">{t('status')}</div>
          <div className="status-picker" role="radiogroup" aria-label={t('status')}>
            {STATUSES.map((s) => (
              <button
                type="button"
                role="radio"
                aria-checked={entry?.status === s.value}
                key={s.value}
                className={`status-option ${s.value} ${entry?.status === s.value ? 'active' : ''}`}
                onClick={() => update({ status: entry?.status === s.value ? null : s.value })}
              >
                <span className={`status-dot ${s.value}`} />
                {t(s.key)}
              </button>
            ))}
          </div>
          <EditableText
            className="headline-input"
            value={entry?.headline ?? ''}
            placeholder={t('headlinePlaceholder')}
            onSave={(v) => update({ headline: v })}
          />
        </section>

        <section className="drawer-section">
          <div className="section-head">
            <span className="section-label">{t('events')}</span>
            <Button size="sm" variant="ghost" icon="plus" onClick={() => onNewEvent(date)}>
              {t('addEvent')}
            </Button>
          </div>
          {occs.length === 0 && <div className="empty">{t('noEvents')}</div>}
          <div className="item-list">
            {occs.map((o) => (
              <button type="button" key={o.key} className={`item-row ev-${o.event.color}`} onClick={() => onOpenEvent(o)}>
                <span className="item-bar" />
                <span className="item-time">
                  {o.event.allDay ? t('allDay') : `${formatTime(o.start, locale)}–${formatTime(o.end, locale)}`}
                </span>
                <span className="item-title">{o.event.title || '—'}</span>
                <span className="item-icons">
                  {o.event.visibility === 'private' && <Icon name="lock" size={13} />}
                  {o.event.repeat !== 'none' && <Icon name="repeat" size={13} />}
                  {o.event.remindBefore.length > 0 && <Icon name="bell" size={13} />}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="drawer-section">
          <div className="section-head">
            <span className="section-label">{t('reminders')}</span>
            <Button size="sm" variant="ghost" icon="plus" onClick={() => onNewReminder(date)}>
              {t('addReminder')}
            </Button>
          </div>
          {rems.length === 0 && <div className="empty">{t('noReminders')}</div>}
          <div className="item-list">
            {rems.map((r) => (
              <button type="button" key={r.reminder.id + r.at.getTime()} className="item-row reminder" onClick={() => onOpenReminder(r)}>
                <Icon name="bell" size={14} className="item-bell" />
                <span className="item-time">{formatTime(r.at, locale)}</span>
                <span className="item-title">{r.reminder.title || '—'}</span>
                <span className="item-icons">{r.reminder.repeat !== 'none' && <Icon name="repeat" size={13} />}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="drawer-section">
          <div className="section-head">
            <span className="section-label">{t('notesTodos')}</span>
            <div className="section-actions">
              <Button size="sm" variant="ghost" icon="note" onClick={() => addCard('text')}>
                {t('addNote')}
              </Button>
              <Button size="sm" variant="ghost" icon="checklist" onClick={() => addCard('checklist')}>
                {t('addChecklist')}
              </Button>
            </div>
          </div>
          {(entry?.cards.length ?? 0) === 0 && <div className="empty">{t('noNotes')}</div>}
          <div className="cards">
            {entry?.cards.map((c, i) => (
              <CardEditor index={i} key={c.id} card={c} autoFocus={focusCard === c.id} onChange={updateCard} onDelete={() => deleteCard(c)} />
            ))}
          </div>
        </section>

      </div>
    </aside>
  );
}

function CardEditor({
  card,
  onChange,
  onDelete,
  autoFocus,
  index,
}: {
  index: number;
  card: NoteCard;
  onChange: (c: NoteCard) => void;
  onDelete: () => void;
  autoFocus: boolean;
}) {
  const { t } = useBloom();
  const [picking, setPicking] = useState(false);
  const [focusItem, setFocusItem] = useState<string | null>(null);

  // Several edits can happen in one tick (e.g. Enter saves the text *and* adds
  // a new item), so always build on the newest version of the card.
  const latest = useRef(card);
  latest.current = card;
  const commit = (next: NoteCard) => {
    latest.current = next;
    onChange(next);
  };
  const setItem = (id: string, patch: Partial<NoteCard['items'][number]>) =>
    commit({ ...latest.current, items: latest.current.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const addItemAfter = (idx: number) => {
    const item = { id: uuid(), text: '', done: false };
    const items = [...latest.current.items];
    items.splice(idx + 1, 0, item);
    commit({ ...latest.current, items });
    setFocusItem(item.id);
  };

  return (
    <div className={`card card--${card.kind}`} style={{ ['--i' as string]: index }}>
      <div className="card-head">
        <div className="emoji-wrap">
          <button type="button" className="emoji-btn" aria-label={t('pickEmoji')} title={t('pickEmoji')} onClick={() => setPicking((p) => !p)}>
            {card.emoji || <span className="marker-dot" />}
          </button>
          {picking && (
            <div className="emoji-pop" onMouseLeave={() => setPicking(false)}>
              {CARD_EMOJIS.map((e) => (
                <button
                  type="button"
                  key={e || 'dot'}
                  className={e === card.emoji ? 'active' : ''}
                  onClick={() => {
                    commit({ ...latest.current, emoji: e });
                    setPicking(false);
                  }}
                >
                  {e || <span className="marker-dot" />}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="card-kind">
          <Icon name={card.kind === 'text' ? 'note' : 'checklist'} size={14} />
        </span>
        <IconButton icon="trash" label={t('delete')} className="card-delete" onClick={onDelete} />
      </div>
      {card.kind === 'text' ? (
        <EditableText
          multiline
          className="card-text"
          value={card.text}
          autoFocus={autoFocus}
          placeholder={t('notePlaceholder')}
          onSave={(v) => commit({ ...latest.current, text: v })}
        />
      ) : (
        <ul className="checklist">
          {card.items.map((it, idx) => (
            <li key={it.id} className={it.done ? 'done' : ''}>
              <label className="check">
                <input type="checkbox" checked={it.done} onChange={(e) => setItem(it.id, { done: e.target.checked })} />
                <span className="check-box">
                  <Icon name="check" size={12} />
                </span>
              </label>
              <EditableText
                className="check-text"
                value={it.text}
                autoFocus={(autoFocus && idx === 0) || focusItem === it.id}
                placeholder={t('checklistItem')}
                onSave={(v) => setItem(it.id, { text: v })}
                onEnter={() => addItemAfter(idx)}
              />
              <button
                type="button"
                className="check-remove"
                aria-label={t('delete')}
                onClick={() => commit({ ...latest.current, items: latest.current.items.filter((x) => x.id !== it.id) })}
              >
                <Icon name="close" size={12} />
              </button>
            </li>
          ))}
          <li className="check-add">
            <button type="button" onClick={() => addItemAfter(card.items.length - 1)}>
              <Icon name="plus" size={13} /> {t('checklistItem')}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}
