// Israeli seasons: a soft color per month (approved palette), a matching
// "ink" color for the month title, and a very subtle animated layer
// (snow / petals / summer glints / falling leaves) for a little atmosphere.
import { useMemo } from 'react';

// One soft color per month (Jan..Dec), matched to Israel's climate
// (coastal averages: high/low °C, rain):
//  Jan 18/9  ~130mm  wettest & coldest  -> cool rain blue
//  Feb 19/9  ~95mm   cold, almond blossom -> periwinkle lilac
//  Mar 21/11 ~55mm   last rains, green fields, anemones -> fresh green
//  Apr 24/13 ~20mm   full bloom, Pesach -> spring lime
//  May 27/16 dry     warm, first sharav -> butter yellow
//  Jun 29/19 dry     summer starts -> apricot
//  Jul 31/22 dry     hottest, humid -> warm orange
//  Aug 31/23 dry     peak heat -> terracotta rose
//  Sep 30/21 dry     still hot, holidays -> golden sand
//  Oct 28/18 ~15mm   first rain, autumn -> clay amber
//  Nov 24/14 ~75mm   rains return, cooling -> olive sage
//  Dec 20/11 ~120mm  winter rain, misty -> sea-mist teal
// The calendar uses these in light AND dark mode (only the app around it goes dark).
export const MONTH_BG = ['#c9daf4', '#d8d0f3', '#cbe8c8', '#e0ecb9', '#f6e6ad', '#f9d6b0', '#f8c7a2', '#f1b8a8', '#efd8a3', '#e4c7a4', '#d3dcbc', '#c6dfdf'];
// Title colors: deeper versions for the light calendar, pastel versions for the dark top bar.
export const MONTH_INK = ['#3a65a6', '#6553b5', '#3c8a4d', '#6a8c1c', '#a7820f', '#c37633', '#cc6630', '#bf5248', '#a77f22', '#93633b', '#5e7a40', '#357f82'];
export const MONTH_INK_DARK = MONTH_BG;

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';
export function seasonOf(month: number): Season {
  if (month === 11 || month <= 1) return 'winter';
  if (month <= 4) return 'spring';
  if (month <= 7) return 'summer';
  return 'autumn';
}

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function mix(a: string, b: string, t: number) {
  const A = hex(a);
  const B = hex(b);
  return `rgb(${A.map((x, i) => Math.round(x + (B[i] - x) * t)).join(',')})`;
}

/** Day-square color for a month (same in light and dark mode — the calendar stays light). */
export function monthColor(month: number, _dark?: boolean) {
  return MONTH_BG[month];
}
export function monthInk(month: number, dark: boolean) {
  return (dark ? MONTH_INK_DARK : MONTH_INK)[month];
}

/** A day's color fades through its month into the next one (used by the week view). */
export function dayColor(d: Date, _dark?: boolean) {
  const m = d.getMonth();
  const days = new Date(d.getFullYear(), m + 1, 0).getDate();
  return mix(MONTH_BG[m], MONTH_BG[(m + 1) % 12], (d.getDate() - 1) / days);
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
      dur: 18 + r() * 16,
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
