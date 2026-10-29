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
  // the closed box, then the opening (the visitor's tap is at GATE seconds)
  const GATE = process.env.NO_GATE ? 0 : 1.2, OPEN = await p.evaluate(() => window.__cap.reel.openMs / 1000);
  if (GATE) {
    await p.evaluate(() => { window.__cap.reel.gate(); });
    list.push([await shot(), GATE]);
    await p.evaluate(() => { const r = document.querySelector('#reel'); r.classList.remove('gate'); r.classList.add('opening'); });
    const nOpen = Math.round(OPEN * FPS);
    for (let k = 1; k <= nOpen; k++) {
      await p.evaluate(k => window.__cap.reel.drawGate(k), k / nOpen);
      list.push([await shot(), OPEN / nOpen]);
    }
    await p.evaluate(() => document.querySelector('#reel').classList.remove('opening'));
  }
  // the film has the score, so show the controls as a visitor who opened it with sound sees them
  await p.evaluate(() => {
    const r = document.querySelector('#reel [data-hud=sound]');
    r.textContent = window.__cap.reel.copy('soundOff'); r.setAttribute('aria-pressed', 'true');
    document.querySelector('#sound-btn').setAttribute('aria-pressed', 'true');
  });
  const reelAt = GATE ? GATE + OPEN : 0;
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
  // hold the settled wall while the sound's tail rings out
  list.push([list[list.length - 1][0], 1.6]);
  const last = cuts[cuts.length - 1];
  const landAt = reelAt + (last.t + last.d) / 1000;
  const score = await p.evaluate(o => window.__cap.score(o), { boxAt: GATE ? GATE : -1, openDur: OPEN, reelAt, landAt });
  fs.writeFileSync(`${out}/score.wav`, Buffer.from(score.b64, 'base64'));
  logs.push(`score peak ${score.peak.toFixed(3)}`);
  const txt = list.map(([f, d]) => `file '${require('path').resolve(f)}'\nduration ${d.toFixed(5)}`).join('\n') + `\nfile '${require('path').resolve(list[list.length - 1][0])}'\n`;
  fs.writeFileSync(`${out}/list.txt`, txt);
  await b.close();
  const mp4 = `${out}/reel-${kind}.mp4`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', `${out}/list.txt`, '-i', `${out}/score.wav`,
    '-vf', `fps=60,format=yuv420p${kind === 'phone' ? ',scale=780:-2' : ''}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', mp4]);
  console.log(mp4, list.length, 'frames;', logs.join('\n') || 'no console errors');
})().catch(e => { console.error('FAILED', e); process.exit(1); });
