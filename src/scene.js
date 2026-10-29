// The lit wall: their slatted wall, glass shelves with LED edges, ten pairs, a light that
// follows the cursor, and a camera that flies to the shelf you pick.
import * as S from './shaders.js';
import { program, vao, target, msaaTarget, deleteTarget, m4, ease } from './gl.js';

const NS = S.NS;
const SHELF_HW = 0.225, SHELF_D = 0.15, GLASS_T = 0.010;
const SHOE_W = 0.40, SHOE_ASPECT = 1.6; // quad = one texture layer (1024x640)
const LAYER_W = 1024, LAYER_H = 640;
const WALK_PITCH = 0.48;

export function createScene(canvas, { catalog, tier = 'high', onFrame, reducedMotion = false } = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const hasFloat = !!gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  const HDR = hasFloat ? { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT } : { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };
  const maxSamples = gl.getParameter(gl.MAX_SAMPLES) || 0;

  // ---------------------------------------------------------------- programs
  let P;
  try {
    P = {
      wall: program(gl, S.WALL_VS, S.WALL_FS, 'wall'),
      rail: program(gl, S.BOX_VS, S.RAIL_FS, 'rail'),
      glass: program(gl, S.BOX_VS, S.GLASS_FS, 'glass'),
      contact: program(gl, S.CONTACT_VS, S.CONTACT_FS, 'contact'),
      shoe: program(gl, S.SHOE_VS, S.SHOE_FS, 'shoe'),
      pre: program(gl, S.FS_VS, S.PREFILTER_FS, 'prefilter'),
      down: program(gl, S.FS_VS, S.DOWN_FS, 'down'),
      up: program(gl, S.FS_VS, S.UP_FS, 'up'),
      comp: program(gl, S.FS_VS, S.COMPOSITE_FS, 'composite'),
    };
  } catch (e) {
    console.error(e);
    return null;
  }

  // ---------------------------------------------------------------- geometry
  const quad = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
  const fsq = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const ctr = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const wallGeo = new Float32Array([-9, -3, 0, 9, -3, 0, -9, 6, 0, 9, 6, 0]);
  const V = {
    wall: vao(gl, P.wall, [['aPos', wallGeo, 3]]),
    shoe: vao(gl, P.shoe, [['aCorner', quad, 2]]),
    contact: vao(gl, P.contact, [['aCorner', ctr, 2]]),
    fs: vao(gl, P.comp, [['aCorner', fsq, 2]]),
  };
  let boxVao = null, railCount = 0, glassCount = 0;

  // ---------------------------------------------------------------- shoe textures (array, one layer per shelf)
  const shoeTex = gl.createTexture();
  const levels = Math.floor(Math.log2(LAYER_W)) + 1;
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, shoeTex);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, levels, gl.RGBA8, LAYER_W, LAYER_H, NS);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const ext = gl.getExtension('EXT_texture_filter_anisotropic');
  if (ext) gl.texParameterf(gl.TEXTURE_2D_ARRAY, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  // start transparent
  {
    const empty = new Uint8Array(LAYER_W * LAYER_H * 4);
    for (let i = 0; i < NS; i++) gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, LAYER_W, LAYER_H, 1, gl.RGBA, gl.UNSIGNED_BYTE, empty);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  }
  const layerCanvas = document.createElement('canvas');
  layerCanvas.width = LAYER_W; layerCanvas.height = LAYER_H;
  const lctx = layerCanvas.getContext('2d', { willReadFrequently: false });
  let mipDirty = false;
  function setShoeImage(i, img) {
    lctx.clearRect(0, 0, LAYER_W, LAYER_H);
    lctx.imageSmoothingQuality = 'high';
    lctx.drawImage(img, 0, 0, LAYER_W, LAYER_H);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, shoeTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, i, LAYER_W, LAYER_H, 1, gl.RGBA, gl.UNSIGNED_BYTE, layerCanvas);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    mipDirty = true;
    state.loaded[i] = 1;
    wake();
  }

  // ---------------------------------------------------------------- state
  const items = catalog.pairs.slice(0, NS);
  const count = items.length;
  const state = {
    mode: 'wall',          // 'wall' (desktop grid) | 'walk' (phone row)
    hover: -1, focus: -1,
    hv: new Float32Array(NS), led: new Float32Array(NS), lift: new Float32Array(NS), dim: new Float32Array(NS),
    spot: new Float32Array(NS), loaded: new Uint8Array(NS), flick: new Float32Array(NS),
    power: reducedMotion ? 1 : 0, introT: reducedMotion ? 10 : 0,
    cursor: { x: 0, y: 1.3, tx: 0, ty: 1.3, i: 0, ti: 0, active: false, lastMove: 0 },
    par: { x: 0, y: 0, tx: 0, ty: 0 },
    cam: null, camFrom: null, camTo: null, camT: 1, camDur: 0.9,
    walk: { x: 0, v: 0, drag: false, target: 0 },
    shelves: [], dpr: 1, w: 1, h: 1, aspect: 1, time: 0, idleUntil: 0, running: false,
  };

  // ---------------------------------------------------------------- layout
  function layout(mode) {
    state.mode = mode;
    const sh = [];
    if (mode === 'wall') {
      const cols = 5, rows = Math.ceil(count / cols), pitchX = 0.62, pitchY = 0.64, y0 = 1.02;
      for (let i = 0; i < count; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        sh.push({ x: (c - (cols - 1) / 2) * pitchX, y: y0 + (rows - 1 - r) * pitchY });
      }
    } else {
      for (let i = 0; i < count; i++) sh.push({ x: i * WALK_PITCH, y: 1.24 });
    }
    state.shelves = sh;
    buildBoxes();
    state.cam = state.cam || cameraFor('overview');
  }

  function buildBoxes() {
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
  const U = {
    shelf: new Float32Array(NS * 4), spot: new Float32Array(NS * 4), led: new Float32Array(NS * 4),
    shoe: new Float32Array(NS * 4), foot: new Float32Array(NS * 4),
  };
  function fillUniforms() {
    for (let i = 0; i < NS; i++) {
      const s = state.shelves[i];
      if (!s) { U.shelf.set([99, -9, 0, 0], i * 4); U.spot.set([99, 0, 0, 0], i * 4); U.shoe.set([99, -9, 0.01, 0.01], i * 4); continue; }
      const it = items[i];
      U.shelf.set([s.x, s.y, SHELF_HW, SHELF_D], i * 4);
      U.spot.set([s.x - 0.04, s.y + 0.78, 0.58, state.spot[i]], i * 4);
      U.led.set([state.led[i], state.hv[i], state.dim[i], state.lift[i]], i * 4);
      const w = SHOE_W * (it.scale || 1), h = w / SHOE_ASPECT;
      const fx = it.rect ? it.rect[0] : 0.05, fx1 = it.rect ? it.rect[2] : 0.95;
      // centre the shoe's content (not the layer) on the shelf
      const cx = (fx + fx1) / 2;
      U.shoe.set([s.x - w * cx, s.y - (it.rect ? it.rect[3] * 0 : 0) - h * (it.base || 0.02) + 0.0006, w, h], i * 4);
      U.foot.set([fx, fx1, 0, 0], i * 4);
    }
  }

  // ---------------------------------------------------------------- camera
  const FOV_WALL = 26 * Math.PI / 180;
  function cameraFor(kind, i) {
    const a = state.aspect;
    if (state.mode === 'wall') {
      if (kind === 'overview' || i < 0) {
        const xs = state.shelves.map(s => s.x), ys = state.shelves.map(s => s.y);
        const minX = Math.min(...xs) - SHELF_HW - 0.12, maxX = Math.max(...xs) + SHELF_HW + 0.12;
        const minY = Math.min(...ys) - 0.12, maxY = Math.max(...ys) + 0.30;
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        const halfW = (maxX - minX) / 2, halfH = (maxY - minY) / 2;
        // fit the wall into the band left between the headline and the footer
        const fov = FOV_WALL, t = Math.tan(fov / 2);
        const H = state.h || 1, mt = state.marginTop || H * 0.18, mb = state.marginBottom || H * 0.1;
        const fh = Math.max(0.35, (H - mt - mb) / H);
        const yc = 1 - 2 * ((mt + (H - mt - mb) / 2) / H);
        const useW = 0.92;
        const d = Math.max(halfH / (t * fh * 0.96), halfW / (t * a * useW));
        return { pos: [cx, cy, d], at: [cx, cy, 0], fov, sx: 0, sy: -yc };
      }
      const s = state.shelves[i];
      const fov = 24 * Math.PI / 180, t = Math.tan(fov / 2);
      // the shoe fills ~46% of the width, centred at ~44% so the panel sits over dark wall
      const wide = a > 1.15;
      const d = wide ? Math.min(1.6, Math.max(0.7, 0.80 / (2 * t * a))) : 0.95;
      const cy = s.y + 0.09;
      return { pos: [s.x, cy, d], at: [s.x, cy, 0], fov, sx: wide ? 0.12 : 0, sy: wide ? 0.06 : 0.12 };
    }
    // walk (phone): one shelf centred, neighbours peeking in
    const x = (i >= 0 ? state.shelves[i].x : state.walk.x);
    const fov = 34 * Math.PI / 180, t = Math.tan(fov / 2);
    const visW = 0.66;
    const d = visW / 2 / (t * a);
    const y = 1.24 + 0.10;
    const k = state.sheetK || 0;
    return { pos: [x, y - k * 0.02, d * (1 + k * 0.06)], at: [x, y - k * 0.02, 0], fov, sx: 0, sy: 0.02 - k * 0.40 };
  }
  function flyTo(cam, dur = 0.95) {
    state.camFrom = { ...state.cam, pos: [...state.cam.pos], at: [...state.cam.at] };
    state.camTo = cam; state.camT = 0; state.camDur = reducedMotion ? 0.001 : dur;
    wake(dur * 1000 + 100);
  }
  function camLerp(dt) {
    if (state.camT < 1 && state.camTo) {
      state.camT = Math.min(1, state.camT + dt / state.camDur);
      const k = ease.inOutQuint(state.camT);
      const A = state.camFrom, B = state.camTo, L = (a, b) => a + (b - a) * k;
      // arc: pull back a little mid-flight so the wall reads as a space
      const arc = Math.sin(Math.PI * k) * (Math.abs(B.pos[2] - A.pos[2]) * 0.18 + Math.hypot(B.pos[0] - A.pos[0], B.pos[1] - A.pos[1]) * 0.25);
      state.cam = {
        pos: [L(A.pos[0], B.pos[0]), L(A.pos[1], B.pos[1]), L(A.pos[2], B.pos[2]) + arc],
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
    const proj = m4.perspective(c.fov, state.aspect, 0.05, 40, c.sx, c.sy);
    const view = m4.lookAt(eye, at);
    VP = m4.mul(proj, view);
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
    let rx = [fz[1] * 0 - fz[2] * 1, fz[2] * 0 - fz[0] * 0, fz[0] * 1 - fz[1] * 0]; l = Math.hypot(...rx); rx = rx.map(v => v / l);
    // right = fwd x up
    rx = [fz[1] * 0 - fz[2] * 1, fz[2] * 0 - fz[0] * 0, fz[0] * 1 - fz[1] * 0];
    rx = [-fz[2], 0, fz[0]]; l = Math.hypot(...rx); rx = rx.map(v => v / l);
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
    for (const k in T) deleteTarget(gl, T[k]);
    T = {};
    const W = canvas.width, H = canvas.height;
    const samples = tier === 'high' ? Math.min(4, maxSamples) : tier === 'mid' ? Math.min(2, maxSamples) : 0;
    T.ms = msaaTarget(gl, W, H, HDR, samples);
    if (!T.ms.ok) T.ms = msaaTarget(gl, W, H, { internal: gl.RGBA8 }, samples);
    T.scene = target(gl, W, H, HDR);
    const levelsB = tier === 'low' ? 3 : 5;
    T.bloom = [];
    let bw = W >> 1, bh = H >> 1;
    for (let i = 0; i < levelsB; i++) { T.bloom.push(target(gl, Math.max(1, bw), Math.max(1, bh), HDR)); bw >>= 1; bh >>= 1; }
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const cap = tier === 'high' ? 2 : tier === 'mid' ? 1.6 : 1.1;
    let dpr = Math.min(window.devicePixelRatio || 1, cap) * (state.scale || 1);
    const maxPx = tier === 'high' ? 4.2e6 : 2.6e6;
    if (r.width * r.height * dpr * dpr > maxPx) dpr = Math.sqrt(maxPx / (r.width * r.height));
    const W = Math.max(2, Math.round(r.width * dpr)), H = Math.max(2, Math.round(r.height * dpr));
    state.w = r.width; state.h = r.height; state.dpr = dpr; state.aspect = r.width / r.height;
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; makeTargets(); }
    if (state.focus >= 0) state.cam = cameraFor('focus', state.focus);
    else if (state.mode === 'walk') state.cam = cameraFor('walk', -1);
    else state.cam = cameraFor('overview');
    state.camT = 1;
    wake();
  }

  // ---------------------------------------------------------------- frame
  let last = performance.now(), frameAvg = 16, slowFrames = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    state.time += dt;
    // adaptive resolution: if the GPU can't keep up, render fewer pixels
    frameAvg = frameAvg * 0.94 + dt * 1000 * 0.06;
    if (frameAvg > 26 && (state.scale || 1) > 0.6) { if (++slowFrames > 40) { state.scale = (state.scale || 1) * 0.85; slowFrames = 0; frameAvg = 16; resize(); } } else slowFrames = 0;
    update(dt);
    render();
    if (onFrame) onFrame(api);
    if (now < state.idleUntil || state.camT < 1 || state.introT < 2.6 || state.walk.drag || Math.abs(state.walk.v) > 0.001) requestAnimationFrame(frame);
    else state.running = false;
  }
  function wake(ms = 700) {
    state.idleUntil = Math.max(state.idleUntil, performance.now() + ms);
    if (!state.running) { state.running = true; last = performance.now(); requestAnimationFrame(frame); }
  }

  const approach = (v, t, rate, dt) => v + (t - v) * (1 - Math.exp(-rate * dt));
  function update(dt) {
    // intro: power on, LEDs strike one by one
    if (state.introT < 10) state.introT += dt;
    const it = state.introT;
    state.power = reducedMotion ? 1 : ease.outQuart(Math.min(1, it / 1.1));
    for (let i = 0; i < count; i++) {
      const t0 = 0.45 + i * 0.075;
      let f = 0;
      const u = it - t0;
      if (u > 0) {
        if (u < 0.05) f = 0.9; else if (u < 0.09) f = 0.05; else if (u < 0.13) f = 0.7; else if (u < 0.18) f = 0.15;
        else if (u < 0.5) f = 1.0; else f = Math.max(0, 1 - (u - 0.5) / 0.6);
      }
      state.flick[i] = reducedMotion ? 0 : f;
    }
    const any = state.hover >= 0 && state.focus < 0;
    for (let i = 0; i < count; i++) {
      const on = (i === state.hover || i === state.focus) ? 1 : 0;
      state.hv[i] = approach(state.hv[i], on, on ? 14 : 7, dt);
      const ledT = Math.max(0.16 * (state.introT > 1 ? 1 : 0), state.focus === i ? 0.5 : state.hv[i], state.flick[i] * 0.8);
      state.led[i] = approach(state.led[i], ledT, ledT > state.led[i] ? 30 : 9, dt);
      state.lift[i] = state.hv[i] * 0.009;
      const dimT = (any && i !== state.hover) || (state.focus >= 0 && i !== state.focus) ? 1 : 0;
      state.dim[i] = approach(state.dim[i], dimT, 6, dt);
      const spotT = (state.focus === i ? 1.05 : (any ? 0.42 : 0.55) + 0.45 * state.hv[i]) * (state.introT > 0.4 ? 1 : 0.2) * (state.loaded[i] ? 1 : 0.6);
      state.spot[i] = approach(state.spot[i], spotT, 5, dt);
    }
    // cursor light
    const c = state.cursor;
    c.x = approach(c.x, c.tx, 10, dt); c.y = approach(c.y, c.ty, 10, dt);
    const idle = performance.now() - c.lastMove > 2600;
    const ci = c.active && !idle ? (state.focus >= 0 ? 0.55 : 1.0) : 0;
    c.i = approach(c.i, ci * (state.power), 4, dt);
    // parallax
    state.par.x = approach(state.par.x, state.par.tx, 4, dt);
    state.par.y = approach(state.par.y, state.par.ty, 4, dt);
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
    if (state.mode === 'walk' && state.camT >= 1) {
      const cam = cameraFor('walk', -1);
      state.cam = cam;
    }
    camLerp(dt);
  }

  // ---------------------------------------------------------------- render
  function setLights(prog) {
    const u = prog.u;
    gl.uniform4fv(u.uShelf, U.shelf); gl.uniform4fv(u.uSpot, U.spot); gl.uniform4fv(u.uLed, U.led);
    if (u.uShoe) gl.uniform4fv(u.uShoe, U.shoe);
    gl.uniform3f(u.uLedColor, 0.42, 0.62, 1.0);
    gl.uniform4f(u.uCursor, state.cursor.x, state.cursor.y, 0.26, state.cursor.i * 1.05);
    gl.uniform3f(u.uCam, camEye[0], camEye[1], camEye[2]);
    gl.uniform1f(u.uAmb, 0.028);
    gl.uniform1f(u.uCount, count);
    gl.uniform1f(u.uPower, state.power);
  }

  function render() {
    fillUniforms();
    matrices();
    if (mipDirty) { gl.bindTexture(gl.TEXTURE_2D_ARRAY, shoeTex); gl.generateMipmap(gl.TEXTURE_2D_ARRAY); mipDirty = false; }
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

    // wall
    gl.useProgram(P.wall.p);
    gl.uniformMatrix4fv(P.wall.u.uVP, false, VP);
    setLights(P.wall);
    gl.uniform1f(P.wall.u.uTime, state.time);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, shoeTex);
    gl.uniform1i(P.wall.u.uShoes, 0);
    gl.bindVertexArray(V.wall);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // rails
    gl.useProgram(P.rail.p);
    gl.uniformMatrix4fv(P.rail.u.uVP, false, VP);
    setLights(P.rail);
    gl.bindVertexArray(boxVao);
    gl.drawArrays(gl.TRIANGLES, 0, railCount);

    // contact shadows, shoes, glass (blended, premultiplied)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
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
    gl.uniform1i(P.shoe.u.uShoes, 0);
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
    gl.useProgram(P.pre.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, B[0].fb); gl.viewport(0, 0, B[0].w, B[0].h);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.scene.tex);
    gl.uniform1i(P.pre.u.uTex, 0); gl.uniform2f(P.pre.u.uTexel, 1 / W, 1 / H); gl.uniform1f(P.pre.u.uThreshold, 0.95);
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

    // composite to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(P.comp.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.scene.tex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, B[0].tex);
    const u = P.comp.u;
    gl.uniform1i(u.uScene, 0); gl.uniform1i(u.uBloom, 1);
    gl.uniform1f(u.uBloomK, 0.7); gl.uniform1f(u.uExposure, 1.35); gl.uniform1f(u.uTime, state.time);
    gl.uniform1f(u.uGrain, tier === 'low' ? 0.02 : 0.034); gl.uniform1f(u.uVig, 0.75); gl.uniform1f(u.uAspect, state.aspect);
    gl.uniform2f(u.uRes, W, H);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
  }

  // ---------------------------------------------------------------- picking & screen geometry
  function shoeScreenRect(i) {
    const s = state.shelves[i]; if (!s) return null;
    const off = i * 4;
    const x0 = U.shoe[off], y0 = U.shoe[off + 1], w = U.shoe[off + 2], h = U.shoe[off + 3];
    const r = items[i].rect || [0.05, 0.02, 0.95, 0.9];
    const X0 = x0 + w * r[0], X1 = x0 + w * r[2];
    const Y0 = y0 + h * 0.0, Y1 = y0 + h * (1 - r[1]);
    const a = toScreen(X0, Y0 - 0.02, 0.07), b = toScreen(X1, Y1 + 0.02, 0.07);
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
    const p = toScreen(s.x, s.y - 0.055, SHELF_D);
    return { x: p[0], y: p[1], visible: p[2] > 0 };
  }

  // ---------------------------------------------------------------- api
  const api = {
    gl, state, items, count,
    setShoeImage,
    layout(mode) { layout(mode); resize(); },
    resize,
    setMargins(top, bottom) { state.marginTop = top; state.marginBottom = bottom; },
    hover(i) { if (state.hover !== i) { state.hover = i; wake(); } },
    focus(i) {
      state.focus = i;
      if (state.mode === 'walk') {
        if (i >= 0) { state.walk.x = state.shelves[i].x; state.walk.v = 0; }
        wake(900);
        return;
      }
      flyTo(i >= 0 ? cameraFor('focus', i) : cameraFor('overview'), i >= 0 ? 1.05 : 0.95);
    },
    pointer(px, py, active) {
      const c = state.cursor;
      c.active = active; c.lastMove = performance.now();
      if (active && VP) {
        const w = unproject(px, py, 0.30);
        c.tx = w[0]; c.ty = w[1];
        if (c.i < 0.02) { c.x = c.tx; c.y = c.ty; }
      }
      if (state.mode === 'wall') {
        state.par.tx = active ? ((px / state.w) - 0.5) * -0.07 : 0;
        state.par.ty = active ? ((py / state.h) - 0.5) * 0.045 : 0;
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
    walkTo(i) { state.walk.v = 0; state.walk.drag = false; state.walk.target = i; const from = state.walk.x; const to = state.shelves[i].x; const t0 = performance.now(); const dur = reducedMotion ? 1 : 520; const step = () => { const k = Math.min(1, (performance.now() - t0) / dur); state.walk.x = from + (to - from) * ease.inOutCubic(k); if (k < 1) requestAnimationFrame(step); }; step(); wake(dur + 400); },
    walkIndex() { return Math.max(0, Math.min(count - 1, Math.round(state.walk.x / WALK_PITCH))); },
    sheet(open) { state.sheetT = open ? 1 : 0; wake(900); },
    wake,
    snapshot() { render(); return canvas.toDataURL('image/jpeg', 0.9); },
  };

  layout('wall');
  return api;
}
