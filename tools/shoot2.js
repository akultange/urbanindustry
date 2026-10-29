// Extra checks: cursor light, bag, about, lightbox, English
const puppeteer = require('puppeteer-core');
const m = require('@sparticuz/chromium'); const chromium = m.default || m;
const [url = 'http://127.0.0.1:8765/', out = 'qa'] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], headless: true });
  const logs = [];
  const p = await b.newPage();
  p.on('pageerror', e => logs.push('pageerror ' + e.message));
  p.on('console', msg => { if (msg.type() === 'error') logs.push('console ' + msg.text()); });
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await p.goto(url, { waitUntil: 'networkidle0' });
  await p.waitForFunction(() => document.documentElement.classList.contains('ready'), { timeout: 60000 });
  await p.evaluate(() => { const s = window.__ui.scene; s.state.introT = 9; s.wake(1500); });
  await sleep(2500);
  await p.screenshot({ path: `${out}/desk-ka.png` });
  await p.mouse.move(720, 450, { steps: 8 }); await sleep(250); await p.mouse.move(560, 470, { steps: 8 }); await sleep(900);
  await p.screenshot({ path: `${out}/cursor.png` });
  // open pair 2, pick size, add to bag, open bag
  await p.evaluate(() => window.__ui.open(2)); await sleep(3500);
  await p.screenshot({ path: `${out}/focus-ka.png` });
  const sz = await p.$$('#sizes .size:not(:disabled)'); await sz[2].click(); await sleep(200);
  await p.click('#add-bag'); await sleep(300);
  await p.click('#bag-btn'); await sleep(900);
  await p.screenshot({ path: `${out}/bag.png` });
  await p.keyboard.press('Escape'); await sleep(500);
  // lightbox
  await p.click('#thumbs .thumb'); await sleep(800);
  await p.screenshot({ path: `${out}/lightbox.png` });
  await p.keyboard.press('Escape'); await sleep(400);
  await p.keyboard.press('Escape'); await sleep(1400);
  // about in English
  await p.click('.lang button[data-lang="en"]'); await sleep(300);
  await p.click('.nav-about'); await sleep(900);
  await p.screenshot({ path: `${out}/about.png` });
  await p.keyboard.press('Escape'); await sleep(600);
  await p.screenshot({ path: `${out}/desk-en.png` });
  logs.push('bag: ' + await p.evaluate(() => document.querySelector('#bag-count').textContent));
  console.log(logs.join('\n'));
  await b.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
