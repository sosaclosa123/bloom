import { useState, type ReactNode } from 'react';
import { formatRemindBefore, type StringKey } from '../i18n/strings';
import { dateOf, parseLocal, timeOf, toLocalDateTime } from '../shared/dates';
import type { CalendarEvent, Countdown, Repeat, Reminder } from '../shared/types';
import { Button, Field, Icon, IconButton, Modal, Toggle } from './common';
import { EVENT_COLORS } from './drafts';
import { COUNTDOWN_STICKERS, countdownSticker, StickerArt } from './Stickers';
import { STICKERS } from './stickerDesigns';
import { platform } from '../platform/api';
import { hebrewDateLabel } from '../shared/holidays';
import { BUILTIN_SOUNDS, playSound } from './sound';
import { useAlive, useBloom } from './store';

/** Collapsible "More options" section that keeps forms short. */
function MoreOptions({ open, children, label }: { open: boolean; children: ReactNode; label?: string }) {
  const { t } = useBloom();
  // Remember open/closed ourselves: only the initial state comes from `open`,
  // so editing a field inside never collapses the section.
  const [isOpen, setIsOpen] = useState(open);
  return (
    <details className="more-options" open={isOpen} onToggle={(e) => setIsOpen((e.target as HTMLDetailsElement).open)}>
      <summary>
        <Icon name="chevronRight" size={14} className="more-chevron" />
        {label ?? t('moreOptions')}
      </summary>
      <div className="more-body">{children}</div>
    </details>
  );
}

/** "Share with partner" switch — everything is private unless this is on. */
export function ShareToggle({ value, onChange }: { value: 'shared' | 'private'; onChange: (v: 'shared' | 'private') => void }) {
  const { t } = useBloom();
  return (
    <Toggle
      checked={value === 'shared'}
      label={
        <>
          <Icon name={value === 'shared' ? 'people' : 'lock'} size={14} /> {value === 'shared' ? t('sharedWithPartner') : t('privateOnlyMe')}
        </>
      }
      onChange={(on) => onChange(on ? 'shared' : 'private')}
    />
  );
}

const REPEATS: Repeat[] = ['none', 'daily', 'weekly', 'monthly', 'yearly', 'hebrewYearly'];

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

/** "Every [2] weeks": how many days/weeks/months/years between repeats. */
export function RepeatEvery({ repeat, value, onChange }: { repeat: Repeat; value: number; onChange: (n: number) => void }) {
  const { t } = useBloom();
  const [text, setText] = useState(String(value));
  const unit = repeat === 'hebrewYearly' ? 'yearly' : repeat;
  const n = Number(text);
  return (
    <div className="repeat-every">
      <span>{t('repeatEvery')}</span>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={99}
        value={text}
        aria-label={`${t('repeatEvery')} (1–99)`}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 2);
          setText(raw);
          const v = Number(raw);
          if (v >= 1 && v <= 99) onChange(v);
        }}
        onBlur={() => {
          if (!(n >= 1 && n <= 99)) {
            setText('1');
            onChange(1);
          }
        }}
      />
      <span>{t(`repeatUnit_${unit}${(n || 1) === 1 ? '' : '_n'}` as StringKey)}</span>
      <span className="muted small">{t('repeatEveryHint')}</span>
    </div>
  );
}

export function SoundSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t, settings } = useBloom();
  const sounds = useAlive('sounds');
  return (
    <div className="sound-select">
      <select
        value={value}
        onChange={async (e) => {
          if (e.target.value === '__upload') {
            const s = await platform.importSound();
            if (s) {
              onChange(s.id);
              playSound(s.id, settings.volume);
            }
            return;
          }
          onChange(e.target.value);
        }}
      >
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
        <option disabled>──────</option>
        <option value="__upload">＋ {t('uploadSound')}</option>
      </select>
      <IconButton icon="play" label={t('play')} onClick={() => playSound(value, settings.volume)} />
    </div>
  );
}

const UNITS = [
  { key: 'unitMinutes', mins: 1 },
  { key: 'unitHours', mins: 60 },
  { key: 'unitDays', mins: 1440 },
  { key: 'unitWeeks', mins: 10080 },
  { key: 'unitMonths', mins: 43200 },
] as const;
const MAX_NOTIFY = 20;

/** "Notify me": one small row — [number 1–60] [unit ▾] [+] — and a chip per notification. */
export function RemindersPicker({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const { t, settings } = useBloom();
  const [amount, setAmount] = useState(15);
  const [unit, setUnit] = useState<number>(1);
  const mins = amount * unit;
  const full = value.length >= MAX_NOTIFY;
  const add = () => !full && !value.includes(mins) && onChange([...value, mins].sort((a, b) => a - b));
  return (
    <div className="notify">
      <div className="notify-add">
        <input
          type="number"
          min={1}
          max={60}
          inputMode="numeric"
          value={amount}
          aria-label={t('amount')}
          onChange={(e) => setAmount(Math.min(60, Math.max(1, Math.round(Number(e.target.value) || 1))))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <select value={unit} aria-label={t('unit')} onChange={(e) => setUnit(Number(e.target.value))}>
          {UNITS.map((u) => (
            <option key={u.mins} value={u.mins}>
              {t(u.key)}
            </option>
          ))}
        </select>
        <button type="button" className="notify-plus" aria-label={t('addAnother')} title={t('addAnother')} disabled={full || value.includes(mins)} onClick={add}>
          <Icon name="plus" size={16} />
        </button>
      </div>
      {value.length > 0 && (
        <div className="remind-picker">
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
        </div>
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
          dir="auto"
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
        {ev.remindBefore.length > 0 && (
          <MoreOptions open={false} label={t('notificationSound')}>
            <SoundSelect value={ev.sound} onChange={(sound) => set({ sound })} />
          </MoreOptions>
        )}

        <ShareToggle value={ev.visibility} onChange={(visibility) => set({ visibility })} />

        <MoreOptions open={ev.repeat !== 'none' || !!ev.notes}>
          <Field label={t('repeat')}>
            <RepeatSelect value={ev.repeat} onChange={(repeat) => set({ repeat })} />
            {ev.repeat !== 'none' && <RepeatEvery repeat={ev.repeat} value={ev.repeatEvery ?? 1} onChange={(repeatEvery) => set({ repeatEvery })} />}
            {ev.repeat === 'hebrewYearly' && (
              <span className="muted small">{t('hebrewRepeatHint', { d: hebrewDateLabel(parseLocal(ev.start), 'he') })}</span>
            )}
          </Field>
          <Field label={t('notes')}>
            <textarea dir="auto" className="notebook" rows={4} value={ev.notes} placeholder={t('notesPlaceholder')} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
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
          dir="auto"
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
        <ShareToggle value={r.visibility} onChange={(visibility) => set({ visibility })} />
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
          <textarea dir="auto" className="notebook" rows={3} value={r.note} placeholder={t('notesPlaceholder')} onChange={(e) => set({ note: e.target.value })} />
        </Field>
        </MoreOptions>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ countdown

export function CountdownEditor({ initial, isNew, onClose }: { initial: Countdown; isNew: boolean; onClose: () => void }) {
  const { t, save, del, settings } = useBloom();
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
          dir="auto"
          autoFocus
          value={c.title}
          placeholder={t('countdownPlaceholder')}
          aria-label={t('title')}
          onChange={(e) => set({ title: e.target.value })}
        />
        <Field label={t('date')}>
          <input type="date" value={c.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
        </Field>
        <Field label={t('sticker')}>
          <div className="emoji-grid cd-sticker-grid">
            {COUNTDOWN_STICKERS.map((k) => (
              <button
                type="button"
                key={k}
                className={k === countdownSticker(c.emoji) ? 'active' : ''}
                title={settings.language === 'he' ? STICKERS[k].labelHe : STICKERS[k].label}
                aria-label={settings.language === 'he' ? STICKERS[k].labelHe : STICKERS[k].label}
                onClick={() => set({ emoji: k })}
              >
                <StickerArt kind={k} size={34} />
              </button>
            ))}
          </div>
        </Field>
        <Toggle checked={c.yearly} label={t('everyYear')} onChange={(yearly) => set({ yearly })} />
        <ShareToggle value={c.visibility} onChange={(visibility) => set({ visibility })} />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
