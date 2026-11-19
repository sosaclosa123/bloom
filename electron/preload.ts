import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { DesktopBridge } from '../src/platform/bridge';

function on<A extends unknown[]>(channel: string, cb: (...args: A) => void) {
  const handler = (_e: IpcRendererEvent, ...args: unknown[]) => cb(...(args as A));
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const bridge: DesktopBridge = {
  platform: process.platform,
  load: () => ipcRenderer.invoke('data:load'),
  upsert: (coll, item) => ipcRenderer.invoke('data:upsert', coll, item),
  remove: (coll, id) => ipcRenderer.invoke('data:remove', coll, id),
  updateSettings: (patch) => ipcRenderer.invoke('data:settings', patch),
  onChange: (cb) => on('data:changed', cb),

  importSound: () => ipcRenderer.invoke('sound:import'),
  soundData: (id) => ipcRenderer.invoke('sound:data', id),
  addPhotos: () => ipcRenderer.invoke('photo:add'),

  exportBackup: () => ipcRenderer.invoke('backup:export'),
  importBackup: () => ipcRenderer.invoke('backup:import'),

  getMissed: () => ipcRenderer.invoke('missed:get'),
  clearMissed: () => ipcRenderer.invoke('missed:clear'),
  onMissed: (cb) => on('missed:changed', cb),
  onPlaySound: (cb) => on('sound:play', cb),
  onOpenDate: (cb) => on('app:open-date', cb),
  testPopup: () => ipcRenderer.invoke('popup:test'),
  gameStatus: () => ipcRenderer.invoke('game:status'),
  setTitleBarTheme: (dark) => ipcRenderer.send('window:titlebar', dark),

  popup: {
    onAlerts: (cb) => on('popup:alerts', cb),
    ready: () => ipcRenderer.send('popup:ready'),
    snooze: (key, minutes) => ipcRenderer.send('popup:snooze', key, minutes),
    dismiss: (key) => ipcRenderer.send('popup:dismiss', key),
    dismissAll: () => ipcRenderer.send('popup:dismiss-all'),
    open: (date) => ipcRenderer.send('popup:open', date),
    resize: (height) => ipcRenderer.send('popup:resize', height),
  },
};

contextBridge.exposeInMainWorld('bloomDesktop', bridge);
