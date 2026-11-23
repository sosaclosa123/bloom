// Sample data used by the QA scripts (Nov 2026, today = Thu 19 Nov 11:40).
const meta = (id, vis = 'shared') => ({ id, createdAt: 1, updatedAt: 1, deletedAt: null, ownerId: 'local', visibility: vis });
const ev = (id, title, start, end, color, extra = {}) => ({ ...meta(id), title, allDay: false, start, end, color, notes: '', location: '', repeat: 'none', remindBefore: [15], sound: 'builtin:chime', ...extra });
const data = {
  schemaVersion: 1, deviceId: 'x',
  settings: { language: 'en', theme: 'light', weekStart: 0, holidays: 'jewish', holidaysIsrael: true, showHebrewDate: false, gameMode: 'auto', gameModeSoftSound: true, startWithWindows: true, closeToTray: true, defaultSound: 'builtin:chime', defaultRemindBefore: [15], volume: 0.8, snoozeOptions: [10, 60] },
  events: [ ev('e1', 'Dentist', '2026-11-19T14:00', '2026-11-19T15:00', 'sky'), ev('e2', 'Dinner with Ido', '2026-11-20T20:00', '2026-11-20T22:00', 'rose'), ev('e3', 'Yoga', '2026-11-03T08:00', '2026-11-03T09:00', 'mint', { repeat: 'weekly' }), ev('e4', 'Work shift', '2026-11-19T09:00', '2026-11-19T13:00', 'butter'), ev('e6', 'Trip to Eilat', '2026-11-27T00:00', '2026-11-29T23:59', 'lilac', { allDay: true, remindBefore: [] }) ],
  days: [
    { ...meta('d1'), date: '2026-11-19', status: 'packed', headline: 'Busy busy day', cards: [ { id: 'c1', kind: 'checklist', text: '', emoji: '', items: [ { id: 'i1', text: 'Milk', done: true }, { id: 'i2', text: 'Strawberries', done: false }, { id: 'i3', text: 'Flowers for mom', done: false } ] }, { id: 'c2', kind: 'text', text: 'Call the bank about the card', emoji: '💡', items: [] } ] },
    { ...meta('d2'), date: '2026-11-12', status: 'free', headline: '', cards: [] },
    { ...meta('d3'), date: '2026-11-22', status: 'some', headline: 'Lazy Sunday ☕', cards: [] },
  ],
  reminders: [ { ...meta('r1'), title: 'Take vitamins', at: '2026-11-19T21:00', repeat: 'daily', sound: 'builtin:chime', note: '' } ],
  countdowns: [ { ...meta('k1'), title: 'Our anniversary', date: '2026-12-14', emoji: '💗', yearly: true }, { ...meta('k2'), title: 'Eilat trip', date: '2026-11-27', emoji: '🏖️', yearly: false } ],
  sounds: [],
  journal: [ { ...meta('j2', 'shared'), date: '2026-11-19', text: 'Long day but a good one.', photos: [] } ],
};
data.schemaVersion = 3;
module.exports = { data };
