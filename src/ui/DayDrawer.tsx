// The day panel: date + busy dots + headline, then four small tabs:
//   Plan (events & reminders) · To-do · Notes
import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, parseISODate } from '../shared/dates';
import { uuid } from '../shared/db';
import { hebrewDateLabel } from '../shared/holidays';
import type { EventOccurrence } from '../shared/recurrence';
import type { DayEntry, DayStatus, ISODate, NoteCard } from '../shared/types';
import { formatDayTitle, formatTime, useRangeData, type ReminderOccurrence } from './calendarData';
import { Button, EditableText, Icon, IconButton } from './common';
import { CARD_EMOJIS, newCard, newDayEntry } from './drafts';
import { NoteRich } from './NoteRich';
import { useAlive, useBloom } from './store';

export type DrawerTab = 'plan' | 'todo' | 'notes';

interface Props {
  date: ISODate;
  initialTab?: DrawerTab;
  /** Start by adding a new to-do / note (from the ＋ menu). */
  autoAdd?: 'todo' | 'note';
  onClose: () => void;
  onOpenEvent: (occ: EventOccurrence) => void;
  onNewEvent: (date: ISODate) => void;
  onOpenReminder: (r: ReminderOccurrence) => void;
  onNewReminder: (date: ISODate) => void;
}

const STATUSES: { value: DayStatus; key: 'statusFree' | 'statusSome' | 'statusPacked' }[] = [
  { value: 'free', key: 'statusFree' },
  { value: 'some', key: 'statusSome' },
  { value: 'packed', key: 'statusPacked' },
];

export function DayDrawer(p: Props) {
  const { date } = p;
  const { t, locale, settings, save, toast } = useBloom();
  const days = useAlive('days');
  const entry = useMemo(() => days.find((d) => d.date === date), [days, date]);
  const day = parseISODate(date);
  const range = useRangeData(day, addDays(day, 1));
  const occs = range.eventsByDay.get(date) ?? [];
  const rems = range.remindersByDay.get(date) ?? [];
  const hols = range.holidays.get(date) ?? [];

  // Several saves can happen in one tick (e.g. Enter saves text and adds an
  // item), so always build on the newest version of the day.
  const latest = useRef(entry);
  latest.current = entry;
  const update = (patch: Partial<DayEntry>) => {
    const next = { ...(latest.current ?? newDayEntry(date)), ...patch };
    latest.current = next;
    save('days', next);
  };
  const cards = () => latest.current?.cards ?? [];
  const setCard = (card: NoteCard) => update({ cards: cards().map((c) => (c.id === card.id ? card : c)) });

  const todos = (entry?.cards ?? []).filter((c) => c.kind === 'checklist').flatMap((c) => c.items.map((i) => ({ ...i, cardId: c.id })));
  const notes = (entry?.cards ?? []).filter((c) => c.kind === 'text');
  const doneCount = todos.filter((i) => i.done && i.text.trim()).length;
  const todoCount = todos.filter((i) => i.text.trim()).length;

  const firstTab: DrawerTab =
    p.initialTab ?? (occs.length || rems.length ? 'plan' : todoCount ? 'todo' : notes.length ? 'notes' : 'plan');
  const [tab, setTab] = useState<DrawerTab>(firstTab);
  const [focusId, setFocusId] = useState<string | null>(null);

  // ---------- to-dos
  const addTodo = (text = '') => {
    const item = { id: uuid(), text, done: false };
    const list = cards();
    const first = list.find((c) => c.kind === 'checklist');
    if (first) update({ cards: list.map((c) => (c.id === first.id ? { ...c, items: [...c.items, item] } : c)) });
    else update({ cards: [...list, { ...newCard('checklist'), items: [item] }] });
    return item.id;
  };
  const setTodo = (cardId: string, id: string, patch: Partial<NoteCard['items'][number]>) =>
    update({ cards: cards().map((c) => (c.id === cardId ? { ...c, items: c.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) } : c)) });
  const removeTodo = (cardId: string, id: string) =>
    update({
      cards: cards()
        .map((c) => (c.id === cardId ? { ...c, items: c.items.filter((i) => i.id !== id) } : c))
        .filter((c) => c.kind !== 'checklist' || c.items.length > 0),
    });

  // ---------- notes
  const addNote = () => {
    const card = newCard('text');
    update({ cards: [...cards(), card] });
    setFocusId(card.id);
  };
  const deleteNote = (card: NoteCard) => {
    const idx = cards().findIndex((c) => c.id === card.id);
    update({ cards: cards().filter((c) => c.id !== card.id) });
    toast(t('deleted'), {
      label: t('undo'),
      run: () => {
        const list = [...cards()];
        list.splice(idx, 0, card);
        update({ cards: list });
      },
    });
  };

  useEffect(() => {
    if (p.autoAdd === 'note') addNote();
    if (p.autoAdd === 'todo') setFocusId('new-todo');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.scrim')) p.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [p]);

  const tabs: { id: DrawerTab; label: string; badge?: string }[] = [
    { id: 'plan', label: t('plan'), badge: occs.length + rems.length ? String(occs.length + rems.length) : undefined },
    { id: 'todo', label: t('tileTodo'), badge: todoCount ? `${doneCount}/${todoCount}` : undefined },
    { id: 'notes', label: t('notes'), badge: notes.length ? String(notes.length) : undefined },
  ];

  const plan = [
    ...occs.map((o) => ({ at: o.event.allDay ? -1 : o.start.getTime(), key: o.key, node: <PlanEventRow key={o.key} occ={o} onOpen={() => p.onOpenEvent(o)} /> })),
    ...rems.map((r) => ({ at: r.at.getTime(), key: r.reminder.id + r.at.getTime(), node: (
      <button type="button" key={r.reminder.id + r.at.getTime()} className="item-row reminder" onClick={() => p.onOpenReminder(r)}>
        <Icon name="bell" size={14} className="item-bell" />
        <span className="item-time">{formatTime(r.at, locale)}</span>
        <span className="item-title" dir="auto">{r.reminder.title || '—'}</span>
        <span className="item-icons">{r.reminder.repeat !== 'none' && <Icon name="repeat" size={13} />}</span>
      </button>
    ) })),
  ].sort((a, b) => a.at - b.at);

  return (
    <aside className="drawer" aria-label={formatDayTitle(date, locale)}>
      <div className="drawer-head">
        <div className="drawer-title">
          <h2>{formatDayTitle(date, locale)}</h2>
          <div className="drawer-sub">
            {settings.showHebrewDate || settings.language === 'he' ? hebrewDateLabel(day, settings.language) : day.getFullYear()}
            {hols.map((h) => (
              <span key={h.name} className="holiday-chip">
                {h.name}
              </span>
            ))}
          </div>
        </div>
        <IconButton icon="close" label={t('close')} onClick={p.onClose} />
      </div>

      <div className="drawer-meta">
        <div className="meta-row">
        <div className="busy-dots" role="radiogroup" aria-label={t('status')}>
          {STATUSES.map((s) => (
            <button
              type="button"
              role="radio"
              aria-checked={entry?.status === s.value}
              key={s.value}
              title={t(s.key)}
              className={`busy-dot ${s.value} ${entry?.status === s.value ? 'active' : ''}`}
              onClick={() => update({ status: entry?.status === s.value ? null : s.value })}
            >
              <span className={`status-dot ${s.value}`} />
            </button>
          ))}
        </div>
        </div>
         <EditableText className="headline-input" value={entry?.headline ?? ''} placeholder={t('headlinePlaceholder')} onSave={(v) => update({ headline: v })} />
      </div>

      <div className="drawer-tabs" role="tablist">
        {tabs.map((x) => (
          <button type="button" role="tab" aria-selected={tab === x.id} key={x.id} className={`drawer-tab tab-${x.id} ${tab === x.id ? 'active' : ''}`} onClick={() => { setTab(x.id); if (x.id === 'todo') setFocusId('new-todo'); }}>
            {x.label}
            {x.badge && <span className="tab-badge">{x.badge}</span>}
          </button>
        ))}
      </div>

      <div className="drawer-body" key={tab}>
        {tab === 'plan' && (
          <>
            {plan.length === 0 ? <div className="empty">{t('noPlans')}</div> : <div className="item-list">{plan.map((x) => x.node)}</div>}
            <div className="tab-actions">
              <Button size="sm" icon="plus" onClick={() => p.onNewEvent(date)}>
                {t('tileEvent')}
              </Button>
            </div>
          </>
        )}

        {tab === 'todo' && (
          <>
            {todoCount > 0 && (
              <div className="todo-progress" aria-label={t('todosDone', { d: doneCount, n: todoCount })}>
                <span style={{ width: `${(doneCount / todoCount) * 100}%` }} />
              </div>
            )}
            <ul className="checklist">
              {todos.map((it) => (
                <li key={it.id} className={it.done ? 'done' : ''}>
                  <label className="check">
                    <input type="checkbox" checked={it.done} onChange={(e) => setTodo(it.cardId, it.id, { done: e.target.checked })} />
                    <span className="check-box">
                      <Icon name="check" size={12} />
                    </span>
                  </label>
                  <EditableText
                    className="check-text"
                    value={it.text}
                    autoFocus={focusId === it.id}
                    onSave={(v) => setTodo(it.cardId, it.id, { text: v })}
                    onEnter={() => setFocusId('new-todo')}
                  />
                  <button type="button" className="check-remove" aria-label={t('delete')} onClick={() => removeTodo(it.cardId, it.id)}>
                    <Icon name="close" size={12} />
                  </button>
                </li>
              ))}
            </ul>
            <NewTodo key={todos.length} autoFocus={focusId === 'new-todo' || todos.length === 0} placeholder={t('checklistItem')} onAdd={(text) => addTodo(text)} />
          </>
        )}

        {tab === 'notes' && (
          <>
            {notes.length === 0 && <div className="empty">{t('noNotes')}</div>}
            <div className="cards">
              {notes.map((c, i) => (
                <NoteEditor key={c.id} index={i} card={c} autoFocus={focusId === c.id} onChange={setCard} onDelete={() => deleteNote(c)} />
              ))}
            </div>
            <div className="tab-actions">
              <Button size="sm" icon="plus" onClick={addNote}>
                {t('tileNote')}
              </Button>
            </div>
          </>
        )}

      </div>
    </aside>
  );
}

/** The always-present "Add a to-do…" line at the bottom of the list. */
function NewTodo({ onAdd, placeholder, autoFocus }: { onAdd: (text: string) => void; placeholder: string; autoFocus: boolean }) {
  const [text, setText] = useState('');
  return (
    <div className="new-todo">
      <Icon name="plus" size={14} />
      <input
        dir="auto"
        autoFocus={autoFocus}
        value={text}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && text.trim()) {
            onAdd(text.trim());
            setText('');
          }
        }}
        onBlur={() => {
          if (text.trim()) {
            onAdd(text.trim());
            setText('');
          }
        }}
      />
    </div>
  );
}

function NoteEditor({
  card,
  onChange,
  onDelete,
  autoFocus,
  index,
}: {
  card: NoteCard;
  onChange: (c: NoteCard) => void;
  onDelete: () => void;
  autoFocus: boolean;
  index: number;
}) {
  const { t } = useBloom();
  const [picking, setPicking] = useState(false);
  const latest = useRef(card);
  latest.current = card;
  const commit = (patch: Partial<NoteCard>) => {
    latest.current = { ...latest.current, ...patch };
    onChange(latest.current);
  };
  return (
    <div className="card card--text" style={{ ['--i' as string]: index }}>
      <div className="emoji-wrap">
        <button type="button" className="emoji-btn" aria-label={t('pickEmoji')} title={t('pickEmoji')} onClick={() => setPicking((x) => !x)}>
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
                  commit({ emoji: e });
                  setPicking(false);
                }}
              >
                {e || <span className="marker-dot" />}
              </button>
            ))}
          </div>
        )}
      </div>
      <NoteRich className="card-text" value={card.text} autoFocus={autoFocus} placeholder={t('notePlaceholder')} onSave={(v) => commit({ text: v })} />
      <IconButton icon="trash" label={t('delete')} className="card-delete" onClick={onDelete} />
    </div>
  );
}

/** An event in the Plan tab, with a small arrow that opens its notes right here. */
function PlanEventRow({ occ, onOpen }: { occ: EventOccurrence; onOpen: () => void }) {
  const { t, locale, save } = useBloom();
  const ev = occ.event;
  const [open, setOpen] = useState(false);
  const latest = useRef(ev);
  latest.current = ev;
  return (
    <div className={`plan-event ev-${ev.color} ${open ? 'open' : ''}`}>
      <div className="plan-event-row">
        <button type="button" className="item-row" onClick={onOpen}>
          <span className="item-bar" />
          <span className="item-time">{ev.allDay ? t('allDay') : `${formatTime(occ.start, locale)}–${formatTime(occ.end, locale)}`}</span>
          <span className="item-title" dir="auto">
            {ev.title || '—'}
          </span>
          <span className="item-icons">
            {ev.remindBefore.length > 0 && <Icon name="bell" size={13} />}
            {ev.visibility === 'shared' && <Icon name="people" size={13} className="shared-ico" />}
            {ev.repeat !== 'none' && <Icon name="repeat" size={13} />}
          </span>
        </button>
        <button
          type="button"
          className={`note-toggle ${ev.notes.trim() ? 'has-notes' : ''}`}
          aria-expanded={open}
          aria-label={t('eventNotes')}
          title={t('eventNotes')}
          onClick={() => setOpen((x) => !x)}
        >
          <Icon name="note" size={14} />
          <Icon name="chevronRight" size={12} className="note-chevron" />
        </button>
      </div>
      {open && (
        <EditableText
          multiline
          autoFocus={!ev.notes}
          className="notebook plan-notes"
          value={ev.notes}
          placeholder={t('notesPlaceholder')}
          onSave={(notes) => save('events', { ...latest.current, notes })}
        />
      )}
    </div>
  );
}
