// Hover tags on the wall at several desktop sizes: the tag must read clearly and stay clear of the footer.
// usage: node tools/hover.js <url> <outdir>
const puppeteer = require('puppeteer-core');
const m = require('@sparticuz/chromium'); const chromium = m.default || m;
const fs = require('fs');
const [url = 'http://127.0.0.1:8765/?noreel', out = 'qa/hover'] = process.argv.slice(2);
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], headless: true });
  const logs = [];
  for (const [w, h] of [[1920, 880], [1440, 900], [1366, 657], [1280, 720], [1024, 700]]) {
    const p = await b.newPage();
    p.on('console', msg => { if (['error', 'warning'].includes(msg.type())) logs.push(`[${w}x${h}] ${msg.type()}: ${msg.text()}`); });
    p.on('pageerror', e => logs.push(`[${w}x${h}] pageerror: ${e.message}`));
    await p.setViewport({ width: w, height: h });
    await p.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
    await p.waitForFunction(() => document.documentElement.classList.contains('ready'), { timeout: 60000 });
    await p.evaluate(() => { const s = window.__ui.scene; s.state.introT = 9; s.wake(1500); });
    await sleep(1500);
    for (const i of [7, 2, 9]) {
      const r = await p.evaluate(i => window.__ui.scene.shoeScreenRect(i), i);
      await p.mouse.move((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, { steps: 5 });
      await sleep(1600);
      await p.screenshot({ path: `${out}/${w}x${h}-${i}.png` });
      const box = await p.evaluate(i => {
        const t = document.querySelectorAll('#labels .lbl')[i].firstChild.getBoundingClientRect();
        const f = document.querySelector('.bottom').getBoundingClientRect();
        const hint = document.querySelector('.bottom .hint');
        return { tagTop: Math.round(t.top), tagBottom: Math.round(t.bottom), footTop: Math.round(f.top), hintOpacity: getComputedStyle(hint).opacity };
      }, i);
      logs.push(`[${w}x${h}] pair ${i} ${JSON.stringify(box)} ${box.tagBottom <= box.footTop ? 'clear' : 'OVERLAPS FOOTER'}`);
    }
    await p.close();
  }
  console.log(logs.join('\n'));
  await b.close();
})().catch(e => { console.error('FAILED', e); process.exit(1); });
