// A small note window that opens right above a day's note icon (or its +).
// It looks like the journal notebook, tinted with that month's season, and it
// stays open until closed with its own buttons — no dimming, not a full pop-up.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { parseISODate } from '../shared/dates';
import type { ISODate, NoteCard } from '../shared/types';
import { EditableText, Icon } from './common';
import { NewTodo } from './DayDrawer';
import { uuid } from '../shared/db';
import { newCard, newDayEntry } from './drafts';
import { NoteRich } from './NoteRich';
import { monthColor, monthInk } from './season';
import { useAlive, useBloom } from './store';

export interface NotePopState {
  date: ISODate;
  /** Element the window points at (note chip or + button). */
  anchor: HTMLElement;
  /** 'new' starts a fresh note (from the + button); 'todos' shows the day's to-do list. */
  mode: 'view' | 'new' | 'todos';
  n: number;
}

/** The note sticker icon used on the calendar. */
export function NoteIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="note-icon">
      <path d="M5 3.5h10.5L19 7v13.5H5z" fill="#fbf3e4" stroke="#8a6a58" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M15.5 3.5V7H19" fill="#efe0c6" stroke="#8a6a58" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 11h8M8 14h8M8 17h5" stroke="#c99b7e" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="8.5" cy="6.5" r="1.6" fill="#e3a587" />
    </svg>
  );
}

const WIDTH = 330;

export function NotePopover({ state, onClose }: { state: NotePopState; onClose: () => void }) {
  const { t, locale, save } = useBloom();
  const days = useAlive('days');
  const entry = days.find((d) => d.date === state.date);
  const notes = (entry?.cards ?? []).filter((c) => c.kind === 'text');
  const isTodos = state.mode === 'todos';
  const todos = (entry?.cards ?? []).filter((c) => c.kind === 'checklist').flatMap((c) => c.items.map((i) => ({ ...i, cardId: c.id })));
  const [brush, setBrush] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef(entry);
  latest.current = entry;
  const d = parseISODate(state.date);
  const m = d.getMonth();

  const update = (cards: NoteCard[]) => {
    const next = { ...(latest.current ?? newDayEntry(state.date)), cards };
    latest.current = next;
    save('days', next);
  };
  const addNote = () => {
    const card = newCard('text');
    update([...(latest.current?.cards ?? []), card]);
    setFocusId(card.id);
  };
  const setText = (id: string, text: string) => update((latest.current?.cards ?? []).map((c) => (c.id === id ? { ...c, text } : c)));
  const remove = (id: string) => update((latest.current?.cards ?? []).filter((c) => c.id !== id));

  // ---------- to-dos (same data as the day panel's To-do tab)
  const addTodo = (text: string) => {
    const item = { id: uuid(), text, done: false };
    const list = latest.current?.cards ?? [];
    const first = list.find((c) => c.kind === 'checklist');
    if (first) update(list.map((c) => (c.id === first.id ? { ...c, items: [...c.items, item] } : c)));
    else update([...list, { ...newCard('checklist'), items: [item] }]);
  };
  const setTodo = (cardId: string, id: string, patch: { text?: string; done?: boolean }) =>
    update((latest.current?.cards ?? []).map((c) => (c.id === cardId ? { ...c, items: c.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) } : c)));
  const removeTodo = (cardId: string, id: string) =>
    update(
      (latest.current?.cards ?? [])
        .map((c) => (c.id === cardId ? { ...c, items: c.items.filter((i) => i.id !== id) } : c))
        .filter((c) => c.kind !== 'checklist' || c.items.length > 0),
    );

  // New note right away when opened from "+" (or when the day has none yet).
  useEffect(() => {
    if (state.mode === 'todos') return;
    if (state.mode === 'new' || notes.length === 0) addNote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.n]);

  // Keep the window above its icon, also when the window resizes or scrolls.
  useLayoutEffect(() => {
    const place = () => {
      const a = state.anchor.getBoundingClientRect();
      const h = box.current?.offsetHeight ?? 260;
      const left = Math.min(Math.max(8, a.left + a.width / 2 - WIDTH / 2), window.innerWidth - WIDTH - 8);
      const below = a.top - h - 10 < 8;
      setPos({ left, top: below ? a.bottom + 10 : a.top - h - 10, below });
    };
    place();
    const ro = new ResizeObserver(place);
    if (box.current) ro.observe(box.current);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [state.anchor, state.n]);

  // Drop empty notes when the window closes.
  const close = () => {
    // Blur first so a note still being typed saves before we tidy up.
    (document.activeElement as HTMLElement | null)?.blur?.();
    const cards = latest.current?.cards ?? [];
    const cleaned = cards
      .map((c) => (c.kind === 'checklist' ? { ...c, items: c.items.filter((i) => i.text.trim()) } : c))
      .filter((c) => (c.kind === 'text' ? c.text.trim() : c.items.length > 0));
    if (cleaned.length !== cards.length) update(cleaned);
    onClose();
  };

  const arrowLeft = pos ? state.anchor.getBoundingClientRect().left + state.anchor.offsetWidth / 2 - pos.left : WIDTH / 2;

  return (
    <div
      ref={box}
      className={`note-pop calendar-light ${pos?.below ? 'below' : 'above'}`}
      role="dialog"
      aria-label={isTodos ? t('tileTodo') : t('notes')}
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: WIDTH,
        ['--journal-bg' as string]: '#fffdfa',
        ['--journal-head-from' as string]: monthColor(m),
        ['--journal-head-to' as string]: monthColor((m + 1) % 12),
        ['--journal-accent' as string]: monthInk(m, false),
        ['--journal-line' as string]: monthColor(m),
        ['--arrow' as string]: `${Math.min(WIDTH - 20, Math.max(20, arrowLeft))}px`,
      }}
    >
      <header className="np-head">
        {isTodos ? <span className="np-todo-icon"><Icon name="checklist" size={18} /></span> : <NoteIcon size={20} />}
        <div className="np-date">{d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <button type="button" className="jm-icon np-close" aria-label={t('close')} onClick={close}>
          <Icon name="close" size={16} />
        </button>
      </header>
      {isTodos ? (
        <>
          <div className="np-body">
            {todos.length > 0 && (
              <div className="todo-progress">
                <span style={{ width: `${(todos.filter((i) => i.done).length / todos.length) * 100}%` }} />
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
                  <EditableText className="check-text" value={it.text} onSave={(v) => setTodo(it.cardId, it.id, { text: v })} />
                  <button type="button" className="check-remove" aria-label={t('delete')} onClick={() => removeTodo(it.cardId, it.id)}>
                    <Icon name="close" size={12} />
                  </button>
                </li>
              ))}
            </ul>
            <NewTodo key={todos.length} autoFocus={todos.length === 0} placeholder={t('checklistItem')} onAdd={addTodo} />
          </div>
          <footer className="np-foot">
            <span className="spacer" />
            <button type="button" className="jm-btn jm-done" onClick={close}>
              {t('done')}
            </button>
          </footer>
        </>
      ) : (
        <>
        <div className="np-body">
          {notes.map((c) => (
            <div className="np-note" key={c.id}>
              <NoteRich className="np-text" value={c.text} brush={brush} autoFocus={focusId === c.id} placeholder={t('notePlaceholder')} onSave={(v) => setText(c.id, v)} />
              <button type="button" className="np-del" aria-label={t('delete')} title={t('delete')} onClick={() => remove(c.id)}>
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))}
        </div>
        <footer className="np-foot">
          <button type="button" className={`np-tool ${brush ? 'active' : ''}`} aria-pressed={brush} title={t('brushHint')} onClick={() => setBrush((b) => !b)}>
            <BrushIcon /> {t('brush')}
          </button>
          <button type="button" className="np-tool" onClick={addNote}>
            <Icon name="plus" size={14} /> {t('tileNote')}
          </button>
          <span className="spacer" />
          <button type="button" className="jm-btn jm-done" onClick={close}>
            {t('done')}
          </button>
        </footer>
        </>
      )}
    </div>
  );
}

export function BrushIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18.5 3.5l2 2-9 9-3-1 1-3z" />
      <path d="M8.5 13.5c-2.5 0-4 1.5-4 4 0 1.5-1 2.5-2 3 3 1 7.5 0 8-3.5" />
    </svg>
  );
}
