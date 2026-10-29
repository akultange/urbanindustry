// Film the Urban Industry intro (the box, the loader, the wall) on this PC's graphics card, with its sound.
// Same frame-by-frame filming as tools/reel_video.js, but in your own Chrome (or Edge) on the GPU, so it can
// go to 4K at 60 fps. Frames go straight into ffmpeg: nothing piles up on disk.
//
// usage (in this folder):  powershell -ExecutionPolicy Bypass -File .\render.ps1
//                    or:  node film.js [url] [outdir] [desk|phone|both] [fps] [desktop scale]
const puppeteer = require('puppeteer-core');
const ffmpeg = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const [url = 'https://akultange.github.io/urbanindustry/', outDir = 'out', which = 'both', fpsArg = '60', scaleArg = '2'] = process.argv.slice(2);
const FPS = +fpsArg, SCALE = +scaleArg;

// where Windows itself says the browser is (App Paths in the registry), then the usual install folders
function registryPath(exe) {
  for (const hive of ['HKCU', 'HKLM']) {
    try {
      const out = execFileSync('reg', ['query', `${hive}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}`, '/ve'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const m = out.match(/REG_SZ\s+(.+)/);
      const p = m && m[1].trim().replace(/^"|"$/g, '');
      if (p && fs.existsSync(p)) return p;
    } catch (e) {}
  }
  return null;
}
function findBrowser() {
  const local = process.env.LOCALAPPDATA || '';
  const pf = process.env.ProgramFiles || 'C:\\Program Files', pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const first = list => list.filter(Boolean).find(p => fs.existsSync(p));
  const chrome = first([process.env.CHROME_PATH, registryPath('chrome.exe'),
    path.join(pf, 'Google\\Chrome\\Application\\chrome.exe'), path.join(pf86, 'Google\\Chrome\\Application\\chrome.exe'), path.join(local, 'Google\\Chrome\\Application\\chrome.exe')]);
  if (chrome) return { exe: chrome, name: 'Chrome' };
  const edge = first([registryPath('msedge.exe'), path.join(pf86, 'Microsoft\\Edge\\Application\\msedge.exe'), path.join(pf, 'Microsoft\\Edge\\Application\\msedge.exe')]);
  return edge ? { exe: edge, name: 'Edge' } : null;
}

async function film(browser, kind, name) {
  const p = await browser.newPage();
  const logs = [];
  p.on('pageerror', e => logs.push(`pageerror: ${e.message}`));
  // the filming tab has to be the one on show: a tab in the background (or a minimized window) draws nothing,
  // and a screenshot of it waits forever. Close anything else that opened (a welcome tab) and keep this one up
  for (const q of await browser.pages()) if (q !== p) await q.close().catch(() => {});
  const cdp = await p.createCDPSession();
  let windowId = null;
  try { ({ windowId } = await cdp.send('Browser.getWindowForTarget')); } catch (e) {}
  const keepUp = async () => {
    try {
      if (windowId != null) {
        const { bounds } = await cdp.send('Browser.getWindowBounds', { windowId });
        if (bounds.windowState === 'minimized') await cdp.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'normal' } });
      }
      await p.bringToFront();
    } catch (e) {}
  };
  await keepUp();

  const vp = kind === 'phone'
    ? { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
    : { width: 1920, height: 1080, deviceScaleFactor: SCALE };
  await p.setViewport(vp);
  const lang = kind === 'phone' ? 'ka' : 'en';
  console.log(`${kind}: loading the site`);
  await p.goto(`${url}${url.includes('?') ? '&' : '?'}capture&lang=${lang}&t=${Date.now()}`, { waitUntil: 'networkidle0', timeout: 120000 });
  await p.waitForFunction(() => window.__cap, { timeout: 240000 });
  await p.addStyleTag({ content: '*, *::before, *::after { transition: none !important; animation: none !important; }' });
  const gpu = await p.evaluate(() => window.__cap.scene.renderer);
  console.log(`${kind}: rendering on ${gpu}`);

  const W = Math.round(vp.width * vp.deviceScaleFactor), H = Math.round(vp.height * vp.deviceScaleFactor);
  const tmp = fs.mkdtempSync(path.join(outDir, `${kind}-`));
  const video = path.join(tmp, 'video.mp4');
  // frames are piped in at a fixed 60 fps; a frame that holds longer is sent several times
  const enc = spawn(ffmpeg, ['-y', '-v', 'error', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(FPS), '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-vf', `scale=${W - (W % 2)}:${H - (H % 2)}`, video], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => enc.on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));

  const cuts = await p.evaluate(() => window.__cap.reel.timeline());
  const GATE = 1.2, OPEN = await p.evaluate(() => window.__cap.reel.openMs / 1000);
  // the score, rendered by the site's own sound engine (muxed in at the end); the film runs as long as it does
  const reelAt = GATE + OPEN, last = cuts[cuts.length - 1];
  const score = await p.evaluate(o => window.__cap.score(o), { boxAt: GATE, openDur: OPEN, reelAt, landAt: reelAt + (last.t + last.d) / 1000 });
  const bytes = Buffer.from(score.b64, 'base64');
  const length = (bytes.length - 44) / 4 / 48000;   // 16-bit stereo at 48 kHz
  const total = Math.round(length * FPS);

  let owed = 0, filmed = 0, sent = 0, lastLog = 0, warned = false;
  const shot = async seconds => {
    const take = p.screenshot({ type: 'jpeg', quality: 96, captureBeyondViewport: false });
    // a frame takes well under a second; if one hangs, the window or its tab got hidden: bring it back
    const nudge = setInterval(() => {
      keepUp();
      if (!warned) { warned = true; process.stdout.write(`\n${kind}: the ${name} window was hidden, bringing it back. Leave it open while it films (it can sit behind other windows, just don't minimize it)\n`); }
    }, 6000);
    let buf;
    try { buf = await take; } finally { clearInterval(nudge); }
    filmed += seconds;
    owed += seconds * FPS;
    let n = Math.round(owed); owed -= n; sent += n;
    while (n-- > 0) if (!enc.stdin.write(buf)) await new Promise(r => enc.stdin.once('drain', r));
    if (Date.now() - lastLog > 1000) { lastLog = Date.now(); process.stdout.write(`\r${kind}: ${Math.min(sent, total)} of ${total} frames   `); }
  };

  // the closed box, then the opening (the visitor's tap is at GATE seconds)
  await p.evaluate(() => { window.__cap.reel.gate(); });
  await shot(GATE);
  await p.evaluate(() => { const r = document.querySelector('#reel'); r.classList.remove('gate'); r.classList.add('opening'); });
  const nOpen = Math.round(OPEN * FPS);
  for (let k = 1; k <= nOpen; k++) { await p.evaluate(k => window.__cap.reel.drawGate(k), k / nOpen); await shot(OPEN / nOpen); }
  await p.evaluate(() => {
    document.querySelector('#reel').classList.remove('opening');
    const r = document.querySelector('#reel [data-hud=sound]');
    r.textContent = window.__cap.reel.copy('soundOff'); r.setAttribute('aria-pressed', 'true');
    document.querySelector('#sound-btn').setAttribute('aria-pressed', 'true');
  });
  // the cuts
  for (const c of cuts) { await p.evaluate(t => window.__cap.reel.seek(t), c.t); await shot(c.d / 1000); }
  // the dissolve into the wall, the pull-back and the sign flickering on, stepped by hand
  await p.evaluate(() => { window.__cap.land(); document.documentElement.classList.add('intro'); });
  const steps = Math.round(3.4 * FPS);
  for (let k = 0; k < steps; k++) {
    await p.evaluate((dt, t) => {
      window.__cap.scene.step(dt);
      const r = window.__cap.reel, u = Math.min(1, t / (r.dissolveMs / 1000));
      if (document.querySelector('#reel')) r.dissolve(u >= 1 ? 1 : 1 - Math.pow(1 - u, 2.2));
      if (t > 2.85) document.documentElement.classList.remove('intro');
    }, 1 / FPS, k / FPS);
    await shot(1 / FPS);
  }
  // the settled wall, held until the sound has rung out
  await shot(Math.max(0.5, length - filmed));
  process.stdout.write(`\r${kind}: ${total} of ${total} frames, finishing the video\n`);
  enc.stdin.end();
  await done;

  const wav = path.join(tmp, 'score.wav');
  fs.writeFileSync(wav, bytes);
  await p.close();
  const mp4 = path.join(outDir, `urban-industry-${kind}-${kind === 'phone' ? `${W}x${H}` : `${H}p`}.mp4`);
  // the picture and the score are the same length (the last hold fills to the score), so no -shortest:
  // with the picture copied it trims the end early
  await new Promise((res, rej) => spawn(ffmpeg, ['-y', '-v', 'error', '-i', video, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-movflags', '+faststart', mp4], { stdio: 'inherit' })
    .on('close', c => (c === 0 ? res() : rej(new Error(`ffmpeg exited ${c}`)))));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${kind}: done, ${mp4}${logs.length ? '\n' + logs.join('\n') : ''}`);
}

(async () => {
  const found = findBrowser();
  if (!found) throw new Error('Chrome or Edge not found. Set CHROME_PATH to chrome.exe and run again.');
  console.log(`Filming in ${found.name}: ${found.exe}`);
  console.log(`A ${found.name} window opens. Leave it open while it films (it can sit behind other windows, just don't minimize it).`);
  fs.mkdirSync(outDir, { recursive: true });
  // a real window, so the page renders on the graphics card
  const browser = await puppeteer.launch({
    executablePath: found.exe, headless: false, defaultViewport: null, protocolTimeout: 600000,
    args: ['--window-size=1280,860', '--window-position=40,40', '--no-first-run', '--no-default-browser-check', '--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--force-color-profile=srgb',
      '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion'],
  });
  try {
    for (const kind of which === 'both' ? ['desk', 'phone'] : [which]) await film(browser, kind, found.name);
  } finally { await browser.close(); }
})().catch(e => { console.error('\nFAILED:', e.message); process.exit(1); });
