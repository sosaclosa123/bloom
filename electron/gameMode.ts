// Detects whether the user is in a full-screen game (or presentation) so
// reminders don't pop up and kick her out of the game.
//
// Two Windows checks, both read-only:
//  1. SHQueryUserNotificationState — the same signal Windows itself uses to
//     silence notifications during full-screen apps / Direct3D games.
//  2. The foreground window exactly covers its monitor — catches borderless
//     "windowed fullscreen" games that (1) can miss.
import type { GameModeSetting } from '../src/shared/types';

type Probe = () => boolean;

let probe: Probe | null = null;
let probeError: string | null = null;

function loadProbe(): Probe {
  if (probe) return probe;
  if (process.platform !== 'win32') {
    probe = () => false;
    return probe;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi');
    const shell32 = koffi.load('shell32.dll');
    const user32 = koffi.load('user32.dll');

    const HANDLE = koffi.pointer('HANDLE', koffi.opaque());
    koffi.alias('HWND', HANDLE);
    koffi.alias('HMONITOR', HANDLE);
    const RECT = koffi.struct('RECT', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
    koffi.struct('MONITORINFO', { cbSize: 'uint32', rcMonitor: RECT, rcWork: RECT, dwFlags: 'uint32' });

    const SHQueryUserNotificationState = shell32.func('int __stdcall SHQueryUserNotificationState(_Out_ int *pquns)');
    const GetForegroundWindow = user32.func('HWND __stdcall GetForegroundWindow()');
    const GetShellWindow = user32.func('HWND __stdcall GetShellWindow()');
    const GetDesktopWindow = user32.func('HWND __stdcall GetDesktopWindow()');
    const GetWindowRect = user32.func('bool __stdcall GetWindowRect(HWND hWnd, _Out_ RECT *rect)');
    const MonitorFromWindow = user32.func('HMONITOR __stdcall MonitorFromWindow(HWND hwnd, uint32 flags)');
    const GetMonitorInfoW = user32.func('bool __stdcall GetMonitorInfoW(HMONITOR mon, _Inout_ MONITORINFO *info)');
    const GetClassNameW = user32.func('int __stdcall GetClassNameW(HWND hWnd, _Out_ uint16 *buf, int max)');

    const QUNS_BUSY = 2;
    const QUNS_RUNNING_D3D_FULL_SCREEN = 3;
    const QUNS_PRESENTATION_MODE = 4;
    const SHELL_CLASSES = new Set(['Progman', 'WorkerW', 'Shell_TrayWnd', 'Shell_SecondaryTrayWnd']);

    const addr = (h: unknown) => (h ? koffi.address(h) : 0n);

    probe = () => {
      const state = [0];
      if (SHQueryUserNotificationState(state) === 0) {
        const s = state[0];
        if (s === QUNS_BUSY || s === QUNS_RUNNING_D3D_FULL_SCREEN || s === QUNS_PRESENTATION_MODE) return true;
      }
      const fg = GetForegroundWindow();
      if (!fg) return false;
      const a = addr(fg);
      if (a === addr(GetShellWindow()) || a === addr(GetDesktopWindow())) return false;
      const buf = Buffer.alloc(512);
      const len = GetClassNameW(fg, buf, 256);
      const cls = buf.toString('utf16le', 0, len * 2);
      if (SHELL_CLASSES.has(cls)) return false;
      if (cls === 'Chrome_WidgetWin_1' && isOwnWindow?.(a)) return false;
      const rect: Record<string, number> = {};
      if (!GetWindowRect(fg, rect)) return false;
      const mon = MonitorFromWindow(fg, 2 /* MONITOR_DEFAULTTONEAREST */);
      const info = { cbSize: 40, rcMonitor: {}, rcWork: {}, dwFlags: 0 } as {
        cbSize: number;
        rcMonitor: Record<string, number>;
        rcWork: Record<string, number>;
        dwFlags: number;
      };
      if (!GetMonitorInfoW(mon, info)) return false;
      const m = info.rcMonitor;
      return rect.left <= m.left && rect.top <= m.top && rect.right >= m.right && rect.bottom >= m.bottom;
    };
  } catch (err) {
    probeError = String(err);
    probe = () => false;
  }
  return probe;
}

/** Lets the probe ignore Bloom's own windows (e.g. if Bloom is maximized full-screen). */
let isOwnWindow: ((hwnd: bigint) => boolean) | null = null;
export function setOwnWindowCheck(fn: (hwnd: bigint) => boolean) {
  isOwnWindow = fn;
}

export function isGaming(setting: GameModeSetting): boolean {
  if (setting === 'always') return true;
  if (setting === 'off') return false;
  try {
    return loadProbe()();
  } catch (err) {
    probeError = String(err);
    return false;
  }
}

export function gameDetectionStatus(): { available: boolean; error: string | null } {
  loadProbe();
  return { available: process.platform === 'win32' && !probeError, error: probeError };
}
