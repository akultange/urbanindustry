// GLSL for the Urban Industry wall. World units are metres; the wall is the plane z = 0,
// shelves stick out towards +z, the camera looks down -z.
//
// Light: one big soft key above and left of the camera (an even, gallery-like wash that
// brings out the ribs of the slats), a weak fill from the other side, the shelf LEDs in the
// brand blue, the halo-lit sign, and a faint light that follows the cursor. Shadows of the
// shelves, the pairs and the sign letters are soft and come from the key.

export const NS = 10; // shelves

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision mediump sampler2DArray;
`;

const LIGHTS = `
#define NS ${NS}
uniform vec4 uShelf[NS];   // x centre, y of glass top, half width, depth
uniform vec4 uLed[NS];     // led 0..1, hover 0..1, dim 0..1, lift (m)
uniform vec4 uShoe[NS];    // shoe quad in world: x0, y0, w, h (at z = SHOE_Z)
uniform vec3 uLedColor;
uniform vec4 uKey;         // key light position, intensity
uniform vec4 uFill;        // fill light position, intensity
uniform vec4 uWash;        // centre x, half width, y floor, y top
uniform vec4 uCursor;      // xyz, intensity
uniform vec4 uSign;        // sign texture rect on the wall: x0, y0, w, h
uniform float uSignK;      // sign power 0..1
uniform vec3 uCam;
uniform float uAmb;
uniform float uCount;
uniform float uPower;
const float SHOE_Z = 0.072;
const float SIGN_Z = 0.022;

// how much of the key reaches a point: brighter up top, falling off towards the floor and the ends
float washAt(vec3 P) {
  float vy = smoothstep(uWash.z, uWash.w, P.y);
  float vx = 1.0 - smoothstep(uWash.y * 0.62, uWash.y * 1.25, abs(P.x - uWash.x));
  return mix(0.30, 1.0, vy * vy * (3.0 - 2.0 * vy)) * mix(0.42, 1.0, vx);
}

vec3 cursorLight(vec3 P, vec3 N, vec3 V, vec3 albedo, float shin, float specK) {
  vec3 L = uCursor.xyz - P;
  float d2 = dot(L, L);
  vec3 l = L * inversesqrt(d2);
  float fall = uCursor.w / (1.0 + d2 * 26.0) * smoothstep(0.9, 0.25, sqrt(d2));
  float ndl = max(dot(N, l), 0.0);
  vec3 H = normalize(l + V);
  float sp = pow(max(dot(N, H), 0.0), shin) * specK;
  return (albedo * ndl + sp) * vec3(0.92, 0.95, 1.0) * fall;
}
`;

// ---------------------------------------------------------------- wall
export const WALL_VS = HEAD + `
uniform mat4 uVP;
in vec3 aPos;
out vec3 vPos;
void main() { vPos = aPos; gl_Position = uVP * vec4(aPos, 1.0); }
`;

export const WALL_FS = HEAD + LIGHTS + `
uniform sampler2DArray uShoes;
uniform sampler2D uSignTex;
uniform sampler2D uSignHalo;
in vec3 vPos;
out vec4 o;

const float PITCH = 0.044;   // slat pitch
const float GROOVE = 0.0105; // gap between slats
const float RAD = 0.0034;    // rounded slat edge
const float LIGHT_SIZE = 0.7; // soft key: penumbra grows with distance from the occluder

float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}

// soft shadow of pair i: the ray from P to the key crosses the shoe plane
float shoeShadow(int i, vec3 P) {
  vec3 Lp = uKey.xyz;
  float t = (SHOE_Z - P.z) / (Lp.z - P.z);
  vec3 Q = P + t * (Lp - P);
  vec4 r = uShoe[i]; r.y += uLed[i].w;
  vec2 uv = (Q.xy - r.xy) / r.zw;
  if (uv.x < -0.04 || uv.x > 1.04 || uv.y < -0.04 || uv.y > 1.04) return 1.0;
  float a = textureLod(uShoes, vec3(uv.x, 1.0 - uv.y, float(i)), 4.4).a;
  return 1.0 - a * 0.62;
}

// glass and rail of shelf i between P and the key
float shelfShadow(int i, vec3 P) {
  vec3 Lp = uKey.xyz;
  vec4 s = uShelf[i];
  float t = (s.y - P.y) / (Lp.y - P.y);
  if (t <= 0.0 || t >= 1.0) return 1.0;
  vec3 H = P + t * (Lp - P);
  float e = 0.004 + LIGHT_SIZE * t;
  float inX = smoothstep(s.x - s.z - e, s.x - s.z + e, H.x) * (1.0 - smoothstep(s.x + s.z - e, s.x + s.z + e, H.x));
  float glass = smoothstep(-e, e, H.z) * (1.0 - smoothstep(s.w - e, s.w + e, H.z));
  float rail = 1.0 - smoothstep(0.022 - e, 0.022 + e, H.z);
  return 1.0 - inX * max(glass * 0.30, rail * 0.62);
}

// sign letters stand off the wall: their shadow from the key
float signShadow(vec3 P) {
  vec3 Lp = uKey.xyz;
  float t = (SIGN_Z - P.z) / (Lp.z - P.z);
  vec2 Q = P.xy + t * (Lp.xy - P.xy);
  vec2 uv = (Q - uSign.xy) / uSign.zw;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 1.0;
  return 1.0 - textureLod(uSignTex, vec2(uv.x, 1.0 - uv.y), 4.6).r * 0.3;
}

void main() {
  vec3 P = vPos;
  vec3 V = normalize(uCam - P);
  float w = max(fwidth(P.x), 1e-5);
  float x = P.x + 0.013;
  float k = floor(x / PITCH);
  float u = x - k * PITCH;
  float a = GROOVE * 0.5, b = PITCH - GROOVE * 0.5;
  float face = smoothstep(a - w, a + w, u) * (1.0 - smoothstep(b - w, b + w, u));
  float el = 1.0 - smoothstep(0.0, RAD + w, u - a);
  float er = 1.0 - smoothstep(0.0, RAD + w, b - u);
  float detail = clamp(RAD / (w * 1.5), 0.0, 1.0);
  float mid = PITCH * 0.5;
  float conv = clamp((u - mid) / (b - mid), -1.0, 1.0) * 0.34 * face;
  vec3 N = normalize(vec3(((er - el) * 1.2 * detail + conv) * face, 0.0, 1.0));
  // painted metal slats: a little uneven from slat to slat, faint vertical wear
  float slatVar = hash1(k) * 0.05 - 0.025;
  float streak = vnoise(vec2(k * 3.1, P.y * 2.3)) * 0.035 + vnoise(vec2(u * 900.0, P.y * 40.0)) * 0.018;
  float alb = mix(0.06, 0.36 + slatVar - streak, face);
  float gd = min(u, PITCH - u);
  float ao = mix(0.32 + 0.4 * smoothstep(0.0, a, gd), 1.0, face) * mix(1.0, 0.84, el + er);
  vec3 albedo = vec3(alb) * vec3(0.985, 0.99, 1.012);

  // shelves and pairs nearby: contact darkening at the rail, soft shadows from the key
  float shK = 1.0;
  for (int i = 0; i < NS; i++) {
    if (float(i) >= uCount) break;
    vec4 s = uShelf[i];
    vec2 dd = P.xy - s.xy;
    if (abs(dd.x) > s.z + 0.3 || dd.y < -0.36 || dd.y > 0.42) continue;
    float rd = length(max(abs(dd - vec2(0.0, -0.014)) - vec2(s.z + 0.004, 0.014), 0.0));
    ao *= 1.0 - 0.38 * exp(-rd * rd / 0.0006);
    shK *= shelfShadow(i, P) * shoeShadow(i, P);
  }
  shK *= signShadow(P);

  float wash = washAt(P);
  vec3 lk = normalize(uKey.xyz - P);
  vec3 Hk = normalize(lk + V);
  float key = max(dot(N, lk), 0.0) * uKey.w * wash * shK;
  float sheen = pow(max(dot(N, Hk), 0.0), 30.0) * 0.06 * uKey.w * wash * shK * face;
  vec3 lf = normalize(uFill.xyz - P);
  float fill = max(dot(N, lf), 0.0) * uFill.w * (0.55 + 0.45 * wash);
  vec3 col = albedo * ao * (uAmb + key + fill) + vec3(sheen) * ao;

  // shelf LEDs: a soft blue glow on the wall under the lit shelf
  for (int i = 0; i < NS; i++) {
    if (float(i) >= uCount) break;
    float led = uLed[i].x * uPower;
    if (led < 0.003) continue;
    vec4 s = uShelf[i];
    vec2 dd = P.xy - s.xy;
    float dx = max(abs(dd.x) - s.z * 0.86, 0.0);
    float dy = dd.y + 0.014;
    float d2 = dx * dx * 1.4 + dy * dy * (dy > 0.0 ? 4.0 : 0.7) + 0.0055;
    col += albedo * ao * vec3(0.3, 0.52, 1.0) * (led * 0.0042 / d2) * (0.55 + 0.45 * face);
  }

  // halo-lit sign: the LEDs behind the letters wash the slats around them
  if (uSignK > 0.002) {
    vec2 uv = (P.xy - uSign.xy) / uSign.zw;
    if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
      vec2 tc = vec2(uv.x, 1.0 - uv.y);
      float edgeFade = smoothstep(0.0, 0.12, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
      float halo = texture(uSignHalo, tc).r * edgeFade;
      float rim = textureLod(uSignTex, tc, 3.4).r;
      vec3 blue = vec3(0.2, 0.42, 1.0);
      vec3 g = blue * (halo * 2.4 + rim * 0.45) + vec3(0.5, 0.62, 0.85) * rim * 0.08;
      col += albedo * ao * g * uSignK * (0.6 + 0.4 * face);
    }
  }

  if (uCursor.w > 0.001) col += cursorLight(P, N, V, albedo, 34.0, 0.22) * ao;

  o = vec4(col * uPower, 1.0);
}
`;

// ---------------------------------------------------------------- rails + glass (one VBO)
export const BOX_VS = HEAD + `
uniform mat4 uVP;
in vec3 aPos; in vec3 aNor; in vec2 aMeta; // meta: shelf id, part (0 rail, 1 glass)
out vec3 vPos; out vec3 vNor; flat out int vId;
void main() {
  vId = int(aMeta.x + 0.5);
  vPos = aPos; vNor = aNor;
  gl_Position = uVP * vec4(aPos, 1.0);
}
`;

export const RAIL_FS = HEAD + LIGHTS + `
in vec3 vPos; in vec3 vNor; flat in int vId;
out vec4 o;
void main() {
  vec3 N = normalize(vNor);
  vec3 V = normalize(uCam - vPos);
  vec3 albedo = vec3(0.032, 0.034, 0.038);
  vec3 lk = normalize(uKey.xyz - vPos);
  vec3 H = normalize(lk + V);
  float wash = washAt(vPos);
  vec3 col = albedo * (uAmb * 1.5 + max(dot(N, lk), 0.0) * uKey.w * wash);
  col += pow(max(dot(N, H), 0.0), 60.0) * 0.5 * uKey.w * wash;
  col += cursorLight(vPos, N, V, albedo, 60.0, 0.5);
  col += uLedColor * uLed[vId].x * uPower * 0.05 * max(N.y, 0.0);
  o = vec4(col * uPower, 1.0);
}
`;

export const GLASS_FS = HEAD + LIGHTS + `
in vec3 vPos; in vec3 vNor; flat in int vId;
out vec4 o;
void main() {
  vec3 N = normalize(vNor);
  vec3 V = normalize(uCam - vPos);
  int i = vId;
  vec4 s = uShelf[i];
  float fres = pow(1.0 - abs(dot(N, V)), 4.0);
  vec3 tint = vec3(0.66, 0.80, 0.79);
  vec3 lk = normalize(uKey.xyz - vPos);
  vec3 H = normalize(lk + V);
  float wash = washAt(vPos);
  float sp = pow(max(dot(N, H), 0.0), 180.0) * 1.4 * uKey.w * wash;
  float isFront = step(0.5, N.z);
  float isTop = step(0.5, N.y);
  float led = uLed[i].x * uPower;
  float hover = uLed[i].y;
  vec3 col = tint * (0.012 + 0.2 * fres) * (0.4 + 2.2 * uKey.w * wash) + vec3(sp);
  col += tint * isFront * (0.035 + 0.4 * uKey.w * wash);
  // edge-lit glass: the strip's light comes out of the front edge
  float along = 1.0 - smoothstep(s.z * 0.84, s.z, abs(vPos.x - s.x));
  col += uLedColor * led * isFront * (0.7 + 1.5 * hover) * (0.45 + 0.55 * along);
  col += uLedColor * led * isTop * 0.1 * smoothstep(s.w * 0.4, s.w, vPos.z);
  col += cursorLight(vPos, N, V, tint * 0.08, 120.0, 0.8);
  float alpha = clamp(0.03 + 0.3 * fres + isFront * 0.5 + isTop * 0.03, 0.0, 0.9);
  o = vec4(col * uPower, alpha * uPower);
}
`;

// ---------------------------------------------------------------- contact shadows on the glass
export const CONTACT_VS = HEAD + `
uniform mat4 uVP;
uniform vec4 uShoe[${NS}];
uniform vec4 uShelf[${NS}];
uniform vec4 uLed[${NS}];
uniform vec4 uFoot[${NS}];
in vec2 aCorner;
out vec2 vUV; flat out int vId;
void main() {
  int i = gl_InstanceID; vId = i;
  vec4 r = uShoe[i]; vec4 s = uShelf[i]; vec4 f = uFoot[i];
  float lift = uLed[i].w;
  float x0 = r.x + r.z * f.x, x1 = r.x + r.z * f.y;
  // the shadow spreads as the pair rises
  float cx = (x0 + x1) * 0.5, hw = (x1 - x0) * 0.5 + 0.014 + lift * 1.2;
  vec3 p = vec3(cx + aCorner.x * hw, s.y + 0.0006, 0.072 + aCorner.y * (0.06 + lift * 0.8));
  vUV = aCorner;
  gl_Position = uVP * vec4(p, 1.0);
}
`;

export const CONTACT_FS = HEAD + `
uniform vec4 uLed[${NS}];
uniform float uPower;
in vec2 vUV; flat in int vId;
out vec4 o;
void main() {
  float lift = uLed[vId].w;
  float d = length(vUV * vec2(1.0, 1.2));
  float up = clamp(lift / 0.02, 0.0, 1.0);
  float a = smoothstep(1.0, 0.1 + 0.55 * up, d) * 0.7 * (1.0 - up * 0.55);
  o = vec4(0.0, 0.0, 0.0, a * uPower);
}
`;

// ---------------------------------------------------------------- pairs (instanced quads)
export const SHOE_VS = HEAD + `
uniform mat4 uVP;
uniform vec4 uShoe[${NS}];
uniform vec4 uLed[${NS}];
in vec2 aCorner;
out vec2 vUV; out vec3 vPos; flat out int vId;
void main() {
  int i = gl_InstanceID; vId = i;
  vec4 r = uShoe[i];
  vec3 p = vec3(r.x + aCorner.x * r.z, r.y + uLed[i].w + aCorner.y * r.w, 0.072);
  vUV = aCorner; vPos = p;
  gl_Position = uVP * vec4(p, 1.0);
}
`;

export const SHOE_FS = HEAD + LIGHTS + `
uniform sampler2DArray uShoes;
uniform sampler2DArray uShoesHi;
uniform float uHi[NS];
in vec2 vUV; in vec3 vPos; flat in int vId;
out vec4 o;
void main() {
  vec3 tc = vec3(vUV.x, 1.0 - vUV.y, float(vId));
  vec4 t = uHi[vId] > 0.5 ? texture(uShoesHi, tc) : texture(uShoes, tc);
  if (t.a < 0.004) discard;
  vec3 c = t.rgb / t.a;
  c = c * c * (c * 0.3 + 0.7); // ~sRGB -> linear, keeps photo highlights soft
  int i = vId;
  vec3 N = normalize(vec3(0.0, 0.25, 1.0));
  vec3 V = normalize(uCam - vPos);
  // the photos are already lit: the room only nudges them, inside a narrow range
  float hover = uLed[i].y;
  float k = (0.82 + 0.12 * hover) * mix(0.95, 1.02, smoothstep(0.1, 0.9, vUV.y));
  k *= mix(1.0, 0.82, uLed[i].z);
  k *= mix(0.9, 1.0, washAt(vPos));
  float h = clamp((vPos.y - uShelf[i].y) / max(uShoe[i].w, 0.01), 0.0, 1.0);
  float led = uLed[i].x * uPower;
  vec3 under = uLedColor * led * (0.03 + 0.12 * hover) * smoothstep(0.32, 0.0, h);
  vec3 cur = cursorLight(vPos, N, V, vec3(1.0), 12.0, 0.0);
  vec3 lit = c * (k + cur.x * 0.06) + c * under;
  o = vec4(lit * t.a * uPower, t.a * uPower);
}
`;

// ---------------------------------------------------------------- the sign: halo-lit letters
export const SIGN_VS = HEAD + `
uniform mat4 uVP;
uniform vec4 uSign;
in vec2 aCorner;
out vec2 vUV; out vec3 vPos;
void main() {
  vec3 p = vec3(uSign.x + aCorner.x * uSign.z, uSign.y + aCorner.y * uSign.w, 0.03);
  vUV = aCorner; vPos = p;
  gl_Position = uVP * vec4(p, 1.0);
}
`;

export const SIGN_FS = HEAD + LIGHTS + `
uniform sampler2D uSignTex;
in vec2 vUV; in vec3 vPos;
out vec4 o;
void main() {
  vec2 tc = vec2(vUV.x, 1.0 - vUV.y);
  float a = texture(uSignTex, tc).r;
  if (a < 0.003) discard;
  // white acrylic faces: lit by the room, with a little light leaking through from the back
  float wash = washAt(vPos);
  float inner = textureLod(uSignTex, tc, 2.0).r;
  float edge = clamp(a - inner, 0.0, 1.0);
  vec3 face = vec3(0.93, 0.95, 0.99) * (0.16 + 0.55 * uKey.w * wash * 4.0);
  vec3 lit = vec3(0.78, 0.81, 0.87) + vec3(0.2, 0.32, 0.6) * edge * 0.3;
  // switched off it sits dark in the dim room, so it doesn't jump out before it powers on
  vec3 col = mix(face * 0.12, lit, uSignK);
  col += cursorLight(vPos, vec3(0.0, 0.0, 1.0), normalize(uCam - vPos), vec3(0.9), 40.0, 0.2);
  o = vec4(col * a * uPower, a * uPower);
}
`;

// ---------------------------------------------------------------- post
export const FS_VS = HEAD + `
in vec2 aCorner;
out vec2 vUV;
void main() { vUV = aCorner * 0.5 + 0.5; gl_Position = vec4(aCorner, 0.0, 1.0); }
`;

export const PREFILTER_FS = HEAD + `
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uThreshold;
in vec2 vUV; out vec4 o;
void main() {
  vec3 c = vec3(0.0);
  c += texture(uTex, vUV + uTexel * vec2(-1, -1)).rgb;
  c += texture(uTex, vUV + uTexel * vec2(1, -1)).rgb;
  c += texture(uTex, vUV + uTexel * vec2(-1, 1)).rgb;
  c += texture(uTex, vUV + uTexel * vec2(1, 1)).rgb;
  c *= 0.25;
  float br = max(c.r, max(c.g, c.b));
  float knee = uThreshold * 0.35;
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  o = vec4(c * contrib, 1.0);
}
`;

export const DOWN_FS = HEAD + `
uniform sampler2D uTex; uniform vec2 uTexel;
in vec2 vUV; out vec4 o;
void main() {
  vec3 c = texture(uTex, vUV).rgb * 4.0;
  c += texture(uTex, vUV + uTexel * vec2(-1, -1)).rgb;
  c += texture(uTex, vUV + uTexel * vec2(1, -1)).rgb;
  c += texture(uTex, vUV + uTexel * vec2(-1, 1)).rgb;
  c += texture(uTex, vUV + uTexel * vec2(1, 1)).rgb;
  o = vec4(c / 8.0, 1.0);
}
`;

export const UP_FS = HEAD + `
uniform sampler2D uTex; uniform vec2 uTexel;
in vec2 vUV; out vec4 o;
void main() {
  vec3 c = vec3(0.0);
  c += texture(uTex, vUV + uTexel * vec2(-2, 0)).rgb;
  c += texture(uTex, vUV + uTexel * vec2(2, 0)).rgb;
  c += texture(uTex, vUV + uTexel * vec2(0, -2)).rgb;
  c += texture(uTex, vUV + uTexel * vec2(0, 2)).rgb;
  c += texture(uTex, vUV + uTexel * vec2(-1, -1)).rgb * 2.0;
  c += texture(uTex, vUV + uTexel * vec2(1, -1)).rgb * 2.0;
  c += texture(uTex, vUV + uTexel * vec2(-1, 1)).rgb * 2.0;
  c += texture(uTex, vUV + uTexel * vec2(1, 1)).rgb * 2.0;
  o = vec4(c / 12.0, 1.0);
}
`;

export const COMPOSITE_FS = HEAD + `
uniform sampler2D uScene; uniform sampler2D uBloom;
uniform sampler2D uSoft; uniform sampler2D uSoft2;   // the scene at 1/4 and 1/8 size: depth of field
uniform float uBloomK, uExposure, uTime, uGrain, uVig, uAspect, uDof;
uniform vec4 uFocus;                                  // centre (uv) and half size (uv) of what's in focus
uniform vec3 uZoom;                                   // zoom centre (uv) and blur length (fraction of the radius)
uniform vec2 uRes;
in vec2 vUV; out vec4 o;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 c = vUV - 0.5;
  float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0));
  vec2 off = c * r2 * 0.002;
  vec3 hdr;
  if (uZoom.z > 0.0005) {
    // the pull-back's motion blur: average along the line to the zoom centre (where things are moving)
    vec2 dir = (vUV - uZoom.xy) * uZoom.z;
    hdr = vec3(0.0);
    for (int i = 0; i < 12; i++) hdr += texture(uScene, vUV + dir * (float(i) / 11.0 - 0.5)).rgb;
    hdr /= 12.0;
  } else {
    hdr.r = texture(uScene, vUV - off).r;
    hdr.g = texture(uScene, vUV).g;
    hdr.b = texture(uScene, vUV + off).b;
  }
  // the hand-off from the loader: a macro lens on the pair, the wall around it soft, racking out as we pull back
  if (uDof > 0.001) {
    float m = smoothstep(1.05, 2.5, length((vUV - uFocus.xy) / max(uFocus.zw, vec2(1e-4)))) * uDof;
    hdr = mix(hdr, 0.5 * (texture(uSoft, vUV).rgb + texture(uSoft2, vUV).rgb), m);
  }
  hdr += texture(uBloom, vUV).rgb * uBloomK;
  hdr *= uExposure;
  vec3 col = aces(hdr);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  // cool the deep shadows a touch, keep the highlights neutral
  col = mix(col, col * vec3(0.93, 0.97, 1.06) + vec3(0.0015, 0.003, 0.006), (1.0 - smoothstep(0.0, 0.4, l)) * 0.5);
  col *= mix(1.0, smoothstep(1.3, 0.3, r2 * 1.45), uVig);
  col = pow(col, vec3(1.0 / 2.2));
  float g = h12(gl_FragCoord.xy + fract(uTime * 7.31) * 517.0) - 0.5;
  col += g * uGrain * (0.45 + 0.55 * (1.0 - l));
  col += (h12(gl_FragCoord.xy * 1.37) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}
`;
