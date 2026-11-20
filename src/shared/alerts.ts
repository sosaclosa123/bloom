// Works out which reminders become due in a time window.
// Used by the desktop scheduler now, and by a phone/sync backend later.
import { toLocalDateTime } from './dates';
import { occurrencesBetween } from './recurrence';
import type { FiredAlert, Snapshot } from './types';

/** All alerts whose fire time is in (from, to]. */
export function alertsDueBetween(data: Pick<Snapshot, 'events' | 'reminders'>, from: number, to: number): FiredAlert[] {
  const out: FiredAlert[] = [];
  const maxLead = 7 * 24 * 60; // reminders up to a week ahead of an event

  for (const ev of data.events) {
    if (ev.deletedAt || ev.remindBefore.length === 0) continue;
    // Look at occurrences that start in (from, to + maxLead].
    const occs = occurrencesBetween(ev.start, ev.repeat, new Date(from), new Date(to + maxLead * 60000 + 1), 0, ev.repeatEvery);
    for (const occ of occs) {
      for (const mins of ev.remindBefore) {
        const due = occ.getTime() - mins * 60000;
        if (due > from && due <= to) {
          out.push({
            key: `${ev.id}@${toLocalDateTime(occ)}#${mins}`,
            sourceId: ev.id,
            kind: 'event',
            title: ev.title,
            when: toLocalDateTime(occ),
            dueAt: due,
            minutesBefore: mins,
            sound: ev.sound,
          });
        }
      }
    }
  }

  for (const r of data.reminders) {
    if (r.deletedAt) continue;
    for (const occ of occurrencesBetween(r.at, r.repeat, new Date(from + 1), new Date(to + 1))) {
      out.push({
        key: `${r.id}@${toLocalDateTime(occ)}`,
        sourceId: r.id,
        kind: 'reminder',
        title: r.title,
        when: toLocalDateTime(occ),
        dueAt: occ.getTime(),
        minutesBefore: 0,
        sound: r.sound,
      });
    }
  }
  return out.sort((a, b) => a.dueAt - b.dueAt);
}

/** Next upcoming fire time after `now` (for display only). */
export function nextAlertTime(data: Pick<Snapshot, 'events' | 'reminders'>, now: number): number | null {
  const week = 7 * 86400000;
  const due = alertsDueBetween(data, now, now + week);
  return due.length ? due[0].dueAt : null;
}
