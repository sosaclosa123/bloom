// Journal: one entry per day (text + photos), private or shared per entry.
// Written from the Day Card; read back as a diary on the Journal page.
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { platform } from '../platform/api';
import { newMeta } from '../shared/db';
import { parseISODate, toISODate } from '../shared/dates';
import type { ISODate, JournalEntry, PhotoRef } from '../shared/types';
import { Button, Icon } from './common';
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

export function Lightbox({ photos, index, onClose }: { photos: PhotoRef[]; index: number; onClose: () => void }) {
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

// ------------------------------------------------------------------ preview (in the Day Card)

/** A small blue card in the day panel; opens the journal pop-up. */
export function JournalPreview({ date, onOpen }: { date: ISODate; onOpen: () => void }) {
  const { t } = useBloom();
  const entry = useJournalEntry(date);
  if (!hasContent(entry)) {
    return (
      <button type="button" className="journal-cta" onClick={onOpen}>
        <span className="journal-cta-emoji" aria-hidden="true">
          📖
        </span>
        <span>
          <strong>{t('journalWrite')}</strong>
          <span className="journal-cta-sub">{t('journalWriteSub')}</span>
        </span>
      </button>
    );
  }
  const e = entry!;
  return (
    <button type="button" className="journal-preview" onClick={onOpen}>
      <span className={`vis-badge ${e.visibility}`}>
        <Icon name={e.visibility === 'private' ? 'lock' : 'heart'} size={12} />
        {t(e.visibility === 'private' ? 'private' : 'shared')}
      </span>
      {e.text.trim() && <span className="jp-text" dir="auto">{e.text}</span>}
      {e.photos.length > 0 && (
        <span className="jp-photos">
          {e.photos.slice(0, 4).map((p) => (
            <PhotoThumb key={p.id} photo={p} />
          ))}
          {e.photos.length > 4 && <span className="jc-more">+{e.photos.length - 4}</span>}
        </span>
      )}
      <span className="jp-open">
        {t('journalOpen')} <Icon name={'chevronRight'} size={14} className="flip-rtl" />
      </span>
    </button>
  );
}

/** Non-interactive thumbnail (for use inside another button). */
function PhotoThumb({ photo }: { photo: PhotoRef }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    platform.photoUrl(photo).then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [photo]);
  return <span className="photo-thumb">{url && <img src={url} alt="" draggable={false} />}</span>;
}

// ------------------------------------------------------------------ Journal page

export function JournalPage({ selected, onOpenJournal }: { selected: ISODate | null; onOpenJournal: (date: ISODate) => void }) {
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
          <Button variant="primary" icon="pen" onClick={() => onOpenJournal(today)}>
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
            {list.map((e, idx) => {
              const d = parseISODate(e.date);
              return (
                <article
                  key={e.id}
                  style={{ ['--i' as string]: Math.min(idx, 8) }}
                  className={`journal-card ${selected === e.date ? 'selected' : ''}`}
                  onClick={() => onOpenJournal(e.date)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(k) => k.key === 'Enter' && onOpenJournal(e.date)}
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
                    {e.text.trim() && <p className="jc-text" dir="auto">{e.text}</p>}
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
