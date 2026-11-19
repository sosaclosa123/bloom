// Year view: all 12 months side by side in rounded cards. Each card has a
// small color dot that opens the month color menu (wheel, pastel-only
// toggle, # code box).
import { useEffect, useMemo, useRef, useState } from 'react';
import { monthGrid, sameDay, toISODate } from '../shared/dates';
import type { ISODate } from '../shared/types';
import { weekdayNames } from './calendarData';
import { Toggle } from './common';
import { DEFAULT_MONTH_BG, dayColor, hexToHsl, hslToHex, inkOf, monthColor, monthInk } from './season';
import { useAlive, useBloom } from './store';

interface Props {
  year: number;
  onOpenMonth: (month: number) => void;
  onOpenDay: (date: ISODate) => void;
}

export function YearView({ year, onOpenMonth, onOpenDay }: Props) {
  const { settings, locale, t } = useBloom();
  const events = useAlive('events');
  const [colorFor, setColorFor] = useState<{ month: number; anchor: HTMLElement } | null>(null);
  const today = new Date();
  const names = weekdayNames(locale, settings.weekStart, 'narrow');
  const busy = useMemo(() => new Set(events.map((e) => e.start.slice(0, 10))), [events]);

  return (
    <div className="year calendar-light">
      <div className="year-grid">
        {Array.from({ length: 12 }, (_, m) => {
          const grid = monthGrid(year, m, settings.weekStart);
          const ink = inkOf(monthColor(m), 'strong');
          return (
            <section key={m} className="year-card" style={{ ['--i' as string]: m, ['--card-bg' as string]: monthColor(m) }}>
              <header className="year-card-head">
                <button type="button" className="year-month" style={{ color: monthInk(m, false) }} onClick={() => onOpenMonth(m)}>
                  {new Date(year, m, 1).toLocaleDateString(locale, { month: 'long' })}
                </button>
                <button
                  type="button"
                  className="color-dot"
                  style={{ background: monthColor(m) }}
                  aria-label={t('monthColor')}
                  title={t('monthColor')}
                  onClick={(e) => setColorFor({ month: m, anchor: e.currentTarget })}
                />
              </header>
              <div className="year-mini">
                {names.map((n, i) => (
                  <span key={`h${i}`} className="ym-head">
                    {n}
                  </span>
                ))}
                {grid.map((d) => {
                  const iso = toISODate(d);
                  const inMonth = d.getMonth() === m;
                  return (
                    <button
                      type="button"
                      key={iso}
                      className={`ym-day ${inMonth ? '' : 'out'} ${sameDay(d, today) ? 'today' : ''} ${busy.has(iso) && inMonth ? 'busy' : ''}`}
                      style={inMonth ? { background: dayColor(d), color: ink } : undefined}
                      onClick={() => inMonth && onOpenDay(iso)}
                      tabIndex={inMonth ? 0 : -1}
                    >
                      {inMonth ? d.getDate() : ''}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      {colorFor && <ColorMenu month={colorFor.month} anchor={colorFor.anchor} onClose={() => setColorFor(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- color menu

const PASTEL_L = 0.9;
const PASTEL_MAX_S = 0.6;

function ColorMenu({ month, anchor, onClose }: { month: number; anchor: HTMLElement; onClose: () => void }) {
  const { t, settings, setSettings, locale } = useBloom();
  const current = monthColor(month);
  const [h0, s0, l0] = hexToHsl(current);
  const [hue, setHue] = useState(h0);
  const [sat, setSat] = useState(s0);
  const [light, setLight] = useState(l0);
  const [pastel, setPastel] = useState(true);
  const [code, setCode] = useState(current);
  const box = useRef<HTMLDivElement>(null);
  const wheel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: -9999, top: -9999 });

  const apply = (hexColor: string | null) => {
    const list = Array.from({ length: 12 }, (_, i) => settings.monthColors?.[i] ?? null);
    list[month] = hexColor;
    setSettings({ monthColors: list });
  };
  const fromHsl = (h: number, s: number, l: number) => {
    const ss = pastel ? Math.min(s, PASTEL_MAX_S) : s;
    const ll = pastel ? PASTEL_L : l;
    const out = hslToHex(h, ss, ll);
    setCode(out);
    apply(out);
  };

  useEffect(() => {
    const a = anchor.getBoundingClientRect();
    const w = 280;
    const hgt = box.current?.offsetHeight ?? 400;
    setPos({
      left: Math.min(Math.max(8, a.left + a.width / 2 - w / 2), window.innerWidth - w - 8),
      top: a.bottom + 8 + hgt > window.innerHeight ? Math.max(8, a.top - hgt - 8) : a.bottom + 8,
    });
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && e.target !== anchor && onClose();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);

  const pick = (e: React.PointerEvent) => {
    const r = wheel.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    const h = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    const s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2));
    setHue(h);
    setSat(s);
    fromHsl(h, s, light);
  };

  const L = pastel ? PASTEL_L : light;
  const markerR = (pastel ? Math.min(sat, PASTEL_MAX_S) / PASTEL_MAX_S : sat) * 50;
  const angle = (hue * Math.PI) / 180;

  return (
    <div ref={box} className="color-menu" style={pos} role="dialog" aria-label={t('monthColor')}>
      <div className="cm-title">
        <span className="cm-swatch" style={{ background: code }} />
        {t('monthColor')} · {new Date(2024, month, 1).toLocaleDateString(locale, { month: 'long' })}
      </div>
      <div
        ref={wheel}
        className="cm-wheel"
        style={{
          background: `radial-gradient(closest-side, hsl(0 0% ${L * 100}%), transparent), conic-gradient(${Array.from({ length: 13 }, (_, i) => `hsl(${i * 30} ${(pastel ? PASTEL_MAX_S : 1) * 100}% ${L * 100}%)`).join(',')})`,
        }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          pick(e);
        }}
        onPointerMove={(e) => e.buttons === 1 && pick(e)}
      >
        <span className="cm-marker" style={{ left: `${50 + Math.sin(angle) * markerR}%`, top: `${50 - Math.cos(angle) * markerR}%`, background: code }} />
      </div>
      {!pastel && (
        <label className="cm-row">
          <span className="muted small">{t('lightness')}</span>
          <input
            type="range"
            min={0.3}
            max={0.97}
            step={0.01}
            value={light}
            onChange={(e) => {
              const l = Number(e.target.value);
              setLight(l);
              fromHsl(hue, sat, l);
            }}
          />
        </label>
      )}
      <Toggle checked={pastel} label={t('pastelOnly')} onChange={setPastel} />
      <label className="cm-row">
        <span className="muted small">#</span>
        <input
          className="cm-code"
          dir="ltr"
          value={code.replace('#', '')}
          maxLength={6}
          aria-label={t('colorCode')}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
            setCode('#' + v);
            if (v.length === 6) {
              const [h, s, l] = hexToHsl('#' + v);
              setHue(h);
              setSat(s);
              setLight(l);
              setPastel(false);
              apply('#' + v.toLowerCase());
            }
          }}
        />
      </label>
      <div className="cm-foot">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => {
            apply(null);
            setCode(DEFAULT_MONTH_BG[month]);
          }}
        >
          {t('resetColor')}
        </button>
        <span className="spacer" />
        <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
          {t('done')}
        </button>
      </div>
    </div>
  );
}
