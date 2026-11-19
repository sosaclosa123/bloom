// Renders the Bloom flower icon to PNGs (app icon + tray icons).
const { chromium } = require('playwright');
const path = require('path');

const petals = (r, ry, cy, fill) =>
  [0, 72, 144, 216, 288].map((a) => `<ellipse rx="${r}" ry="${ry}" cy="${cy}" transform="rotate(${a})" fill="${fill}"/>`).join('');

const appIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f3eefe"/><stop offset="1" stop-color="#fde8ef"/>
    </linearGradient>
    <linearGradient id="pt" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f7c3d4"/><stop offset="1" stop-color="#e99bb6"/>
    </linearGradient>
  </defs>
  <rect x="24" y="24" width="464" height="464" rx="112" fill="url(#bg)"/>
  <g transform="translate(256 262)">${petals(70, 112, -96, 'url(#pt)')}
    <circle r="56" fill="#f9dc85"/><circle r="56" fill="none" stroke="#efc65a" stroke-width="6"/>
  </g>
</svg>`;

const tray = (badge) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <g transform="translate(32 33)">${petals(10, 16, -14, '#ee9fbb')}<circle r="8.5" fill="#f5cf62"/></g>
  ${badge ? '<circle cx="51" cy="13" r="11" fill="#7c6cd6" stroke="#fff" stroke-width="3"/>' : ''}
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
