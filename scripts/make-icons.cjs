// Renders the Bloom app icon and tray icons to PNG.
const { chromium } = require('playwright');
const path = require('path');

// Logo: cream "b" with a blush leaf on deep sage.
// The bowl of the b starts exactly at the stem's left edge (never sticks out).
const STEM_X = 200; // stem centre
const SW = 40; // stroke width
const BOWL_R = 78;
const BOWL_CX = STEM_X - SW / 2 + SW / 2 + BOWL_R; // bowl's outer-left edge == stem's outer-left edge
const mark = (fg, leaf) => `<g transform="translate(-32 0)">
  <path d="M${STEM_X} 128v254" stroke="${fg}" stroke-width="${SW}" stroke-linecap="round"/>
  <circle cx="${BOWL_CX}" cy="304" r="${BOWL_R}" fill="none" stroke="${fg}" stroke-width="${SW}"/>
  <path d="M304 178c10-46 50-70 92-66-4 44-40 76-92 66z" fill="${leaf}"/></g>`;

const appIcon = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#46584f"/><stop offset="1" stop-color="#34433d"/>
    </linearGradient>
  </defs>
  <rect x="24" y="24" width="464" height="464" rx="116" fill="url(#bg)"/>
  ${mark('#f3ebe2', '#e9b0a3')}
</svg>`;

const tray = (badge) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="64" height="64">
  <rect x="24" y="24" width="464" height="464" rx="116" fill="#3f4f49"/>
  ${mark('#f3ebe2', '#e9b0a3')}
  ${badge ? '<circle cx="410" cy="102" r="86" fill="#e2735f" stroke="#ffffff" stroke-width="28"/>' : ''}
</svg>`;

module.exports = { appIcon };

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
