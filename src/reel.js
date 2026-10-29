// The loader: a fast-cut reel built around one pair.
// Every shot holds for four frames at 30 fps and comes back as its own negative, while the pair
// stays dead centre and the world around it cuts: their blue, the box, a halftone, the shelf LEDs,
// a technical drawing, the price, their feed, the slat wall, the colourways, a silhouette.
// It ends on their wall at night and match-cuts onto the real one: same pair, same spot.
//
// Flash safety (WCAG 2.3.1): the order keeps every region of the screen under three light/dark
// flashes a second; tools/flash_check.py verifies the filmed frames. Reduced motion gets a still.

const BLUE = '#a2c1f0', PAPER = '#ecebe7', INK = '#0e0f12';
const CUT = 400 / 3;      // 133 ms: four frames at 30 fps
const PAIR_M = 0.43 * 0.92; // a pair's width on the real wall, in metres (scene.js SHOE_W x content)

const COPY = {
  en: {
    loc: 'Tbilisi — Worldwide', loading: 'Loading', ready: 'Ready', skip: 'Skip',
    field: 'Nike Dunk Low', night: 'The wall', day: 'The wall', blueprint: 'Side view — EU 36–45', beam: 'Light it up',
    silhouette: 'A classic', held: 'From our feed', halftone: '144K on Instagram', price: 'In stock',
    swatch: 'Colourways', box: 'Ships worldwide',
  },
  ka: {
    loc: 'თბილისი — მთელ მსოფლიოში', loading: 'იტვირთება', ready: 'მზადაა', skip: 'გამოტოვება',
    field: 'Nike Dunk Low', night: 'კედელი', day: 'კედელი', blueprint: 'გვერდხედი — EU 36–45', beam: 'აანთე',
    silhouette: 'კლასიკა', held: 'ჩვენი გვერდიდან', halftone: '144 ათასი Instagram-ზე', price: 'მარაგშია',
    swatch: 'ფერები', box: 'ვაგზავნით მსოფლიოში',
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

export function createReel({ root, lang = 'ka', phone = false, reduced = false, short = false, anchorIndex, pairs }) {
  const canvas = root.querySelector('canvas');
  const g = canvas.getContext('2d', { alpha: false });
  const hud = Object.fromEntries([...root.querySelectorAll('[data-hud]')].map(el => [el.dataset.hud, el]));
  const img = { anchor: null, lines: null, held: null, box: null, pairs: [] };
  const cache = new Map();
  const C = () => COPY[lang] || COPY.en;
  let W = 1, H = 1, dpr = 1, A = null;
  let cuts = [], idx = -1, t0 = 0, raf = 0, holding = false, done = false, skipped = false;
  let onEnd = null, pct = 0, current = null;

  // ---------------------------------------------------------------- geometry: the pair's texture layer, centred on screen
  function measure() {
    W = innerWidth; H = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2);
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

  // ---------------------------------------------------------------- one cut
  function draw(c) {
    current = c;
    canvas.classList.add('drawn');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const [shot, neg, tone, arg] = c;
    const raw = SHOTS[shot](neg, arg);
    if (neg && raw !== true) invert();
    root.dataset.tone = tone;
    const cap = C()[shot];
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

  function tick(now) {
    raf = requestAnimationFrame(tick);
    // the clock starts on the first frame actually shown (a background tab may not draw for a while)
    if (!t0) t0 = now;
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
    if (el >= end && !done) {
      done = true;
      if (onEnd) onEnd();
    }
  }

  const api = {
    root,
    // capture mode: lay out the script and draw any moment of it by hand
    prepare() { measure(); root.classList.add('on'); return build(); },
    timeline() { return cuts.map(k => ({ t: k.t, d: k.d })); },
    seek(ms) { let n = 0; while (n + 1 < cuts.length && ms >= cuts[n + 1].t) n++; draw(cuts[n].c); },
    drawCut(c) { draw(c); },
    set(name, bmp, i) { if (name === 'pair') img.pairs[i] = bmp; else img[name] = bmp; if (name === 'anchor') cache.clear(); },
    progress: setPct,
    anchorRect() { return { x: A.x, y: A.y, w: A.w, h: A.h }; },
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
      build();
      return new Promise(res => {
        onEnd = res;
        t0 = 0; idx = -1;
        raf = requestAnimationFrame(tick);
      });
    },
    // keep the wall running until land() is called
    hold() { if (!holding) { holding = true; t0 = 0; } },
    skip() {
      if (done || skipped) return;
      skipped = true; done = true;
      if (onEnd) onEnd();
    },
    // the match cut: the reel goes, the real wall is already drawn underneath
    land({ fade = false } = {}) {
      cancelAnimationFrame(raf);
      if (fade) { root.classList.add('fade'); setTimeout(() => root.remove(), 450); }
      else root.remove();
    },
    resize() { if (!root.isConnected) return; measure(); if (current) draw(current); },
    get skipped() { return skipped; },
  };
  if (hud.loc) hud.loc.textContent = C().loc;
  if (hud.skip) { hud.skip.textContent = C().skip; hud.skip.addEventListener('click', () => api.skip()); }
  setPct(0);
  measure();
  return api;
}
