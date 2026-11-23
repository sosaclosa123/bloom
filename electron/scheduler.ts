// Fires reminders at their exact time (checked every few seconds).
// Runs in the main process so it works while the window is hidden in the tray.
import { alertsDueBetween } from '../src/shared/alerts';
import type { FiredAlert, Snapshot } from '../src/shared/types';
import { isGaming } from './gameMode';
import { StateFile } from './store';

const TICK_MS = 5000;
const MAX_CATCH_UP_MS = 24 * 3600 * 1000; // after the PC was off, show up to a day of missed reminders

interface SchedulerState {
  lastCheck: number;
  snoozed: { alert: FiredAlert; until: number }[];
  /** Reminders held back while gaming, shown when the game ends. */
  missed: FiredAlert[];
}

export type DeliveryReason = 'now' | 'afterGame' | 'whileClosed';

export interface SchedulerHooks {
  getData: () => Snapshot;
  show: (alerts: FiredAlert[], reason: DeliveryReason) => void;
  playSound: (soundId: string, soft: boolean) => void;
  onMissedChange: (missed: FiredAlert[]) => void;
}

export class Scheduler {
  private state = new StateFile<SchedulerState>('scheduler-state.json', {
    lastCheck: Date.now(),
    snoozed: [],
    missed: [],
  });
  private s: SchedulerState;
  private timer: NodeJS.Timeout | null = null;
  private firstTick = true;

  constructor(private hooks: SchedulerHooks) {
    this.s = this.state.read();
  }

  start() {
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.save();
  }

  get missed() {
    return this.s.missed;
  }

  clearMissed() {
    this.s.missed = [];
    this.save();
    this.hooks.onMissedChange([]);
  }

  snooze(alert: FiredAlert, minutes: number) {
    this.s.snoozed.push({ alert, until: Date.now() + minutes * 60000 });
    this.save();
  }

  tick() {
    const now = Date.now();
    const data = this.hooks.getData();
    const from = Math.max(this.s.lastCheck, now - MAX_CATCH_UP_MS);
    const due = from < now ? alertsDueBetween(data, from, now) : [];

    // Snoozes that are now due.
    const stillSnoozed: SchedulerState['snoozed'] = [];
    for (const sn of this.s.snoozed) {
      if (sn.until <= now) due.push({ ...sn.alert, dueAt: sn.until, key: `${sn.alert.key}~${sn.until}` });
      else stillSnoozed.push(sn);
    }
    this.s.snoozed = stillSnoozed;
    this.s.lastCheck = now;

    const gaming = due.length > 0 || this.s.missed.length > 0 ? isGaming(data.settings.gameMode) : false;

    if (due.length > 0) {
      // Anything that was due over 2 minutes ago fired while the app/PC was off.
      const late = due.filter((a) => a.dueAt < now - 2 * 60000);
      const onTime = due.filter((a) => a.dueAt >= now - 2 * 60000);
      if (gaming) {
        // Water nudges are only useful right now: never kept for after the game.
        const keep = due.filter((a) => a.kind !== 'water');
        this.s.missed.push(...keep.map((a) => ({ ...a, missedWhileGaming: true })));
        const soft = onTime.filter((a) => a.kind !== 'water');
        if (soft.length && data.settings.gameModeSoftSound) this.hooks.playSound(soft[0].sound, true);
        this.hooks.onMissedChange(this.s.missed);
      } else {
        if (late.length) this.hooks.show(late, 'whileClosed');
        if (onTime.length) {
          this.hooks.show(onTime, 'now');
          this.hooks.playSound(onTime[0].sound, false);
        }
      }
    } else if (this.s.missed.length > 0 && !gaming) {
      // Game is over: show everything that was held back.
      this.hooks.show(this.s.missed, 'afterGame');
      this.s.missed = [];
      this.hooks.onMissedChange([]);
    }

    if (due.length || this.firstTick) this.save();
    else if (now % 60000 < TICK_MS) this.save(); // persist lastCheck about once a minute
    this.firstTick = false;
  }

  private save() {
    this.state.write(this.s);
  }
}
