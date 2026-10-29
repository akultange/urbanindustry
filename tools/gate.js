// The box gate: renders, opens with and without sound, hands over to the wall.
// usage: node tools/gate.js <url> <outdir>
const puppeteer = require('puppeteer-core');
const m = require('@sparticuz/chromium'); const chromium = m.default || m;
const fs = require('fs');
const [url = 'http://127.0.0.1:8765/', out = 'qa/gate'] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=user-gesture-required'], headless: true });
  const logs = [];
  for (const [name, vp, sel, lang] of [
    ['desk-sound', { width: 1440, height: 900 }, '.r-open', 'en'],
    ['phone-mute', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, '.r-mute', 'ka'],
  ]) {
    const p = await b.newPage();
    p.on('console', msg => { if (['error', 'warning'].includes(msg.type())) logs.push(`[${name}] ${msg.type()}: ${msg.text()}`); });
    p.on('pageerror', e => logs.push(`[${name}] pageerror: ${e.message}`));
    await p.setViewport(vp);
    await p.goto(url + `?lang=${lang}`, { waitUntil: 'domcontentloaded' });
    await sleep(1500);
    await p.screenshot({ path: `${out}/${name}-gate.png` });
    const st0 = await p.evaluate(() => ({ gate: document.querySelector('#reel').classList.contains('gate'), q: document.querySelector('.r-q').textContent }));
    const t0 = Date.now();
    await p.click(sel);
    await sleep(250); await p.screenshot({ path: `${out}/${name}-opening.png` });
    await p.waitForFunction(() => !document.querySelector('#reel'), { timeout: 40000 });
    const st = await p.evaluate(() => ({ cls: document.documentElement.className, sound: document.querySelector('#sound-btn').getAttribute('aria-pressed') }));
    logs.push(`[${name}] gate ${JSON.stringify(st0)} -> wall after ${Date.now() - t0} ms ${JSON.stringify(st)}`);
    await sleep(1500); await p.screenshot({ path: `${out}/${name}-wall.png` });
    await p.close();
  }
  console.log(logs.join('\n'));
  await b.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
