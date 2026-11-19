import { useState, type ReactNode } from 'react';
import { formatRemindBefore, type StringKey } from '../i18n/strings';
import { dateOf, parseLocal, timeOf, toLocalDateTime } from '../shared/dates';
import type { CalendarEvent, Countdown, Repeat, Reminder } from '../shared/types';
import { Button, Field, Icon, IconButton, Modal, Toggle } from './common';
import { COUNTDOWN_EMOJIS, EVENT_COLORS, REMIND_PRESETS } from './drafts';
import { BUILTIN_SOUNDS, playSound } from './sound';
import { useAlive, useBloom } from './store';

/** Collapsible "More options" section that keeps forms short. */
function MoreOptions({ open, children }: { open: boolean; children: ReactNode }) {
  const { t } = useBloom();
  return (
    <details className="more-options" open={open}>
      <summary>
        <Icon name="chevronRight" size={14} className="more-chevron" />
        {t('moreOptions')}
      </summary>
      <div className="more-body">{children}</div>
    </details>
  );
}

const REPEATS: Repeat[] = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

export function RepeatSelect({ value, onChange }: { value: Repeat; onChange: (r: Repeat) => void }) {
  const { t } = useBloom();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as Repeat)}>
      {REPEATS.map((r) => (
        <option key={r} value={r}>
          {t(`repeat_${r}` as StringKey)}
        </option>
      ))}
    </select>
  );
}

export function SoundSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t, settings } = useBloom();
  const sounds = useAlive('sounds');
  return (
    <div className="sound-select">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {BUILTIN_SOUNDS.map((id) => (
          <option key={id} value={id}>
            {t(`builtin_${id.slice(8)}` as StringKey)}
          </option>
        ))}
        {sounds.length > 0 && <option disabled>──────</option>}
        {sounds.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <IconButton icon="play" label={t('play')} onClick={() => playSound(value, settings.volume)} />
    </div>
  );
}

export function RemindersPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const { t, settings } = useBloom();
  const available = REMIND_PRESETS.filter((m) => !value.includes(m));
  return (
    <div className="remind-picker">
      {value.length === 0 && <span className="muted">{t('noReminder')}</span>}
      {[...value]
        .sort((a, b) => a - b)
        .map((m) => (
          <span key={m} className="chip">
            <Icon name="bell" size={12} />
            {formatRemindBefore(settings.language, m)}
            <button type="button" aria-label={t('delete')} onClick={() => onChange(value.filter((x) => x !== m))}>
              <Icon name="close" size={11} />
            </button>
          </span>
        ))}
      {available.length > 0 && (
        <select
          className="chip-add"
          value=""
          aria-label={t('addAnother')}
          onChange={(e) => e.target.value !== '' && onChange([...value, Number(e.target.value)])}
        >
          <option value="">+ {t('addAnother')}</option>
          {available.map((m) => (
            <option key={m} value={m}>
              {formatRemindBefore(settings.language, m)}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ event

export function EventEditor({ initial, isNew, onClose }: { initial: CalendarEvent; isNew: boolean; onClose: () => void }) {
  const { t, save, del, settings } = useBloom();
  const [ev, setEv] = useState(initial);
  const set = (patch: Partial<CalendarEvent>) => setEv((e) => ({ ...e, ...patch }));

  const startD = dateOf(ev.start);
  const endD = dateOf(ev.end);

  const setStart = (date: string, time: string) => {
    // Keep the duration when the start moves.
    const dur = parseLocal(ev.end).getTime() - parseLocal(ev.start).getTime();
    const s = parseLocal(`${date}T${time}`);
    const e = new Date(s.getTime() + Math.max(0, dur));
    set({ start: toLocalDateTime(s), end: ev.allDay ? `${dateOf(toLocalDateTime(e))}T23:59` : toLocalDateTime(e) });
  };
  const setEnd = (date: string, time: string) => {
    let end = `${date}T${time}`;
    if (parseLocal(end) < parseLocal(ev.start)) end = ev.allDay ? `${startD}T23:59` : ev.start;
    set({ end });
  };

  const commit = () => {
    save('events', { ...ev, title: ev.title.trim() });
    onClose();
  };

  return (
    <Modal
      title={isNew ? t('newEvent') : t('editEvent')}
      onClose={onClose}
      width={580}
      footer={
        <>
          {!isNew && (
            <Button
              variant="danger"
              icon="trash"
              onClick={() => {
                del('events', initial, `${t('deleted')}: ${initial.title || '—'}`);
                onClose();
              }}
            >
              {t('delete')}
            </Button>
          )}
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="primary" onClick={commit}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <input
          className="title-input"
          autoFocus
          value={ev.title}
          placeholder={t('titlePlaceholder')}
          aria-label={t('title')}
          onChange={(e) => set({ title: e.target.value })}
        />

        <div className="color-row" role="radiogroup" aria-label={t('color')}>
          {EVENT_COLORS.map((c) => (
            <button
              type="button"
              key={c}
              role="radio"
              aria-checked={ev.color === c}
              aria-label={c}
              className={`swatch ev-${c} ${ev.color === c ? 'active' : ''}`}
              onClick={() => set({ color: c })}
            />
          ))}
        </div>

        <Toggle
          checked={ev.allDay}
          label={t('allDay')}
          onChange={(allDay) =>
            set(
              allDay
                ? { allDay, start: `${startD}T00:00`, end: `${endD}T23:59`, remindBefore: [] }
                : { allDay, start: `${startD}T09:00`, end: `${startD}T10:00`, remindBefore: [...settings.defaultRemindBefore] },
            )
          }
        />

        <div className="grid-2">
          <Field label={t('starts')}>
            <div className="dt">
              <input type="date" value={startD} onChange={(e) => e.target.value && setStart(e.target.value, timeOf(ev.start))} />
              {!ev.allDay && (
                <input type="time" value={timeOf(ev.start)} onChange={(e) => e.target.value && setStart(startD, e.target.value)} />
              )}
            </div>
          </Field>
          <Field label={t('ends')}>
            <div className="dt">
              <input type="date" value={endD} min={startD} onChange={(e) => e.target.value && setEnd(e.target.value, timeOf(ev.end))} />
              {!ev.allDay && <input type="time" value={timeOf(ev.end)} onChange={(e) => e.target.value && setEnd(endD, e.target.value)} />}
            </div>
          </Field>
        </div>

        <Field label={t('remindMe')}>
          <RemindersPicker value={ev.remindBefore} onChange={(remindBefore) => set({ remindBefore })} />
        </Field>

        <MoreOptions open={ev.repeat !== 'none' || !!ev.location || !!ev.notes || ev.visibility === 'private'}>
        <div className="grid-2">
          <Field label={t('repeat')}>
            <RepeatSelect value={ev.repeat} onChange={(repeat) => set({ repeat })} />
          </Field>
          <Field label={t('sound')}>
            <SoundSelect value={ev.sound} onChange={(sound) => set({ sound })} />
          </Field>
        </div>

        <Field label={t('location')}>
          <input value={ev.location} placeholder={t('locationPlaceholder')} onChange={(e) => set({ location: e.target.value })} />
        </Field>
        <Field label={t('notes')}>
          <textarea rows={3} value={ev.notes} placeholder={t('notesPlaceholder')} onChange={(e) => set({ notes: e.target.value })} />
        </Field>

        <Toggle
          checked={ev.visibility === 'private'}
          label={
            <>
              <Icon name="lock" size={14} /> {t('privateItem')}
            </>
          }
          onChange={(p) => set({ visibility: p ? 'private' : 'shared' })}
        />
        </MoreOptions>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ reminder

export function ReminderEditor({ initial, isNew, onClose }: { initial: Reminder; isNew: boolean; onClose: () => void }) {
  const { t, save, del } = useBloom();
  const [r, setR] = useState(initial);
  const set = (patch: Partial<Reminder>) => setR((x) => ({ ...x, ...patch }));
  const commit = () => {
    save('reminders', { ...r, title: r.title.trim() });
    onClose();
  };
  return (
    <Modal
      title={isNew ? t('newReminder') : t('editReminder')}
      onClose={onClose}
      width={460}
      footer={
        <>
          {!isNew && (
            <Button
              variant="danger"
              icon="trash"
              onClick={() => {
                del('reminders', initial, `${t('deleted')}: ${initial.title || '—'}`);
                onClose();
              }}
            >
              {t('delete')}
            </Button>
          )}
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="primary" onClick={commit}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <input
          className="title-input"
          autoFocus
          value={r.title}
          placeholder={t('reminderPlaceholder')}
          aria-label={t('title')}
          onChange={(e) => set({ title: e.target.value })}
        />
        <div className="grid-2">
          <Field label={t('date')}>
            <input type="date" value={dateOf(r.at)} onChange={(e) => e.target.value && set({ at: `${e.target.value}T${timeOf(r.at)}` })} />
          </Field>
          <Field label={t('time')}>
            <input type="time" value={timeOf(r.at)} onChange={(e) => e.target.value && set({ at: `${dateOf(r.at)}T${e.target.value}` })} />
          </Field>
        </div>
        <Toggle
          checked={r.visibility === 'shared'}
          label={
            <>
              <Icon name="heart" size={14} /> {t('sharedWithPartner')}
            </>
          }
          onChange={(on) => set({ visibility: on ? 'shared' : 'private' })}
        />
        <MoreOptions open={r.repeat !== 'none' || !!r.note}>
        <div className="grid-2">
          <Field label={t('repeat')}>
            <RepeatSelect value={r.repeat} onChange={(repeat) => set({ repeat })} />
          </Field>
          <Field label={t('sound')}>
            <SoundSelect value={r.sound} onChange={(sound) => set({ sound })} />
          </Field>
        </div>
        <Field label={t('notes')}>
          <textarea rows={2} value={r.note} placeholder={t('notesPlaceholder')} onChange={(e) => set({ note: e.target.value })} />
        </Field>
        </MoreOptions>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ countdown

export function CountdownEditor({ initial, isNew, onClose }: { initial: Countdown; isNew: boolean; onClose: () => void }) {
  const { t, save, del } = useBloom();
  const [c, setC] = useState(initial);
  const set = (patch: Partial<Countdown>) => setC((x) => ({ ...x, ...patch }));
  const commit = () => {
    save('countdowns', { ...c, title: c.title.trim() });
    onClose();
  };
  return (
    <Modal
      title={isNew ? t('newCountdown') : t('editCountdown')}
      onClose={onClose}
      width={440}
      footer={
        <>
          {!isNew && (
            <Button
              variant="danger"
              icon="trash"
              onClick={() => {
                del('countdowns', initial);
                onClose();
              }}
            >
              {t('delete')}
            </Button>
          )}
          <span className="spacer" />
          <Button variant="ghost" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="primary" onClick={commit}>
            {t('save')}
          </Button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <input
          className="title-input"
          autoFocus
          value={c.title}
          placeholder={t('countdownPlaceholder')}
          aria-label={t('title')}
          onChange={(e) => set({ title: e.target.value })}
        />
        <Field label={t('date')}>
          <input type="date" value={c.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
        </Field>
        <Field label={t('emoji')}>
          <div className="emoji-grid">
            {COUNTDOWN_EMOJIS.map((e) => (
              <button type="button" key={e} className={e === c.emoji ? 'active' : ''} onClick={() => set({ emoji: e })}>
                {e}
              </button>
            ))}
          </div>
        </Field>
        <Toggle checked={c.yearly} label={t('everyYear')} onChange={(yearly) => set({ yearly })} />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
