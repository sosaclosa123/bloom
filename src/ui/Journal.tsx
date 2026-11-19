// Journal: one entry per day (text + photos), private or shared per entry.
// Opened from the calendar (📖 chip) or the day panel's Journal tab.
import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { platform } from '../platform/api';
import { newMeta } from '../shared/db';
import type { ISODate, JournalEntry, PhotoRef } from '../shared/types';
import { Icon } from './common';
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
        <Icon name={e.visibility === 'private' ? 'lock' : 'people'} size={12} />
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
