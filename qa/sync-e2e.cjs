// Real app, real sync: a PC window and a phone window (?phone) signed in to
// the same account on the local Firebase emulator. Adds, edits and deletes
// through the UI and checks the other device shows it. Run: qa/sync-e2e.sh
const { chromium } = require('playwright');
const URL = process.env.URL || 'http://localhost:5173/';
const EMU = '127.0.0.1:8080';
const LANG = process.env.LANG_UI || 'en';
const email = `owner${Date.now()}@example.com`;
let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${msg}`);
  if (!cond) bad++;
};

async function device(b, phone) {
  // The app only allows the real Firebase servers; the test talks to the local emulator.
  const ctx = await b.newContext({ bypassCSP: true, ...(phone ? { viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } }) });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log((phone ? 'phone' : 'pc') + ' ERR', e.message));
  await p.goto(URL + (phone ? '?phone' : ''));
  await p.evaluate(([emu, lang]) => {
    localStorage.clear();
    localStorage.setItem('qa-emulator', emu);
    localStorage.setItem('bloom-data-v1', JSON.stringify({ settings: { language: lang } }));
    localStorage.setItem('bloom-tab', 'calendar');
    localStorage.setItem('bloom-view', 'month');
  }, [EMU, LANG]);
  await p.reload();
  await p.waitForTimeout(1200);
  return p;
}

async function openAccount(p, phone) {
  await p.locator(phone ? '.phone-gear' : '.rail-settings').first().click();
  await p.waitForTimeout(400);
  await p.locator('.settings-tabs button').first().click(); // Account
  await p.waitForTimeout(300);
}

async function signIn(p, phone, signup) {
  await openAccount(p, phone);
  if (!signup) await p.locator('.modal .segmented button').nth(1).click().catch(() => {});
  const f = p.locator('.modal form');
  if (signup) await f.locator('input').first().fill('Ido');
  await f.locator('input[type=email]').fill(email);
  await f.locator('input[type=password]').fill('pw123456');
  await f.locator('button[type=submit]').click();
  try {
    await p.locator('.sync-status.synced').waitFor({ timeout: 15000 });
  } catch (e) {
    await p.screenshot({ path: `${__dirname}/shots/sync-signin-fail-${phone ? 'phone' : 'pc'}.png` });
    throw e;
  }
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
}

async function addEvent(p, phone, title) {
  for (let i = 0; i < 3 && (await p.locator('.scrim').count()); i++) {
    await p.keyboard.press('Escape');
    await p.waitForTimeout(250);
  }
  if (phone) await p.locator('.phone-fab').click();
  else {
    // The empty top corner of a day square (not one of its events).
    const cell = p.locator('.cell.today, .cell[data-today="true"]').first();
    const box = await cell.boundingBox();
    await cell.click({ position: { x: box.width - 12, y: 10 } });
    await p.waitForTimeout(400);
    await p.locator('.drawer button:has-text("Event"), .drawer button:has-text("אירוע")').first().click({ timeout: 5000 });
  }
  await p.waitForTimeout(400);
  await p.locator('.modal .title-input').first().fill(title);
  await p.locator('.modal .btn-primary, .modal button.primary').last().click();
  await p.waitForTimeout(300);
}

const shows = (p, title) => p.locator(`text=${title}`).count();
async function waitShows(p, title, want = true, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (((await shows(p, title)) > 0) === want) return true;
    await p.waitForTimeout(250);
  }
  return false;
}

(async () => {
  const b = await chromium.launch();
  const pc = await device(b, false);
  const phone = await device(b, true);
  await signIn(pc, false, true);
  await signIn(phone, true, false);
  ok(true, 'both signed in to the same account');

  await addEvent(phone, true, 'Phone dentist');
  ok(await waitShows(pc, 'Phone dentist'), 'event added on the phone shows on the PC');
  await addEvent(pc, false, 'PC work shift');
  ok(await waitShows(phone, 'PC work shift'), 'event added on the PC shows on the phone');

  // The phone goes to the background and comes back (listens again from where it was).
  await phone.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await addEvent(pc, false, 'While phone hidden');
  await phone.waitForTimeout(16000);
  await phone.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  ok(await waitShows(phone, 'While phone hidden'), 'phone back from the background has the PC change');

  // Delete on the phone: open the event and delete it.
  await phone.locator('text=Phone dentist').first().click();
  await phone.waitForTimeout(500);
  const del = phone.locator('.modal button.btn-danger').first();
  if (await del.count()) {
    await del.click();
    await phone.waitForTimeout(300);
    const confirm = phone.locator('.modal button:has-text("Delete"), .modal button:has-text("מחיקה")').last();
    if (await confirm.count()) await confirm.click().catch(() => {});
  } else {
    // The day panel opened instead: open the event row from it.
    await phone.locator('.phone-sheet :text("Phone dentist")').first().click();
    await phone.waitForTimeout(400);
    await phone.locator('.modal button.btn-danger').first().click();
  }
  ok(await waitShows(pc, 'Phone dentist', false), 'event deleted on the phone disappears on the PC');

  // Status line + "Sync now" (screenshots of the Account tab).
  for (const [p, name] of [[pc, 'pc'], [phone, 'phone']]) {
    await openAccount(p, name === 'phone');
    await p.locator('.sync-row button').click();
    await p.locator('.sync-status.synced').waitFor({ timeout: 15000 });
    ok(true, `${name}: "Sync now" works, status shows Synced`);
    await p.screenshot({ path: `${__dirname}/shots/sync-account-${name}-${LANG}.png` });
    await p.keyboard.press('Escape');
  }
  await b.close();
  console.log(bad ? `sync-e2e: ${bad} problem(s)` : 'sync-e2e: OK');
  process.exit(bad ? 1 : 0);
})();
