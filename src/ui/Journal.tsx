// Journal: one entry per day (text + photos), private or shared per entry.
// Written from the Day Card; read back as a diary on the Journal page.
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { platform } from '../platform/api';
import { newMeta } from '../shared/db';
import { parseISODate, toISODate } from '../shared/dates';
import type { ISODate, JournalEntry, PhotoRef } from '../shared/types';
import { Button, EditableText, Icon } from './common';
import { useAlive, useBloom } from './store';

export function newJournal(date: ISODate): JournalEntry {
  return { ...newMeta(), visibility: 'private', date, text: '', photos: [] };
}

export function useJournalEntry(date: ISODate) {
  const entries = useAlive('journal');
  return useMemo(() => entries.find((e) => e.date === date), [entries, date]);
}

export function hasContent(e: JournalEntry | undefined) {
  return !!e && (e.text.trim() !== '' || e.photos.length > 0);
}

// ------------------------------------------------------------------ photos

export function Photo({ photo, className, onClick }: { photo: PhotoRef; className?: string; onClick?: (e: ReactMouseEvent) => void }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    platform.photoUrl(photo).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [photo]);
  return (
    <button type="button" className={`photo ${className ?? ''}`} onClick={onClick} aria-label={photo.name}>
      {url && <img src={url} alt={photo.name} loading="lazy" draggable={false} />}
    </button>
  );
}

function Lightbox({ photos, index, onClose }: { photos: PhotoRef[]; index: number; onClose: () => void }) {
  const { t, dir } = useBloom();
  const [i, setI] = useState(index);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') onClose();
      const fwd = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
      const back = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
      if (e.key === fwd) setI((x) => (x + 1) % photos.length);
      if (e.key === back) setI((x) => (x - 1 + photos.length) % photos.length);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, photos.length, dir]);
  const p = photos[i];
  if (!p) return null;
  return (
    <div className="lightbox" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Photo key={p.id} photo={p} className="lightbox-img" />
      <button type="button" className="lightbox-close" aria-label={t('close')} onClick={onClose}>
        <Icon name="close" size={22} />
      </button>
      {photos.length > 1 && <div className="lightbox-count">{`${i + 1} / ${photos.length}`}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ editor (in the Day Card)

export function JournalEditor({ date }: { date: ISODate }) {
  const { t, save } = useBloom();
  const entry = useJournalEntry(date);
  const [viewing, setViewing] = useState<number | null>(null);
  const update = (patch: Partial<JournalEntry>) => save('journal', { ...(entry ?? newJournal(date)), ...patch });
  const isPrivate = (entry?.visibility ?? 'private') === 'private';
  const photos = entry?.photos ?? [];

  return (
    <div className={`journal-editor ${isPrivate ? 'is-private' : 'is-shared'}`}>
      <EditableText
        multiline
        className="journal-text"
        value={entry?.text ?? ''}
        placeholder={t('journalPlaceholder')}
        onSave={(text) => update({ text })}
      />
      {photos.length > 0 && (
        <div className="photo-grid">
          {photos.map((p, idx) => (
            <div className="photo-cell" key={p.id}>
              <Photo photo={p} onClick={() => setViewing(idx)} />
              <button
                type="button"
                className="photo-remove"
                aria-label={t('removePhoto')}
                title={t('removePhoto')}
                onClick={() => update({ photos: photos.filter((x) => x.id !== p.id) })}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="journal-foot">
        <Button
          size="sm"
          variant="ghost"
          icon="image"
          onClick={async () => {
            const added = await platform.addPhotos();
            if (added.length) update({ photos: [...photos, ...added] });
          }}
        >
          {t('addPhotos')}
        </Button>
        <div className="visibility-switch" role="radiogroup" aria-label={t('journalVisibility')}>
          <button type="button" role="radio" aria-checked={isPrivate} className={isPrivate ? 'active' : ''} onClick={() => update({ visibility: 'private' })}>
            <Icon name="lock" size={13} /> {t('private')}
          </button>
          <button type="button" role="radio" aria-checked={!isPrivate} className={!isPrivate ? 'active' : ''} onClick={() => update({ visibility: 'shared' })}>
            <Icon name="heart" size={13} /> {t('shared')}
          </button>
        </div>
      </div>
      {viewing !== null && <Lightbox photos={photos} index={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

// ------------------------------------------------------------------ Journal page

export function JournalPage({ selected, onOpenDay }: { selected: ISODate | null; onOpenDay: (date: ISODate) => void }) {
  const { t, locale } = useBloom();
  const all = useAlive('journal');
  const [filter, setFilter] = useState<'all' | 'private' | 'shared'>('all');
  const [viewing, setViewing] = useState<{ photos: PhotoRef[]; i: number } | null>(null);

  const entries = useMemo(
    () =>
      all
        .filter(hasContent)
        .filter((e) => filter === 'all' || e.visibility === filter)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [all, filter],
  );

  const groups = useMemo(() => {
    const map = new Map<string, JournalEntry[]>();
    for (const e of entries) {
      const key = e.date.slice(0, 7);
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()];
  }, [entries]);

  const today = toISODate(new Date());
  const wroteToday = all.some((e) => e.date === today && hasContent(e));

  return (
    <div className="journal-page">
      <div className="journal-top">
        <p className="journal-count">{t('journalCount', { n: entries.length })}</p>
        <div className="journal-top-actions">
          <div className="segmented" role="radiogroup">
            {(['all', 'private', 'shared'] as const).map((f) => (
              <button type="button" role="radio" aria-checked={filter === f} key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
                {t(f === 'all' ? 'journalAll' : f)}
              </button>
            ))}
          </div>
          <Button variant="primary" icon="pen" onClick={() => onOpenDay(today)}>
            {wroteToday ? t('journalContinue') : t('journalWriteToday')}
          </Button>
        </div>
      </div>

      {entries.length === 0 && (
        <div className="journal-empty">
          <div className="journal-empty-art" aria-hidden="true">📖</div>
          <p>{t('journalEmpty')}</p>
        </div>
      )}

      <div className="journal-scroll">
        {groups.map(([month, list]) => (
          <section key={month} className="journal-month">
            <h3>{parseISODate(month + '-01').toLocaleDateString(locale, { month: 'long', year: 'numeric' })}</h3>
            {list.map((e) => {
              const d = parseISODate(e.date);
              return (
                <article
                  key={e.id}
                  className={`journal-card ${selected === e.date ? 'selected' : ''}`}
                  onClick={() => onOpenDay(e.date)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(k) => k.key === 'Enter' && onOpenDay(e.date)}
                >
                  <div className="jc-date">
                    <span className="jc-day">{d.getDate()}</span>
                    <span className="jc-weekday">{d.toLocaleDateString(locale, { weekday: 'short' })}</span>
                  </div>
                  <div className="jc-body">
                    <div className="jc-meta">
                      <span className={`vis-badge ${e.visibility}`}>
                        <Icon name={e.visibility === 'private' ? 'lock' : 'heart'} size={12} />
                        {t(e.visibility === 'private' ? 'private' : 'shared')}
                      </span>
                    </div>
                    {e.text.trim() && <p className="jc-text">{e.text}</p>}
                    {e.photos.length > 0 && (
                      <div className="jc-photos">
                        {e.photos.slice(0, 5).map((p, i) => (
                          <Photo key={p.id} photo={p} onClick={(ev) => { ev.stopPropagation(); setViewing({ photos: e.photos, i }); }} />
                        ))}
                        {e.photos.length > 5 && <span className="jc-more">+{e.photos.length - 5}</span>}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        ))}
      </div>
      {viewing && <Lightbox photos={viewing.photos} index={viewing.i} onClose={() => setViewing(null)} />}
    </div>
  );
}
