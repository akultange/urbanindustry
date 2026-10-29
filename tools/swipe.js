const puppeteer = require('puppeteer-core');
const m = require('@sparticuz/chromium'); const chromium = m.default || m;
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], headless: true });
  const p = await b.newPage();
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.goto('http://127.0.0.1:8765/', { waitUntil: 'networkidle0' });
  await sleep(3000);
  await p.evaluate(() => { window.__ev = []; for (const t of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'touchstart', 'touchmove']) document.getElementById('gl').addEventListener(t, e => window.__ev.push(t + ':' + (e.pointerType || '') + ':' + Math.round(e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0))); });
  await p.touchscreen.touchStart(300, 420);
  for (let i = 1; i <= 8; i++) { await p.touchscreen.touchMove(300 - i * 25, 420); await sleep(16); }
  await p.touchscreen.touchEnd();
  await sleep(200);
  console.log(await p.evaluate(() => JSON.stringify({ ev: window.__ev.slice(0, 30), n: window.__ev.length, walk: window.__ui.scene.state.walk })));
  await sleep(1500);
  console.log(await p.evaluate(() => JSON.stringify({ walk: window.__ui.scene.state.walk, idx: window.__ui.scene.walkIndex() })));
  await b.close();
})();
