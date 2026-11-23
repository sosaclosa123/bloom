// Small shared pieces for the Health tab (data hook, number box, formatting).
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StickerArt } from './Stickers';
import { STICKERS } from './stickerDesigns';
import { alive, newMeta } from '../shared/db';
import { emptyProfile, profileOf } from '../shared/health';
import type { HealthItem, HealthProfile } from '../shared/types';
import { useBloom } from './store';

/** All live health records + the profile. `ibd` = IBD parts are shown on this computer. */
export function useHealth() {
  const { snap, settings, save } = useBloom();
  const all = useMemo(() => alive(snap.health ?? []) as HealthItem[], [snap.health]);
  const profile = useMemo(() => profileOf(all), [all]);
  const ibd = settings.healthEnabled && settings.healthIbd;
  /** Saves profile changes (creates the profile the first time). */
  const saveProfile = (patch: Partial<HealthProfile>) => {
    const base: HealthProfile = profile ?? { ...newMeta(), ...emptyProfile() };
    save('health', { ...base, ...patch, visibility: 'private' });
  };
  return { all, profile, ibd, saveProfile };
}

/** "2.1 L" / "750 ml" */
export function useWaterFmt() {
  const { t, locale } = useBloom();
  return (ml: number) =>
    ml >= 1000 ? t('hlLiters', { n: (ml / 1000).toLocaleString(locale, { maximumFractionDigits: 2 }) }) : t('hlMl', { n: Math.round(ml).toLocaleString(locale) });
}

/** A number box that keeps what's typed (e.g. "7." while typing 7.5). */
export function NumBox({
  value,
  onChange,
  unit,
  min = 0,
  max = 100000,
  step = 1,
  label,
  autoFocus,
  className,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  unit?: ReactNode;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => {
    // Follow outside changes, but don't fight the person typing.
    if (value == null ? text !== '' : Number(text) !== value) setText(value == null ? '' : String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <span className={`hl-num ${className ?? ''}`}>
      <input
        type="number"
        inputMode="decimal"
        dir="ltr"
        min={min}
        max={max}
        step={step}
        value={text}
        aria-label={label}
        autoFocus={autoFocus}
        onChange={(e) => {
          setText(e.target.value);
          const n = e.target.value.trim() === '' ? null : Number(e.target.value);
          if (n == null) onChange(null);
          else if (Number.isFinite(n) && n >= min && n <= max) onChange(n);
        }}
      />
      {unit && <span className="hl-num-unit">{unit}</span>}
    </span>
  );
}

/** Row of choice pills (one tap). */
export function Pills<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T | null;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T | null) => void;
  label: string;
  className?: string;
}) {
  return (
    <div className={`hl-pills ${className ?? ''}`} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          className={o.value === value ? 'active' : ''}
          // Tapping the chosen one again clears it.
          onClick={() => onChange(o.value === value ? null : o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- card header with sticker art

export function CardHead({ sticker, title, sub, tip, children }: { sticker?: string; title: ReactNode; sub?: ReactNode; tip?: string; children?: ReactNode }) {
  return (
    <div className="w-card-head hl-head">
      <div className="hl-head-title">
        {sticker && (
          <span className="hl-head-st" aria-hidden="true">
            <StickerArt kind={sticker} size={30} />
          </span>
        )}
        <div>
          <h3>{tip ? <Tip text={tip}>{title}</Tip> : title}</h3>
          {sub && <p className="w-card-sub">{sub}</p>}
        </div>
      </div>
      {children && <div className="hl-head-actions">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- small popover under a tile

export function Popover({ onClose, children, className }: { onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const el = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(el) && !el.closest('[data-pop-anchor]')) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', down);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('keydown', key);
    };
  }, [onClose]);
  return (
    <div ref={ref} className={`hl-pop ${className ?? ''}`} role="dialog">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- sticker choice (same art as the rest of Bloom)

/** Health-ish stickers first, then everything else. */
export const HEALTH_STICKERS = ['pill', 'injection', 'doctor', 'hospital', 'dentist', 'sleep', 'gym', 'run', 'yoga', 'coffee', 'cooking', 'groceries', 'plants', 'flowers', 'important', 'idea', 'done', 'cycle', 'baby'];

export function StickerChoice({ value, onChange, label }: { value: string; onChange: (k: string) => void; label: string }) {
  const kinds = [...HEALTH_STICKERS, ...Object.keys(STICKERS).filter((k) => !HEALTH_STICKERS.includes(k))].filter((k) => STICKERS[k]);
  return (
    <div className="hl-st-grid" role="radiogroup" aria-label={label}>
      {kinds.map((k) => (
        <button type="button" key={k} role="radio" aria-checked={value === k} className={value === k ? 'active' : ''} title={k} onClick={() => onChange(k)}>
          <StickerArt kind={k} size={30} />
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- line chart (weight, test results)

/** Points over time with an optional straight trend line (least squares). Responsive; works in RTL (time stays left-to-right like a graph). */
export function LineChart({
  points,
  fmt,
  trend = true,
  label,
  goal,
  fixed,
  onPick,
  dateLabel,
}: {
  points: { date: string; value: number }[];
  fmt: (v: number) => string;
  trend?: boolean;
  label: string;
  /** A dashed goal line (e.g. the water goal). */
  goal?: { value: number; label: string };
  /** Fixed value range (e.g. mood 1-5). */
  fixed?: [number, number];
  /** Click on a dot (e.g. open that day). */
  onPick?: (date: string) => void;
  /** Date label shown when hovering a dot. */
  dateLabel?: (date: string) => string;
}) {
  if (points.length === 0) return null;
  const W = 600;
  const H = 160;
  const pad = { l: 8, r: 8, t: 14, b: 14 };
  const t0 = Date.parse(points[0].date);
  const t1 = Date.parse(points[points.length - 1].date);
  const span = Math.max(1, t1 - t0);
  const vals = points.map((p) => p.value);
  let lo = Math.min(...vals, ...(goal ? [goal.value] : []));
  let hi = Math.max(...vals, ...(goal ? [goal.value] : []));
  if (fixed) [lo, hi] = fixed;
  if (hi - lo < 1e-9) {
    lo -= 1;
    hi += 1;
  }
  const m = (hi - lo) * (fixed ? 0.08 : 0.15);
  lo -= m;
  hi += m;
  const small = points.length > 45;
  const x = (d: string) => pad.l + ((Date.parse(d) - t0) / span) * (W - pad.l - pad.r) + (points.length === 1 ? (W - pad.l - pad.r) / 2 : 0);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
  let tr: { y0: number; y1: number } | null = null;
  if (trend && points.length >= 3) {
    const xs = points.map((p) => (Date.parse(p.date) - t0) / 86400000);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = vals.reduce((a, b) => a + b, 0) / n;
    const sxx = xs.reduce((a, v) => a + (v - mx) ** 2, 0);
    const slope = sxx ? xs.reduce((a, v, i) => a + (v - mx) * (vals[i] - my), 0) / sxx : 0;
    tr = { y0: my - slope * mx, y1: my + slope * (xs[n - 1] - mx) };
  }
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  return (
    <div className="hl-line" role="img" aria-label={label} dir="ltr">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="hl-line-svg">
        {tr && <line x1={x(points[0].date)} x2={x(points[points.length - 1].date)} y1={y(tr.y0)} y2={y(tr.y1)} className="hl-line-trend" vectorEffect="non-scaling-stroke" />}
        <path d={path} className="hl-line-path" vectorEffect="non-scaling-stroke" />
        {goal && <line x1={pad.l} x2={W - pad.r} y1={y(goal.value)} y2={y(goal.value)} className="hl-line-goal" vectorEffect="non-scaling-stroke" />}
      </svg>
      {goal && (
        <span className="hl-line-goal-label" style={{ top: `${(y(goal.value) / H) * 100}%` }}>
          {goal.label}
        </span>
      )}
      {points.map((p) => (
        <button
          type="button"
          key={p.date}
          className={`hl-line-dot ${small ? 'small' : ''} ${onPick ? 'pick' : ''} ${x(p.date) / W > 0.75 ? 'at-r' : x(p.date) / W < 0.25 ? 'at-l' : ''}`}
          style={{ left: `${(x(p.date) / W) * 100}%`, top: `${(y(p.value) / H) * 100}%` }}
          aria-label={`${dateLabel ? dateLabel(p.date) : p.date} · ${fmt(p.value)}`}
          onClick={onPick ? () => onPick(p.date) : undefined}
          tabIndex={onPick ? 0 : -1}
        >
          <span className="hl-dot-label">
            {dateLabel ? dateLabel(p.date) : p.date} · {fmt(p.value)}
          </span>
        </button>
      ))}
      <span className="hl-line-max">{fmt(Math.max(...vals))}</span>
      <span className="hl-line-min">{fmt(Math.min(...vals))}</span>
      <span className="hl-line-from">{points[0].date.slice(5).split('-').reverse().join('.')}</span>
      <span className="hl-line-to">{points[points.length - 1].date.slice(5).split('-').reverse().join('.')}</span>
    </div>
  );
}

// ---------------------------------------------------------------- "answer the questions again" (from Settings)

let redoPending = false;
const redoListeners = new Set<() => void>();
/** Settings asks to restart the health questions: opens Health and the questionnaire from the start. */
export function requestHealthRedo() {
  redoPending = true;
  window.dispatchEvent(new CustomEvent('bloom:health-redo'));
  redoListeners.forEach((l) => l());
}
export function takeHealthRedo(): boolean {
  const r = redoPending;
  redoPending = false;
  return r;
}
export function onHealthRedo(cb: () => void) {
  const l = () => {
    redoPending = false;
    cb();
  };
  redoListeners.add(l);
  return () => {
    redoListeners.delete(l);
  };
}

// ---------------------------------------------------------------- hover explanation (after 1.3 s)

/** Explanations stay out of sight: hold the mouse over the item for 1.3 s to see them. */
export function Tip({ text, children, className }: { text: ReactNode; children: ReactNode; className?: string }) {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  return (
    <span
      className={`hl-tip ${className ?? ''}`}
      onMouseEnter={() => {
        clear();
        timer.current = setTimeout(() => setShow(true), 1300);
      }}
      onMouseLeave={() => {
        clear();
        setShow(false);
      }}
    >
      {children}
      {show && (
        <span className="hl-tip-bubble" role="tooltip">
          {text}
        </span>
      )}
    </span>
  );
}
