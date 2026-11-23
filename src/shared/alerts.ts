// Works out which reminders become due in a time window.
// Used by the desktop scheduler now, and by a phone/sync backend later.
import { toLocalDateTime } from './dates';
import { occurrencesBetween } from './recurrence';
import { alive } from './db';
import { medDueOn, profileOf } from './health';
import { behindPace, dayFacts, nudgePlan } from './healthExtras';
import type { FiredAlert, HealthCheckin, HealthMed, HealthMedTaken, Snapshot } from './types';

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
  out.push(...medAlertsBetween(data, from, to), ...healthNudgesBetween(data, from, to));
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
      if (!medDueOn(m, date)) continue; // e.g. an injection every 2 weeks
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

/**
 * Water nudges (if turned on) and the weekly weigh-in reminder. Health must
 * be on. A water nudge comes at the planned times only while you're behind the
 * even pace for the day's goal (see healthExtras.nudgePlan); the weigh-in at
 * 09:00 on the chosen weekday unless a weight was logged in the last 6 days.
 */
export function healthNudgesBetween(data: AlertData, from: number, to: number): FiredAlert[] {
  const s = data.settings;
  if (!s?.healthEnabled || (!s.healthWaterNudge && s.healthWeighDay == null)) return [];
  const all = alive(data.health ?? []);
  const out: FiredAlert[] = [];
  const start = new Date(from);
  for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d.getTime() <= to; d.setDate(d.getDate() + 1)) {
    const date = toLocalDateTime(d).slice(0, 10);
    const at = (min: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(min / 60), min % 60).getTime();
    if (s.healthWaterNudge) {
      const f = dayFacts(all, date, !!s.healthIbd);
      const c = all.find((x): x is HealthCheckin => x.kind === 'checkin' && x.date === date);
      const glass = profileOf(all)?.glassMl || 250;
      const plan = nudgePlan(f.waterGoalMl, glass, c?.wake || '08:00', '23:00');
      for (const slot of plan.slots) {
        const due = at(slot);
        if (due <= from || due > to || !behindPace(plan, f.waterGoalMl, glass, f.waterMl, slot)) continue;
        const hhmm = `${String(Math.floor(slot / 60)).padStart(2, '0')}:${String(slot % 60).padStart(2, '0')}`;
        out.push({ key: `water@${date}T${hhmm}`, sourceId: 'water', kind: 'water', title: '', when: `${date}T${hhmm}`, dueAt: due, minutesBefore: 0, sound: s.defaultSound });
      }
    }
    if (s.healthWeighDay != null && d.getDay() === s.healthWeighDay) {
      const due = at(9 * 60);
      const weekAgo = toLocalDateTime(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6)).slice(0, 10);
      const recent = all.some((x) => x.kind === 'body' && !!x.weightKg && x.date >= weekAgo && x.date <= date);
      if (due > from && due <= to && !recent) out.push({ key: `weigh@${date}`, sourceId: 'weigh', kind: 'weigh', title: '', when: `${date}T09:00`, dueAt: due, minutesBefore: 0, sound: s.defaultSound });
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
