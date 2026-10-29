// Tiny WebGL2 helpers: programs, buffers, render targets, array textures, mat4.

export function program(gl, vs, fs, label) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
      throw new Error(`[${label}] ${type === gl.VERTEX_SHADER ? 'VS' : 'FS'} compile: ${log}\n${lines.slice(0, 4000)}`);
    }
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`[${label}] link: ${gl.getProgramInfoLog(p)}`);
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u, label };
}

// Two-phase variant: start compiling (no status queries, so the driver can work in parallel),
// finish later once KHR_parallel_shader_compile says it's done.
export function startProgram(gl, vs, fs, label) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const v = mk(gl.VERTEX_SHADER, vs), f = mk(gl.FRAGMENT_SHADER, fs);
  const p = gl.createProgram();
  gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
  return { p, v, f, label };
}
export function finishProgram(gl, x) {
  if (!gl.getProgramParameter(x.p, gl.LINK_STATUS)) {
    const log = (gl.getShaderInfoLog(x.v) || '') + (gl.getShaderInfoLog(x.f) || '') + (gl.getProgramInfoLog(x.p) || '');
    throw new Error(`[${x.label}] ${log}`);
  }
  const u = {};
  const n = gl.getProgramParameter(x.p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(x.p, i);
    u[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(x.p, info.name);
  }
  return { p: x.p, u, label: x.label };
}

export function vao(gl, prog, attribs, indices) {
  const v = gl.createVertexArray();
  gl.bindVertexArray(v);
  for (const [name, data, size] of attribs) {
    const loc = gl.getAttribLocation(prog.p, name);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    if (loc < 0) continue;
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
  if (indices) {
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  }
  gl.bindVertexArray(null);
  return v;
}

export function texture2D(gl, w, h, internal, format, type, filter = gl.LINEAR) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

export function target(gl, w, h, fmt) {
  const tex = texture2D(gl, w, h, fmt.internal, fmt.format, fmt.type);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fb, w, h };
}

export function msaaTarget(gl, w, h, fmt, samples) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  const color = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, color);
  if (samples > 1) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, fmt.internal, w, h);
  else gl.renderbufferStorage(gl.RENDERBUFFER, fmt.internal, w, h);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color);
  const depth = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  if (samples > 1) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
  else gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, color, depth, w, h, ok };
}

export function deleteTarget(gl, t) {
  if (!t) return;
  if (t.tex) gl.deleteTexture(t.tex);
  if (t.fb) gl.deleteFramebuffer(t.fb);
  if (t.color) gl.deleteRenderbuffer(t.color);
  if (t.depth) gl.deleteRenderbuffer(t.depth);
}

// ---------------------------------------------------------------- math
export const m4 = {
  perspective(fovy, aspect, near, far, shiftX = 0, shiftY = 0) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      shiftX, shiftY, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0,
    ]);
  },
  lookAt(eye, at, up = [0, 1, 0]) {
    let zx = eye[0] - at[0], zy = eye[1] - at[1], zz = eye[2] - at[2];
    let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0,
      xy, yy, zy, 0,
      xz, yz, zz, 0,
      -(xx * eye[0] + xy * eye[1] + xz * eye[2]), -(yx * eye[0] + yy * eye[1] + yz * eye[2]), -(zx * eye[0] + zy * eye[1] + zz * eye[2]), 1,
    ]);
  },
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  },
  project(m, x, y, z) {
    const X = m[0] * x + m[4] * y + m[8] * z + m[12];
    const Y = m[1] * x + m[5] * y + m[9] * z + m[13];
    const W = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [X / W, Y / W, W];
  },
};

// CSS-style cubic-bezier(x1, y1, x2, y2) as an easing function
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t, dX = t => (3 * ax * t + 2 * bx) * t + cx;
  return x => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) { const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= (X(t) - x) / d; }
    if (t < 0 || t > 1 || Math.abs(X(t) - x) > 1e-4) { let lo = 0, hi = 1; t = x; for (let i = 0; i < 30; i++) { if (X(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
    return Y(t);
  };
}

export const ease = {
  outExpo: t => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutQuint: t => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  outQuart: t => 1 - Math.pow(1 - t, 4),
  outCubic: t => 1 - Math.pow(1 - t, 3),
  smoother: t => t * t * t * (t * (t * 6 - 15) + 10),
};
