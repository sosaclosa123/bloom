import { useEffect, useMemo, useState } from 'react';
import { dateOf, parseISODate } from '../shared/dates';
import type { ISODate } from '../shared/types';
import { Icon } from './common';
import { useAlive, useBloom } from './store';

interface Result {
  id: string;
  kind: 'event' | 'reminder' | 'note' | 'day' | 'journal';
  title: string;
  detail: string;
  date: ISODate;
  open: () => void;
}

interface Props {
  onClose: () => void;
  onOpenDay: (date: ISODate) => void;
  onOpenEventId: (id: string) => void;
  onOpenReminderId: (id: string) => void;
}

const norm = (s: string) => s.toLocaleLowerCase().normalize('NFKD').replace(/[̀-֑ͯ-ׇ]/g, '');

export function Search({ onClose, onOpenDay, onOpenEventId, onOpenReminderId }: Props) {
  const { t, locale } = useBloom();
  const events = useAlive('events');
  const reminders = useAlive('reminders');
  const days = useAlive('days');
  const journal = useAlive('journal');
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);

  const results = useMemo<Result[]>(() => {
    const query = norm(q.trim());
    if (!query) return [];
    const hit = (...parts: string[]) => parts.some((p) => norm(p).includes(query));
    const out: Result[] = [];
    for (const e of events)
      if (hit(e.title, e.notes, e.location))
        out.push({ id: e.id, kind: 'event', title: e.title || '—', detail: e.location || e.notes, date: dateOf(e.start), open: () => onOpenEventId(e.id) });
    for (const r of reminders)
      if (hit(r.title, r.note))
        out.push({ id: r.id, kind: 'reminder', title: r.title || '—', detail: r.note, date: dateOf(r.at), open: () => onOpenReminderId(r.id) });
    for (const d of days) {
      if (d.headline && hit(d.headline)) out.push({ id: d.id + 'h', kind: 'day', title: d.headline, detail: '', date: d.date, open: () => onOpenDay(d.date) });
      for (const c of d.cards) {
        const text = c.kind === 'text' ? c.text : c.items.map((i) => i.text).join(' · ');
        if (hit(text)) out.push({ id: c.id, kind: 'note', title: text.split('\n')[0].slice(0, 80) || '—', detail: '', date: d.date, open: () => onOpenDay(d.date) });
      }
    }
    for (const j of journal)
      if (j.text && hit(j.text))
        out.push({ id: j.id, kind: 'journal', title: j.text.split('\n')[0].slice(0, 80), detail: '', date: j.date, open: () => onOpenDay(j.date) });
    return out.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 40);
  }, [q, events, reminders, days, journal, onOpenDay, onOpenEventId, onOpenReminderId]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const choose = (r: Result | undefined) => {
    if (!r) return;
    onClose();
    r.open();
  };

  return (
    <div className="scrim top" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="search" role="dialog" aria-label={t('search')}>
        <div className="search-input">
          <Icon name="search" />
          <input
            autoFocus
            value={q}
            placeholder={t('searchPlaceholder')}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(results.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') choose(results[active]);
            }}
          />
        </div>
        {q.trim() && (
          <ul className="search-results">
            {results.length === 0 && <li className="empty">{t('noResults')}</li>}
            {results.map((r, i) => (
              <li key={r.kind + r.id}>
                <button type="button" className={i === active ? 'active' : ''} onMouseEnter={() => setActive(i)} onClick={() => choose(r)}>
                  <Icon name={r.kind === 'event' ? 'calendar' : r.kind === 'reminder' ? 'bell' : r.kind === 'journal' ? 'book' : 'note'} size={16} />
                  <span className="sr-text">
                    <span className="sr-title">{r.title}</span>
                    {r.detail && <span className="sr-detail">{r.detail}</span>}
                  </span>
                  <span className="sr-date">{parseISODate(r.date).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
