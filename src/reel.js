// The loader: a fast-cut reel built around one pair.
// Every shot holds for four frames at 30 fps and comes back as its own negative, while the pair
// stays dead centre and the world around it cuts: their blue, the box, a halftone, the shelf LEDs,
// a technical drawing, the price, their feed, the slat wall, the colourways, a silhouette.
// It ends on their wall at night and match-cuts onto the real one: same pair, same spot.
//
// Flash safety (WCAG 2.3.1): the order keeps every region of the screen under three light/dark
// flashes a second; tools/flash_check.py verifies the filmed frames. Reduced motion gets a still.

import LOGO from './logo.json';

const BLUE = '#a2c1f0', PAPER = '#ecebe7', INK = '#0e0f12';
const CUT = 400 / 3;      // 133 ms: four frames at 30 fps
const DISSOLVE_MS = 420;  // the loader dissolving into the real wall (style.css .reel.fade)
const PAIR_M = 0.43 * 0.92; // a pair's width on the real wall, in metres (scene.js SHOE_W x content)

const COPY = {
  en: {
    loc: 'Tbilisi — Worldwide', loading: 'Loading', ready: 'Ready', skip: 'Skip', soundOn: 'Sound on', soundOff: 'Sound off',
    field: 'Nike Dunk Low', night: 'The wall', day: 'The wall', blueprint: 'Side view — EU 36–45', beam: 'Light it up',
    silhouette: 'A classic', held: 'From our feed', halftone: '144K on Instagram', price: 'In stock',
    swatch: 'Colourways', box: 'Ships worldwide',
    gateQ: 'What’s in the box?', gateOpen: 'Open it, sound on', gateMute: 'or open without sound',
  },
  ka: {
    // the film's titles stay in English (a fashion film's captions; translated they read stiff); the controls are Georgian
    loc: 'TBILISI — WORLDWIDE', loading: 'იტვირთება', ready: 'მზადაა', skip: 'გამოტოვება', soundOn: 'ხმის ჩართვა', soundOff: 'ხმის გამორთვა',
    field: 'Nike Dunk Low', night: 'The wall', day: 'The wall', blueprint: 'Side view — EU 36–45', beam: 'Light it up',
    silhouette: 'A classic', held: 'From our feed', halftone: '144K on Instagram', price: 'In stock',
    swatch: 'Colourways', box: 'Ships worldwide',
    gateQ: 'What’s in the box?', gateOpen: 'გახსენით ხმით', gateMute: 'ან გახსენით ხმის გარეშე',
  },
};

// shot, negative?, HUD tone (w = white text, k = ink text).
// The frame re-cuts every 133 ms, but the order is chosen so that no region of the screen swings
// between light and dark more than ~5 times a second (tools/flash_check.py checks the filmed frames).
const SCRIPT = [
  ['field', 0, 'w'], ['field', 1, 'w'],
  ['price', 1, 'w'], ['price', 0, 'k'],
  ['day', 0, 'k'], ['day', 1, 'w'],
  ['blueprint', 0, 'k'],
  ['held', 1, 'w'], ['held', 0, 'w'],
  ['beam', 0, 'w'],
  ['blueprint', 1, 'w'],
  ['swatch', 1, 'w'], ['swatch', 0, 'k'],
  ['halftone', 0, 'k'], ['halftone', 1, 'w'],
  ['silhouette', 1, 'w'], ['silhouette', 0, 'k'],
  ['beam', 1, 'k'],
  ['box', 0, 'w'], ['box', 1, 'w'],
  ['night', 0, 'w'],
];
const SHORT = [['field', 0, 'w'], ['field', 1, 'w'], ['night', 0, 'w']];

// colourways off the wall, light to dark, for the swatch shot
const SWATCHES = [
  ['Sail', '530 SL', '#efe8dc'], ['Sandy pink', 'Gazelle Indoor', '#e9c8c3'], ['Urban blue', 'Urban Industry', BLUE],
  ['Birch', 'Mexico 66', '#d9d1be'], ['Cognac', '530 SL', '#a0714f'],
];

export function createReel({ root, lang = 'ka', phone = false, isPhone = null, reduced = false, short = false, film = false, anchorIndex, pairs, name = '' }) {
  const canvas = root.querySelector('canvas');
  let g = canvas.getContext('2d', { alpha: false });
  const hud = Object.fromEntries([...root.querySelectorAll('[data-hud]')].map(el => [el.dataset.hud, el]));
  const img = { anchor: null, lines: null, held: null, box: null, pairs: [] };
  const cache = new Map();
  const C = () => COPY[lang] || COPY.en;
  let W = 1, H = 1, dpr = 1, A = null;
  let cuts = [], idx = -1, t0 = null, raf = 0, holding = false, done = false, skipped = false;
  let pct = 0, current = null, clock = null, endP = null, endRes = null;
  const arm = () => { endP = new Promise(r => { endRes = r; }); };
  const finish = () => { done = true; if (endRes) { const r = endRes; endRes = null; r(); } };

  // ---------------------------------------------------------------- geometry: the pair's texture layer, centred on screen
  function measure() {
    W = innerWidth; H = innerHeight; dpr = Math.min(devicePixelRatio || 1, film ? 4 : 2);   // a film: full resolution
    if (isPhone) phone = isPhone();   // the layout follows the window (it can change before the cuts start)
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const r = pairs[anchorIndex].rect || [0.04, 0.06, 0.96, 0.99];
    const cw = phone ? W * 0.8 : Math.min(W * 0.4, H * 0.62);
    const w = cw / (r[2] - r[0]), h = w / 1.6;
    const cx = W / 2, cy = H * (phone ? 0.47 : 0.5);
    const x = cx - w * (r[0] + r[2]) / 2, y = cy - h * (r[1] + r[3]) / 2;
    A = { x, y, w, h, cx, cy, cw, ch: h * (r[3] - r[1]), top: y + h * r[1], sole: y + h * r[3], r };
    cache.clear();
  }

  // ---------------------------------------------------------------- drawing helpers
  const fill = c => { g.fillStyle = c; g.fillRect(0, 0, W, H); };
  const invert = () => { g.save(); g.globalCompositeOperation = 'difference'; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.restore(); };
  const font = (px, wt = 500) => `${wt} ${px}px RB, NSG, system-ui, sans-serif`;
  function label(text, x, y, { size = 9.5, align = 'left', color = INK, track = 0.13, wt = 500 } = {}) {
    // tracked caps, drawn glyph by glyph so it works without canvas letterSpacing
    g.font = font(size, wt); g.fillStyle = color; g.textBaseline = 'middle';
    const s = String(text).toUpperCase(), sp = size * track;
    const ws = [...s].map(ch => g.measureText(ch).width);
    const total = ws.reduce((a, b) => a + b, 0) + sp * (s.length - 1);
    let px = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    [...s].forEach((ch, i) => { g.fillText(ch, px, y); px += ws[i] + sp; });
  }
  function layerOf(src, key, paint) {
    // an offscreen copy of a pair layer at its on-screen size, recoloured by paint()
    if (cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas');
    c.width = Math.round(A.w * dpr); c.height = Math.round(A.h * dpr);
    const q = c.getContext('2d');
    q.drawImage(src, 0, 0, c.width, c.height);
    paint(q, c);
    cache.set(key, c); return c;
  }
  const anchor = (src = img.anchor) => { if (src) g.drawImage(src, A.x, A.y, A.w, A.h); };
  function softShadow(alpha = 0.3, spread = 1) {
    const rx = A.cw * 0.56 * spread, ry = A.ch * 0.07 * spread;
    g.save(); g.translate(A.cx, A.sole - ry * 0.25); g.scale(1, ry / rx);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    gr.addColorStop(0, `rgba(0,0,0,${alpha})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
  }

  function slats(night) {
    const k0 = A.cw / PAIR_M, p = 0.044 * k0, gw = p * 0.24;
    fill(night ? '#060708' : '#6a6d72');
    // groove centres sit where the real wall has them: x = -0.013 + n * 0.044 m from the pair's centre
    const g0 = A.cx - 0.013 * k0;
    const x0 = g0 - Math.ceil(g0 / p) * p;
    for (let x = x0; x < W + p; x += p) {
      const gr = g.createLinearGradient(x + gw / 2, 0, x + p - gw / 2, 0);
      if (night) { gr.addColorStop(0, '#34373d'); gr.addColorStop(0.18, '#26292e'); gr.addColorStop(0.75, '#191b1f'); gr.addColorStop(1, '#0e0f11'); }
      else { gr.addColorStop(0, '#d2d4d8'); gr.addColorStop(0.18, '#bfc2c6'); gr.addColorStop(0.75, '#a9acb1'); gr.addColorStop(1, '#8e9196'); }
      g.fillStyle = gr; g.fillRect(x + gw / 2, 0, p - gw, H);
    }
    const v = g.createLinearGradient(0, 0, 0, H);
    v.addColorStop(0, night ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0.08)'); v.addColorStop(1, night ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.25)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    const rg = g.createRadialGradient(A.cx, A.cy, 0, A.cx, A.cy, Math.max(W, H) * 0.7);
    rg.addColorStop(0, night ? 'rgba(160,190,240,0.07)' : 'rgba(255,255,255,0.1)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
    if (night) {
      // the glass shelf the pair stands on
      const hw = 0.24 * k0, y = A.sole + 1;
      g.fillStyle = 'rgba(4,5,6,0.9)'; g.fillRect(A.cx - hw - 0.004 * k0, y + 0.006 * k0, 2 * hw + 0.008 * k0, 0.022 * k0);
      g.fillStyle = 'rgba(150,190,186,0.5)'; g.fillRect(A.cx - hw, y - 0.002 * k0, 2 * hw, 0.008 * k0);
      g.fillStyle = 'rgba(200,225,225,0.35)'; g.fillRect(A.cx - hw, y + 0.006 * k0, 2 * hw, Math.max(1, 0.002 * k0));
    }
    softShadow(night ? 0.55 : 0.35, 1.1);
    anchor();
  }

  // ---------------------------------------------------------------- shots
  const SHOTS = {
    field() { fill(BLUE); anchor(); },

    // their wall, at the same scale and slat phase as the real one behind the loader
    day() { slats(false); },
    night() { slats(true); return true; },

    blueprint() {
      fill(PAPER);
      const s = Math.max(16, A.cw / 22);
      g.lineWidth = 1; g.strokeStyle = 'rgba(14,15,18,0.07)';
      g.beginPath();
      for (let x = A.cx % s; x < W; x += s) { g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, H); }
      for (let y = A.cy % s; y < H; y += s) { g.moveTo(0, Math.round(y) + 0.5); g.lineTo(W, Math.round(y) + 0.5); }
      g.stroke();
      g.strokeStyle = 'rgba(14,15,18,0.55)';
      g.beginPath();
      // centre lines, sole line, the bounding circle
      g.moveTo(0, Math.round(A.cy) + 0.5); g.lineTo(W, Math.round(A.cy) + 0.5);
      g.moveTo(Math.round(A.cx) + 0.5, 0); g.lineTo(Math.round(A.cx) + 0.5, H);
      g.moveTo(A.cx - A.cw * 0.62, Math.round(A.sole) + 0.5); g.lineTo(A.cx + A.cw * 0.62, Math.round(A.sole) + 0.5);
      g.stroke();
      g.beginPath(); g.arc(A.cx, A.cy, A.cw * 0.6, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(14,15,18,0.35)';
      g.beginPath(); g.arc(A.cx, A.cy, A.cw * 0.43, 0, Math.PI * 2); g.stroke();
      // toe and heel markers
      const xl = A.cx - A.cw / 2, xr = A.cx + A.cw / 2;
      for (const [x, y] of [[xl, A.sole - A.ch * 0.18], [xr, A.sole - A.ch * 0.16], [A.cx, A.top]]) {
        g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(x - 9, y); g.lineTo(x + 9, y); g.moveTo(x, y - 9); g.lineTo(x, y + 9); g.stroke();
      }
      // dimension line under the pair
      const dy = A.sole + Math.max(26, A.ch * 0.16);
      g.strokeStyle = 'rgba(14,15,18,0.7)';
      g.beginPath(); g.moveTo(xl, dy); g.lineTo(xr, dy);
      g.moveTo(xl, dy - 6); g.lineTo(xl, dy + 6); g.moveTo(xr, dy - 6); g.lineTo(xr, dy + 6);
      g.moveTo(xl, dy); g.lineTo(xl + 7, dy - 4); g.moveTo(xl, dy); g.lineTo(xl + 7, dy + 4);
      g.moveTo(xr, dy); g.lineTo(xr - 7, dy - 4); g.moveTo(xr, dy); g.lineTo(xr - 7, dy + 4);
      g.stroke();
      label('Dunk Low — 1985', A.cx, dy + 16, { align: 'center', size: 9 });
      label('Heel', xl - 14, A.sole - A.ch * 0.18, { align: 'right', size: 8.5 });
      label('Toe', xr + 14, A.sole - A.ch * 0.16, { size: 8.5 });
      label('Collar', A.cx + 14, A.top - 12, { size: 8.5 });
      if (img.lines) {
        const ink = layerOf(img.lines, 'lines-ink', (q, c) => { q.globalCompositeOperation = 'source-in'; q.fillStyle = INK; q.fillRect(0, 0, c.width, c.height); });
        g.drawImage(ink, A.x, A.y, A.w, A.h);
      } else anchor();
    },

    // the wall's LED shelves as a grid of light, the pair on the brightest one
    beam() {
      fill('#030406');
      const k0 = A.cw / PAIR_M;           // px per metre at the pair's scale
      const pitchX = 0.58 * k0, pitchY = 0.64 * k0, sw = 0.47 * k0;
      const glow = (x, y, rx, ry, a) => {
        g.save(); g.translate(x, y); g.scale(1, ry / rx);
        const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
        gr.addColorStop(0, `rgba(110,160,255,${a})`); gr.addColorStop(0.35, `rgba(90,140,255,${a * 0.4})`); gr.addColorStop(1, 'rgba(80,130,255,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
      };
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let r = -3; r <= 3; r++) for (let c = -4; c <= 4; c++) {
        const x = A.cx + c * pitchX, y = A.sole + r * pitchY;
        if (x < -sw || x > W + sw || y < -pitchY * 0.5 || y > H + pitchY * 0.5) continue;
        const main = r === 0 && c === 0;
        const k = main ? 1 : Math.max(0.12, 0.62 - Math.hypot(c * 0.5, r * 0.75) * 0.22);
        glow(x, y + 6, sw * (main ? 0.95 : 0.75), pitchY * (main ? 0.5 : 0.32), (main ? 0.5 : 0.36) * k);
        // the strip: a hot core and a soft line
        const line = g.createLinearGradient(x - sw / 2, 0, x + sw / 2, 0);
        line.addColorStop(0, 'rgba(140,185,255,0)'); line.addColorStop(0.12, `rgba(175,205,255,${0.9 * k})`);
        line.addColorStop(0.88, `rgba(175,205,255,${0.9 * k})`); line.addColorStop(1, 'rgba(140,185,255,0)');
        g.fillStyle = line; g.fillRect(x - sw / 2, y - 2, sw, main ? 4 : 3);
        if (main) { g.fillStyle = 'rgba(245,250,255,0.95)'; g.fillRect(x - sw * 0.42, y - 1, sw * 0.84, 2); }
      }
      g.restore();
      anchor();
      // the strip's blue on the lower half of the pair
      if (img.anchor) {
        const lit = layerOf(img.anchor, 'anchor-under', (q, c) => {
          q.globalCompositeOperation = 'source-atop';
          const gr = q.createLinearGradient(0, c.height, 0, c.height * 0.4);
          gr.addColorStop(0, 'rgba(120,170,255,0.6)'); gr.addColorStop(1, 'rgba(120,170,255,0)');
          q.fillStyle = gr; q.fillRect(0, 0, c.width, c.height);
          q.globalCompositeOperation = 'destination-in'; q.drawImage(img.anchor, 0, 0, c.width, c.height);
        });
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55; g.drawImage(lit, A.x, A.y, A.w, A.h); g.restore();
      }
    },

    silhouette() {
      const gr = g.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, BLUE); gr.addColorStop(0.62, '#dfe9fa'); gr.addColorStop(1, '#f7f9fd');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      if (img.anchor) {
        const sil = layerOf(img.anchor, 'sil', (q, c) => { q.globalCompositeOperation = 'source-in'; q.fillStyle = INK; q.fillRect(0, 0, c.width, c.height); });
        g.drawImage(sil, A.x, A.y, A.w, A.h);
      }
    },

    held() { return photo(img.held, 0.58, 0.6); },
    box() { return photo(img.box, 0.5, 0.52); },

    halftone() {
      fill(BLUE);
      const s = A.cw / 60;
      // the field of dots behind
      g.fillStyle = 'rgba(14,15,18,0.16)';
      g.beginPath();
      const ox = A.cx % s, oy = A.cy % s;
      for (let y = oy; y < H; y += s) for (let x = ox; x < W; x += s) { g.moveTo(x + 1, y); g.arc(x, y, 1, 0, Math.PI * 2); }
      g.fill();
      if (!img.anchor) return;
      let dots = cache.get('ht');
      if (!dots) {
        const cols = Math.ceil(A.w / s), rows = Math.ceil(A.h / s);
        const c = document.createElement('canvas'); c.width = cols; c.height = rows;
        const q = c.getContext('2d', { willReadFrequently: true }); q.drawImage(img.anchor, 0, 0, cols, rows);
        const d = q.getImageData(0, 0, cols, rows).data;
        dots = [];
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const o = (j * cols + i) * 4, a = d[o + 3] / 255;
          if (a < 0.1) continue;
          const lum = (0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]) / 255; // getImageData is never premultiplied
          dots.push(i, j, s * 0.52 * Math.sqrt(a * (0.2 + 0.8 * Math.min(1, 1.15 - lum))));
        }
        cache.set('ht', dots);
      }
      g.fillStyle = INK; g.beginPath();
      const bx = A.x + s / 2, by = A.y + s / 2;
      for (let k = 0; k < dots.length; k += 3) { const x = bx + dots[k] * s, y = by + dots[k + 1] * s, r = dots[k + 2]; g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); }
      g.fill();
    },

    price() {
      fill(PAPER);
      const p = pairs[anchorIndex].price;
      const size = phone ? W * 0.52 : Math.min(H * 0.62, W * 0.42);
      g.font = font(size, 600); g.fillStyle = BLUE; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      const m = g.measureText(String(p));
      // behind the pair on wide screens; above it on a phone, where the pair covers most of the width
      const by = phone ? A.top - size * 0.08 : A.cy + size * 0.36;
      g.fillText(String(p), A.cx, by);
      g.font = font(size * 0.2, 500); g.textAlign = 'left';
      g.fillText('₾', A.cx + m.width / 2 + size * 0.04, by - size * 0.58);
      g.textAlign = 'start';
      softShadow(0.28);
      anchor();
      label('Nike — Dunk Low', A.cx, A.sole + Math.max(30, A.ch * 0.2), { align: 'center', size: 9.5 });
    },

    swatch() {
      const n = SWATCHES.length, bh = H / n;
      SWATCHES.forEach(([name, from, c], i) => {
        g.fillStyle = c; g.fillRect(0, Math.floor(i * bh), W, Math.ceil(bh) + 1);
        const dark = i === n - 1;
        const col = dark ? 'rgba(255,255,255,0.92)' : INK;
        // keep clear of the HUD row at the top
        const y = i * bh + (i === 0 ? Math.max(bh * 0.5, 64) : Math.min(26, bh * 0.22));
        label(name, phone ? 18 : 32, y, { color: col, size: 9 });
        label(from, phone ? 18 : 32, y + 14, { color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(14,15,18,0.55)', size: 8 });
        label(c, W - (phone ? 18 : 32), y, { color: col, size: 9, align: 'right' });
      });
      softShadow(0.25);
      anchor();
    },

  };

  // feed photos: full bleed on a phone, a card on the blue field on wider screens
  function photo(src, fx, fy) {
    if (!src) { SHOTS.field(); return; }
    if (phone || W / H < 0.9) {
      const s = Math.max(W / src.width, H / src.height);
      const w = src.width * s, h = src.height * s;
      const x = Math.min(0, Math.max(W - w, A.cx - w * fx)), y = Math.min(0, Math.max(H - h, A.cy - h * fy));
      g.drawImage(src, x, y, w, h);
    } else {
      fill(BLUE);
      const h = H * 0.76, w = h * src.width / src.height;
      g.drawImage(src, A.cx - w / 2, A.cy - h / 2, w, h);
    }
  }


  // ---------------------------------------------------------------- the gate: a closed shoebox
  // "What's in the box?" The tap that opens it is also the click browsers need before sound can play.
  // The box is drawn in 3D, from a fixed camera a little above it, so the lid can come off with real
  // perspective. Opening (OPEN_MS): a small press, the lid tips up at the back and lifts away, light
  // comes out of the box, and the pair rises out of it while the box drops away. The pair settles
  // exactly where the reel's first frame has it, so the cuts start without a cut.
  const OPEN_MS = 1300;
  function boxGeom() {
    const bw = A.cw * (phone ? 1.08 : 1.14), bh = bw * 0.36;
    const x0 = A.cx - bw / 2, y1 = A.sole + bh * 0.1, y0 = y1 - bh;
    return { bw, bh, x0, y0, y1, lidH: bh * 0.34, over: bw * 0.016, topH: bh * 0.2, inset: bw * 0.045 };
  }
  // world units: the box is 1 long (x), D deep (z, toward the camera), HT tall (y) with its lid on
  const BX = { HT: 0.36, D: 0.58, OV: 0.016, W: 0.008 };
  BX.LID = BX.HT * 0.34; BX.HB = BX.HT - 0.004;
  const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm3 = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const CAM = (() => {
    const el = 0.2, dist = 4.2, ty = BX.HT * 0.5;
    const C = [0, ty + dist * Math.sin(el), dist * Math.cos(el)];
    const f = norm3(sub3([0, ty, 0], C)), r = [1, 0, 0];
    return { C, f, r, u: cross3(r, f) };
  })();
  const rawP = p => { const d = sub3(p, CAM.C), z = dot3(d, CAM.f); return [dot3(d, CAM.r) / z, -dot3(d, CAM.u) / z]; };
  let FIT = null, DY = 0;  // projection fitted to the layout; DY drops the whole box (screen px)
  function fitBox(b) {
    const p = rawP([-0.5, 0, BX.D / 2]), q = rawP([0.5, 0, BX.D / 2]);
    const k = b.bw / (q[0] - p[0]);
    FIT = { k, ox: A.cx - k * (p[0] + q[0]) / 2, oy: b.y1 - k * p[1] };
  }
  const P3 = p => { const r = rawP(p); return [FIT.ox + FIT.k * r[0], FIT.oy + FIT.k * r[1] + DY]; };
  function poly(pts, style) {
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath(); g.fillStyle = style; g.fill();
  }
  const grad = (a, b, stops) => { const gr = g.createLinearGradient(a[0], a[1], b[0], b[1]); for (const [o, c] of stops) gr.addColorStop(o, c); return gr; };
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const oCubic = x => 1 - Math.pow(1 - clamp01(x), 3);
  const iQuad = x => clamp01(x) * clamp01(x);
  const iCubic = x => Math.pow(clamp01(x), 3);
  const oBack = (x, s = 0.9) => { const u = clamp01(x) - 1; return 1 + (s + 1) * u * u * u + s * u * u; };

  // the lid: an open-bottomed box that tips about its back lower edge, then lifts away
  const LX0 = -0.5 - BX.OV, LX1 = 0.5 + BX.OV, LZ0 = -BX.D / 2 - BX.OV, LZ1 = BX.D / 2 + BX.OV, LY0 = BX.HT - BX.LID, LY1 = BX.HT;
  const LID_FACES = [
    { id: 'top', n: [0, 1, 0], p: [[LX0, LY1, LZ1], [LX1, LY1, LZ1], [LX1, LY1, LZ0], [LX0, LY1, LZ0]] },
    { id: 'front', n: [0, 0, 1], p: [[LX0, LY1, LZ1], [LX1, LY1, LZ1], [LX1, LY0, LZ1], [LX0, LY0, LZ1]] },
    { id: 'back', n: [0, 0, -1], p: [[LX0, LY1, LZ0], [LX1, LY1, LZ0], [LX1, LY0, LZ0], [LX0, LY0, LZ0]] },
    { id: 'left', n: [-1, 0, 0], p: [[LX0, LY1, LZ0], [LX0, LY1, LZ1], [LX0, LY0, LZ1], [LX0, LY0, LZ0]] },
    { id: 'right', n: [1, 0, 0], p: [[LX1, LY1, LZ1], [LX1, LY1, LZ0], [LX1, LY0, LZ0], [LX1, LY0, LZ1]] },
  ];
  function lidPose(t, nudge) {
    // t in seconds since the tap; nudge (0..1) is the hover tease on the closed box
    const press = t > 0 && t < 0.1 ? Math.sin(Math.PI * t / 0.1) : 0;
    const th = 0.03 * nudge + 0.42 * oCubic((t - 0.07) / 0.28) + 0.78 * iQuad((t - 0.3) / 0.34);
    const ty = 0.011 * nudge - 0.005 * press + 0.04 * oCubic((t - 0.07) / 0.28) + 2.3 * iCubic((t - 0.28) / 0.38);
    const tz = -0.55 * iQuad((t - 0.28) / 0.38);
    return { th, ty, tz };
  }
  const lidXf = (p, { th, ty, tz }) => {
    const dy = p[1] - LY0, dz = p[2] - LZ0, c = Math.cos(th), s = Math.sin(th);
    return [p[0], LY0 + dy * c + dz * s + ty, LZ0 - dy * s + dz * c + tz];
  };
  const lidN = (n, { th }) => { const c = Math.cos(th), s = Math.sin(th); return [n[0], n[1] * c + n[2] * s, -n[1] * s + n[2] * c]; };

  // the lid's front band: gradient, edge lines, wordmark and the blue label, as a bitmap per layout
  let BAND = null;
  function bandArt(b) {
    const lw = b.bw + b.over * 2, lh = b.lidH, key = `${lw.toFixed(1)}x${lh.toFixed(1)}@${dpr}`;
    if (BAND && BAND.key === key) return BAND;
    const mk = withPrint => {
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(lw * dpr)); c.height = Math.max(1, Math.ceil(lh * dpr));
      const q = c.getContext('2d'); q.scale(c.width / lw, c.height / lh);
      const gr = q.createLinearGradient(0, 0, 0, lh); gr.addColorStop(0, '#1d1f23'); gr.addColorStop(1, '#121316');
      q.fillStyle = gr; q.fillRect(0, 0, lw, lh);
      q.fillStyle = 'rgba(255,255,255,0.12)'; q.fillRect(0, 0, lw, 1);
      q.fillStyle = 'rgba(0,0,0,0.45)'; q.fillRect(0, lh - 1, lw, 1.5);
      if (withPrint) {
        const mh = lh * 0.42, ms = mh / LOGO.h, mw = LOGO.w * ms;
        q.save(); q.translate(lw / 2 - mw / 2, (lh - mh) / 2); q.scale(ms, ms);
        q.fillStyle = '#ffffff'; q.fill(new Path2D(LOGO.d), 'evenodd'); q.restore();
        q.fillStyle = BLUE; q.fillRect(lw - b.inset * 1.6, 0, b.inset * 0.5, lh);
      }
      return c;
    };
    BAND = { key, lw, lh, full: mk(true), plain: mk(false) };
    return BAND;
  }
  function drawLid(pose, glow, print = 1) {
    const b = boxGeom();
    g.save();
    const faces = LID_FACES.map(f => {
      const w = f.p.map(p => lidXf(p, pose)), n = lidN(f.n, pose);
      const c = w.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4, a[2] + p[2] / 4], [0, 0, 0]);
      return { f, s: w.map(P3), outer: dot3(n, sub3(CAM.C, c)) > 0, n };
    });
    // inside first (seen through the open bottom as it tips up), lit by what's in the box
    for (const q of faces.filter(q => !q.outer)) {
      const lit = glow * (q.f.id === 'top' ? 0.85 : 0.5);
      // brighter toward the hinge, which sits right over the light in the box
      poly(q.s, grad(mid(q.s[0], q.s[1]), mid(q.s[2], q.s[3]), [[0, `rgb(${12 + 105 * lit},${13 + 115 * lit},${16 + 135 * lit})`], [1, `rgb(${18 + 175 * lit},${19 + 186 * lit},${23 + 204 * lit})`]]));
    }
    for (const q of faces.filter(q => q.outer)) {
      const [p0, p1, p2, p3] = q.s;
      if (q.f.id === 'top') {
        poly(q.s, grad(mid(p2, p3), mid(p0, p1), [[0, '#34373d'], [1, '#25272c']]));
        // tipping back takes it out of the light
        const dim = clamp01(1 - q.n[1]) * 0.55;
        if (dim > 0.01) poly(q.s, `rgba(0,0,0,${dim})`);
        // the front edge catches the light
        g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 1; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
      } else if (q.f.id === 'front') {
        // the band with its print (drawn once per layout), mapped onto the face
        const band = bandArt(b), lw = band.lw, lh = band.lh;
        g.save();
        const ex = [(p1[0] - p0[0]) / lw, (p1[1] - p0[1]) / lw], ey = [(p3[0] - p0[0]) / lh, (p3[1] - p0[1]) / lh];
        g.transform(ex[0], ex[1], ey[0], ey[1], p0[0], p0[1]);
        if (print < 1) g.drawImage(band.plain, 0, 0, lw, lh);
        if (print > 0) { g.globalAlpha = print; g.drawImage(band.full, 0, 0, lw, lh); g.globalAlpha = 1; }
        // its lower edge, lit from inside once the lid is off the rim
        if (glow > 0) { g.fillStyle = `rgba(230,240,255,${0.5 * glow})`; g.fillRect(0, lh - 1.5, lw, 1.5); }
        g.restore();
        const dim = clamp01(-q.n[1]) * 0.4;
        if (dim > 0.01) poly(q.s, `rgba(0,0,0,${dim})`);
      } else {
        poly(q.s, '#16171a');
      }
    }
    g.restore();
  }

  function drawBody(glow) {
    const { HB, D, W } = BX, z0 = -D / 2, z1 = D / 2, x0 = -0.5, x1 = 0.5;
    // inside: back and side walls, the tissue paper, the rim (only seen once the lid is up)
    if (glow > 0.001 || DY) {
      const yT = HB - 0.035;
      const back = [[x0 + W, HB, z0 + W], [x1 - W, HB, z0 + W], [x1 - W, yT, z0 + W], [x0 + W, yT, z0 + W]].map(P3);
      poly(back, grad(back[0], back[3], [[0, `rgb(${17 + 90 * glow},${18 + 100 * glow},${22 + 115 * glow})`], [1, `rgb(${30 + 200 * glow},${32 + 208 * glow},${38 + 214 * glow})`]]));
      const tis = [[x0 + W, yT, z1 - W], [x1 - W, yT, z1 - W], [x1 - W, yT, z0 + W], [x0 + W, yT, z0 + W]].map(P3);
      const tc = mid(mid(tis[0], tis[1]), mid(tis[2], tis[3]));
      const tg = g.createRadialGradient(tc[0], tc[1], 0, tc[0], tc[1], Math.abs(tis[1][0] - tis[0][0]) * 0.55);
      tg.addColorStop(0, `rgb(${Math.round(236 + 19 * glow)},${Math.round(239 + 16 * glow)},${Math.round(244 + 11 * glow)})`);
      tg.addColorStop(1, `rgb(${Math.round(196 + 50 * glow)},${Math.round(202 + 48 * glow)},${Math.round(212 + 42 * glow)})`);
      poly(tis, tg);
      // a few soft folds in the paper
      g.save(); g.beginPath(); tis.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.clip();
      const tw = tis[1][0] - tis[0][0], th = Math.max(4, tis[0][1] - tis[3][1]);
      for (const [fx, fy, fr, a] of [[0.18, 0.5, 0.22, 0.1], [0.42, 0.35, 0.16, -0.08], [0.63, 0.6, 0.2, 0.09], [0.84, 0.42, 0.15, -0.07]]) {
        const cx = tis[3][0] + tw * fx, cy = tis[3][1] + th * fy, rx = tw * fr;
        g.save(); g.translate(cx, cy); g.scale(1, th / rx);
        const fg = g.createRadialGradient(0, 0, 0, 0, 0, rx);
        fg.addColorStop(0, a > 0 ? `rgba(255,255,255,${a})` : `rgba(60,70,90,${-a})`); fg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = fg; g.beginPath(); g.arc(0, 0, rx, 0, Math.PI * 2); g.fill(); g.restore();
      }
      g.restore();
      // the rim: the cardboard's cut edge, lit from inside on its inner side
      const rim = [[x0, HB, z1], [x1, HB, z1], [x1 - W, HB, z1 - W], [x0 + W, HB, z1 - W]].map(P3);
      poly(rim, `rgba(${60 + 150 * glow},${63 + 158 * glow},${70 + 170 * glow},1)`);
      const rimB = [[x0 + W, HB, z0 + W], [x1 - W, HB, z0 + W], [x1, HB, z0], [x0, HB, z0]].map(P3);
      poly(rimB, `rgba(${40 + 60 * glow},${42 + 64 * glow},${48 + 70 * glow},1)`);
    }
  }
  function drawFront(glow) {
    const { HB, D } = BX, z1 = D / 2;
    const f = [[-0.5, HB, z1], [0.5, HB, z1], [0.5, 0, z1], [-0.5, 0, z1]].map(P3);
    poly(f, grad(f[0], f[2], [[0, '#24262b'], [0.55, '#16171a'], [1, '#0c0d0f']]));
    g.fillStyle = `rgba(255,255,255,${0.06 + 0.2 * glow})`; g.fillRect(f[0][0], f[0][1], f[1][0] - f[0][0], 1);
    if (glow > 0) {
      // light from inside, falling on the outside of the rim
      const rl = grad(f[0], [f[0][0], f[0][1] + (f[3][1] - f[0][1]) * 0.4], [[0, `rgba(225,235,255,${0.16 * glow})`], [1, 'rgba(225,235,255,0)']]);
      poly(f, rl);
    }
  }
  function floorShadow(b, k) {
    if (k <= 0.001) return;
    g.save(); g.translate(A.cx, b.y1 + 2 + DY); g.scale(1, 0.09);
    const sg = g.createRadialGradient(0, 0, 0, 0, 0, b.bw * 0.66);
    sg.addColorStop(0, `rgba(20,40,80,${0.42 * k})`); sg.addColorStop(1, 'rgba(20,40,80,0)');
    g.fillStyle = sg; g.beginPath(); g.arc(0, 0, b.bw * 0.66, 0, Math.PI * 2); g.fill(); g.restore();
  }
  // light pouring out of the opening: a soft spill on the backdrop and a faint column
  function spill(b, glow) {
    if (glow <= 0.002) return;
    const o = P3([0, BX.HB, 0]), half = (b.bw - b.inset * 3.6) / 2;
    const r = b.bw * (0.55 + 0.5 * glow);
    const rg = g.createRadialGradient(o[0], o[1], 0, o[0], o[1], r);
    rg.addColorStop(0, `rgba(250,252,255,${0.44 * glow})`); rg.addColorStop(0.45, `rgba(220,232,252,${0.2 * glow})`); rg.addColorStop(1, 'rgba(162,193,240,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
    const hgt = H * (0.2 + 0.55 * glow);
    for (let i = 0; i < 12; i++) {
      const s = i / 11, wb = half * (0.6 + 0.6 * s), wt = wb * (1.3 + 0.8 * s), top = o[1] - hgt * (1 - 0.25 * s);
      const al = glow * 0.075 * (1 - 0.5 * s);
      g.fillStyle = grad([0, o[1]], [0, top], [[0, `rgba(255,255,255,${al})`], [0.5, `rgba(236,244,255,${al * 0.5})`], [1, 'rgba(236,244,255,0)']]);
      g.beginPath(); g.moveTo(o[0] - wb, o[1]); g.lineTo(o[0] + wb, o[1]); g.lineTo(o[0] + wt, top); g.lineTo(o[0] - wt, top); g.closePath(); g.fill();
    }
  }
  // the pair coming out: it rises from inside the box into exactly the spot (and size) the reel's first
  // frame has it in, while the box falls away around it. One smooth move, no bounce back down (a pattern
  // sweeping back and forth over the same spot reads as flicker; tools/flash_check.py counts it).
  function shoePose(t) {
    const ch = A.sole - A.top, cyEnd = (A.top + A.sole) / 2;
    const rim = P3([0, BX.HB, BX.D / 2])[1];
    const s0 = 0.8, cy0 = rim + 12 + s0 * ch / 2;      // hidden behind the front of the box
    const u = (t - 0.3) / 0.9;
    const k = oBack(u, 1.0), s = s0 + (1 - s0) * oCubic(u);
    return { cy: cy0 + (cyEnd - cy0) * k, s, rot: -0.04 * (1 - oCubic(u)), cyEnd, on: t > 0.3 };
  }
  function drawRising(t) {
    if (!img.anchor) return;
    const q = shoePose(t);
    if (!q.on) return;
    g.save(); g.translate(A.cx, q.cy); g.rotate(q.rot); g.scale(q.s, q.s); g.translate(-A.cx, -q.cyEnd);
    g.drawImage(img.anchor, A.x, A.y, A.w, A.h);
    g.restore();
  }
  // dust in the light: a few specks drifting up out of the box
  const MOTES = Array.from({ length: 16 }, (_, i) => { const r = n => { const x = Math.sin((i + 1) * n) * 43758.5453; return x - Math.floor(x); }; return [r(12.9898) * 2 - 1, r(78.233), 0.4 + r(37.719) * 0.9, r(93.989)]; });
  function motes(b, t, glow) {
    if (glow <= 0.01) return;
    const o = P3([0, BX.HB, 0]), half = (b.bw - b.inset * 3.6) / 2;
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const [x, y0, sp, ph] of MOTES) {
      const life = (t - 0.12 - ph * 0.3) * sp;
      if (life <= 0) continue;
      const yy = o[1] - (y0 * 0.15 + life) * b.bh * 1.6, xx = o[0] + x * half * (0.8 + life * 0.6) + Math.sin((t + ph) * 5) * 3;
      const a = 0.4 * glow * Math.max(0, 1 - life * 0.9) * (0.35 + 0.65 * ph);
      if (a <= 0.01) continue;
      const rr = 0.6 + ph * 0.8;
      const mg = g.createRadialGradient(xx, yy, 0, xx, yy, rr * 3);
      mg.addColorStop(0, `rgba(255,255,255,${0.7 * a})`); mg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = mg; g.fillRect(xx - rr * 3, yy - rr * 3, rr * 6, rr * 6);
    }
    g.restore();
  }

  // motion blur: the lid at several moments across a frame's exposure, averaged over what's behind it
  const blurC = document.createElement('canvas');
  let blurG = null;
  function lidBlurred(t, glow) {
    // half resolution is plenty for a smear, and four times cheaper to fill
    const N = 8, span = 1.2 / 60, R = 0.5 * dpr;
    const poses = Array.from({ length: N }, (_, j) => lidPose(t - span * j / (N - 1), 0));
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const ps of poses) for (const f of LID_FACES) for (const p of f.p) {
      const q = P3(lidXf(p, ps)); x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]);
    }
    x0 = Math.max(0, x0 - 4); y0 = Math.max(0, y0 - 4); x1 = Math.min(W, x1 + 4); y1 = Math.min(H, y1 + 4);
    if (x1 <= x0 || y1 <= y0) return;
    const cw = Math.ceil(W * R), chh = Math.ceil(H * R);
    if (blurC.width !== cw || blurC.height !== chh) { blurC.width = cw; blurC.height = chh; blurG = null; }
    blurG = blurG || blurC.getContext('2d');
    const sx = Math.floor(x0 * R), sy = Math.floor(y0 * R), sw = Math.ceil(x1 * R) - sx, sh = Math.ceil(y1 * R) - sy;
    const main = g, print = 1 - sstep(0.31, 0.42, t);
    poses.forEach((ps, j) => {
      g = blurG; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(sx, sy, sw, sh); g.setTransform(R, 0, 0, R, 0, 0);
      drawLid(ps, glow, print);
      g = main;
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1 / (j + 1);
      g.drawImage(blurC, sx, sy, sw, sh, sx / R * dpr, sy / R * dpr, sw / R * dpr, sh / R * dpr); g.restore();
    });
  }

  // t: seconds since the tap (0 = closed); nudge: hover tease
  function drawBox(t = 0, nudge = 0) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    fill(BLUE);
    const b = boxGeom();
    if (!(b.bw > 2 && b.bh > 2)) return;   // no room yet (a 0 x 0 window): resize() draws it again
    fitBox(b);
    const glow = Math.max(0.28 * nudge, sstep(0.05, 0.35, t) * (1 - sstep(0.78, 1.15, t)));
    // the box falls away (gravity: slow, then fast) as the lid flies off: the box splits open around the pair
    const drop = iQuad((t - 0.36) / 0.7);
    DY = drop * (H - b.y0 + b.bh * 0.6 + 40);
    floorShadow(b, 1 - drop);
    spill(b, glow);
    if (drop < 1) drawBody(glow);
    motes(b, t, glow * (1 - drop));
    DY = 0; drawRising(t); DY = drop * (H - b.y0 + b.bh * 0.6 + 40);
    if (drop < 1) drawFront(glow);
    // the lid, with motion blur while it moves fast
    const pose = lidPose(t, nudge);
    if (t < 0.3 && glow > 0.01) {
      // light leaking out under the lid's edge onto the front of the box
      const a = P3(lidXf([-0.5 - BX.OV, LY0, LZ1], pose)), c = P3(lidXf([0.5 + BX.OV, LY0, LZ1], pose));
      const fy = Math.max(a[1], c[1]), lk = Math.min(1, glow * 1.6);
      const lg = g.createLinearGradient(0, fy - 2, 0, fy + 16);
      lg.addColorStop(0, `rgba(235,243,255,${0.55 * lk})`); lg.addColorStop(1, 'rgba(235,243,255,0)');
      g.fillStyle = lg; g.fillRect(b.x0, fy - 2, b.bw, 18);
    }
    if (t > 0.3 && t < 0.75) lidBlurred(t, glow);
    else if (t < 0.75) drawLid(pose, glow);
    DY = 0;
    canvas.classList.add('drawn');
    root.dataset.tone = 'w';
  }
  let gateState = null, gateNudge = 0;

  // ---------------------------------------------------------------- one cut
  function draw(c) {
    current = c;
    if (!(W > 2 && H > 2)) return;   // nothing to draw into yet; resize() redraws the current cut
    canvas.classList.add('drawn');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const [shot, neg, tone, arg] = c;
    const raw = SHOTS[shot](neg, arg);
    if (neg && raw !== true) invert();
    root.dataset.tone = tone;
    const cap = shot === 'field' && name ? name : C()[shot];   // the pair's own name, from the catalog
    if (hud.cap && hud.cap.textContent !== cap) hud.cap.textContent = cap;
  }
  function setPct(p) {
    pct = Math.max(pct, Math.min(100, Math.round(p)));
    if (hud.pct) hud.pct.textContent = pct >= 100 ? C().ready : `${C().loading} ${String(pct).padStart(3, '0')}`;
  }

  function build() {
    const base = short ? SHORT : SCRIPT;
    cuts = base.map(([s, n, t]) => ({ c: [s, n, t], d: CUT }));
    let t = 0; cuts.forEach(k => { k.t = t; t += k.d; });
    return t;
  }

  function tick(rafNow) {
    raf = requestAnimationFrame(tick);
    // with sound the audio clock leads; otherwise the clock starts on the first frame actually shown
    // (a background tab may not draw for a while)
    const now = clock ? clock() : rafNow;
    if (t0 === null) t0 = now;
    const el = now - t0;
    if (holding) {
      // still loading: hold the night wall (a still frame, nothing flashing) until the app says land
      if (!current || current[0] !== 'night') draw(['night', 0, 'w']);
      return;
    }
    let n = idx;
    while (n + 1 < cuts.length && el >= cuts[n + 1].t) n++;
    if (n !== idx) { idx = n; draw(cuts[n].c); }
    const end = cuts.length ? cuts[cuts.length - 1].t + cuts[cuts.length - 1].d : 0;
    if (el >= end && !done) finish();
  }

  const api = {
    root,
    // capture mode: lay out the script and draw any moment of it by hand
    prepare() { measure(); root.classList.add('on'); return build(); },
    timeline() { return cuts.map(k => ({ t: k.t, d: k.d, shot: k.c[0], neg: k.c[1] })); },
    seek(ms) { let n = 0; while (n + 1 < cuts.length && ms >= cuts[n + 1].t) n++; draw(cuts[n].c); },
    drawCut(c) { draw(c); },
    set(name, bmp, i) { if (name === 'pair') img.pairs[i] = bmp; else img[name] = bmp; if (name === 'anchor') cache.clear(); },
    progress: setPct,
    anchorRect() { return { x: A.x, y: A.y, w: A.w, h: A.h }; },
    // the box: resolves with { sound } when it's opened (tap, click, Enter or Space).
    // onOpen runs inside the click itself, so sound can start there.
    gate({ onOpen } = {}) {
      measure(); root.classList.add('on', 'gate');
      const q = root.querySelector('.r-gate');
      q.querySelector('.r-q').textContent = C().gateQ;
      q.querySelector('.r-open span').textContent = C().gateOpen;
      q.querySelector('.r-mute').textContent = C().gateMute;
      // the window can still be 0 x 0 when this runs (a page loaded in a hidden pane): resize() lays it out again
      const place = () => { const b = boxGeom(); if (b.bw > 2) q.style.top = `${Math.round(b.y1 + Math.max(26, b.bh * 0.32))}px`; };
      this._gatePlace = place;
      place();
      let target = 0, anim = 0;
      const frame = () => { gateNudge += (target - gateNudge) * 0.25; drawBox(0, gateNudge); anim = Math.abs(target - gateNudge) > 0.01 ? requestAnimationFrame(frame) : 0; };
      drawBox();
      const inBox = e => { const b = boxGeom(); return e.clientX > b.x0 - 20 && e.clientX < b.x0 + b.bw + 20 && e.clientY > b.y0 - b.topH - 20 && e.clientY < b.y1 + 20; };
      const move = e => { const t = inBox(e) || e.target.closest?.('.r-open') ? 1 : 0; if (t !== target) { target = t; canvas.style.cursor = t ? 'pointer' : ''; if (!anim) anim = requestAnimationFrame(frame); } };
      return new Promise(res => {
        const done = (withSound, e) => {
          if (e) { e.preventDefault(); e.stopPropagation(); }
          root.removeEventListener('pointermove', move); root.removeEventListener('click', onClick, true); removeEventListener('keydown', onKey, true);
          const ready = onOpen ? onOpen(withSound) : null;
          gateState = { withSound };
          res({ sound: withSound, ready });
        };
        const onClick = e => { if (e.target.closest('.r-mute')) return done(false, e); if (e.target.closest('.r-skip, [data-hud=sound]')) return; done(true, e); };
        const onKey = e => { if (e.key === 'Enter' || e.key === ' ') { if (document.activeElement?.closest?.('.r-mute')) return done(false, e); done(true, e); } };
        root.addEventListener('pointermove', move);
        root.addEventListener('click', onClick, true);
        addEventListener('keydown', onKey, true);
      });
    },
    // the lid comes off, light comes out of the box, the pair rises out of it (OPEN_MS); then the reel starts.
    // If the pair's image isn't in yet, the light holds until it is (up to 1.5 s).
    openBox() {
      root.classList.remove('gate'); root.classList.add('opening');
      let last = performance.now(), t = 0, waited = 0;
      return new Promise(res => {
        let over = false;
        const end = () => { if (over) return; over = true; root.classList.remove('opening'); res(); };
        const step = now => {
          if (over) return;
          const dt = Math.min(0.05, (now - last) / 1000); last = now;
          if (t >= 0.3 && !img.anchor && waited < 1.5) waited += dt; else t += dt;
          drawBox(Math.min(t, OPEN_MS / 1000));
          if (t * 1000 < OPEN_MS) requestAnimationFrame(step); else end();
        };
        requestAnimationFrame(step);
        // a background tab gets no frames: don't hang
        setTimeout(() => { if (!over && document.hidden) end(); }, OPEN_MS + 1600);
      });
    },
    openMs: OPEN_MS,
    drawGate(k) { measure(); drawBox(k * OPEN_MS / 1000); },
    // show the first frame now (a still) while the rest of the page warms up
    prime() { measure(); root.classList.add('on'); draw((short ? SHORT : SCRIPT)[0]); },
    // runs the script; resolves when it has played through (or was skipped)
    play() {
      if (!current) measure();
      root.classList.add('on');
      if (reduced) {
        // one still frame, no cuts
        draw(['field', 0, 'w']);
        return new Promise(r => setTimeout(r, 700));
      }
      build(); arm();
      t0 = null; idx = -1; done = false; skipped = false; holding = false;
      raf = requestAnimationFrame(tick);
      return endP;
    },
    // play it again from the top on another clock (the audio clock, when sound comes on)
    restart(startMs, clockFn) {
      if (!cuts.length) build();
      clock = clockFn || null;
      if (done) arm();
      done = false; holding = false; skipped = false; idx = -1; t0 = startMs;
      if (!raf) raf = requestAnimationFrame(tick);
    },
    // back on the screen's clock, without a jump (sound went off mid-reel and the audio clock will stop)
    unclock() { if (!clock) return; if (t0 !== null) t0 = performance.now() - (clock() - t0); clock = null; },
    ended() { return endP || Promise.resolve(); },
    get running() { return !done && !holding; },
    // keep the wall running until land() is called
    hold() { if (!holding) { holding = true; t0 = null; } },
    skip() {
      if (done || skipped) return;
      skipped = true; finish();
    },
    // the match cut: the reel goes, the real wall is already drawn underneath
    land({ fade = false, keep = false } = {}) {
      cancelAnimationFrame(raf); raf = 0;
      if (keep) return;
      if (fade) { root.classList.add('fade'); setTimeout(() => root.remove(), DISSOLVE_MS + 60); }
      else root.remove();
    },
    // capture mode: the dissolve, by hand (k: 0 = loader, 1 = wall)
    dissolve(k) { root.style.opacity = String(1 - k); if (k >= 1) root.remove(); },
    dissolveMs: DISSOLVE_MS,
    resize() { if (!root.isConnected) return; measure(); if (root.classList.contains('gate')) { drawBox(0, gateNudge); if (api._gatePlace) api._gatePlace(); } else if (current) draw(current); },
    get skipped() { return skipped; },
    copy: k => C()[k],
  };
  if (hud.loc) hud.loc.textContent = C().loc;
  if (hud.skip) { hud.skip.textContent = C().skip; hud.skip.addEventListener('click', () => api.skip()); }
  setPct(0);
  measure();
  return api;
}
