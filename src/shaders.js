// GLSL for the Urban Industry wall. World units are metres; the wall is the plane z = 0,
// shelves stick out towards +z, the camera looks down -z.

export const NS = 10; // shelves

const HEAD = `#version 300 es
precision highp float;
precision highp int;
precision mediump sampler2DArray;
`;

// Shared lighting state, uploaded once per frame.
const LIGHTS = `
#define NS ${NS}
uniform vec4 uShelf[NS];   // x centre, y of glass top, half width, depth
uniform vec4 uSpot[NS];    // spot position xyz, intensity
uniform vec4 uLed[NS];     // led level 0..1, hover 0..1, dim 0..1, lift (m)
uniform vec4 uShoe[NS];    // shoe quad in world: x0, y0, w, h  (at z = SHOE_Z)
uniform vec3 uLedColor;
uniform vec4 uCursor;      // xyz, intensity
uniform vec3 uCam;
uniform float uAmb;
uniform float uCount;
uniform float uPower;      // global intro 0..1
const float SHOE_Z = 0.072;

// spot aimed at the middle of the shoe on its shelf
float spotCone(int i, vec3 P, out vec3 l, out float atten) {
  vec3 Lp = uSpot[i].xyz;
  vec3 L = Lp - P;
  float d2 = dot(L, L);
  l = L * inversesqrt(d2);
  vec3 aim = normalize(vec3(uShelf[i].x, uShelf[i].y + 0.07, 0.04) - Lp);
  float c = dot(-l, aim);
  atten = 1.0 / (0.30 + d2);
  return smoothstep(0.935, 0.992, c);
}

vec3 cursorLight(vec3 P, vec3 N, vec3 V, vec3 albedo, float shin, float specK, out vec3 lc) {
  vec3 L = uCursor.xyz - P;
  float d2 = dot(L, L);
  vec3 l = L * inversesqrt(d2);
  float fall = uCursor.w / (1.0 + d2 * 34.0) * smoothstep(0.9, 0.22, sqrt(d2));
  float ndl = max(dot(N, l), 0.0);
  vec3 H = normalize(l + V);
  float sp = pow(max(dot(N, H), 0.0), shin) * specK;
  lc = vec3(0.84, 0.91, 1.0) * fall;
  return (albedo * ndl + sp) * lc;
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
uniform float uTime;
in vec3 vPos;
out vec4 o;

const float PITCH = 0.044;   // slat pitch
const float GROOVE = 0.0105; // dark gap between slats
const float RAD = 0.0032;    // rounded slat edge

float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float hash2(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1, 0)), f.x), mix(hash2(i + vec2(0, 1)), hash2(i + vec2(1, 1)), f.x), f.y);
}

// shadow of shoe i on point P, from a light at Lp (projected through the shoe plane)
float shoeShadow(int i, vec3 P, vec3 Lp, float soft) {
  float t = (SHOE_Z - Lp.z) / (P.z - Lp.z);
  if (t <= 0.0 || t >= 1.0) return 1.0;
  vec2 Q = Lp.xy + t * (P.xy - Lp.xy);
  vec4 r = uShoe[i];
  r.y += uLed[i].w;
  vec2 uv = (Q - r.xy) / r.zw;
  if (uv.x < -0.05 || uv.x > 1.05 || uv.y < -0.05 || uv.y > 1.05) return 1.0;
  float a = textureLod(uShoes, vec3(uv.x, 1.0 - uv.y, float(i)), soft).a;
  return 1.0 - a * 0.82;
}

// glass + rail shadow from shelf i (light through the shelf plane)
float shelfShadow(int i, vec3 P, vec3 Lp, out float caustic) {
  caustic = 0.0;
  vec4 s = uShelf[i];
  float t = (s.y - Lp.y) / (P.y - Lp.y);
  if (t <= 0.0 || t >= 1.0) return 1.0;
  vec3 H = Lp + t * (P - Lp);
  float inX = smoothstep(s.x - s.z - 0.004, s.x - s.z + 0.004, H.x) * (1.0 - smoothstep(s.x + s.z - 0.004, s.x + s.z + 0.004, H.x));
  if (inX <= 0.0) return 1.0;
  float inZ = smoothstep(-0.002, 0.004, H.z) * (1.0 - smoothstep(s.w - 0.004, s.w + 0.002, H.z));
  // glass dims light a little, the rail at the wall blocks it, the front edge focuses it
  float rail = 1.0 - smoothstep(0.016, 0.022, H.z);
  caustic = inX * exp(-pow((s.w - H.z) / 0.005, 2.0)) * 0.22 + inX * exp(-pow((s.w * 0.55 - H.z) / 0.03, 2.0)) * 0.03;
  return 1.0 - inX * (inZ * 0.32 + rail * 0.55);
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
  float conv = clamp((u - mid) / (b - mid), -1.0, 1.0) * 0.32 * face;
  float nx = ((er - el) * 1.2 * detail + conv) * face;
  vec3 N = normalize(vec3(nx, 0.0, 1.0));
  // albedo: painted metal slats, slightly uneven per slat, faint vertical wear
  float slatVar = hash1(k) * 0.07 - 0.035;
  float streak = vnoise(vec2(k * 3.1, P.y * 2.3)) * 0.05 + vnoise(vec2(u * 900.0, P.y * 40.0)) * 0.025;
  float alb = mix(0.075, 0.34 + slatVar - streak, face);
  float gd = min(u, PITCH - u);
  float ao = mix(0.30 + 0.45 * smoothstep(0.0, a, gd), 1.0, face) * mix(1.0, 0.82, el + er);
  vec3 albedo = vec3(alb) * vec3(0.98, 0.99, 1.02);

  vec3 col = albedo * uAmb * ao * (0.5 + 0.5 * smoothstep(-0.6, 2.6, P.y));

  for (int i = 0; i < NS; i++) {
    if (float(i) >= uCount) break;
    vec4 s = uShelf[i];
    vec2 dd = P.xy - vec2(s.x, s.y);
    // contact darkening around the rail
    float rd = length(max(abs(dd - vec2(0.0, -0.014)) - vec2(s.z, 0.012), 0.0));
    ao *= 1.0 - 0.45 * exp(-rd * rd / 0.0009);
    if (abs(dd.x) > 1.6 || dd.y < -1.6 || dd.y > 2.0) continue;
    vec3 l; float att;
    float cone = spotCone(i, P, l, att);
    float I = uSpot[i].w;
    if (cone > 0.0 && I > 0.0) {
      float ndl = max(dot(N, l), 0.0);
      vec3 H = normalize(l + V);
      float sp = pow(max(dot(N, H), 0.0), 38.0) * 0.16;
      float caust;
      float sh = shoeShadow(i, P, uSpot[i].xyz, 3.2) * shelfShadow(i, P, uSpot[i].xyz, caust);
      vec3 lc = vec3(1.0, 0.965, 0.92) * I * cone * att;
      col += ((albedo * ndl + sp) * sh + albedo * caust * 0.6) * lc * ao;
    }
    // LED strip under the glass front edge: soft glow on the wall below and around the shelf
    float led = uLed[i].x * uPower;
    if (led > 0.001) {
      float dx = max(abs(dd.x) - s.z * 0.94, 0.0);
      float dy = dd.y + 0.011;
      float d2 = dx * dx + dy * dy * (dy > 0.0 ? 2.2 : 0.55) + s.w * s.w * 0.6;
      float g = led * led * 0.0052 / d2 * (dy > 0.0 ? 0.55 : 1.0);
      col += albedo * uLedColor * g * ao * (0.6 + 0.4 * face);
    }
  }

  if (uCursor.w > 0.0) {
    vec3 lc;
    vec3 c = cursorLight(P, N, V, albedo, 34.0, 0.32, lc);
    float sh = 1.0;
    for (int i = 0; i < NS; i++) {
      if (float(i) >= uCount) break;
      vec4 r = uShoe[i];
      if (abs(P.x - (r.x + r.z * 0.5)) > 0.6 || abs(P.y - (r.y + r.w * 0.5)) > 0.6) continue;
      sh *= shoeShadow(i, P, uCursor.xyz, 2.4);
    }
    col += c * sh * ao;
  }

  o = vec4(col * uPower, 1.0);
}
`;

// ---------------------------------------------------------------- rails + glass (one VBO)
export const BOX_VS = HEAD + `
uniform mat4 uVP;
uniform vec4 uLed2[${NS}];
in vec3 aPos; in vec3 aNor; in vec2 aMeta; // meta: shelf id, part (0 rail, 1 glass)
out vec3 vPos; out vec3 vNor; flat out int vId; flat out int vPart; out vec3 vLocal;
void main() {
  vId = int(aMeta.x + 0.5); vPart = int(aMeta.y + 0.5);
  vPos = aPos; vNor = aNor; vLocal = aPos;
  gl_Position = uVP * vec4(aPos, 1.0);
}
`;

export const RAIL_FS = HEAD + LIGHTS + `
in vec3 vPos; in vec3 vNor; flat in int vId; flat in int vPart; in vec3 vLocal;
out vec4 o;
void main() {
  vec3 N = normalize(vNor);
  vec3 V = normalize(uCam - vPos);
  vec3 albedo = vec3(0.028, 0.03, 0.034);
  vec3 col = albedo * uAmb * 1.4;
  int i = vId;
  vec3 l; float att;
  float cone = spotCone(i, vPos, l, att);
  vec3 H = normalize(l + V);
  float sp = pow(max(dot(N, H), 0.0), 60.0) * 0.9;
  col += (albedo * max(dot(N, l), 0.0) + sp) * vec3(1.0, 0.965, 0.92) * uSpot[i].w * cone * att;
  vec3 lc; col += cursorLight(vPos, N, V, albedo, 60.0, 0.8, lc);
  // anodised edge catching the LED
  float led = uLed[i].x * uPower;
  col += uLedColor * led * 0.05 * max(N.y, 0.0);
  o = vec4(col * uPower, 1.0);
}
`;

export const GLASS_FS = HEAD + LIGHTS + `
in vec3 vPos; in vec3 vNor; flat in int vId; flat in int vPart; in vec3 vLocal;
out vec4 o;
void main() {
  vec3 N = normalize(vNor);
  vec3 V = normalize(uCam - vPos);
  int i = vId;
  vec4 s = uShelf[i];
  float fres = pow(1.0 - abs(dot(N, V)), 4.0);
  vec3 tint = vec3(0.62, 0.78, 0.74);
  vec3 l; float att;
  float cone = spotCone(i, vPos, l, att);
  vec3 H = normalize(l + V);
  float sp = pow(max(dot(N, H), 0.0), 140.0) * 2.4;
  float I = uSpot[i].w * cone * att;
  float isFront = step(0.5, N.z);
  float isTop = step(0.5, N.y);
  float led = uLed[i].x * uPower;
  float hover = uLed[i].y;
  // edge-lit glass: the front edge is where the light comes out
  vec3 col = tint * (0.010 + 0.30 * fres) * (0.4 + I) + vec3(sp * I);
  col += tint * isFront * (0.06 + 0.12 * I);
  float along = 1.0 - smoothstep(s.z * 0.80, s.z * 1.0, abs(vPos.x - s.x));
  col += uLedColor * led * isFront * (1.1 + 2.9 * hover) * (0.55 + 0.45 * along);
  col += uLedColor * led * isTop * 0.22 * smoothstep(s.w * 0.35, s.w, vPos.z);
  vec3 lc; col += cursorLight(vPos, N, V, tint * 0.08, 120.0, 1.2, lc);
  float alpha = clamp(0.035 + 0.38 * fres + isFront * 0.52 + isTop * 0.03, 0.0, 0.92);
  o = vec4(col * uPower, alpha * uPower);
}
`;

// ---------------------------------------------------------------- contact shadows on the glass
export const CONTACT_VS = HEAD + `
uniform mat4 uVP;
uniform vec4 uShoe[${NS}];
uniform vec4 uShelf[${NS}];
uniform vec4 uLed[${NS}];
uniform vec4 uFoot[${NS}];   // footprint on the glass: x0, x1 (0..1 of quad width), unused
in vec2 aCorner;
out vec2 vUV; flat out int vId;
void main() {
  int i = gl_InstanceID; vId = i;
  vec4 r = uShoe[i]; vec4 s = uShelf[i]; vec4 f = uFoot[i];
  float x0 = r.x + r.z * f.x, x1 = r.x + r.z * f.y;
  float cx = (x0 + x1) * 0.5, hw = (x1 - x0) * 0.5 + 0.012;
  vec3 p = vec3(cx + aCorner.x * hw, s.y + 0.0006, 0.072 + aCorner.y * 0.055);
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
  float d = length(vUV * vec2(1.0, 1.15));
  float a = smoothstep(1.0, 0.15, d) * 0.62 * (1.0 - clamp(lift / 0.014, 0.0, 1.0) * 0.55);
  o = vec4(0.0, 0.0, 0.0, a * uPower);
}
`;

// ---------------------------------------------------------------- shoes (instanced quads)
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
uniform float uReveal;
in vec2 vUV; in vec3 vPos; flat in int vId;
out vec4 o;
void main() {
  vec4 t = texture(uShoes, vec3(vUV.x, 1.0 - vUV.y, float(vId)));
  if (t.a < 0.004) discard;
  vec3 c = t.rgb / t.a;
  c = c * c * (c * 0.30 + 0.70); // ~sRGB -> linear, keeps photo highlights soft
  int i = vId;
  vec3 N = normalize(vec3(0.0, 0.25, 1.0));
  vec3 V = normalize(uCam - vPos);
  // the photos are already lit: the scene only modulates them in a narrow, believable range
  float sp = uSpot[i].w;
  float k = 0.74 + 0.26 * smoothstep(0.5, 1.05, sp);
  k *= mix(0.93, 1.03, smoothstep(0.1, 0.9, vUV.y));
  k *= mix(1.0, 0.56, uLed[i].z);
  float h = clamp((vPos.y - uShelf[i].y) / max(uShoe[i].w, 0.01), 0.0, 1.0);
  float led = uLed[i].x * uPower;
  vec3 under = uLedColor * led * (0.05 + 0.10 * uLed[i].y) * smoothstep(0.35, 0.0, h);
  vec3 lc; vec3 cur = cursorLight(vPos, N, V, vec3(1.0), 12.0, 0.0, lc);
  vec3 lit = c * (k + cur.x * 0.10) + c * under;
  o = vec4(lit * t.a * uPower, t.a * uPower);
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
  float knee = uThreshold * 0.6;
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
uniform float uBloomK, uExposure, uTime, uGrain, uVig, uAspect;
uniform vec2 uRes;
in vec2 vUV; out vec4 o;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 c = vUV - 0.5;
  float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0));
  // a touch of lens dispersion at the edges
  vec2 off = c * r2 * 0.0035;
  vec3 hdr;
  hdr.r = texture(uScene, vUV - off).r;
  hdr.g = texture(uScene, vUV).g;
  hdr.b = texture(uScene, vUV + off).b;
  hdr += texture(uBloom, vUV).rgb * uBloomK;
  hdr *= uExposure;
  vec3 col = aces(hdr);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, col * vec3(0.90, 0.97, 1.10) + vec3(0.002, 0.004, 0.009), (1.0 - smoothstep(0.0, 0.5, l)) * 0.6);
  col *= mix(1.0, smoothstep(1.15, 0.2, r2 * 1.6), uVig);
  col = pow(col, vec3(1.0 / 2.2));
  float g = h12(gl_FragCoord.xy + fract(uTime * 7.31) * 517.0) - 0.5;
  col += g * uGrain * (0.6 + 0.4 * (1.0 - l));
  col += (h12(gl_FragCoord.xy * 1.37) - 0.5) / 255.0;
  o = vec4(col, 1.0);
}
`;
