// Общие униформы и «впрыски» в стандартные материалы three.js:
// каустика (световые блики под водой), покачивание растений, изгиб тела рыбки.
import * as THREE from 'three';

export const G = {
  uTime: { value: 0 },
  uLampColor: { value: new THREE.Color(1, 1, 1) },
  uLampPower: { value: 1 },       // 0..1.4 (включённость * яркость)
  uCurrent: { value: 1 },         // сила течения (компрессор)
  uWaterTop: { value: 3.2 },
  caustics: true,
};

const CAUSTIC_GLSL = /* glsl */`
uniform float uTime; uniform vec3 uLampColor; uniform float uLampPower; uniform float uWaterTop;
varying vec3 vCWorld; varying vec3 vCNorm;
vec2 cHash(vec2 p){ p = vec2(dot(p,vec2(127.1,311.7)), dot(p,vec2(269.5,183.3))); return fract(sin(p)*43758.5453); }
float cCells(vec2 p, float t){
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y=-1; y<=1; y++) for (int x=-1; x<=1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = cHash(i + g);
    o = 0.5 + 0.42*sin(t + 6.2831*o);
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return 1.0 - smoothstep(0.0, 0.09, d2 - d1);
}
float caustic(vec3 w){
  vec2 p = w.xz * 1.6 + vec2(w.y*0.25, 0.0);
  float a = cCells(p, uTime*0.9);
  float b = cCells(p*1.37 + 4.1, -uTime*0.7);
  return a*b;
}
`;

// Каустика: поверх освещения добавляем яркие подвижные блики под водой.
export function addCaustics(mat, strength = 0.55) {
  if (!G.caustics) return mat;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = G.uTime; sh.uniforms.uLampColor = G.uLampColor;
    sh.uniforms.uLampPower = G.uLampPower; sh.uniforms.uWaterTop = G.uWaterTop;
    sh.vertexShader = 'varying vec3 vCWorld; varying vec3 vCNorm;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n vCWorld = (modelMatrix * vec4(transformed,1.0)).xyz; vCNorm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = CAUSTIC_GLSL + sh.fragmentShader.replace('#include <dithering_fragment>',
      `#include <dithering_fragment>
       float under = step(vCWorld.y, uWaterTop);
       float up = clamp(0.35 + 0.65*vCNorm.y, 0.0, 1.0);
       gl_FragColor.rgb += uLampColor * caustic(vCWorld) * ${strength.toFixed(2)} * uLampPower * under * up;`);
  };
  mat.customProgramCacheKey = () => 'caustic' + strength;
  return mat;
}

// Покачивание растений: смещение растёт с высотой над основанием.
export function addSway(mat, amount = 0.09) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = G.uTime; sh.uniforms.uCurrent = G.uCurrent;
    sh.vertexShader = 'uniform float uTime; uniform float uCurrent;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `#include <begin_vertex>
       float sh_h = max(position.y, 0.0);
       float sh_seed = modelMatrix[3].x*3.7 + modelMatrix[3].z*5.3;
       float sh_k = ${amount.toFixed(3)} * sh_h * sh_h * (0.35 + 0.65*uCurrent);
       transformed.x += sin(uTime*1.25 + sh_h*1.4 + sh_seed) * sh_k;
       transformed.z += cos(uTime*0.95 + sh_h*1.1 + sh_seed*1.3) * sh_k * 0.6;`);
  };
  mat.customProgramCacheKey = () => 'sway' + amount;
  return mat;
}

// Изгиб тела рыбки (волна от головы к хвосту) и трепет плавников.
export function addFishBend(mat, u, isFin) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: G.uTime, uPhase: u.uPhase, uFreq: u.uFreq, uAmp: u.uAmp, uTurn: u.uTurn });
    sh.vertexShader = 'uniform float uTime, uPhase, uFreq, uAmp, uTurn;\n' + (isFin ? 'attribute float flex;\n' : '') +
      sh.vertexShader.replace('#include <begin_vertex>',
        `#include <begin_vertex>
         float fb_s = clamp((0.32 - position.x) / 0.9, 0.0, 1.0);
         float fb_w = sin(uTime*uFreq + uPhase - position.x*6.5) * uAmp * fb_s * fb_s + uTurn * fb_s * fb_s;
         transformed.z += fb_w;
         ${isFin ? 'transformed.z += sin(uTime*uFreq*1.6 + uPhase + position.y*9.0 + position.x*4.0) * 0.03 * flex * (0.4 + uAmp*12.0);' : ''}`);
  };
  mat.customProgramCacheKey = () => isFin ? 'fishfin' : 'fishbody';
  return mat;
}

// Небольшие утилиты
export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

// Детерминированный шум для процедурных моделей
export function hash3(x, y, z) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
export function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  let r = 0;
  for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const h = hash3(xi + dx, yi + dy, zi + dz);
    r += h * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  }
  return r;
}

export function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
