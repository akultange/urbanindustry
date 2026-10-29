// The lit wall: their slatted wall with the halo-lit sign, glass shelves with LED edges,
// ten pairs, a faint light that follows the cursor, and a camera that moves to the shelf you pick.
import * as S from './shaders.js';
import { startProgram, finishProgram, vao, target, msaaTarget, deleteTarget, m4, ease, bezier } from './gl.js';
import LOGO from './logo.json';

const NS = S.NS;
const SHELF_HW = 0.24, SHELF_D = 0.15, GLASS_T = 0.010;
const SHOE_W = 0.43, SHOE_ASPECT = 1.6; // quad = one texture layer (1024x640)
const SHOE_Z = 0.072;
const LAYER_W = 1024, LAYER_H = 640;
const WALK_PITCH = 0.48;
const FOV_WALL = 26 * Math.PI / 180, FOV_WALK = 34 * Math.PI / 180;
// sign texture: letters fill 80% of the width, the rest is room for the halo
const SIGN_TW = 2048, SIGN_TH = 1024, SIGN_FILL = 0.72;
const LED_IDLE = 0.05;
export const SIGN_ON = 2.35;  // seconds into the pull-back when the sign starts to flicker on

export function createScene(canvas, { catalog, tier = 'high', onFrame, reducedMotion = false, manual = false, film = false } = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  if (!gl) return null;
  const hasFloat = !!gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  const HDR = hasFloat ? { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT } : { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
  const maxSamples = gl.getParameter(gl.MAX_SAMPLES) || 0;

  // no GPU (SwiftShader, llvmpipe…): render a lighter scene so the page stays responsive.
  // Filming (tools/reel_video.js steps frames by hand) keeps full quality: time per frame doesn't matter there.
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(renderer);
  if (software && !film) tier = 'low';

  // ---------------------------------------------------------------- programs (compiled off the main thread where possible)
  const par = gl.getExtension('KHR_parallel_shader_compile');
  const pend = {
    wall: startProgram(gl, S.WALL_VS, S.WALL_FS, 'wall'),
    rail: startProgram(gl, S.BOX_VS, S.RAIL_FS, 'rail'),
    glass: startProgram(gl, S.BOX_VS, S.GLASS_FS, 'glass'),
    contact: startProgram(gl, S.CONTACT_VS, S.CONTACT_FS, 'contact'),
    shoe: startProgram(gl, S.SHOE_VS, S.SHOE_FS, 'shoe'),
    sign: startProgram(gl, S.SIGN_VS, S.SIGN_FS, 'sign'),
    pre: startProgram(gl, S.FS_VS, S.PREFILTER_FS, 'prefilter'),
    down: startProgram(gl, S.FS_VS, S.DOWN_FS, 'down'),
    up: startProgram(gl, S.FS_VS, S.UP_FS, 'up'),
    comp: startProgram(gl, S.FS_VS, S.COMPOSITE_FS, 'composite'),
  };
  let P = null, V = null;
  let boxVao = null, railCount = 0, glassCount = 0;
  const quad = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
  const fsq = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const ctr = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const wallGeo = new Float32Array([-9, -3, 0, 9, -3, 0, -9, 6, 0, 9, 6, 0]);
  const ready = new Promise((resolve, reject) => {
    const check = () => {
      if (par && !Object.values(pend).every(x => gl.getProgramParameter(x.p, par.COMPLETION_STATUS_KHR))) { setTimeout(check, 24); return; }
      try { P = Object.fromEntries(Object.entries(pend).map(([k, x]) => [k, finishProgram(gl, x)])); }
      catch (e) { console.error(e); reject(e); return; }
      V = {
        wall: vao(gl, P.wall, [['aPos', wallGeo, 3]]),
        shoe: vao(gl, P.shoe, [['aCorner', quad, 2]]),
        sign: vao(gl, P.sign, [['aCorner', quad, 2]]),
        contact: vao(gl, P.contact, [['aCorner', ctr, 2]]),
        fs: vao(gl, P.comp, [['aCorner', fsq, 2]]),
      };
      buildBoxes();
      resolve();
    };
    setTimeout(check, 0);
  });

  // ---------------------------------------------------------------- pair textures: a low-res and a sharp array, one layer per shelf
  const LO_W = LAYER_W >> 1, LO_H = LAYER_H >> 1;
  const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
  const mkArray = (w, h) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, Math.floor(Math.log2(w)) + 1, gl.RGBA8, w, h, NS); // zero-initialised = transparent
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (aniso) gl.texParameterf(gl.TEXTURE_2D_ARRAY, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
    return t;
  };
  const texLo = mkArray(LO_W, LO_H), texHi = mkArray(LAYER_W, LAYER_H);
  const hiReady = new Float32Array(NS);
  let dirtyLo = false, dirtyHi = false, lastHiMip = 0;
  const scratch = document.createElement('canvas');
  // src: ImageBitmap (already premultiplied) or an <img>; scaled through a canvas if it isn't the layer's size
  function setShoeImage(i, src, hi) {
    const w = hi ? LAYER_W : LO_W, h = hi ? LAYER_H : LO_H;
    let img = src;
    if (src.width !== w || src.height !== h) {
      scratch.width = w; scratch.height = h;
      const c = scratch.getContext('2d'); c.clearRect(0, 0, w, h); c.drawImage(src, 0, 0, w, h); img = scratch;
    }
    const isBitmap = typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, hi ? texHi : texLo);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, !isBitmap);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, w, h, 1, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (hi) { dirtyHi = true; state.hiPending[i] = 1; } else { dirtyLo = true; state.loaded[i] = 1; }
    if (!state.held) wake();
  }

  // ---------------------------------------------------------------- the sign, drawn from their wordmark
  let signTex = null, haloTex = null;
  function buildSign() {
    const HW = SIGN_TW / 4, HH = SIGN_TH / 4;
    const c = document.createElement('canvas'); c.width = SIGN_TW; c.height = SIGN_TH;
    const g = c.getContext('2d');
    const s = SIGN_TW * SIGN_FILL / LOGO.w;
    g.fillStyle = '#000'; g.fillRect(0, 0, SIGN_TW, SIGN_TH);
    g.save(); g.translate((SIGN_TW - LOGO.w * s) / 2, (SIGN_TH - LOGO.h * s) / 2); g.scale(s, s);
    g.fillStyle = '#fff'; g.fill(new Path2D(LOGO.d), 'evenodd'); g.restore();
    const tex = (src, mips) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      if (src instanceof Uint8Array) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, HW, HH, 0, gl.RED, gl.UNSIGNED_BYTE, src);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, src);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
      if (mips) gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (mips && aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      return t;
    };
    signTex = tex(c, true); // the canvas goes straight to the GPU, red channel only
    // halo: the letters at quarter size, blurred tight + wide (the canvas does it on the GPU where it can)
    const h = document.createElement('canvas'); h.width = HW; h.height = HH;
    const q = h.getContext('2d');
    if (canvasBlurs()) {
      q.filter = 'none'; q.fillStyle = '#000'; q.fillRect(0, 0, HW, HH);
      q.globalCompositeOperation = 'lighter';
      // thin strokes lose most of their peak when blurred, so the weights are scaled up to match
      q.filter = 'blur(4.5px)'; q.globalAlpha = 1; q.drawImage(c, 0, 0, HW, HH);
      q.filter = 'blur(16px)'; q.globalAlpha = 0.75; q.drawImage(c, 0, 0, HW, HH); q.drawImage(c, 0, 0, HW, HH);
      haloTex = tex(h, false);
    } else {
      // no canvas filters (Safari, iPhones): the same blur in script, once
      q.drawImage(c, 0, 0, HW, HH);
      const px = q.getImageData(0, 0, HW, HH).data, small = new Float32Array(HW * HH);
      for (let i = 0; i < small.length; i++) small[i] = px[i * 4] / 255;
      const tight = blur(small, HW, HH, 4), wide = blur(small, HW, HH, 16);
      const out = new Uint8Array(HW * HH);
      for (let i = 0; i < out.length; i++) out[i] = Math.min(255, Math.round((tight[i] + wide[i] * 1.5) * 255));
      haloTex = tex(out, false);
    }
  }
  // Can a 2D canvas blur? Safari ships ctx.filter switched off, and setting it there only stores the string
  // (it reads back fine) while drawing stays sharp, so the sign lost its glow on iPhones. Blur a dot and look.
  function canvasBlurs() {
    if (!('filter' in CanvasRenderingContext2D.prototype)) return false;
    const t = document.createElement('canvas'); t.width = t.height = 16;
    const x = t.getContext('2d', { willReadFrequently: true });
    x.filter = 'blur(2px)'; x.fillStyle = '#fff'; x.fillRect(7, 7, 2, 2);
    return x.getImageData(4, 8, 1, 1).data[0] > 0;
  }
  // three box passes each way ~ a gaussian
  function blur(src, w, h, r) {
    let a = Float32Array.from(src), b = new Float32Array(src.length);
    const pass = (from, to, horiz) => {
      const n = horiz ? w : h, m = horiz ? h : w, inv = 1 / (2 * r + 1);
      for (let q = 0; q < m; q++) {
        let acc = 0;
        const at = p => (horiz ? from[q * w + Math.min(n - 1, Math.max(0, p))] : from[Math.min(n - 1, Math.max(0, p)) * w + q]);
        for (let p = -r; p <= r; p++) acc += at(p);
        for (let p = 0; p < n; p++) {
          if (horiz) to[q * w + p] = acc * inv; else to[p * w + q] = acc * inv;
          acc += at(p + r + 1) - at(p - r);
        }
      }
    };
    for (let k = 0; k < 3; k++) { pass(a, b, true); pass(b, a, false); }
    return a;
  }
  buildSign();

  // ---------------------------------------------------------------- state
  const items = catalog.pairs.slice(0, NS);
  const count = items.length;
  const state = {
    mode: 'wall',          // 'wall' (desktop grid) | 'walk' (phone row)
    hover: -1, focus: -1, start: 0,
    hv: new Float32Array(NS), led: new Float32Array(NS), lift: new Float32Array(NS), liftV: new Float32Array(NS), dim: new Float32Array(NS),
    loaded: new Uint8Array(NS), hiPending: new Uint8Array(NS), sweep: new Float32Array(NS),
    power: 1, signK: 0, introT: -1, held: true,
    cursor: { x: 0, y: 1.3, tx: 0, ty: 1.3, i: 0, active: false, lastMove: 0 },
    par: { x: 0, y: 0, tx: 0, ty: 0 },
    cam: null, camFrom: null, camTo: null, camT: 1, camDur: 1, camEase: 'smoother', camArc: 0,
    walk: { x: 0, v: 0, drag: false, target: 0 },
    shelves: [], sign: [0, 0, 1, 0.3], letters: [0, 0, 1, 0.1],
    dpr: 1, w: 1, h: 1, aspect: 1, time: 0, idleUntil: 0, running: false,
  };

  // ---------------------------------------------------------------- layout
  // a phone held upright gets the same wall, in two columns
  const isPortrait = () => { const r = canvas.getBoundingClientRect(); return r.width > 0 && r.width / Math.max(1, r.height) < 0.8; };
  function layout(mode) {
    state.mode = mode;
    const sh = [];
    const portrait = state.portrait = mode === 'wall' && isPortrait();
    if (mode === 'wall') {
      const cols = portrait ? 2 : 5, rows = Math.ceil(count / cols);
      const pitchX = portrait ? 0.52 : 0.58, pitchY = portrait ? 0.41 : 0.64, y0 = 1.02;
      for (let i = 0; i < count; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        sh.push({ x: (c - (cols - 1) / 2) * pitchX, y: y0 + (rows - 1 - r) * pitchY });
      }
    } else {
      for (let i = 0; i < count; i++) sh.push({ x: i * WALK_PITCH, y: 1.24 });
    }
    state.shelves = sh;
    // the sign: centred over the middle of the wall (desktop) or over the first shelf you see (phone)
    const topY = Math.max(...sh.map(s => s.y));
    const lw = mode === 'wall' ? (portrait ? 0.74 : 0.9) : 0.46;
    const lh = lw * LOGO.h / LOGO.w;
    const cx = mode === 'wall' ? 0 : sh[state.start].x;
    const ly = topY + (portrait ? 0.34 : 0.36);
    const tw = lw / SIGN_FILL, th = tw * SIGN_TH / SIGN_TW;
    state.letters = [cx - lw / 2, ly, lw, lh];
    state.sign = [cx - tw / 2, ly + lh / 2 - th / 2, tw, th];
    state.wash = mode === 'wall' ? (portrait ? [0, 0.75, 0.55, 3.3] : [0, 1.75, 0.55, 2.35]) : [cx, 3.2, 0.7, 2.1];
    // the LED run after the loader: left to right with the top row a beat ahead (wide), row by row down (upright)
    const minY = Math.min(...sh.map(q => q.y));
    state.sweepOrder = portrait
      ? sh.map((s, i) => [-s.y * 10 + s.x, i]).sort((p, q) => p[0] - q[0]).map(p => p[1])
      : sh.map((s, i) => [s.x + (s.y > minY + 0.01 ? 0 : 0.31), i]).sort((p, q) => p[0] - q[0]).map(p => p[1]);
    buildBoxes();
    state.cam = state.cam || cameraFor('overview');
  }

  function buildBoxes() {
    if (!P) return;
    const pos = [], nor = [], meta = [];
    const box = (x0, y0, z0, x1, y1, z1, id, part) => {
      const f = (n, a, b, c, d) => {
        for (const p of [a, b, c, a, c, d]) { pos.push(...p); nor.push(...n); meta.push(id, part); }
      };
      f([0, 0, 1], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
      f([0, 1, 0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]);
      f([0, -1, 0], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]);
      f([-1, 0, 0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]);
      f([1, 0, 0], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]);
    };
    state.shelves.forEach((s, i) => box(s.x - SHELF_HW - 0.004, s.y - 0.028, 0, s.x + SHELF_HW + 0.004, s.y + 0.004, 0.022, i, 0));
    railCount = pos.length / 3;
    state.shelves.forEach((s, i) => box(s.x - SHELF_HW, s.y - GLASS_T, 0.004, s.x + SHELF_HW, s.y, SHELF_D, i, 1));
    glassCount = pos.length / 3 - railCount;
    if (boxVao) gl.deleteVertexArray(boxVao);
    boxVao = vao(gl, P.rail, [['aPos', new Float32Array(pos), 3], ['aNor', new Float32Array(nor), 3], ['aMeta', new Float32Array(meta), 2]]);
  }

  // per-shelf uniform blocks
  const U = { shelf: new Float32Array(NS * 4), led: new Float32Array(NS * 4), shoe: new Float32Array(NS * 4), foot: new Float32Array(NS * 4) };
  function shoeQuad(i) {
    const s = state.shelves[i], it = items[i];
    const w = SHOE_W * (it.scale || 1), h = w / SHOE_ASPECT;
    const r = it.rect || [0.05, 0.02, 0.95, 0.99];
    const cx = (r[0] + r[2]) / 2; // centre the shoe itself (not the layer) on the shelf
    return [s.x - w * cx, s.y - h * (it.base || 0.012) + 0.0006, w, h];
  }
  function fillUniforms() {
    for (let i = 0; i < NS; i++) {
      const s = state.shelves[i];
      if (!s) { U.shelf.set([99, -9, 0, 0], i * 4); U.shoe.set([99, -9, 0.01, 0.01], i * 4); U.led.set([0, 0, 0, 0], i * 4); continue; }
      const it = items[i];
      U.shelf.set([s.x, s.y, SHELF_HW, SHELF_D], i * 4);
      // a slow float while it's up (desktop only, so an idle phone can stop rendering)
      const bob = state.mode === 'wall' && !reducedMotion ? Math.max(0, state.lift[i] / 0.019) * 0.0022 * Math.sin(state.time * 2.3 + i * 1.7) : 0;
      U.led.set([state.led[i], state.hv[i], state.dim[i], Math.max(0, state.lift[i] + bob)], i * 4);
      U.shoe.set(shoeQuad(i), i * 4);
      U.foot.set([it.rect ? it.rect[0] : 0.05, it.rect ? it.rect[2] : 0.95, 0, 0], i * 4);
    }
  }

  // ---------------------------------------------------------------- camera
  function cameraFor(kind, i) {
    const a = state.aspect;
    if (state.mode === 'wall') {
      if (kind === 'overview' || i < 0) {
        const xs = state.shelves.map(s => s.x), ys = state.shelves.map(s => s.y);
        const minX = Math.min(...xs) - SHELF_HW - 0.08, maxX = Math.max(...xs) + SHELF_HW + 0.08;
        const L = state.letters;
        const minY = Math.min(...ys) - 0.1, maxY = L[1] + L[3] + 0.05;
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        const halfW = (maxX - minX) / 2, halfH = (maxY - minY) / 2;
        // fit the wall into the band between the header and the footer
        const fov = FOV_WALL, t = Math.tan(fov / 2);
        const H = state.h || 1, mt = state.marginTop || H * 0.12, mb = state.marginBottom || H * 0.1;
        const fh = Math.max(0.35, (H - mt - mb) / H);
        const yc = 1 - 2 * ((mt + (H - mt - mb) / 2) / H);
        const d = Math.max(halfH / (t * fh), halfW / (t * a * 0.93));
        return { pos: [cx, cy, d], at: [cx, cy, 0], fov, sx: 0, sy: -yc };
      }
      const s = state.shelves[i];
      const fov = 24 * Math.PI / 180, t = Math.tan(fov / 2);
      if (state.portrait) {
        // a phone: the pair in the space between the header and the bottom sheet (focusBand, css px)
        const H = state.h || 1, [b0, b1] = state.focusBand || [H * 0.08, H * 0.42];
        const f = Math.max(0.12, (b1 - b0) / H), yc = 1 - 2 * ((b0 + b1) / 2) / H;
        const d = Math.max(0.62 / (2 * t * a), 0.34 / (1.7 * f * t)), cy = s.y + 0.1;
        return { pos: [s.x, cy, d], at: [s.x, cy, 0], fov, sx: 0, sy: -yc };
      }
      // the pair fills ~46% of the width, a little left of centre so the panel sits over wall
      const wide = a > 1.15;
      const d = wide ? Math.min(1.6, Math.max(0.7, 0.80 / (2 * t * a))) : 0.95;
      const cy = s.y + 0.09;
      return { pos: [s.x, cy, d], at: [s.x, cy, 0], fov, sx: wide ? 0.12 : 0, sy: wide ? 0.06 : 0.12 };
    }
    // walk (phone): one shelf centred, neighbours peeking in
    const x = i >= 0 ? state.shelves[i].x : state.walk.x;
    const t = Math.tan(FOV_WALK / 2);
    const d = 0.66 / 2 / (t * a);
    const y = 1.24 + 0.1;
    const k = state.sheetK || 0;
    return { pos: [x, y - k * 0.02, d * (1 + k * 0.06)], at: [x, y - k * 0.02, 0], fov: FOV_WALK, sx: 0, sy: 0.02 - k * 0.4 };
  }
  // a straight-on close-up that puts pair i's texture layer exactly on a given screen rect (css px)
  function shotFor(i, rect) {
    const q = shoeQuad(i);
    const fov = state.mode === 'wall' ? FOV_WALL : FOV_WALK;
    const F = (state.h / 2) / Math.tan(fov / 2);
    const dz = q[2] * F / rect.w;
    const qx = q[0] + q[2] / 2, qy = q[1] + q[3] / 2;
    const cx = qx - (rect.x + rect.w / 2 - state.w / 2) * dz / F;
    const cy = qy + (rect.y + rect.h / 2 - state.h / 2) * dz / F;
    return { pos: [cx, cy, SHOE_Z + dz], at: [cx, cy, 0], fov, sx: 0, sy: 0 };
  }
  const EASE = {
    smoother: ease.smoother,
    // eases off the mark, then a long glide in: the pull-back after the loader
    glide: bezier(0.42, 0, 0.18, 1),
  };
  function flyTo(cam, dur = 1.0, curve = 'smoother', arc = 0.08) {
    state.camFrom = { ...state.cam, pos: [...state.cam.pos], at: [...state.cam.at] };
    state.camTo = cam; state.camT = 0; state.camDur = reducedMotion ? 0.001 : dur; state.camEase = curve; state.camArc = arc;
    wake(dur * 1000 + 100);
  }
  function camLerp(dt) {
    if (state.camT < 1 && state.camTo) {
      state.camT = Math.min(1, state.camT + dt / state.camDur);
      const k = EASE[state.camEase](state.camT);
      const A = state.camFrom, B = state.camTo, L = (a, b) => a + (b - a) * k;
      // a slight pull-back mid-flight so the wall reads as a space
      const arc = Math.sin(Math.PI * k) * state.camArc * (Math.abs(B.pos[2] - A.pos[2]) * 0.5 + Math.hypot(B.pos[0] - A.pos[0], B.pos[1] - A.pos[1]));
      // the pull-back from a close-up: distance changes geometrically, so the zoom runs at an even rate
      // (linear distance zooms out in a burst at the start, then crawls)
      const z = state.camEase === 'glide' && A.pos[2] > 0 && B.pos[2] > 0 ? A.pos[2] * Math.pow(B.pos[2] / A.pos[2], k) : L(A.pos[2], B.pos[2]);
      state.cam = {
        pos: [L(A.pos[0], B.pos[0]), L(A.pos[1], B.pos[1]), z + arc],
        at: [L(A.at[0], B.at[0]), L(A.at[1], B.at[1]), L(A.at[2], B.at[2])],
        fov: L(A.fov, B.fov), sx: L(A.sx, B.sx), sy: L(A.sy, B.sy),
      };
    }
  }

  let VP = null, camEye = [0, 0, 1];
  function matrices() {
    const c = state.cam;
    const px = state.par.x, py = state.par.y;
    const eye = [c.pos[0] + px, c.pos[1] + py, c.pos[2]];
    const at = [c.at[0] + px * 0.35, c.at[1] + py * 0.35, c.at[2]];
    camEye = eye;
    VP = m4.mul(m4.perspective(c.fov, state.aspect, 0.05, 40, c.sx, c.sy), m4.lookAt(eye, at));
    return VP;
  }
  // screen pixel -> world point on plane z = zPlane
  function unproject(px, py, zPlane) {
    const c = state.cam;
    const nx = (px / state.w) * 2 - 1, ny = 1 - (py / state.h) * 2;
    const t = Math.tan(c.fov / 2);
    const eye = camEye;
    const at = [c.at[0] + state.par.x * 0.35, c.at[1] + state.par.y * 0.35, c.at[2]];
    let fz = [at[0] - eye[0], at[1] - eye[1], at[2] - eye[2]]; let l = Math.hypot(...fz); fz = fz.map(v => v / l);
    let rx = [-fz[2], 0, fz[0]]; l = Math.hypot(...rx); rx = rx.map(v => v / l);
    const up = [rx[1] * fz[2] - rx[2] * fz[1], rx[2] * fz[0] - rx[0] * fz[2], rx[0] * fz[1] - rx[1] * fz[0]];
    const dx = (nx - c.sx) * t * state.aspect, dy = (ny - c.sy) * t;
    const d = [fz[0] + rx[0] * dx + up[0] * dy, fz[1] + rx[1] * dx + up[1] * dy, fz[2] + rx[2] * dx + up[2] * dy];
    const k = (zPlane - eye[2]) / d[2];
    return [eye[0] + d[0] * k, eye[1] + d[1] * k, zPlane];
  }
  function toScreen(x, y, z) {
    const p = m4.project(VP, x, y, z);
    return [(p[0] * 0.5 + 0.5) * state.w, (0.5 - p[1] * 0.5) * state.h, p[2]];
  }

  // ---------------------------------------------------------------- targets
  let T = {};
  function makeTargets() {
    for (const k in T) { if (Array.isArray(T[k])) T[k].forEach(t => deleteTarget(gl, t)); else deleteTarget(gl, T[k]); }
    T = {};
    const W = canvas.width, H = canvas.height;
    const samples = tier === 'high' ? Math.min(4, maxSamples) : tier === 'mid' ? Math.min(2, maxSamples) : 0;
    T.ms = msaaTarget(gl, W, H, HDR, samples);
    if (!T.ms.ok) T.ms = msaaTarget(gl, W, H, { internal: gl.RGBA8 }, samples);
    T.scene = target(gl, W, H, HDR);
    const levels = tier === 'low' ? 3 : 5;
    T.bloom = [];
    let bw = W >> 1, bh = H >> 1;
    for (let i = 0; i < levels; i++) { T.bloom.push(target(gl, Math.max(1, bw), Math.max(1, bh), HDR)); bw >>= 1; bh >>= 1; }
    // depth of field for the hand-off: the scene at 1/2, 1/4, 1/8 (only drawn while it's in use)
    T.soft = [2, 4, 8].map(k => target(gl, Math.max(1, Math.round(W / k)), Math.max(1, Math.round(H / k)), HDR));
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    // a film renders every pixel it's filmed at (4K, a 3x phone); a visitor's screen is capped to keep it smooth
    // phones ('mid') draw at the screen's own resolution (3x on an iPhone): at 1.6x the pairs came out soft.
    // A phone that can't keep up drops the resolution itself (see frame()).
    const cap = film ? 4 : tier === 'high' ? 2 : tier === 'mid' ? 3 : 0.7;
    let dpr = Math.min(window.devicePixelRatio || 1, cap) * (state.scale || 1);
    const maxPx = film ? 1.6e7 : tier === 'high' ? 4.2e6 : tier === 'mid' ? 3.4e6 : 2.6e6;
    if (r.width * r.height * dpr * dpr > maxPx) dpr = Math.sqrt(maxPx / (r.width * r.height));
    const W = Math.max(2, Math.round(r.width * dpr)), H = Math.max(2, Math.round(r.height * dpr));
    state.w = r.width; state.h = r.height; state.dpr = dpr; state.aspect = r.width / r.height;
    if (canvas.width !== W || canvas.height !== H || !T.ms) { canvas.width = W; canvas.height = H; makeTargets(); }
    // turned between upright and wide: the wall re-arranges its columns
    if (state.mode === 'wall' && state.shelves && isPortrait() !== !!state.portrait) layout('wall');
    if (state.held) return;
    const to = state.focus >= 0 ? cameraFor('focus', state.focus) : state.mode === 'walk' ? cameraFor('walk', -1) : cameraFor('overview');
    // mid-flight (the pull-back after the loader, a move onto a pair) the camera keeps flying, only to the
    // re-fitted spot: snapping here cut the pull-back off as it started (app.js re-fits when the webfonts are in,
    // and a slow GPU drops the resolution), so the loader landed straight on the wide wall
    if (state.camT < 1 && state.camTo) state.camTo = to;
    else { state.cam = to; state.camT = 1; }
    wake();
  }

  // ---------------------------------------------------------------- frame
  let last = performance.now(), frameAvg = 16, slowFrames = 0, lastDraw = 0;
  function frame(now) {
    if (tier === 'low' && now - lastDraw < 40 && state.running) { requestAnimationFrame(frame); return; }
    lastDraw = now;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    state.time += dt;
    // adaptive resolution: if the GPU can't keep up, render fewer pixels
    frameAvg = frameAvg * 0.94 + dt * 1000 * 0.06;
    if (tier !== 'low' && frameAvg > 26 && (state.scale || 1) > 0.6) { if (++slowFrames > 40) { state.scale = (state.scale || 1) * 0.85; slowFrames = 0; frameAvg = 16; resize(); } } else slowFrames = 0;
    update(dt);
    render();
    if (onFrame) onFrame(api);
    let lifting = false;
    for (let i = 0; i < count; i++) if (Math.abs(state.liftV[i]) > 0.0004 || (state.mode === 'wall' && state.lift[i] > 0.001)) { lifting = true; break; }
    const busy = state.camT < 1 || (state.introT >= 0 && state.introT < 3) || state.walk.drag || Math.abs(state.walk.v) > 0.001 || lifting;
    if (!state.held && (now < state.idleUntil || busy)) requestAnimationFrame(frame);
    else state.running = false;
  }
  function wake(ms = 700) {
    state.idleUntil = Math.max(state.idleUntil, performance.now() + ms);
    if (!state.running && !state.held && !manual) { state.running = true; last = performance.now(); requestAnimationFrame(frame); }
  }

  // The sign stays dark while the camera pulls back, then comes on like a tired neon tube: two short blinks,
  // then on, with a small flutter while it settles. Five changes in half a second, so it stays under the
  // flash limit (tools/flash_check.py). sound.js lands its clicks and buzz on the same times (SIGN_ON).
  function signFlicker(it) {
    const u = it - SIGN_ON;
    if (u < 0) return 0;
    if (u < 0.06) return 0.85;
    if (u < 0.2) return 0;
    if (u < 0.25) return 0.62;
    if (u < 0.48) return 0;
    const settle = 1 - sstep(0.48, 0.95, u);
    return Math.min(1, 0.72 + 0.28 * sstep(0.48, 0.66, u)) * (1 - 0.06 * settle * Math.abs(Math.sin(u * 95)));
  }
  const approach = (v, t, rate, dt) => v + (t - v) * (1 - Math.exp(-rate * dt));
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function update(dt) {
    // after the loader: the sign comes on, then the shelf LEDs run once along the wall
    if (state.introT >= 0 && state.introT < 10) state.introT += dt;
    const it = state.introT;
    if (reducedMotion) { state.signK = it >= 0 ? 1 : 0; state.sweep.fill(0); state.dof = 0; }
    else if (it >= 0) {
      state.signK = signFlicker(it);
      // after the loader the shop is dim; the lights come up with the sign (a smooth ramp after its last blink)
      if (state.focusPair >= 0) state.room = 0.6 + 0.4 * sstep(SIGN_ON + 0.5, SIGN_ON + 1.2, it);
      // the macro look racks out over the first second and a bit of the pull-back
      if (state.dof > 0) state.dof = 1 - sstep(0.1, 1.35, it);
      state.sweepOrder.forEach((i, k) => {
        const u = it - (0.55 + k * 0.065);
        state.sweep[i] = u <= 0 ? 0 : u < 0.22 ? ease.outQuart(u / 0.22) * 0.55 : 0.55 * Math.max(0, 1 - (u - 0.22) / 0.7) ** 2;
      });
    }
    const any = state.hover >= 0 && state.focus < 0;
    for (let i = 0; i < count; i++) {
      const on = (i === state.hover || i === state.focus) ? 1 : 0;
      state.hv[i] = approach(state.hv[i], on, on ? 10 : 6, dt);
      const ledT = Math.max(it >= 0 ? LED_IDLE : 0, state.focus === i ? 0.62 : state.hv[i] * 0.9, state.sweep[i]);
      state.led[i] = approach(state.led[i], ledT, ledT > state.led[i] ? 14 : 6, dt);
      // hover: the pair pops up off the glass on a little spring and floats there ("hold me, try me")
      const liftT = i === state.focus ? 0.012 : (i === state.hover && state.focus < 0) ? 0.019 : 0;
      state.liftV[i] += ((liftT - state.lift[i]) * 150 - state.liftV[i] * 15.5) * dt;
      state.lift[i] += state.liftV[i] * dt;
      const dimT = (any && i !== state.hover) || (state.focus >= 0 && i !== state.focus) ? 1 : 0;
      state.dim[i] = approach(state.dim[i], dimT, 5, dt);
    }
    // cursor light
    const c = state.cursor;
    c.x = approach(c.x, c.tx, 9, dt); c.y = approach(c.y, c.ty, 9, dt);
    const idle = performance.now() - c.lastMove > 2600;
    const ci = c.active && !idle ? (state.focus >= 0 ? 0.5 : 1) : 0;
    c.i = approach(c.i, ci, 3.5, dt);
    // parallax
    state.par.x = approach(state.par.x, state.par.tx, 3.5, dt);
    state.par.y = approach(state.par.y, state.par.ty, 3.5, dt);
    state.sheetK = approach(state.sheetK || 0, state.sheetT || 0, 7, dt);
    // phone: walk inertia + snap
    const w = state.walk;
    if (state.mode === 'walk' && !w.drag && state.camT >= 1) {
      w.x += w.v * dt; w.v *= Math.exp(-dt * 5.5);
      const nearest = Math.round(w.x / WALK_PITCH);
      const tgt = Math.max(0, Math.min(count - 1, Math.abs(w.v) < 0.25 ? nearest : Math.round((w.x + w.v * 0.25) / WALK_PITCH)));
      w.target = tgt;
      if (Math.abs(w.v) < 0.25) { w.x = approach(w.x, tgt * WALK_PITCH, 9, dt); if (Math.abs(w.x - tgt * WALK_PITCH) < 0.0005) w.v = 0; }
      w.x = Math.max(-0.25, Math.min((count - 1) * WALK_PITCH + 0.25, w.x));
    }
    if (state.mode === 'walk' && state.camT >= 1) state.cam = cameraFor('walk', -1);
    const z0 = state.cam ? state.cam.pos[2] : 0;
    camLerp(dt);
    // how fast the pull-back zooms (log distance per second): the composite blurs along the zoom by it
    if (state.focusPair >= 0 && state.introT >= 0 && state.introT < 3.4 && z0 > 0 && dt > 0) {
      const v = Math.log(state.cam.pos[2] / z0) / dt;
      state.zoomV = Number.isFinite(v) ? v : 0;
    } else state.zoomV = 0;
  }

  // ---------------------------------------------------------------- render
  const LED_COLOR = [0.41, 0.61, 1.0];
  function setLights(prog) {
    const u = prog.u;
    gl.uniform4fv(u.uShelf, U.shelf); gl.uniform4fv(u.uLed, U.led);
    if (u.uShoe) gl.uniform4fv(u.uShoe, U.shoe);
    gl.uniform3fv(u.uLedColor, LED_COLOR);
    const wc = state.wash || [0, 1.75, 0.55, 2.35];
    const kx = state.mode === 'wall' ? -1.5 : state.shelves[state.start].x - 0.9;
    // the room light: dimmed while the loader hands over, up once the sign is on (state.room)
    const room = state.room == null ? 1 : state.room;
    gl.uniform4f(u.uKey, kx, 3.9, 2.5, 0.15 * room);
    gl.uniform4f(u.uFill, kx + 4.2, 1.2, 1.6, 0.025 * room);
    gl.uniform4f(u.uWash, wc[0], wc[1], wc[2], wc[3]);
    gl.uniform4f(u.uCursor, state.cursor.x, state.cursor.y, 0.3, state.cursor.i * 0.34);
    gl.uniform4fv(u.uSign, state.sign);
    gl.uniform1f(u.uSignK, state.signK);
    gl.uniform3f(u.uCam, camEye[0], camEye[1], camEye[2]);
    gl.uniform1f(u.uAmb, 0.016);
    gl.uniform1f(u.uCount, count);
    gl.uniform1f(u.uPower, state.power);
  }

  function render() {
    if (!P || !T.ms || !state.cam) return;
    fillUniforms();
    matrices();
    if (dirtyLo) { gl.bindTexture(gl.TEXTURE_2D_ARRAY, texLo); gl.generateMipmap(gl.TEXTURE_2D_ARRAY); dirtyLo = false; }
    const nowMs = performance.now();
    if (dirtyHi && nowMs - lastHiMip > 450) {
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, texHi); gl.generateMipmap(gl.TEXTURE_2D_ARRAY); dirtyHi = false; lastHiMip = nowMs;
      for (let i = 0; i < NS; i++) if (state.hiPending[i]) hiReady[i] = 1;
    }
    const W = canvas.width, H = canvas.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, T.ms.fb);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1);
    gl.clearDepth(1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.BLEND);

    // textures: 0 = low-res pairs, 1 = sharp pairs, 2 = sign letters, 3 = sign halo
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, haloTex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, signTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D_ARRAY, texHi);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, texLo);

    // wall
    gl.useProgram(P.wall.p);
    gl.uniformMatrix4fv(P.wall.u.uVP, false, VP);
    setLights(P.wall);
    gl.uniform1i(P.wall.u.uShoes, 0); gl.uniform1i(P.wall.u.uSignTex, 2); gl.uniform1i(P.wall.u.uSignHalo, 3);
    gl.bindVertexArray(V.wall);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // rails
    gl.useProgram(P.rail.p);
    gl.uniformMatrix4fv(P.rail.u.uVP, false, VP);
    setLights(P.rail);
    gl.bindVertexArray(boxVao);
    gl.drawArrays(gl.TRIANGLES, 0, railCount);

    // sign letters, contact shadows, pairs, glass (blended, premultiplied)
    gl.enable(gl.BLEND);
    gl.depthMask(false);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(P.sign.p);
    gl.uniformMatrix4fv(P.sign.u.uVP, false, VP);
    setLights(P.sign);
    gl.uniform1i(P.sign.u.uSignTex, 2);
    gl.bindVertexArray(V.sign);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.useProgram(P.contact.p);
    gl.uniformMatrix4fv(P.contact.u.uVP, false, VP);
    gl.uniform4fv(P.contact.u.uShoe, U.shoe); gl.uniform4fv(P.contact.u.uShelf, U.shelf); gl.uniform4fv(P.contact.u.uLed, U.led); gl.uniform4fv(P.contact.u.uFoot, U.foot);
    gl.uniform1f(P.contact.u.uPower, state.power);
    gl.bindVertexArray(V.contact);
    gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(P.shoe.p);
    gl.uniformMatrix4fv(P.shoe.u.uVP, false, VP);
    setLights(P.shoe);
    gl.uniform1i(P.shoe.u.uShoes, 0); gl.uniform1i(P.shoe.u.uShoesHi, 1); gl.uniform1fv(P.shoe.u.uHi, hiReady);
    gl.bindVertexArray(V.shoe);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);

    gl.useProgram(P.glass.p);
    gl.uniformMatrix4fv(P.glass.u.uVP, false, VP);
    setLights(P.glass);
    gl.bindVertexArray(boxVao);
    gl.drawArrays(gl.TRIANGLES, railCount, glassCount);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    // resolve MSAA
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.ms.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.scene.fb);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);

    // bloom
    gl.bindVertexArray(V.fs);
    const B = T.bloom;
    gl.activeTexture(gl.TEXTURE0);
    gl.useProgram(P.pre.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, B[0].fb); gl.viewport(0, 0, B[0].w, B[0].h);
    gl.bindTexture(gl.TEXTURE_2D, T.scene.tex);
    gl.uniform1i(P.pre.u.uTex, 0); gl.uniform2f(P.pre.u.uTexel, 1 / W, 1 / H); gl.uniform1f(P.pre.u.uThreshold, 1.0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.useProgram(P.down.p);
    for (let i = 1; i < B.length; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, B[i].fb); gl.viewport(0, 0, B[i].w, B[i].h);
      gl.bindTexture(gl.TEXTURE_2D, B[i - 1].tex);
      gl.uniform1i(P.down.u.uTex, 0); gl.uniform2f(P.down.u.uTexel, 1 / B[i - 1].w, 1 / B[i - 1].h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.useProgram(P.up.p);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = B.length - 1; i > 0; i--) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, B[i - 1].fb); gl.viewport(0, 0, B[i - 1].w, B[i - 1].h);
      gl.bindTexture(gl.TEXTURE_2D, B[i].tex);
      gl.uniform1i(P.up.u.uTex, 0); gl.uniform2f(P.up.u.uTexel, 1 / B[i].w, 1 / B[i].h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.disable(gl.BLEND);

    // depth of field (the hand-off only): blur the scene down the soft chain
    const dof = state.dof || 0, S2 = T.soft;
    if (dof > 0.001) {
      gl.useProgram(P.down.p);
      let src = T.scene;
      for (const t of S2) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, t.w, t.h);
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform1i(P.down.u.uTex, 0); gl.uniform2f(P.down.u.uTexel, 1 / src.w, 1 / src.h);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        src = t;
      }
    }

    // composite to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(P.comp.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.scene.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, B[0].tex);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, S2[1].tex);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, S2[2].tex);
    const u = P.comp.u;
    gl.uniform1i(u.uScene, 0); gl.uniform1i(u.uBloom, 1); gl.uniform1i(u.uSoft, 2); gl.uniform1i(u.uSoft2, 3);
    gl.uniform1f(u.uDof, dof);
    // motion blur along the zoom: a camera's shutter (~1/90 s) smears what rushes in, so the slats and
    // pairs don't strobe past (tools/flash_check.py counts a moving stripe pattern as flicker)
    const zb = reducedMotion ? 0 : Math.min(0.12, Math.abs(state.zoomV || 0) / 30);
    let fr = null;
    if ((dof > 0.001 || zb > 0.0005) && state.focusPair >= 0) fr = shoeScreenRect(state.focusPair);
    if (fr) {
      const fx = (fr.x0 + fr.x1) / 2 / state.w, fy = 1 - (fr.y0 + fr.y1) / 2 / state.h;
      gl.uniform4f(u.uFocus, fx, fy, Math.max(1, (fr.x1 - fr.x0) / 2) / state.w, Math.max(1, (fr.y1 - fr.y0) / 2) / state.h);
      gl.uniform3f(u.uZoom, fx, fy, zb);
    } else gl.uniform3f(u.uZoom, 0.5, 0.5, 0);
    gl.uniform1f(u.uBloomK, 0.55); gl.uniform1f(u.uExposure, 1.35); gl.uniform1f(u.uTime, state.time);
    gl.uniform1f(u.uGrain, tier === 'low' ? 0.016 : 0.026); gl.uniform1f(u.uVig, 0.6); gl.uniform1f(u.uAspect, state.aspect);
    gl.uniform2f(u.uRes, W, H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
  }

  // ---------------------------------------------------------------- picking & screen geometry
  function shoeScreenRect(i) {
    const s = state.shelves[i]; if (!s || !VP) return null;
    const [x0, y0, w, h] = shoeQuad(i);
    const r = items[i].rect || [0.05, 0.02, 0.95, 0.99];
    const X0 = x0 + w * r[0], X1 = x0 + w * r[2];
    const Y0 = y0 + h * (1 - r[3]), Y1 = y0 + h * (1 - r[1]);
    const a = toScreen(X0, Y0 - 0.02, SHOE_Z), b = toScreen(X1, Y1 + 0.02, SHOE_Z);
    return { x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) };
  }
  function pick(px, py) {
    if (!VP) return -1;
    let best = -1, bd = 1e9;
    for (let i = 0; i < count; i++) {
      const r = shoeScreenRect(i); if (!r) continue;
      const pad = 10;
      if (px >= r.x0 - pad && px <= r.x1 + pad && py >= r.y0 - pad && py <= r.y1 + pad * 2.5) {
        const d = Math.hypot(px - (r.x0 + r.x1) / 2, py - (r.y0 + r.y1) / 2);
        if (d < bd) { bd = d; best = i; }
      }
    }
    return best;
  }
  function labelPoint(i) {
    const s = state.shelves[i]; if (!s || !VP) return null;
    const p = toScreen(s.x, s.y - 0.05, SHELF_D);
    return { x: p[0], y: p[1], visible: p[2] > 0 };
  }

  // ---------------------------------------------------------------- api
  const api = {
    gl, state, items, count, ready, tier: () => tier, renderer, software,
    setShoeImage,
    layout(mode, opts = {}) { if (opts.start != null) state.start = opts.start; layout(mode); if (mode === 'walk') state.walk.x = state.shelves[state.start].x; resize(); },
    resize,
    setMargins(top, bottom) { state.marginTop = top; state.marginBottom = bottom; },
    // phone: the strip of screen left for the pair above the product sheet
    setFocusBand(top, bottom) { state.focusBand = [top, bottom]; },
    // the loader hands over here: hold a close-up of pair i on exactly the rect it drew
    introShot(i, rect) {
      state.held = true; state.introT = -1; state.signK = 0; state.par.x = state.par.y = state.par.tx = state.par.ty = 0;
      state.focusPair = i; state.dof = reducedMotion ? 0 : 1; state.room = reducedMotion ? 1 : 0.6;
      state.cam = shotFor(i, rect); state.camT = 1;
      if (state.mode === 'walk') { state.walk.x = state.shelves[i].x; state.walk.v = 0; }
    },
    renderOnce() { if (!P || !state.cam) return; matrices(); render(); },
    // capture mode: advance the clock by hand
    step(dt) { state.time += dt; update(dt); render(); if (onFrame) onFrame(api); },
    // pull back to the wall and power it on
    reveal({ instant = false } = {}) {
      state.held = false;
      const to = state.focus >= 0 ? cameraFor('focus', state.focus) : state.mode === 'walk' ? cameraFor('walk', -1) : cameraFor('overview');
      if (instant || reducedMotion) { state.cam = to; state.camT = 1; state.introT = reducedMotion ? 10 : 0; }
      else { state.introT = 0; flyTo(to, state.mode === 'walk' ? 2.2 : 3.0, 'glide', 0); }
      wake(3200);
    },
    hover(i) { if (state.hover !== i) { state.hover = i; wake(); } },
    focus(i) {
      state.focus = i;
      if (state.held) return;
      if (state.mode === 'walk') {
        if (i >= 0) { state.walk.x = state.shelves[i].x; state.walk.v = 0; }
        wake(900);
        return;
      }
      flyTo(i >= 0 ? cameraFor('focus', i) : cameraFor('overview'), i >= 0 ? 1.1 : 1.0);
    },
    pointer(px, py, active) {
      const c = state.cursor;
      c.active = active; c.lastMove = performance.now();
      if (active && VP) {
        const w = unproject(px, py, 0.3);
        c.tx = w[0]; c.ty = w[1];
        if (c.i < 0.02) { c.x = c.tx; c.y = c.ty; }
      }
      if (state.mode === 'wall') {
        state.par.tx = active ? ((px / state.w) - 0.5) * -0.06 : 0;
        state.par.ty = active ? ((py / state.h) - 0.5) * 0.04 : 0;
      }
      wake(900);
    },
    pick, labelPoint, shoeScreenRect, toScreen,
    walkDrag(dxPx, done, velPx) {
      const w = state.walk;
      const worldPerPx = 0.66 / state.w;
      if (!done) { w.drag = true; w.x -= dxPx * worldPerPx; w.v = 0; }
      else { w.drag = false; w.v = -(velPx || 0) * worldPerPx; }
      wake(1400);
    },
    walkTo(i) {
      const w = state.walk; w.v = 0; w.drag = false; w.target = i;
      const from = w.x, to = state.shelves[i].x, t0 = performance.now(), dur = reducedMotion ? 1 : 560;
      const step = () => { const k = Math.min(1, (performance.now() - t0) / dur); w.x = from + (to - from) * EASE.smoother(k); if (k < 1) requestAnimationFrame(step); };
      step(); wake(dur + 400);
    },
    walkIndex() { return Math.max(0, Math.min(count - 1, Math.round(state.walk.x / WALK_PITCH))); },
    sheet(open) { state.sheetT = open ? 1 : 0; wake(900); },
    wake,
    snapshot() { render(); return canvas.toDataURL('image/jpeg', 0.9); },
  };

  layout('wall');
  return api;
}
