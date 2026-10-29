// When the box shows. Computer: first visit asks; after it's been opened, a reload goes straight into the
// loader (with sound if it was opened with sound and the browser lets the page start it), a new tab asks
// again if the browser blocks sound there. Phone: the box every time.
// usage: node tools/visits.js <url>
const puppeteer = require('puppeteer-core');
const m = require('@sparticuz/chromium'); const chromium = m.default || m;
const [url = 'http://127.0.0.1:8765/'] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required'], headless: true });
  const logs = [];
  const desk = { width: 1440, height: 900 };
  const phone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  const state = p => p.evaluate(() => {
    const r = document.querySelector('#reel');
    return { reel: r ? r.className : 'gone', sound: document.querySelector('#sound-btn').getAttribute('aria-pressed') };
  });
  // what the page shows shortly after it loads: the box, or the loader already running
  const first = async (p, name) => {
    await p.waitForSelector('#reel.on', { timeout: 20000 }).catch(() => {});
    await sleep(700);
    const s = await state(p);
    logs.push(`${name}: ${/gate/.test(s.reel) ? 'BOX' : 'no box'} (reel "${s.reel}", sound ${s.sound})`);
    return s;
  };
  const gone = p => p.waitForFunction(() => !document.querySelector('#reel'), { timeout: 60000 });
  const page = async (vp, name) => {
    const p = await b.newPage();
    p.on('console', msg => { if (msg.type() === 'error') logs.push(`[${name}] error: ${msg.text()}`); });
    p.on('pageerror', e => logs.push(`[${name}] pageerror: ${e.message}`));
    await p.setViewport(vp);
    return p;
  };

  // computer, opened with sound
  let p = await page(desk, 'desk');
  await p.goto(url + '?lang=en', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'domcontentloaded' });
  await first(p, 'desk 1st visit');
  await p.click('.r-open'); await gone(p);
  logs.push(`desk after opening: sound ${(await state(p)).sound}`);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await first(p, 'desk reload');
  await gone(p);
  logs.push(`desk reload, on the wall: sound ${(await state(p)).sound}`);
  await p.close();
  p = await page(desk, 'desk-tab');
  await p.goto(url + '?lang=en', { waitUntil: 'domcontentloaded' });
  await first(p, 'desk new tab');
  await p.close();

  // computer, opened without sound
  p = await page(desk, 'desk-mute');
  await p.goto(url + '?lang=en', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'domcontentloaded' });
  await first(p, 'mute 1st visit');
  await p.click('.r-mute'); await gone(p);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await first(p, 'mute reload');
  await p.close();

  // phone
  p = await page(phone, 'phone');
  await p.goto(url + '?lang=ka', { waitUntil: 'domcontentloaded' });
  await p.evaluate(() => localStorage.clear());
  await p.reload({ waitUntil: 'domcontentloaded' });
  await first(p, 'phone 1st visit');
  await p.tap('.r-open'); await gone(p);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await first(p, 'phone reload');
  await p.close();

  console.log(logs.join('\n'));
  await b.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
