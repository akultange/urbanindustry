// Headless checks + screenshots. usage: node tools/shoot.js <url> <outdir> [scenario...]
const puppeteer = require('puppeteer-core');
const m = require('@sparticuz/chromium'); const chromium = m.default || m;
const fs = require('fs');
const [url = 'http://127.0.0.1:8765/', out = 'qa', ...scen] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], headless: true });
  const logs = [];
  const run = async (name, vp, fn) => {
    const p = await b.newPage();
    p.on('console', msg => { if (['error', 'warning'].includes(msg.type())) logs.push(`[${name}] ${msg.type()}: ${msg.text()}`); });
    p.on('pageerror', e => logs.push(`[${name}] pageerror: ${e.message}`));
    await p.setViewport(vp);
    await p.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await p.waitForFunction(() => document.documentElement.classList.contains('ready') || document.documentElement.classList.contains('no-gl'), { timeout: 60000 });
    // headless GL runs at a few fps: skip the power-on so the shots show the settled wall
    await p.evaluate(() => { const s = window.__ui.scene; if (s) { s.state.introT = 9; s.wake(1500); } });
    await sleep(2500);
    await fn(p);
    await p.close();
  };
  const all = scen.length ? scen : ['desk', 'hover', 'focus', 'phone', 'sheet'];
  const desk = { width: 1440, height: 900, deviceScaleFactor: 1 };
  const phone = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
  if (all.includes('desk')) await run('desk', desk, async p => {
    await p.screenshot({ path: `${out}/desk.png` });
    const st = await p.evaluate(() => ({ cls: document.documentElement.className, gl: !!window.__ui.scene }));
    logs.push('[desk] ' + JSON.stringify(st));
  });
  if (all.includes('hover')) await run('hover', desk, async p => {
    const r = await p.evaluate(() => { const s = window.__ui.scene; const q = s.shoeScreenRect(2); return q; });
    await p.mouse.move((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, { steps: 6 });
    await sleep(2600);
    await p.screenshot({ path: `${out}/hover.png` });
  });
  if (all.includes('focus')) await run('focus', desk, async p => {
    const r = await p.evaluate(() => window.__ui.scene.shoeScreenRect(6));
    await p.mouse.move((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, { steps: 4 });
    await sleep(300);
    await p.mouse.click((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
    await sleep(900);
    await p.screenshot({ path: `${out}/focus-mid.png` });
    await sleep(3200);
    await p.screenshot({ path: `${out}/focus.png` });
    const sz = await p.$$('#sizes .size:not(:disabled)');
    if (sz[3]) await sz[3].click();
    await sleep(500);
    await p.screenshot({ path: `${out}/focus-size.png` });
    logs.push('[focus] hash ' + await p.evaluate(() => location.hash) + ' order ' + await p.evaluate(() => document.querySelector('#order').className));
  });
  if (all.includes('phone')) await run('phone', phone, async p => {
    await p.screenshot({ path: `${out}/phone.png` });
  });
  // phone: tap a pair on the wall (it lights, then comes off the shelf into the sheet); tap the wall to close
  if (all.includes('sheet')) await run('sheet', phone, async p => {
    const r = await p.evaluate(() => window.__ui.scene.shoeScreenRect(2));
    await p.touchscreen.tap((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
    await sleep(3000);
    await p.screenshot({ path: `${out}/phone-sheet.png` });
    logs.push('[sheet] ' + JSON.stringify(await p.evaluate(() => ({ hash: location.hash, open: document.querySelector('#product').classList.contains('open') }))));
    await p.touchscreen.tap(24, 300);
    await sleep(2500);
    await p.screenshot({ path: `${out}/phone-closed.png` });
    logs.push('[sheet closed] ' + JSON.stringify(await p.evaluate(() => ({ hash: location.hash, open: document.querySelector('#product').classList.contains('open') }))));
  });
  console.log(logs.join('\n') || 'no console errors');
  await b.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
