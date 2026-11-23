// Works out which reminders become due in a time window.
// Used by the desktop scheduler now, and by a phone/sync backend later.
import { toLocalDateTime } from './dates';
import { occurrencesBetween } from './recurrence';
import type { FiredAlert, HealthMed, HealthMedTaken, Snapshot } from './types';

type AlertData = Pick<Snapshot, 'events' | 'reminders'> & Partial<Pick<Snapshot, 'health' | 'settings'>>;

/** All alerts whose fire time is in (from, to]. */
export function alertsDueBetween(data: AlertData, from: number, to: number): FiredAlert[] {
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
  out.push(...medAlertsBetween(data, from, to));
  return out.sort((a, b) => a.dueAt - b.dueAt);
}

/**
 * Medication reminders (Health tab). Only on a computer where Health is on.
 * The title stays generic ('' = "Medication") unless the person chose to show
 * medicine names. A dose already marked as taken isn't reminded.
 */
export function medAlertsBetween(data: AlertData, from: number, to: number): FiredAlert[] {
  const s = data.settings;
  if (!s?.healthEnabled || !data.health?.length) return [];
  const out: FiredAlert[] = [];
  const meds = data.health.filter((h): h is HealthMed => h.kind === 'med' && !h.deletedAt && h.active && h.remind);
  if (!meds.length) return out;
  const taken = data.health.filter((h): h is HealthMedTaken => h.kind === 'taken' && !h.deletedAt);
  const start = new Date(from);
  // Each day touched by the window (usually just today).
  for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d.getTime() <= to; d.setDate(d.getDate() + 1)) {
    const date = toLocalDateTime(d).slice(0, 10);
    for (const m of meds) {
      for (const time of m.times) {
        const [hh, mm] = time.split(':').map(Number);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) continue;
        const due = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm).getTime();
        if (due <= from || due > to) continue;
        if (taken.some((x) => x.medId === m.id && x.date === date && x.time === time)) continue;
        out.push({
          key: `${m.id}@${date}T${time}`,
          sourceId: m.id,
          kind: 'med',
          title: s.healthMedNames ? [m.name, m.dose].filter((x) => x.trim()).join(' · ') : '',
          when: `${date}T${time}`,
          dueAt: due,
          minutesBefore: 0,
          sound: s.defaultSound,
        });
      }
    }
  }
  return out;
}

/** Next upcoming fire time after `now` (for display only). */
export function nextAlertTime(data: AlertData, now: number): number | null {
  const week = 7 * 86400000;
  const due = alertsDueBetween(data, now, now + week);
  return due.length ? due[0].dueAt : null;
}
