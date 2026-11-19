// The journal pop-up: a blue "notebook" window over a dimmed background.
// All colors come from the --journal-* tokens in tokens.css and all motion
// from motion.css, so the look can be redesigned without touching this logic.
import { useEffect, useState } from 'react';
import { platform } from '../platform/api';
import { addDays, parseISODate, toISODate } from '../shared/dates';
import type { ISODate, JournalEntry } from '../shared/types';
import { EditableText, Icon } from './common';
import { Lightbox, newJournal, Photo, useJournalEntry } from './Journal';
import { useBloom } from './store';

interface Props {
  date: ISODate;
  onClose: () => void;
  onChangeDate: (date: ISODate) => void;
}

export function JournalModal({ date, onClose, onChangeDate }: Props) {
  const { t, locale, dir, save } = useBloom();
  const entry = useJournalEntry(date);
  const [viewing, setViewing] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [savedPulse, setSavedPulse] = useState(0);
  const d = parseISODate(date);
  const photos = entry?.photos ?? [];
  const isPrivate = (entry?.visibility ?? 'private') === 'private';

  const update = (patch: Partial<JournalEntry>) => {
    save('journal', { ...(entry ?? newJournal(date)), ...patch });
    setSavedPulse((n) => n + 1);
  };

  // Play the closing animation, then unmount.
  const close = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 200);
  };
  const step = (n: number) => onChangeDate(toISODate(addDays(d, n)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (viewing !== null) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
      const typing = (document.activeElement as HTMLElement | null)?.tagName === 'TEXTAREA';
      if (!typing && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const fwd = (e.key === 'ArrowRight') !== (dir === 'rtl');
        step(fwd ? 1 : -1);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  return (
    <div className={`scrim journal-scrim ${closing ? 'is-closing' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`journal-modal ${isPrivate ? 'is-private' : 'is-shared'}`} role="dialog" aria-modal="true" aria-label={t('journal')}>
        <header className="jm-head">
          <div className="jm-floaties" aria-hidden="true">
            <span>✦</span>
            <span>♡</span>
            <span>✧</span>
            <span>☁</span>
          </div>
          <div className="jm-nav">
            <button type="button" className="jm-icon" aria-label={t('prev')} onClick={() => step(-1)}>
              <Icon name={dir === 'rtl' ? 'chevronRight' : 'chevronLeft'} size={18} />
            </button>
            <div className="jm-date" key={date}>
              <span className="jm-book" aria-hidden="true">
                📖
              </span>
              <div>
                <div className="jm-day">{d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                <div className="jm-year">
                  {t('journal')} · {d.getFullYear()}
                </div>
              </div>
            </div>
            <button type="button" className="jm-icon" aria-label={t('next')} onClick={() => step(1)}>
              <Icon name={dir === 'rtl' ? 'chevronLeft' : 'chevronRight'} size={18} />
            </button>
          </div>
          <button type="button" className="jm-icon jm-close" aria-label={t('close')} onClick={close}>
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="jm-body" key={date}>
          <EditableText
            multiline
            autoFocus
            className="jm-text"
            value={entry?.text ?? ''}
            placeholder={t('journalPlaceholder')}
            onSave={(text) => update({ text })}
          />

          {photos.length > 0 && (
            <div className="jm-photos">
              {photos.map((p, idx) => (
                <div className="photo-cell" key={p.id} style={{ ['--i' as string]: idx }}>
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
        </div>

        <footer className="jm-foot">
          <button
            type="button"
            className="jm-btn"
            onClick={async () => {
              const added = await platform.addPhotos();
              if (added.length) update({ photos: [...photos, ...added] });
            }}
          >
            <Icon name="image" size={16} /> {t('addPhotos')}
          </button>
          <div className="visibility-switch jm-vis" role="radiogroup" aria-label={t('journalVisibility')}>
            <button type="button" role="radio" aria-checked={isPrivate} className={isPrivate ? 'active' : ''} onClick={() => update({ visibility: 'private' })}>
              <Icon name="lock" size={13} /> {t('private')}
            </button>
            <button type="button" role="radio" aria-checked={!isPrivate} className={!isPrivate ? 'active' : ''} onClick={() => update({ visibility: 'shared' })}>
              <Icon name="heart" size={13} className="heart-icon" /> {t('shared')}
            </button>
          </div>
          <span className="spacer" />
          {savedPulse > 0 && (
            <span className="jm-saved" key={savedPulse}>
              <Icon name="check" size={14} /> {t('saved')}
            </span>
          )}
          <button type="button" className="jm-btn jm-done" onClick={close}>
            {t('done')}
          </button>
        </footer>
      </div>
      {viewing !== null && <Lightbox photos={photos} index={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
