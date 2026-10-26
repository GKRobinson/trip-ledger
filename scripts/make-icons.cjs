// @ts-check
'use strict';

/**
 * Draws every icon and splash image from the SVG below, using Electron (already
 * a dev dependency) to rasterise, so no image library is needed. The design
 * is the original Trip Ledger tile: white "TL", a dashed road line and a
 * yellow band on green — drawn with rectangles, so no fonts are involved.
 *
 *   npm run icons
 *   npx @capacitor/assets generate --android   (then turns assets/ into Android icons)
 */

const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const GREEN = '#01633C';
const YELLOW = '#F5B700';
const root = path.join(__dirname, '..');

const letters = `<g fill="#fff">
  <rect x="270" y="90" width="240" height="60"/><rect x="360" y="90" width="60" height="250"/>
  <rect x="560" y="90" width="60" height="250"/><rect x="560" y="280" width="200" height="60"/>
</g>`;
const dashes = (y, h) =>
  `<g fill="#fff">${[60, 266, 472, 678, 884].map((x) => `<rect x="${x}" y="${y}" width="80" height="${h}"/>`).join('')}</g>`;
const tile = `<rect width="1024" height="1024" fill="${GREEN}"/>${letters}${dashes(430, 30)}
  <rect y="780" width="1024" height="100" fill="${YELLOW}"/>`;
const svg = (size, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${size}" height="${size}">${body}</svg>`;

/** @type {Record<string, (size: number) => string>} */
const designs = {
  // Rounded tile for desktop and the browser tab.
  rounded: (s) => svg(s, `<clipPath id="r"><rect width="1024" height="1024" rx="180"/></clipPath><g clip-path="url(#r)">${tile}</g>`),
  // Square, for Android's legacy icon (Android applies its own mask).
  square: (s) => svg(s, tile),
  // Android adaptive icon: the road and band in the background layer, the
  // letters in the foreground, all inside the area every mask shape shows.
  background: (s) =>
    svg(s, `<rect width="1024" height="1024" fill="${GREEN}"/>${dashes(520, 26)}<rect y="680" width="1024" height="80" fill="${YELLOW}"/>`),
  foreground: (s) => svg(s, `<g transform="translate(100,178) scale(0.8)">${letters}</g>`),
  // Splash: the rounded tile, small, on green.
  splash: (s) =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732" width="${s}" height="${s}">
      <rect width="2732" height="2732" fill="${GREEN}"/>
      <svg x="1066" y="1066" width="600" height="600" viewBox="0 0 1024 1024">${tile}</svg></svg>`,
};

/** @type {Array<[string, keyof typeof designs, number]>} */
const outputs = [
  ['build-resources/icon.png', 'rounded', 1024],
  ['electron/icon.png', 'rounded', 256],
  ['public/icon.png', 'rounded', 192],
  ['assets/icon-only.png', 'square', 1024],
  ['assets/icon-background.png', 'background', 1024],
  ['assets/icon-foreground.png', 'foreground', 1024],
  ['assets/splash.png', 'splash', 2732],
  ['assets/splash-dark.png', 'splash', 2732],
];

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.disableHardwareAcceleration();

void app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, frame: false, transparent: true, webPreferences: { offscreen: true } });
  for (const [out, design, size] of outputs) {
    win.setContentSize(size, size);
    const html = `<html><body style="margin:0;background:transparent">${designs[design](size)}</body></html>`;
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await new Promise((r) => setTimeout(r, 300)); // let the offscreen frame paint
    const image = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size });
    fs.mkdirSync(path.dirname(path.join(root, out)), { recursive: true });
    fs.writeFileSync(path.join(root, out), image.toPNG());
    const { width, height } = image.getSize();
    console.log(`${out}: ${width}x${height}`);
  }
  app.quit();
});
