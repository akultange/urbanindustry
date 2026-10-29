// Render the 1200x630 share image from the live wall (one pair lit).
const puppeteer = require('puppeteer-core');
const m = require('@sparticuz/chromium'); const chromium = m.default || m;
const [url = 'http://127.0.0.1:8765/', out = 'assets/img/og.jpg'] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], headless: true });
  const p = await b.newPage();
  await p.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
  await p.goto(url + '?noreel&lang=en', { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => document.documentElement.classList.contains('ready'), { timeout: 60000 });
  await p.evaluate(() => { const s = window.__ui.scene; s.state.introT = 9; s.wake(1500); });
  await sleep(2500);
  const i = await p.evaluate(() => window.__ui.pairs.findIndex(q => q.id === 'dunk'));
  const r = await p.evaluate(i => window.__ui.scene.shoeScreenRect(i), i);
  await p.mouse.move((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, { steps: 6 }); await sleep(3000);
  await p.evaluate(() => { for (const s of ['.bottom', '.actions', '.nav']) document.querySelector(s).style.visibility = 'hidden'; });
  await p.screenshot({ path: out, type: 'jpeg', quality: 86 });
  await b.close(); console.log('og ->', out);
})();
