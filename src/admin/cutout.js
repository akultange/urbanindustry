// Photo in, wall layer out — in the browser, no server.
//
// A pair's picture on the wall is a cut-out in a 1024 x 640 layer (and a 512 x 320 copy), laid out the way
// tools/make_assets.py lays out the original ten: trimmed, fitted into 92% of the width and 93% of the height,
// centred, its sole 1.2% above the bottom edge. `rect` says where it sits (layer UV, v from the top).
//
// A photo that's already cut out (transparent PNG/WebP) is used as it is. Otherwise the background has to be
// plain (a studio shot, a pair on a sheet of paper or a wall): it's filled in from the photo's edges, by colour,
// the way a magic wand would, then the edge is softened and the background's colour is taken back out of it so
// there's no light fringe on the dark wall. A soft shadow under the pair goes with the background.
export const LAYER_W = 1024, LAYER_H = 640, BASE = 0.012;
const WORK = 1400;   // the long side the photo is worked on at

// ---------------------------------------------------------------- decode
export async function decode(file) {
  const url = URL.createObjectURL(file);
  try {
    const im = new Image();
    im.decoding = 'async';
    await new Promise((res, rej) => { im.onload = res; im.onerror = () => rej(new Error('decode')); im.src = url; });
    const s = Math.min(1, WORK / Math.max(im.naturalWidth, im.naturalHeight));
    const w = Math.max(1, Math.round(im.naturalWidth * s)), h = Math.max(1, Math.round(im.naturalHeight * s));
    const c = canvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
    g.imageSmoothingQuality = 'high';
    g.drawImage(im, 0, 0, w, h);   // <img> applies the photo's EXIF rotation (phone pictures)
    return { canvas: c, data: g.getImageData(0, 0, w, h), w, h };
  } finally { URL.revokeObjectURL(url); }
}
const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

// already transparent around the edges? then it's a cut-out
export function hasAlpha({ data, w, h }) {
  const d = data.data; let clear = 0, n = 0;
  const at = (x, y) => d[(y * w + x) * 4 + 3];
  for (let x = 0; x < w; x += 2) { n += 2; if (at(x, 0) < 250) clear++; if (at(x, h - 1) < 250) clear++; }
  for (let y = 0; y < h; y += 2) { n += 2; if (at(0, y) < 250) clear++; if (at(w - 1, y) < 250) clear++; }
  return clear / n > 0.5;
}

// ---------------------------------------------------------------- colour: OKLab, x100 (a just-visible step is ~1)
const LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
function oklab(d, n) {
  const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = LIN[d[i * 4]], g = LIN[d[i * 4 + 1]], b = LIN[d[i * 4 + 2]];
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    L[i] = (0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s) * 100;
    A[i] = (1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s) * 100;
    B[i] = (0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s) * 100;
  }
  return { L, A, B };
}
const median = arr => { const s = Float32Array.from(arr).sort(); return s.length ? s[s.length >> 1] : 0; };

// ---------------------------------------------------------------- the model
// U²-Net (the small one, Apache-2.0) finds the pair, run here with onnxruntime-web (MIT). Both are served from
// admin/vendor, about 16 MB, fetched the first time a photo needs it and cached by the browser after that.
let model = null;
export function loadModel(base, onProgress = () => {}) {
  if (model) return model;
  model = (async () => {
    const abs = u => new URL(u, location.href).href;
    // sizes as unpacked (Pages sends them gzipped, so content-length would undercount)
    const got = { wasm: 0, onnx: 0 }, size = { wasm: 11246032, onnx: 4574861 };
    const tell = () => onProgress(Math.min(1, (got.wasm + got.onnx) / (size.wasm + size.onnx)));
    const fetchBytes = async (url, k) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      const reader = r.body.getReader(), parts = [];
      for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); got[k] += value.length; tell(); }
      const out = new Uint8Array(got[k]); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
      return out;
    };
    const ort = await import(/* @vite-ignore */ abs(base + 'ort.wasm.min.js'));
    const [wasm, onnx] = await Promise.all([fetchBytes(abs(base + 'ort-wasm.wasm'), 'wasm'), fetchBytes(abs(base + 'u2netp.onnx'), 'onnx')]);
    ort.env.wasm.numThreads = 1;   // no cross-origin isolation on GitHub Pages, so no threads
    ort.env.wasm.wasmPaths = { mjs: abs(base + 'ort-wasm.js'), wasm: abs(base + 'ort-wasm.wasm') };
    ort.env.wasm.wasmBinary = wasm;
    const session = await ort.InferenceSession.create(onnx, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    return { ort, session };
  })();
  model.catch(() => { model = null; });
  return model;
}
// how sure the model is that each pixel is the pair (0..1), at the photo's working size
export async function findPair(src, base, onProgress) {
  const { ort, session } = await loadModel(base, onProgress);
  const S = 320, c = canvas(S, S), g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(toCanvas(src), 0, 0, S, S);
  const px = g.getImageData(0, 0, S, S).data;
  let mx = 1; for (let i = 0; i < S * S; i++) mx = Math.max(mx, px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225], inp = new Float32Array(3 * S * S);
  for (let i = 0; i < S * S; i++) for (let k = 0; k < 3; k++) inp[k * S * S + i] = (px[i * 4 + k] / mx - mean[k]) / std[k];
  const res = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', inp, [1, 3, S, S]) });
  const o = res[session.outputNames[0]].data;
  let mi = Infinity, ma = -Infinity; for (const v of o) { if (v < mi) mi = v; if (v > ma) ma = v; }
  // up to the working size, smoothly
  const m8 = new Uint8ClampedArray(S * S * 4);
  for (let i = 0; i < S * S; i++) { const v = (o[i] - mi) / Math.max(1e-6, ma - mi) * 255; m8[i * 4] = m8[i * 4 + 1] = m8[i * 4 + 2] = v; m8[i * 4 + 3] = 255; }
  const mc = canvas(S, S); mc.getContext('2d').putImageData(new ImageData(m8, S, S), 0, 0);
  const up = canvas(src.w, src.h), ug = up.getContext('2d', { willReadFrequently: true });
  ug.imageSmoothingQuality = 'high'; ug.drawImage(mc, 0, 0, src.w, src.h);
  const U = ug.getImageData(0, 0, src.w, src.h).data, prob = new Float32Array(src.w * src.h);
  for (let i = 0; i < prob.length; i++) prob[i] = U[i * 4] / 255;
  return prob;
}
const toCanvas = src => { const t = canvas(src.w, src.h); t.getContext('2d').putImageData(src.data, 0, 0); return t; };

// ---------------------------------------------------------------- the cut
// prob: the model's map (findPair). Without it, a plain background is filled in by colour alone, which can't
// tell white leather from a white backdrop. tolerance: 0.5 (keeps more) .. 2 (takes more away).
export function cut(src, { prob = null, tolerance = 1, shadow = true, flood = !prob, holes = true } = {}) {
  const { data, w, h } = src, n = w * h, d = data.data;
  const lab = oklab(d, n);
  // the background's colour: the median of a band round the edge, and how much it varies there
  const band = Math.max(2, Math.round(Math.min(w, h) * 0.02));
  const bi = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < band || y < band || x >= w - band || y >= h - band) bi.push(y * w + x);
  const bg = [median(bi.map(i => lab.L[i])), median(bi.map(i => lab.A[i])), median(bi.map(i => lab.B[i]))];
  const dist = new Float32Array(n);
  for (let i = 0; i < n; i++) dist[i] = Math.hypot(lab.L[i] - bg[0], lab.A[i] - bg[1], lab.B[i] - bg[2]);
  const spread = median(bi.map(i => dist[i]));
  const plain = spread < 6;
  const T = Math.min(28, Math.max(4.5, spread * 3 + 4)) * tolerance;

  let p = null;
  if (prob) {
    // the model's edge is 320 px across the photo, so soft: pull it onto the photo's own edges
    const Y = new Float32Array(n); for (let i = 0; i < n; i++) Y[i] = lab.L[i] / 100;
    p = guided(Y, prob, w, h, Math.max(2, Math.round(Math.max(w, h) / 280)), 2e-4);
  }
  // fill in from the edges: anything close to the background colour, plus gentle drifts away from it (a
  // vignette, a lighting falloff) as long as each step is small; never into what the model calls the pair
  const BG = 1, SHADOW = 2;
  const m = new Uint8Array(n);
  const free = p ? (j => p[j] < 0.5) : (() => true);
  const q = new Int32Array(n), nb = new Int32Array(4); let qh = 0, qt = 0;
  const step = (i, j) => Math.hypot(lab.L[i] - lab.L[j], lab.A[i] - lab.A[j], lab.B[i] - lab.B[j]);
  if (plain && flood) {
    for (const i of bi) if (dist[i] < T && !m[i] && free(i)) { m[i] = BG; q[qt++] = i; }
    while (qh < qt) {
      const i = q[qh++], x = i % w, y = (i / w) | 0;
      nb[0] = x > 0 ? i - 1 : -1; nb[1] = x < w - 1 ? i + 1 : -1; nb[2] = y > 0 ? i - w : -1; nb[3] = y < h - 1 ? i + w : -1;
      for (let k = 0; k < 4; k++) {
        const j = nb[k];
        if (j < 0 || m[j] || !free(j)) continue;
        if (dist[j] < T || (dist[j] < T * 1.7 && step(i, j) < T * 0.22)) { m[j] = BG; q[qt++] = j; }
      }
    }
  }
  // a soft shadow: darker than the background but the same colour, smooth, and under the pair
  if (plain && shadow) {
    if (p && !flood) for (let i = 0; i < n; i++) if (p[i] < 0.08) m[i] = BG;   // the model's sure background seeds it
    {
      let y0 = h, y1 = 0;
      for (let i = 0; i < n; i++) if (!m[i]) { const y = (i / w) | 0; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const yMin = y0 + (y1 - y0) * 0.55;
      const isShadow = j => {
        if ((j / w | 0) < yMin || !free(j)) return false;
        const dc = Math.hypot(lab.A[j] - bg[1], lab.B[j] - bg[2]), dl = bg[0] - lab.L[j];
        return dc < 2.6 * tolerance + 1 && dl > -2 && dl < 34;
      };
      qh = 0; qt = 0;
      for (let i = 0; i < n; i++) if (m[i] === BG) q[qt++] = i;
      while (qh < qt) {
        const i = q[qh++], x = i % w, y = (i / w) | 0;
        nb[0] = x > 0 ? i - 1 : -1; nb[1] = x < w - 1 ? i + 1 : -1; nb[2] = y > 0 ? i - w : -1; nb[3] = y < h - 1 ? i + w : -1;
        for (let k = 0; k < 4; k++) {
          const j = nb[k];
          if (j < 0 || m[j]) continue;
          if (isShadow(j) && step(i, j) < 2.2) { m[j] = SHADOW; q[qt++] = j; }
        }
      }
    }
    if (p && !flood) for (let i = 0; i < n; i++) if (m[i] === BG) m[i] = 0;   // only the shadow is taken, the model has the rest
  }

  // the pair: the model's call where there is one, else what the fill didn't reach; specks are dropped
  let a = new Float32Array(n);
  if (p) {
    // a little tighter than half-sure, so the edge doesn't carry the backdrop; tolerance shifts it
    const lo = 0.3 + 0.1 * (tolerance - 1), hi = lo + 0.34;
    for (let i = 0; i < n; i++) { const v = m[i] ? 0 : Math.min(1, Math.max(0, (p[i] - lo) / (hi - lo))); a[i] = v * v * (3 - 2 * v); }
  } else {
    for (let i = 0; i < n; i++) a[i] = m[i] ? 0 : 1;
    a = boxBlur(a, w, h, 1);
    for (let i = 0; i < n; i++) a[i] = Math.min(1, Math.max(0, (a[i] - 0.34) / 0.6));
  }
  const fg = new Uint8Array(n); for (let i = 0; i < n; i++) fg[i] = a[i] > 0.5 ? 1 : 0;
  keepLargest(fg, w, h, a);
  if (holes && p) {
    // anything the outline closes round is the pair (a white panel the model wasn't sure of); a lace loop's
    // little window fills in too, with the photo's backdrop in it, which reads fine
    const inside = fillHoles(fg, w, h);
    let f = new Float32Array(n); for (let i = 0; i < n; i++) f[i] = inside[i];
    f = boxBlur(f, w, h, 1);
    for (let i = 0; i < n; i++) if (inside[i] && !fg[i]) { a[i] = Math.max(a[i], Math.min(1, Math.max(0, (f[i] - 0.34) / 0.6))); fg[i] = 1; }
  }

  const out = new ImageData(w, h), o = out.data;
  const bgRGB = medianRGB(d, bi);
  for (let i = 0; i < n; i++) {
    const al = a[i];
    if (al <= 0.004) { o[i * 4 + 3] = 0; continue; }
    const k = i * 4;
    if (al < 0.996 && plain) {
      // take the background's colour back out of the edge: c = al * pair + (1 - al) * background
      for (let c = 0; c < 3; c++) o[k + c] = Math.max(0, Math.min(255, (d[k + c] - (1 - al) * bgRGB[c]) / al));
    } else { o[k] = d[k]; o[k + 1] = d[k + 1]; o[k + 2] = d[k + 2]; }
    o[k + 3] = Math.round(al * 255);
  }
  let kept = 0; for (let i = 0; i < n; i++) kept += fg[i];
  return { data: out, w, h, plain, coverage: kept / n };
}

// the guided filter (He et al.): p's edges follow the guide I's, in linear time
function guided(I, p, w, h, r, eps) {
  const n = w * h, II = new Float32Array(n), Ip = new Float32Array(n);
  for (let i = 0; i < n; i++) { II[i] = I[i] * I[i]; Ip[i] = I[i] * p[i]; }
  const mI = boxBlur(I, w, h, r), mp = boxBlur(p, w, h, r), mII = boxBlur(II, w, h, r), mIp = boxBlur(Ip, w, h, r);
  const A = new Float32Array(n), B = new Float32Array(n);
  for (let i = 0; i < n; i++) { const v = mII[i] - mI[i] * mI[i], c = mIp[i] - mI[i] * mp[i]; A[i] = c / (v + eps); B[i] = mp[i] - A[i] * mI[i]; }
  const mA = boxBlur(A, w, h, r), mB = boxBlur(B, w, h, r), q = new Float32Array(n);
  for (let i = 0; i < n; i++) q[i] = Math.min(1, Math.max(0, mA[i] * I[i] + mB[i]));
  return q;
}

function medianRGB(d, idx) {
  const ch = c => median(idx.map(i => d[i * 4 + c]));
  return [ch(0), ch(1), ch(2)];
}
// keep the biggest piece and anything at least a fifth its size (both shoes of a pair photographed together)
function keepLargest(fg, w, h, alpha = null) {
  const n = w * h, lab = new Int32Array(n), sizes = [0];
  const q = new Int32Array(n);
  for (let s = 0; s < n; s++) {
    if (!fg[s] || lab[s]) continue;
    const id = sizes.length; let qh = 0, qt = 0, cnt = 0;
    q[qt++] = s; lab[s] = id;
    while (qh < qt) {
      const i = q[qh++], x = i % w, y = (i / w) | 0; cnt++;
      if (x > 0 && fg[i - 1] && !lab[i - 1]) { lab[i - 1] = id; q[qt++] = i - 1; }
      if (x < w - 1 && fg[i + 1] && !lab[i + 1]) { lab[i + 1] = id; q[qt++] = i + 1; }
      if (y > 0 && fg[i - w] && !lab[i - w]) { lab[i - w] = id; q[qt++] = i - w; }
      if (y < h - 1 && fg[i + w] && !lab[i + w]) { lab[i + w] = id; q[qt++] = i + w; }
    }
    sizes.push(cnt);
  }
  const big = Math.max(0, ...sizes);
  for (let i = 0; i < n; i++) if (fg[i] && sizes[lab[i]] < big * 0.2) { fg[i] = 0; if (alpha) alpha[i] = 0; }
  // soft edge pixels next to no kept piece go too (specks' halos)
  if (alpha) for (let i = 0; i < n; i++) if (!fg[i] && alpha[i] > 0) {
    const x = i % w, y = (i / w) | 0; let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h && fg[yy * w + xx]) { near = true; break; }
    }
    if (!near) alpha[i] = 0;
  }
}
// the mask with every enclosed gap filled: background is only what connects to the photo's edge
function fillHoles(fg, w, h) {
  const n = w * h, out = new Uint8Array(n).fill(1), q = new Int32Array(n); let qh = 0, qt = 0;
  const push = i => { if (!fg[i] && out[i]) { out[i] = 0; q[qt++] = i; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (qh < qt) {
    const i = q[qh++], x = i % w, y = (i / w) | 0;
    if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w);
  }
  return out;
}
function boxBlur(src, w, h, r) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length), k = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / k;
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / k;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

// ---------------------------------------------------------------- the layer
// rgba (cut-out ImageData) -> the 1024 x 640 layer and its 512 copy, flipped / turned as asked
export function layer(cutout, { flip = false, rotate = 0 } = {}) {
  // turn and mirror on a canvas big enough for the turned picture
  const src = canvas(cutout.w, cutout.h); src.getContext('2d').putImageData(cutout.data, 0, 0);
  const rad = rotate * Math.PI / 180, cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
  const tw = Math.ceil(cutout.w * cos + cutout.h * sin) + 2, th = Math.ceil(cutout.w * sin + cutout.h * cos) + 2;
  const turned = canvas(tw, th), tg = turned.getContext('2d', { willReadFrequently: true });
  tg.imageSmoothingQuality = 'high';
  tg.translate(tw / 2, th / 2); tg.rotate(rad); if (flip) tg.scale(-1, 1);
  tg.drawImage(src, -cutout.w / 2, -cutout.h / 2);
  // trim to the pair
  const td = tg.getImageData(0, 0, tw, th).data;
  let x0 = tw, y0 = th, x1 = -1, y1 = -1;
  for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) if (td[(y * tw + x) * 4 + 3] > 5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw new Error('empty');
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  // fit, centre, sit it on the shelf line
  const s = Math.min((LAYER_W * 0.92) / cw, (LAYER_H * 0.93) / ch);
  const nw = Math.round(cw * s), nh = Math.round(ch * s);
  const lx = Math.round((LAYER_W - nw) / 2), ly = LAYER_H - nh - Math.round(LAYER_H * BASE);
  const hi = canvas(LAYER_W, LAYER_H), hg = hi.getContext('2d');
  hg.imageSmoothingQuality = 'high';
  hg.drawImage(turned, x0, y0, cw, ch, lx, ly, nw, nh);
  const lo = canvas(LAYER_W / 2, LAYER_H / 2), lg = lo.getContext('2d');
  lg.imageSmoothingQuality = 'high';
  lg.drawImage(hi, 0, 0, LAYER_W / 2, LAYER_H / 2);
  const r4 = v => Math.round(v * 1e4) / 1e4;
  return { hi, lo, rect: [r4(lx / LAYER_W), r4(ly / LAYER_H), r4((lx + nw) / LAYER_W), r4((ly + nh) / LAYER_H)], base: BASE };
}

// WebP where the browser can write it (Chrome, Firefox, Edge), PNG elsewhere (Safari)
export async function encode(c, quality = 0.9) {
  const blob = await new Promise(res => c.toBlob(res, 'image/webp', quality));
  if (blob && blob.type === 'image/webp') return { blob, ext: 'webp' };
  const png = await new Promise(res => c.toBlob(res, 'image/png'));
  return { blob: png, ext: 'png' };
}

// a feed photo: 720 x 960 at most, and a 180 x 240 thumbnail
export async function feedPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const im = new Image();
    await new Promise((res, rej) => { im.onload = res; im.onerror = () => rej(new Error('decode')); im.src = url; });
    const fit = (mw, mh) => {
      const s = Math.min(1, mw / im.naturalWidth, mh / im.naturalHeight);
      const c = canvas(Math.round(im.naturalWidth * s), Math.round(im.naturalHeight * s)), g = c.getContext('2d');
      g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, c.width, c.height); return c;
    };
    const big = fit(720, 960), small = fit(180, 240);
    const a = await encode(big, 0.82), b = await encode(small, 0.74);
    // a photo has no transparency: where WebP can't be written, JPEG beats PNG by far
    if (a.ext !== 'webp') {
      const jpg = c => new Promise(res => c.toBlob(res, 'image/jpeg', 0.84));
      return { full: await jpg(big), thumb: await jpg(small), ext: 'jpg', w: big.width, h: big.height };
    }
    return { full: a.blob, thumb: b.blob, ext: 'webp', w: big.width, h: big.height };
  } finally { URL.revokeObjectURL(url); }
}
