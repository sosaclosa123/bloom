// Built-in reminder sounds are synthesized (no audio files to ship), custom
// sounds are played from the user's own files.
import { platform } from '../platform/api';

export const BUILTIN_SOUNDS = ['builtin:chime', 'builtin:bell', 'builtin:pop', 'builtin:harp', 'builtin:silent'] as const;

let ctx: AudioContext | null = null;
const audio = () => (ctx ??= new AudioContext());

function tone(freq: number, at: number, dur: number, vol: number, type: OscillatorType = 'sine') {
  const c = audio();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t = c.currentTime + at;
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function playBuiltin(name: string, vol: number) {
  switch (name) {
    case 'chime':
      tone(880, 0, 0.9, vol * 0.5);
      tone(1318.5, 0.16, 1.1, vol * 0.4);
      break;
    case 'bell':
      tone(660, 0, 1.6, vol * 0.5);
      tone(1320, 0, 1.0, vol * 0.18);
      tone(1980, 0, 0.6, vol * 0.08);
      break;
    case 'pop':
      tone(520, 0, 0.18, vol * 0.6, 'triangle');
      tone(780, 0.09, 0.22, vol * 0.5, 'triangle');
      break;
    case 'harp':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.09, 0.9, vol * 0.35, 'triangle'));
      break;
    case 'soft':
      tone(740, 0, 0.7, vol * 0.25);
      break;
  }
}

const cache = new Map<string, string>();

export async function playSound(id: string, volume: number, soft = false) {
  if (!id || id === 'builtin:silent') return;
  const vol = Math.max(0, Math.min(1, volume)) * (soft ? 0.35 : 1);
  try {
    if (audio().state === 'suspended') await audio().resume();
  } catch {
    /* ignore */
  }
  if (soft) {
    playBuiltin('soft', vol * 2);
    return;
  }
  if (id.startsWith('builtin:')) {
    playBuiltin(id.slice(8), vol);
    return;
  }
  let url = cache.get(id);
  if (!url) {
    url = (await platform.soundData(id)) ?? undefined;
    if (!url) return playBuiltin('chime', vol);
    cache.set(id, url);
  }
  const el = new Audio(url);
  el.volume = vol;
  el.play().catch(() => playBuiltin('chime', vol));
}
