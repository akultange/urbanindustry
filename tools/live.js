// Real-time checks of the loader hand-off: normal, skip, reduced motion, repeat visit, deep link, no WebGL.
// usage: node tools/live.js <url> <outdir>
const puppeteer = require('puppeteer-core');
const m = require('@sparticuz/chromium'); const chromium = m.default || m;
const fs = require('fs');
const [url = 'http://127.0.0.1:8765/', out = 'qa/live'] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], headless: true });
  const logs = [];
  const state = p => p.evaluate(() => ({ reel: !!document.querySelector('#reel'), cls: document.documentElement.className, held: window.__ui.scene ? window.__ui.scene.state.held : null, hash: location.hash, open: document.querySelector('#product').classList.contains('open') }));
  const page = async (name, opts = {}) => {
    // one page per run: sessionStorage (the repeat-visit flag) is per tab
    const p = await b.newPage();
    const ctx = p;
    p.on('console', msg => { if (['error', 'warning'].includes(msg.type())) logs.push(`[${name}] ${msg.type()}: ${msg.text()}`); });
    p.on('pageerror', e => logs.push(`[${name}] pageerror: ${e.message}`));
    await p.setViewport({ width: 1440, height: 900 });
    if (opts.reduced) await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    if (opts.nogl) await p.evaluateOnNewDocument(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return t === 'webgl2' ? null : g.call(this, t, ...a); }; });
    return { p, ctx };
  };
  // 1. normal
  {
    const { p, ctx } = await page('normal');
    const t0 = Date.now();
    await p.goto(url + '?lang=en', { waitUntil: 'domcontentloaded' });
    await sleep(700); await p.screenshot({ path: `${out}/n-0700.png` });
    await sleep(900); await p.screenshot({ path: `${out}/n-1600.png` });
    await p.waitForFunction(() => !document.querySelector('#reel'), { timeout: 30000 });
    logs.push(`[normal] reel gone after ${Date.now() - t0} ms ` + JSON.stringify(await state(p)));
    await sleep(2500); await p.screenshot({ path: `${out}/n-end.png` });
    // 2. repeat visit in the same session: the short version
    const t1 = Date.now();
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => !document.querySelector('#reel'), { timeout: 30000 });
    logs.push(`[repeat] reel gone after ${Date.now() - t1} ms`);
    await ctx.close();
  }
  // 3. skip
  {
    const { p, ctx } = await page('skip');
    await p.goto(url + '?lang=en', { waitUntil: 'domcontentloaded' });
    await sleep(900);
    const t0 = Date.now();
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => !document.querySelector('#reel'), { timeout: 30000 });
    logs.push(`[skip] reel gone ${Date.now() - t0} ms after Esc ` + JSON.stringify(await state(p)));
    await ctx.close();
  }
  // 4. reduced motion
  {
    const { p, ctx } = await page('reduced', { reduced: true });
    await p.goto(url + '?lang=en', { waitUntil: 'domcontentloaded' });
    await sleep(400); await p.screenshot({ path: `${out}/r-0400.png` });
    await p.waitForFunction(() => !document.querySelector('#reel'), { timeout: 30000 });
    await sleep(1200); await p.screenshot({ path: `${out}/r-end.png` });
    logs.push('[reduced] ' + JSON.stringify(await state(p)));
    await ctx.close();
  }
  // 5. deep link
  {
    const { p, ctx } = await page('deep');
    await p.goto(url + '?lang=en#/p/veja', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => !document.querySelector('#reel'), { timeout: 30000 });
    await sleep(4000); await p.screenshot({ path: `${out}/d-end.png` });
    logs.push('[deep] ' + JSON.stringify(await state(p)));
    await ctx.close();
  }
  // 6. no WebGL
  {
    const { p, ctx } = await page('nogl', { nogl: true });
    await p.goto(url + '?lang=en', { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => !document.querySelector('#reel'), { timeout: 30000 });
    await sleep(800); await p.screenshot({ path: `${out}/g-end.png` });
    logs.push('[nogl] ' + JSON.stringify(await state(p)));
    await ctx.close();
  }
  console.log(logs.join('\n'));
  await b.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
