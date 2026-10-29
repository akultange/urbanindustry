// Render just the loader's score (same engine as the site) to <out>/score.wav and re-mux the film in <out>.
// usage: node tools/score.js <url> <outdir> [desk|phone]
const puppeteer = require('puppeteer-core');
const m = require('@sparticuz/chromium'); const chromium = m.default || m;
const fs = require('fs');
const { execFileSync } = require('child_process');
const [url = 'http://127.0.0.1:8765/', out = 'qa/reel', kind = 'desk'] = process.argv.slice(2);
(async () => {
  const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args], headless: true });
  const p = await b.newPage();
  await p.setViewport(kind === 'phone' ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width: 1280, height: 800 });
  await p.goto(url + (url.includes('?') ? '&' : '?') + 'capture', { waitUntil: 'networkidle0', timeout: 120000 });
  await p.waitForFunction(() => window.__cap, { timeout: 240000 });
  const cuts = await p.evaluate(() => window.__cap.reel.timeline());
  const OPEN = await p.evaluate(() => window.__cap.reel.openMs / 1000);
  const GATE = process.env.NO_GATE ? 0 : 1.2, reelAt = GATE ? GATE + OPEN : 0;
  const last = cuts[cuts.length - 1];
  const score = await p.evaluate(o => window.__cap.score(o), { boxAt: GATE ? GATE : -1, openDur: OPEN, reelAt, landAt: reelAt + (last.t + last.d) / 1000 });
  fs.writeFileSync(`${out}/score.wav`, Buffer.from(score.b64, 'base64'));
  await b.close();
  const mp4 = `${out}/reel-${kind}.mp4`;
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', `${out}/list.txt`, '-i', `${out}/score.wav`,
    '-vf', `fps=60,format=yuv420p${kind === 'phone' ? ',scale=780:-2' : ''}`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', mp4]);
  console.log(mp4, 'score peak', score.peak.toFixed(3));
})().catch(e => { console.error('FAILED', e); process.exit(1); });
