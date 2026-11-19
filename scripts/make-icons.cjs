// Renders the Bloom app icon and tray icons to PNG.
// Design: deep sage squircle, a calendar page in warm cream line work, and a
// minimal four-petal bloom drawn from overlapping circles.
const { chromium } = require('playwright');
const path = require('path');

const mark = (stroke, petal, sw) => `
  <rect x="148" y="150" width="216" height="210" rx="38" fill="none" stroke="${stroke}" stroke-width="${sw}"/>
  <line x1="148" y1="206" x2="364" y2="206" stroke="${stroke}" stroke-width="${sw}"/>
  <line x1="206" y1="126" x2="206" y2="170" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>
  <line x1="306" y1="126" x2="306" y2="170" stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round"/>
  <g transform="translate(256 284)" fill="none" stroke="${petal}" stroke-width="${sw * 0.9}">
    <circle cx="0" cy="-26" r="26"/><circle cx="26" cy="0" r="26"/><circle cx="0" cy="26" r="26"/><circle cx="-26" cy="0" r="26"/>
  </g>
  <circle cx="256" cy="284" r="7" fill="${petal}"/>`;

const appIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4b5d55"/><stop offset="1" stop-color="#2c3733"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/><stop offset="0.5" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="24" y="24" width="464" height="464" rx="116" fill="url(#bg)"/>
  <rect x="24" y="24" width="464" height="464" rx="116" fill="url(#sheen)"/>
  ${mark('#f3e9dc', '#e9b7ad', 14)}
</svg>`;

const tray = (badge) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="64" height="64">
  <rect x="40" y="40" width="432" height="432" rx="110" fill="#3c4a45"/>
  ${mark('#f3e9dc', '#e9b7ad', 26)}
  ${badge ? '<circle cx="410" cy="102" r="86" fill="#e2735f" stroke="#ffffff" stroke-width="28"/>' : ''}
</svg>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const render = async (svg, size, out) => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${svg.replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`)}</body></html>`);
    await page.locator('svg').screenshot({ path: out, omitBackground: true });
  };
  const pub = path.join(__dirname, '..', 'public');
  const build = path.join(__dirname, '..', 'build');
  await render(appIcon, 512, path.join(build, 'icon.png'));
  await render(appIcon, 256, path.join(pub, 'icon.png'));
  await render(tray(false), 32, path.join(pub, 'tray.png'));
  await render(tray(true), 32, path.join(pub, 'tray-badge.png'));
  await render(tray(false), 64, path.join(pub, 'tray@2x.png'));
  await render(tray(true), 64, path.join(pub, 'tray-badge@2x.png'));
  await browser.close();
})();
