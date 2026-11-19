// Israeli seasons: a soft color per month (approved palette), a matching
// "ink" color for the month title, and a very subtle animated layer
// (snow / petals / summer glints / falling leaves) for a little atmosphere.
import { useMemo } from 'react';

// Default month colors: "Earth & clay" — soft, close to the background.
// Winter stone-blue, spring sage, summer soft clay, autumn brown (Jan..Dec).
export const DEFAULT_MONTH_BG = ['#e1e6ec', '#e3e8e6', '#e2e9db', '#e7ebd8', '#ece9d6', '#f2e6d5', '#f3dfd2', '#f1dbd1', '#ede2d2', '#e8dccf', '#e5ded4', '#e4e7ea'];

// The person can pick their own color per month (Year view → color dot).
let custom: (string | null)[] = [];
export function setCustomMonthColors(list: (string | null)[] | undefined) {
  custom = list ?? [];
}

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export function seasonOf(month: number): Season {
  if (month === 11 || month <= 1) return 'winter';
  if (month <= 4) return 'spring';
  if (month <= 7) return 'summer';
  return 'autumn';
}

// ---------------------------------------------------------------- color math

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function mix(a: string, b: string, t: number) {
  const A = hex(a);
  const B = hex(b);
  return '#' + A.map((x, i) => Math.round(x + (B[i] - x) * t).toString(16).padStart(2, '0')).join('');
}

export function hexToHsl(h: string): [number, number, number] {
  const [r, g, b] = hex(h).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const hue = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hue * 60, sat, l];
}

export function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

/** A readable "ink" in the same hue as a soft color: day numbers, Hebrew dates, titles. */
export function inkOf(bg: string, level: 'strong' | 'medium' | 'title' | 'titleDark'): string {
  const [h, s] = hexToHsl(bg);
  const sat = Math.min(0.55, Math.max(0.22, s * 1.4 + 0.12));
  const l = { strong: 0.28, medium: 0.42, title: 0.36, titleDark: 0.8 }[level];
  return hslToHex(h, sat, l);
}

// ---------------------------------------------------------------- per month / per day

/** A month's own color (custom if the person chose one). */
export function monthColor(month: number, _dark?: boolean) {
  return custom[month] || DEFAULT_MONTH_BG[month];
}
export function monthInk(month: number, dark: boolean) {
  return inkOf(monthColor(month), dark ? 'titleDark' : 'title');
}

const BLEND_DAYS = 4;
/**
 * A day's color: its month's own color, gently blending toward the
 * neighbouring month over the last / first 4 days. The last day of a month
 * and the 1st of the next meet at the same halfway color, so it flows.
 */
export function dayColor(d: Date, _dark?: boolean) {
  const m = d.getMonth();
  const n = new Date(d.getFullYear(), m + 1, 0).getDate();
  const day = d.getDate();
  const own = monthColor(m);
  const toEnd = n - day; // 0 on the last day
  if (toEnd < BLEND_DAYS) return mix(own, monthColor((m + 1) % 12), 0.5 * (1 - toEnd / BLEND_DAYS));
  const fromStart = day - 1; // 0 on the 1st
  if (fromStart < BLEND_DAYS) return mix(own, monthColor((m + 11) % 12), 0.5 * (1 - fromStart / BLEND_DAYS));
  return own;
}

// ---------------------------------------------------------------- particles

const SHAPES: Record<Season, string[]> = {
  winter: [
    '<g stroke="#9db8dc" stroke-width="1.6" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5"/></g>',
    '<circle cx="12" cy="12" r="3.2" fill="#c6d6ee"/>',
  ],
  spring: [
    '<path d="M12 3c5 3 6 9 0 18C6 12 7 6 12 3z" fill="#efbccb"/>',
    '<path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16z" fill="#b3cfa6"/><path d="M4 20L16 8" stroke="#8fae86" stroke-width="1.2"/>',
  ],
  summer: [
    '<circle cx="12" cy="12" r="4" fill="#f6c97f"/><g stroke="#f6c97f" stroke-width="1.4" stroke-linecap="round"><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></g>',
    '<circle cx="12" cy="12" r="5" fill="#f9d7a6"/>',
  ],
  autumn: [
    '<path d="M12 2l2 5 5-1-2 5 4 3-5 1 1 5-5-3-5 3 1-5-5-1 4-3-2-5 5 1z" fill="#d9a074"/>',
    '<path d="M4 20C4 10 10 4 20 4c0 10-6 16-16 16z" fill="#c98f62"/><path d="M4 20L16 8" stroke="#a87554" stroke-width="1.2"/>',
  ],
};

/** Deterministic pseudo-random numbers so particles don't jump on re-render. */
function rand(seed: number) {
  let x = seed;
  return () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
}

export function SeasonLayer({ month, count = 14 }: { month: number; count?: number }) {
  const season = seasonOf(month);
  const items = useMemo(() => {
    const r = rand(month * 97 + 13);
    return Array.from({ length: count }, (_, i) => ({
      i,
      left: r() * 100,
      size: 9 + r() * 9,
      dur: (18 + r() * 16) * 0.9, // 10% faster than before
      delay: -r() * 30,
      sway: 8 + r() * 22,
      shape: SHAPES[season][i % SHAPES[season].length],
    }));
  }, [month, count, season]);
  return (
    <div className={`season-layer season-${season}`} aria-hidden="true">
      {items.map((p) => (
        <span
          key={p.i}
          className="particle"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
            ['--sway' as string]: `${p.sway}px`,
          }}
        >
          <svg viewBox="0 0 24 24" width="100%" height="100%" dangerouslySetInnerHTML={{ __html: p.shape }} />
        </span>
      ))}
    </div>
  );
}
