// Film the loader frame by frame (headless GL is too slow for real time), then encode an MP4.
// usage: node tools/reel_video.js <url> <outdir> [desk|phone] [fps]
const puppeteer = require('puppeteer-core');
const m = require('@sparticuz/chromium'); const chromium = m.default || m;
const fs = require('fs');
const { execFileSync } = require('child_process');
const [url = 'http://127.0.0.1:8765/', out = 'qa/reel', kind = 'desk', fpsArg = '30'] = process.argv.slice(2);
const FPS = +fpsArg;
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], headless: true });
  const p = await b.newPage();
  const logs = [];
  p.on('console', msg => { if (['error', 'warning'].includes(msg.type())) logs.push(`${msg.type()}: ${msg.text()}`); });
  p.on('pageerror', e => logs.push(`pageerror: ${e.message}`));
  const vp = kind === 'phone' ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1280, height: 800, deviceScaleFactor: 1 };
  await p.setViewport(vp);
  const sep = url.includes('?') ? '&' : '?';
  await p.goto(url + sep + 'capture', { waitUntil: 'networkidle0', timeout: 90000 });
  await p.waitForFunction(() => window.__cap, { timeout: 240000 });
  await p.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
  const cuts = await p.evaluate(() => window.__cap.reel.timeline());
  const list = [];
  let n = 0;
  const shot = async () => { const f = `${out}/f${String(n++).padStart(4, '0')}.png`; await p.screenshot({ path: f }); return f; };
  // a beat of the first frame, as the page would show it while the pair decodes
  await p.evaluate(() => window.__cap.reel.seek(0));
  for (const c of cuts) {
    await p.evaluate(t => window.__cap.reel.seek(t), c.t);
    list.push([await shot(), c.d / 1000]);
  }
  // the match cut and the pull-back, stepped by hand
  await p.evaluate(() => { window.__cap.land(); document.documentElement.classList.add('intro'); });
  const steps = process.env.REEL_ONLY ? 2 : Math.round(2.6 * FPS);
  for (let k = 0; k < steps; k++) {
    const t = k / FPS;
    await p.evaluate((dt, t) => {
      window.__cap.scene.step(dt);
      if (t > 0.7) document.documentElement.classList.remove('intro');
    }, 1 / FPS, t);
    list.push([await shot(), 1 / FPS]);
  }
  // hold the settled wall a moment
  list.push([list[list.length - 1][0], 0.8]);
  const txt = list.map(([f, d]) => `file '${require('path').resolve(f)}'\nduration ${d.toFixed(5)}`).join('\n') + `\nfile '${require('path').resolve(list[list.length - 1][0])}'\n`;
  fs.writeFileSync(`${out}/list.txt`, txt);
  await b.close();
  const mp4 = `${out}/reel-${kind}.mp4`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', `${out}/list.txt`, '-vf', `fps=60,format=yuv420p${kind === 'phone' ? ',scale=780:-2' : ''}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-movflags', '+faststart', mp4]);
  console.log(mp4, list.length, 'frames;', logs.join('\n') || 'no console errors');
})().catch(e => { console.error('FAILED', e); process.exit(1); });
