// Render every shot of the loader in both polarities (plus the first wall frame) for the order search.
// usage: node tools/reel_frames.js <url> <outdir> [desk|phone]
const puppeteer = require('puppeteer-core');
const m = require('@sparticuz/chromium'); const chromium = m.default || m;
const fs = require('fs');
const [url = 'http://127.0.0.1:8765/', out = 'qa/frames', kind = 'desk'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const SHOTS = ['field', 'box', 'held', 'halftone', 'beam', 'blueprint', 'price', 'swatch', 'silhouette', 'day'];
(async () => {
  const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], headless: true });
  const p = await b.newPage();
  const vp = kind === 'phone' ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1280, height: 800, deviceScaleFactor: 1 };
  await p.setViewport(vp);
  await p.goto(url + (url.includes('?') ? '&' : '?') + 'capture', { waitUntil: 'networkidle0', timeout: 90000 });
  await p.waitForFunction(() => window.__cap, { timeout: 240000 });
  const names = [];
  for (const s of SHOTS) for (const neg of [0, 1]) {
    await p.evaluate((s, neg) => window.__cap.reel.drawCut([s, neg, 'w']), s, neg);
    const n = `${s}${neg ? '-' : '+'}`; names.push(n);
    await p.screenshot({ path: `${out}/${n}.png` });
  }
  await p.evaluate(() => window.__cap.reel.drawCut(['night', 0, 'w']));
  await p.screenshot({ path: `${out}/night.png` }); names.push('night');
  await p.evaluate(() => window.__cap.land());
  await p.evaluate(() => window.__cap.scene.step(1 / 60));
  await p.screenshot({ path: `${out}/gl.png` }); names.push('gl');
  fs.writeFileSync(`${out}/names.json`, JSON.stringify(names));
  console.log(names.length, 'frames');
  await b.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
