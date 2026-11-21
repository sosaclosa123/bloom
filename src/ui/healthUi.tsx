// Small shared pieces for the Health tab (data hook, number box, formatting).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
