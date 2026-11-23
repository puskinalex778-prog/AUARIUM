// Процедурные 3D-модели всех 23 видов рыб/сомиков и пресноводного крабика.
// Тело строится сечениями вдоль оси X (нос в +X), плавники — гибкие сетки с атрибутом flex.
// Окраска — уникальные процедурные canvas-текстуры для каждого вида и вариации.
import * as THREE from 'three';
import { addFishBend, canvasTex } from './fx.js';

const texCache = new Map();
const geoCache = new Map();

const GUPPY_TAILS = {
  fire:   ['#ff6a14', '#ffd23a', '#ff3d00'],
  blue:   ['#2a6dff', '#7ee8ff', '#1a3fbf'],
  red:    ['#e3203f', '#ff9db0', '#a3001b'],
  violet: ['#8d4dff', '#ffc6ff', '#5a22c0'],
  cobra:  ['#3fae4a', '#f7e04a', '#1c6b2a'],
  tiger:  ['#ff7a10', '#1a1a1a', '#39ff6a'],
  orange: ['#ff8a00', '#ffe14a', '#101010'],
};

// --- Профили тела ---------------------------------------------------------
function profile(t, mode = 'normal') {
  if (mode === 'disc') {
    // Круглый дисковидный силуэт (дискус)
    const s = Math.sin(Math.PI * Math.pow(t, 0.85));
    return 0.14 + 0.86 * Math.pow(Math.max(s, 0), 0.72);
  }
  if (mode === 'diamond') {
    // Высокий ромбовидный силуэт (скалярия, тернеция)
    const s = t < 0.42 ? Math.sin(Math.PI / 2 * t / 0.42) : Math.cos(Math.PI / 2 * (t - 0.42) / 0.58);
    return 0.14 + 0.86 * Math.pow(Math.max(s, 0), 0.78);
  }
  if (mode === 'plump') {
    // Округлый пухлый (золотая рыбка, пецилия)
    const s = t < 0.4 ? Math.sin(Math.PI / 2 * t / 0.4) : Math.cos(Math.PI / 2 * (t - 0.4) / 0.6);
    return 0.18 + 0.82 * Math.pow(Math.max(s, 0), 0.7);
  }
  if (mode === 'catfish') {
    // Широкая голова, сужающийся к хвосту (анциструс, коридорас, отоцинклюс)
    const s = t < 0.28 ? Math.sin(Math.PI / 2 * t / 0.28) : Math.cos(Math.PI / 2 * (t - 0.28) / 0.72);
    return 0.18 + 0.82 * Math.pow(Math.max(s, 0), 0.9);
  }
  const s = t < 0.34 ? Math.sin(Math.PI / 2 * t / 0.34) : Math.cos(Math.PI / 2 * (t - 0.34) / 0.66);
  return 0.16 + 0.84 * Math.pow(Math.max(s, 0), 0.85);
}

const X0 = 0.5, XP = -0.3;
const xAt = (t) => X0 + (XP - X0) * t;

function buildBody(sh) {
  const { H, W, belly, mode = 'normal', flatBottom = false } = sh;
  const N = 26, M = 18;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N, x = xAt(t);
    const pr = profile(t, mode);
    const h = H * pr;
    const w = W * pr * (mode === 'catfish' ? (1.15 - 0.45 * t) : (1 - 0.25 * t));
    const yc = -belly * h * (1 - t) * 0.35;
    for (let j = 0; j <= M; j++) {
      const a = (j / M) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const bellyBulge = c < 0 ? (flatBottom ? 0.42 : (1 + belly * 0.25 * (1 - t))) : 1;
      pos.push(x, yc + h * c * bellyBulge, w * s);
      uv.push(t * 0.9, (1 - c) / 2);
    }
  }
  const tip = pos.length / 3;
  pos.push(X0 + (mode === 'catfish' ? 0.02 : 0.04), flatBottom ? -H * 0.12 : -belly * H * 0.05, 0);
  uv.push(0, 0.5);
  const end = pos.length / 3;
  pos.push(XP - 0.02, 0, 0);
  uv.push(0.9, 0.5);

  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = i * (M + 1) + j, b = a + M + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  for (let j = 0; j < M; j++) {
    idx.push(tip, j + 1, j);
    const o = N * (M + 1);
    idx.push(end, o + j, o + j + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function topY(t, sh) {
  const pr = profile(t, sh.mode);
  return -sh.belly * sh.H * pr * (1 - t) * 0.35 + sh.H * pr;
}
function botY(t, sh) {
  const pr = profile(t, sh.mode);
  const mul = sh.flatBottom ? 0.42 : (1 + sh.belly * 0.25 * (1 - t));
  return -sh.belly * sh.H * pr * (1 - t) * 0.35 - sh.H * pr * mul;
}

function finGrid(nd, ns, f, flexFn) {
  const pos = [], uv = [], flex = [], idx = [];
  for (let i = 0; i <= nd; i++) for (let j = 0; j <= ns; j++) {
    const d = i / nd, s = j / ns;
    const [x, y, z = 0] = f(d, s);
    pos.push(x, y, z); uv.push(d, s); flex.push(flexFn(d, s));
  }
  for (let i = 0; i < nd; i++) for (let j = 0; j < ns; j++) {
    const a = i * (ns + 1) + j, b = a + ns + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('flex', new THREE.Float32BufferAttribute(flex, 1));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function mergeGeoms(list) {
  let total = 0; list.forEach(g => total += g.attributes.position.count);
  const names = Object.keys(list[0].attributes);
  const out = new THREE.BufferGeometry();
  for (const n of names) {
    const size = list[0].attributes[n].itemSize, arr = new Float32Array(total * size);
    let o = 0; for (const g of list) { arr.set(g.attributes[n].array, o); o += g.attributes[n].array.length; }
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  }
  const idx = []; let base = 0;
  for (const g of list) { for (const i of g.index.array) idx.push(i + base); base += g.attributes.position.count; }
  out.setIndex(idx); return out;
}

// --- Формы для всех 23 видов рыб/сомиков ----------------------------------
function shapeFor(spId, sex) {
  const f = sex === 'f';
  switch (spId) {
    case 'guppy':
      return f ? { H: 0.15, W: 0.085, belly: 0.55, tail: 'round', tailL: 0.24, tailH: 0.14, dorsal: 'small' }
               : { H: 0.115, W: 0.07, belly: 0.1, tail: 'fan', tailL: 0.42, tailH: 0.3, dorsal: 'long' };
    case 'endler':
      return f ? { H: 0.15, W: 0.085, belly: 0.5, tail: 'round', tailL: 0.22, tailH: 0.13, dorsal: 'small' }
               : { H: 0.12, W: 0.07, belly: 0.1, tail: 'round', tailL: 0.3, tailH: 0.2, dorsal: 'small' };
    case 'neon':
    case 'cardinal':
    case 'ember_tetra':
      return { H: 0.13, W: 0.07, belly: f ? 0.35 : 0.15, tail: 'fork', tailL: 0.22, tailH: 0.15, dorsal: 'small' };
    case 'danio':
      return { H: 0.11, W: 0.07, belly: f ? 0.35 : 0.1, tail: 'fork', tailL: 0.26, tailH: 0.16, dorsal: 'small' };
    case 'cherry_barb':
      return { H: 0.155, W: 0.085, belly: f ? 0.4 : 0.2, mode: 'plump', tail: 'fork', tailL: 0.24, tailH: 0.16, dorsal: 'small' };
    case 'rasbora':
      return { H: 0.155, W: 0.07, belly: f ? 0.3 : 0.12, tail: 'fork', tailL: 0.24, tailH: 0.16, dorsal: 'small' };
    case 'swordtail':
      return f ? { H: 0.155, W: 0.085, belly: 0.45, tail: 'round', tailL: 0.25, tailH: 0.16, dorsal: 'small' }
               : { H: 0.14, W: 0.08, belly: 0.15, tail: 'sword', tailL: 0.55, tailH: 0.17, dorsal: 'sail' };
    case 'platy':
      return { H: f ? 0.20 : 0.18, W: f ? 0.10 : 0.09, belly: f ? 0.58 : 0.22, mode: 'plump', tail: 'fan', tailL: 0.24, tailH: 0.18, dorsal: f ? 'small' : 'sail' };
    case 'molly':
      return { H: 0.165, W: 0.09, belly: f ? 0.52 : 0.18, tail: 'fan', tailL: 0.28, tailH: 0.22, dorsal: f ? 'small' : 'sail' };
    case 'pearl_gourami':
      return { H: 0.21, W: 0.075, belly: f ? 0.34 : 0.16, mode: 'diamond', tail: 'round', tailL: 0.28, tailH: 0.19, dorsal: f ? 'small' : 'long', anal: 'long', ventral: 'feelers' };
    case 'dwarf_gourami':
      return { H: 0.23, W: 0.085, belly: f ? 0.38 : 0.18, mode: 'plump', tail: 'round', tailL: 0.22, tailH: 0.18, dorsal: f ? 'small' : 'long', anal: 'long', ventral: 'feelers' };
    case 'betta':
      return f ? { H: 0.145, W: 0.078, belly: 0.42, tail: 'round', tailL: 0.24, tailH: 0.17, dorsal: 'small', anal: 'long' }
               : { H: 0.135, W: 0.075, belly: 0.12, tail: 'veil', tailL: 0.54, tailH: 0.42, dorsal: 'veil', anal: 'veil', ventral: 'feelers' };
    case 'angelfish':
      return { H: 0.36, W: 0.06, belly: 0.15, mode: 'diamond', tail: 'angel', tailL: 0.36, tailH: 0.26, dorsal: 'tall', anal: 'tall', ventral: 'feelers' };
    case 'discus':
      return { H: 0.42, W: 0.072, belly: 0.05, mode: 'disc', tail: 'round', tailL: 0.22, tailH: 0.2, dorsal: 'disc', anal: 'disc' };
    case 'goldfish':
      return { H: 0.25, W: 0.145, belly: f ? 0.62 : 0.48, mode: 'plump', tail: 'doubleveil', tailL: 0.44, tailH: 0.34, dorsal: 'sail', anal: 'normal' };
    case 'apistogramma':
      return { H: f ? 0.155 : 0.17, W: 0.082, belly: f ? 0.36 : 0.12, tail: f ? 'round' : 'fan', tailL: f ? 0.22 : 0.34, tailH: f ? 0.15 : 0.24, dorsal: f ? 'small' : 'crest', anal: 'long' };
    case 'rainbowfish':
      return { H: f ? 0.175 : 0.21, W: 0.082, belly: f ? 0.28 : 0.15, mode: 'diamond', tail: 'fork', tailL: 0.26, tailH: 0.18, dorsal: f ? 'small' : 'sail', anal: 'long' };
    case 'ternetzi':
      return { H: 0.24, W: 0.068, belly: f ? 0.35 : 0.2, mode: 'diamond', tail: 'fork', tailL: 0.24, tailH: 0.18, dorsal: 'tall_mid', anal: 'long' };
    case 'ancistrus':
      return { H: 0.12, W: f ? 0.17 : 0.16, belly: 0.0, mode: 'catfish', flatBottom: true, tail: 'round', tailL: 0.26, tailH: 0.16, dorsal: 'sail', ventral: 'wide', barbels: !f ? 'bristles' : 'none' };
    case 'corydoras':
      return { H: f ? 0.185 : 0.165, W: f ? 0.13 : 0.11, belly: 0.0, mode: 'catfish', flatBottom: true, tail: 'fork', tailL: 0.24, tailH: 0.17, dorsal: 'small', ventral: 'wide', barbels: 'whiskers' };
    case 'otocinclus':
      return { H: 0.105, W: 0.09, belly: 0.0, mode: 'catfish', flatBottom: true, tail: 'fork', tailL: 0.22, tailH: 0.14, dorsal: 'small', ventral: 'wide' };
    default:
      return { H: 0.13, W: 0.075, belly: 0.2, tail: 'fork', tailL: 0.24, tailH: 0.16, dorsal: 'small' };
  }
}

function buildFins(sh) {
  const { H, tail, tailL, tailH, dorsal = 'small', anal = 'normal', ventral = 'none' } = sh;
  const fins = [];

  // 1. Хвостовой плавник
  if (tail === 'doubleveil') {
    // Золотая рыбка: раздвоенный пышный вуалевый хвост
    for (const side of [-1, 1]) {
      fins.push(finGrid(8, 8, (d, s) => {
        const k = s * 2 - 1;
        const hh = 0.05 + tailH * Math.pow(d, 0.7);
        const x = XP - tailL * d * (0.72 + 0.28 * Math.abs(k));
        const z = side * d * (0.04 + 0.1 * Math.abs(k));
        return [x + 0.03, k * hh - d * 0.05, z];
      }, (d) => d));
    }
  } else {
    fins.push(finGrid(10, 10, (d, s) => {
      const k = s * 2 - 1; // -1 низ … +1 верх
      let x, y;
      if (tail === 'veil') {
        // Пышный вуалевый полумесяц петушка
        const ang = k * Math.PI * 0.47;
        const rad = tailL * (0.85 + 0.15 * Math.cos(k * 2.2));
        x = XP + 0.04 - Math.cos(ang) * rad * Math.pow(d, 0.8);
        y = Math.sin(ang) * tailH * 1.15 * Math.pow(d, 0.75);
      } else if (tail === 'sword') {
        // Меченосец: нижний луч вытянут в острый меч!
        const isSword = k < -0.58;
        const swordExt = isSword ? Math.pow((-k - 0.58) / 0.42, 0.7) * 0.48 : 0;
        const len = 0.24 + swordExt;
        const hh = 0.045 + tailH * Math.pow(d, 0.8);
        x = XP + 0.03 - len * d * (1 - 0.1 * k * k);
        y = k * hh - (isSword ? 0.03 * d : 0);
      } else if (tail === 'angel') {
        // Скалярия: длинные верхняя и нижняя нити хвоста
        const tip = Math.pow(Math.abs(k), 3.2) * 0.26;
        const hh = 0.05 + (tailH + tip * 0.5) * d;
        x = XP + 0.03 - (tailL * 0.65 + tip) * d;
        y = k * hh;
      } else if (tail === 'fan') {
        const hh = 0.05 + tailH * Math.pow(d, 0.65);
        x = XP + 0.03 - tailL * d * (1 - 0.08 * k * k);
        y = k * hh;
      } else if (tail === 'round') {
        const hh = 0.04 + tailH * Math.sin(Math.min(d * 1.3, 1) * Math.PI / 2);
        x = XP + 0.03 - tailL * d * (1 - 0.25 * k * k);
        y = k * hh;
      } else { // fork
        const hh = 0.035 + tailH * d;
        x = XP + 0.03 - tailL * d * (0.55 + 0.45 * Math.abs(k));
        y = k * hh;
      }
      return [x, y, 0];
    }, (d) => d));
  }

  // 2. Спинной плавник
  if (dorsal === 'tall') {
    // Скалярия: огромный высокий треугольный спинной парус
    fins.push(finGrid(8, 6, (d, s) => {
      const t = 0.35 + 0.52 * d;
      const x0 = xAt(t), y0 = topY(t, sh) - 0.015;
      const peak = Math.pow(Math.sin(Math.PI * Math.min(d * 1.15, 1)), 0.7) * (1 - 0.25 * d);
      return [x0 - s * (0.28 + 0.25 * (1 - d)), y0 + s * (H * 1.65) * Math.max(peak, 0.04), 0];
    }, (d, s) => s));
  } else if (dorsal === 'disc') {
    // Дискус: сплошной окаймляющий спинной плавник вдоль спины
    fins.push(finGrid(10, 4, (d, s) => {
      const t = 0.22 + 0.72 * d;
      const x0 = xAt(t), y0 = topY(t, sh) - 0.015;
      const h = H * 0.32 * Math.sin(Math.PI * Math.pow(d, 0.8));
      return [x0 - s * 0.08, y0 + s * Math.max(h, 0.02), 0];
    }, (d, s) => s));
  } else if (dorsal === 'veil') {
    // Петушок: пышный струящийся спинной плавник
    fins.push(finGrid(10, 6, (d, s) => {
      const t = 0.36 + 0.54 * d;
      const x0 = xAt(t), y0 = topY(t, sh) - 0.01;
      const h = H * 2.15 * Math.pow(Math.sin(Math.PI * (0.1 + d * 0.85)), 0.55);
      return [x0 - s * 0.24, y0 + s * h, 0];
    }, (d, s) => s));
  } else if (dorsal === 'crest') {
    // Апистограмма: зубчатый пламенный гребень
    fins.push(finGrid(12, 5, (d, s) => {
      const t = 0.28 + 0.62 * d;
      const x0 = xAt(t), y0 = topY(t, sh) - 0.01;
      const spike = 0.75 + 0.35 * Math.abs(Math.sin(d * Math.PI * 5));
      const env = Math.sin(Math.PI * (0.15 + d * 0.8));
      return [x0 - s * 0.14, y0 + s * H * 1.25 * env * spike, 0];
    }, (d, s) => s));
  } else {
    const dl = dorsal === 'long' || dorsal === 'sail' || dorsal === 'tall_mid';
    const ta = dorsal === 'sail' ? 0.34 : dorsal === 'tall_mid' ? 0.42 : dl ? 0.42 : 0.5;
    const tb = dorsal === 'sail' ? 0.82 : dl ? 0.82 : 0.68;
    const hd = dorsal === 'tall_mid' ? H * 1.1 : dorsal === 'sail' ? H * 1.05 : dl ? H * 1.25 : H * 0.75;
    fins.push(finGrid(7, 4, (d, s) => {
      const t = ta + (tb - ta) * d, x = xAt(t);
      const y0 = topY(t, sh) - 0.01;
      const shape = dl ? Math.pow(Math.sin(Math.PI * Math.min(d * 0.9 + 0.1, 1)), 0.5) : Math.sin(Math.PI * d) * (1 - 0.3 * d);
      return [x - s * (dl ? 0.14 : 0.06), y0 + s * hd * Math.max(shape, 0.05), 0];
    }, (d, s) => s));
  }

  // 3. Анальный плавник
  if (anal === 'tall') {
    // Скалярия: огромный нижний парус
    fins.push(finGrid(8, 6, (d, s) => {
      const t = 0.38 + 0.5 * d;
      const x0 = xAt(t), y0 = botY(t, sh) + 0.015;
      const peak = Math.pow(Math.sin(Math.PI * Math.min(d * 1.15, 1)), 0.7) * (1 - 0.2 * d);
      return [x0 - s * (0.26 + 0.22 * (1 - d)), y0 - s * (H * 1.6) * Math.max(peak, 0.04), 0];
    }, (d, s) => s));
  } else if (anal === 'disc') {
    fins.push(finGrid(10, 4, (d, s) => {
      const t = 0.32 + 0.62 * d;
      const x0 = xAt(t), y0 = botY(t, sh) + 0.015;
      const h = H * 0.3 * Math.sin(Math.PI * Math.pow(d, 0.8));
      return [x0 - s * 0.08, y0 - s * Math.max(h, 0.02), 0];
    }, (d, s) => s));
  } else if (anal === 'veil') {
    fins.push(finGrid(10, 6, (d, s) => {
      const t = 0.34 + 0.58 * d;
      const x0 = xAt(t), y0 = botY(t, sh) + 0.01;
      const h = H * 2.25 * Math.pow(Math.sin(Math.PI * (0.12 + d * 0.85)), 0.55);
      return [x0 - s * 0.22, y0 - s * h, 0];
    }, (d, s) => s));
  } else {
    const al = anal === 'long';
    fins.push(finGrid(6, 4, (d, s) => {
      const t = (al ? 0.4 : 0.58) + (al ? 0.48 : 0.24) * d, x = xAt(t);
      const y0 = botY(t, sh) + 0.01;
      return [x - s * (al ? 0.1 : 0.05), y0 - s * H * (al ? 0.85 : 0.55) * Math.sin(Math.PI * d), 0];
    }, (d, s) => s));
  }

  // 4. Брюшные плавники / длинные усики (гурами, лялиус, скалярия, петушок) или широкие донные плавники сомиков
  if (ventral === 'feelers') {
    for (const side of [1, -1]) {
      fins.push(finGrid(6, 2, (d, s) => {
        const y0 = botY(0.32, sh) + 0.01;
        return [xAt(0.32) - d * 0.36, y0 - d * (H * 1.15) + (s - 0.5) * 0.018, side * (0.02 + d * 0.05)];
      }, (d) => d));
    }
  } else if (ventral === 'wide') {
    for (const side of [1, -1]) {
      fins.push(finGrid(4, 3, (d, s) => {
        const y0 = botY(0.28, sh) + 0.02;
        return [0.22 - d * 0.2, y0 - s * 0.02, side * (sh.W * 0.85 + d * 0.18)];
      }, (d) => d * 0.7));
    }
  }

  // 5. Грудные плавники
  for (const side of [1, -1]) {
    const g = finGrid(3, 3, (d, s) => [
      0.26 - d * (sh.flatBottom ? 0.16 : 0.13),
      (sh.flatBottom ? -0.04 : -0.02) - s * 0.05 + d * 0.02,
      side * (sh.W * 0.92 + d * (sh.flatBottom ? 0.12 : 0.06)),
    ], (d) => d);
    fins.push(g);
  }

  return mergeGeoms(fins);
}

function buildEyes(sh) {
  const { H, W, belly, mode, flatBottom, barbels } = sh;
  const t = mode === 'catfish' ? 0.18 : 0.13;
  const x = xAt(t), pr = profile(t, mode), h = H * pr, w = W * pr;
  const r = Math.max(0.032, Math.min(0.068, H * (mode === 'disc' || mode === 'diamond' ? 0.17 : 0.28)));
  const parts = [];
  for (const side of [1, -1]) {
    const g = new THREE.SphereGeometry(r, 10, 8);
    const ey = flatBottom ? h * 0.45 : (-belly * h * 0.28 + h * 0.22);
    g.translate(x, ey, side * w * (flatBottom ? 0.72 : 0.82));
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const nz = g.attributes.normal.getZ(i) * side;
      uv.setXY(i, nz > 0.72 ? 0.975 : 0.945, 0.5);
    }
    g.deleteAttribute('normal');
    parts.push(g);
  }
  // Усики сомиков (коридорас / анциструс самец)
  if (barbels === 'whiskers') {
    for (const side of [1, -1]) {
      const b = new THREE.CylinderGeometry(0.005, 0.01, 0.11, 5);
      b.rotateZ(-1.1);
      b.rotateY(side * 0.5);
      b.translate(X0 + 0.01, -H * 0.22, side * 0.04);
      const uv = b.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.2, 0.5);
      b.deleteAttribute('normal');
      parts.push(b);
    }
  } else if (barbels === 'bristles') {
    for (let k = -2; k <= 2; k++) {
      const b = new THREE.CylinderGeometry(0.004, 0.008, 0.07, 4);
      b.rotateZ(-0.7 - Math.abs(k) * 0.12);
      b.translate(X0 + 0.015, 0.01, k * 0.025);
      const uv = b.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.3, 0.4);
      b.deleteAttribute('normal');
      parts.push(b);
    }
  }
  const m = mergeGeoms(parts);
  m.computeVertexNormals();
  return m;
}

// --- Детерминированный псевдослучайный генератор для текстур ---------------
function prng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// --- Окраска тела (уникальная для каждого из 23 видов) --------------------
function bodyTexture(spId, variant, sex) {
  const key = `b_${spId}_${variant}_${sex}`;
  if (texCache.has(key)) return texCache.get(key);
  const rnd = prng((spId.charCodeAt(0) * 97 + variant.charCodeAt(0) * 31 + (sex === 'm' ? 7 : 19)) | 0);
  const tex = canvasTex(256, 128, (c, w, h) => {
    const U = (u) => u * w, V = (v) => v * h;
    const grad = (stops) => { const g = c.createLinearGradient(0, 0, 0, h); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
    const hgrad = (stops) => { const g = c.createLinearGradient(0, 0, U(0.92), 0); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
    let irisColor = '#d8b34a';

    if (spId === 'guppy' || spId === 'endler') {
      c.fillStyle = grad([[0, '#6f7a68'], [0.35, '#a8b0a0'], [0.65, '#dfe3d6'], [1, '#f2f1e8']]); c.fillRect(0, 0, w, h);
      const tc = GUPPY_TAILS[variant] || GUPPY_TAILS.fire;
      if (sex === 'm') {
        for (let i = 0; i < 9; i++) {
          c.fillStyle = tc[i % 3]; c.globalAlpha = 0.78;
          c.beginPath(); c.ellipse(U(0.42 + rnd() * 0.44), V(0.24 + rnd() * 0.5), 7 + rnd() * 10, 5 + rnd() * 7, 0, 0, Math.PI * 2); c.fill();
        }
        c.globalAlpha = 1;
        const g2 = c.createLinearGradient(U(0.58), 0, U(0.9), 0); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, tc[0]);
        c.fillStyle = g2; c.fillRect(U(0.58), V(0.18), U(0.32), V(0.64));
      } else {
        const g2 = c.createLinearGradient(U(0.65), 0, U(0.9), 0); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(1, tc[0] + '66');
        c.fillStyle = g2; c.fillRect(U(0.65), 0, U(0.25), h);
        c.fillStyle = 'rgba(40,40,40,0.35)'; c.beginPath(); c.ellipse(U(0.42), V(0.68), 12, 8, 0, 0, Math.PI * 2); c.fill();
      }
    } else if (spId === 'neon' || spId === 'cardinal') {
      c.fillStyle = grad([[0, '#2f3a2e'], [0.3, '#4c5a46'], [0.55, '#c9cfd6'], [1, '#eef1f5']]); c.fillRect(0, 0, w, h);
      c.fillStyle = '#e0162b';
      c.beginPath(); c.moveTo(U(spId === 'cardinal' ? 0.08 : 0.42), V(0.5)); c.lineTo(U(0.9), V(0.44)); c.lineTo(U(0.9), V(0.95)); c.lineTo(U(spId === 'cardinal' ? 0.12 : 0.5), V(0.92)); c.closePath(); c.fill();
      const sg = c.createLinearGradient(0, V(0.28), 0, V(0.5)); sg.addColorStop(0, 'rgba(60,200,255,0)'); sg.addColorStop(0.3, '#39e0ff'); sg.addColorStop(0.7, '#1f7dff'); sg.addColorStop(1, 'rgba(20,90,255,0)');
      c.fillStyle = sg; c.fillRect(U(0.1), V(0.28), U(0.74), V(0.22));
      irisColor = '#40d8ff';
    } else if (spId === 'danio') {
      const gold = variant === 'gold';
      c.fillStyle = grad([[0, gold ? '#d9b25a' : '#cbbf95'], [0.5, gold ? '#f4dc9a' : '#efe5c4'], [1, '#fbf6e6']]); c.fillRect(0, 0, w, h);
      const stripe = gold ? '#c98a2a' : '#22408e';
      for (let i = 0; i < 4; i++) {
        const v = 0.3 + i * 0.13;
        c.fillStyle = stripe; c.globalAlpha = 0.9;
        c.beginPath(); c.moveTo(U(0.18), V(v)); c.bezierCurveTo(U(0.4), V(v - 0.02), U(0.7), V(v + 0.01), U(0.9), V(0.48 + (v - 0.5) * 0.6));
        c.lineTo(U(0.9), V(0.48 + (v - 0.5) * 0.6 + 0.05)); c.bezierCurveTo(U(0.7), V(v + 0.06), U(0.4), V(v + 0.045), U(0.18), V(v + 0.05)); c.fill();
      }
      c.globalAlpha = 1;
    } else if (spId === 'cherry_barb') {
      const alb = variant === 'albino';
      if (sex === 'm') {
        c.fillStyle = grad(alb ? [[0, '#ff9a8a'], [0.5, '#ff4d4d'], [1, '#ffc4b8']] : [[0, '#78101c'], [0.4, '#cf192e'], [0.75, '#e83a38'], [1, '#f49a80']]);
      } else {
        c.fillStyle = grad(alb ? [[0, '#f2c2a8'], [0.5, '#ffded0'], [1, '#fff2eb']] : [[0, '#785a3a'], [0.4, '#c49664'], [0.75, '#e8cda8'], [1, '#f7ecd8']]);
      }
      c.fillRect(0, 0, w, h);
      // Тёмная боковая полоса
      c.fillStyle = alb ? 'rgba(210,70,60,0.45)' : 'rgba(38,14,18,0.65)';
      c.fillRect(U(0.1), V(0.44), U(0.8), V(0.11));
      irisColor = '#ff6a4a';
    } else if (spId === 'rasbora') {
      c.fillStyle = grad([[0, '#a85a48'], [0.35, '#e68c6e'], [0.7, '#f5c0a4'], [1, '#f8e6da']]);
      c.fillRect(0, 0, w, h);
      // Знаменитый чёрный треугольный клин расборы!
      c.fillStyle = '#181a24';
      c.beginPath();
      c.moveTo(U(0.42), V(0.28));
      c.lineTo(U(0.9), V(0.47));
      c.lineTo(U(0.9), V(0.55));
      c.lineTo(U(0.5), V(0.68));
      c.closePath(); c.fill();
      // Оранжевая искра над клином
      c.fillStyle = 'rgba(255,140,60,0.55)';
      c.fillRect(U(0.36), V(0.24), U(0.36), V(0.08));
    } else if (spId === 'swordtail') {
      if (variant === 'green') c.fillStyle = grad([[0, '#3a6e42'], [0.45, '#72b86a'], [1, '#d8ecd0']]);
      else if (variant === 'black') c.fillStyle = grad([[0, '#14151a'], [0.55, '#2b2d36'], [1, '#484b56']]);
      else if (variant === 'kohaku') c.fillStyle = hgrad([[0, '#f24318'], [0.35, '#ff5924'], [0.42, '#f5f2eb'], [0.72, '#f5f2eb'], [0.78, '#f24318'], [1, '#e03010']]);
      else c.fillStyle = grad([[0, '#c82810'], [0.45, '#ff5518'], [0.85, '#ff8e38'], [1, '#ffd08a']]);
      c.fillRect(0, 0, w, h);
      if (variant === 'green') { c.fillStyle = '#e03224'; c.fillRect(U(0.15), V(0.46), U(0.75), V(0.08)); }
    } else if (spId === 'platy') {
      if (variant === 'tuxedo') {
        c.fillStyle = grad([[0, '#e85820'], [0.5, '#ff8f3a'], [1, '#ffe090']]); c.fillRect(0, 0, w, h);
        c.fillStyle = '#181a20'; c.fillRect(U(0.36), V(0.15), U(0.54), V(0.72));
      } else if (variant === 'coral') {
        c.fillStyle = grad([[0, '#c81c28'], [0.45, '#ff3a44'], [1, '#ff9888']]); c.fillRect(0, 0, w, h);
      } else {
        c.fillStyle = hgrad([[0, '#ffe248'], [0.45, '#ff9424'], [0.85, '#e83818'], [1, '#cc2010']]); c.fillRect(0, 0, w, h);
        if (variant === 'mickey') {
          c.fillStyle = '#181820';
          c.beginPath(); c.arc(U(0.82), V(0.5), 11, 0, 7); c.fill();
          c.beginPath(); c.arc(U(0.76), V(0.37), 6, 0, 7); c.fill();
          c.beginPath(); c.arc(U(0.76), V(0.63), 6, 0, 7); c.fill();
        }
      }
    } else if (spId === 'molly') {
      if (variant === 'dalmatian') {
        c.fillStyle = grad([[0, '#e0e2e6'], [0.5, '#f6f7f9'], [1, '#ffffff']]); c.fillRect(0, 0, w, h);
        c.fillStyle = '#14161a';
        for (let i = 0; i < 34; i++) { c.beginPath(); c.ellipse(U(0.08 + rnd() * 0.8), V(0.08 + rnd() * 0.84), 4 + rnd() * 9, 3 + rnd() * 7, rnd() * 3, 0, 7); c.fill(); }
      } else if (variant === 'gold') {
        c.fillStyle = grad([[0, '#cc8410'], [0.45, '#ffbe28'], [1, '#fff09a']]); c.fillRect(0, 0, w, h);
      } else {
        c.fillStyle = grad([[0, '#101218'], [0.5, '#1e222c'], [1, '#323742']]); c.fillRect(0, 0, w, h);
      }
    } else if (spId === 'pearl_gourami') {
      c.fillStyle = grad([[0, '#5c4e5a'], [0.38, '#a08c9a'], [0.7, '#d8c4cc'], [1, '#efe4e6']]); c.fillRect(0, 0, w, h);
      // Оранжево-красное горло у самца
      if (sex === 'm') {
        const tg = c.createRadialGradient(U(0.28), V(0.78), 4, U(0.28), V(0.78), 55);
        tg.addColorStop(0, '#ff4d18'); tg.addColorStop(0.6, 'rgba(255,105,40,0.7)'); tg.addColorStop(1, 'rgba(255,105,40,0)');
        c.fillStyle = tg; c.fillRect(0, V(0.45), U(0.6), V(0.55));
      }
      // Тёмная боковая полоса + перламутровые «жемчужины»
      c.fillStyle = 'rgba(25,22,28,0.6)'; c.fillRect(U(0.1), V(0.47), U(0.78), V(0.07));
      c.fillStyle = '#f6fbff';
      for (let x = U(0.2); x < U(0.88); x += 11) for (let y = 14; y < h - 14; y += 11) {
        c.globalAlpha = 0.68; c.beginPath(); c.arc(x + ((y % 22) ? 5 : 0), y, 3, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
    } else if (spId === 'dwarf_gourami') {
      if (sex === 'f') {
        // Самка лялиуса в природе скромная серебристо-перламутровая с едва заметными полосками
        c.fillStyle = grad([[0, '#8d9ca2'], [0.45, '#c6d2d8'], [0.8, '#e2e9ec'], [1, '#f2f5f6']]); c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(175,140,125,0.22)';
        for (let i = 0; i < 10; i++) { const x = U(0.18 + i * 0.072); c.fillRect(x, 0, 7, h); }
      } else if (variant === 'neon_blue') {
        c.fillStyle = grad([[0, '#1090d0'], [0.5, '#38d8ff'], [1, '#8af0ff']]); c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(255,70,30,0.35)'; c.fillRect(0, 0, U(0.9), V(0.22));
      } else if (variant === 'flame') {
        c.fillStyle = grad([[0, '#c82010'], [0.45, '#ff5018'], [1, '#ff9840']]); c.fillRect(0, 0, w, h);
      } else {
        // Классический полосатый бирюзово-огненный самец лялиуса!
        c.fillStyle = '#20c4e8'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#f03e24';
        for (let i = 0; i < 11; i++) {
          const x = U(0.16 + i * 0.068);
          c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 9, 0); c.lineTo(x - 6, h); c.lineTo(x - 15, h); c.closePath(); c.fill();
        }
        c.fillStyle = '#24b8e6'; c.fillRect(0, V(0.35), U(0.22), V(0.65));
      }
    } else if (spId === 'betta') {
      const pals = {
        royal_blue: ['#0a1e68', '#1c4ed8', '#38a8ff'],
        crimson:    ['#5e0412', '#c8122a', '#ff4858'],
        turquoise:  ['#084a54', '#14a6a8', '#52f0de'],
        koi:        ['#f5efe6', '#e83c18', '#141824'],
      };
      const pal = pals[variant] || pals.royal_blue;
      if (variant === 'koi') {
        c.fillStyle = pal[0]; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 14; i++) {
          c.fillStyle = i % 3 === 0 ? pal[2] : pal[1];
          c.beginPath(); c.ellipse(U(0.12 + rnd() * 0.75), V(0.15 + rnd() * 0.7), 12 + rnd() * 18, 9 + rnd() * 14, rnd() * 3, 0, 7); c.fill();
        }
      } else if (sex === 'f') {
        // Самка петушка мягче окрашена, часто с деликатными продольными полосками
        c.fillStyle = grad([[0, pal[0]], [0.5, pal[1]], [1, '#c8c4c0']]); c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(255,248,240,0.22)'; c.fillRect(U(0.12), V(0.34), U(0.75), V(0.1)); c.fillRect(U(0.12), V(0.56), U(0.75), V(0.1));
      } else {
        c.fillStyle = grad([[0, pal[0]], [0.45, pal[1]], [0.8, pal[2]], [1, pal[1]]]); c.fillRect(0, 0, w, h);
      }
      irisColor = '#7ee8ff';
    } else if (spId === 'angelfish') {
      if (variant === 'gold') {
        c.fillStyle = grad([[0, '#d89820'], [0.35, '#ffe07a'], [0.75, '#fff3c4'], [1, '#ffffff']]); c.fillRect(0, 0, w, h);
      } else if (variant === 'marble') {
        c.fillStyle = '#e8ecf0'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#181a20';
        for (let i = 0; i < 16; i++) { c.beginPath(); c.ellipse(U(0.1 + rnd() * 0.78), V(0.1 + rnd() * 0.8), 10 + rnd() * 20, 12 + rnd() * 22, rnd(), 0, 7); c.fill(); }
      } else if (variant === 'koi') {
        c.fillStyle = '#f4f2ec'; c.fillRect(0, 0, w, h);
        c.fillStyle = '#ff6818'; c.fillRect(0, 0, U(0.42), V(0.52));
        c.fillStyle = '#1a1c22';
        for (let i = 0; i < 8; i++) { c.beginPath(); c.ellipse(U(0.32 + rnd() * 0.52), V(0.2 + rnd() * 0.6), 10 + rnd() * 14, 12 + rnd() * 16, 0, 0, 7); c.fill(); }
      } else {
        // Классическая серебристая скалярия с 4 вертикальными чёрными полосами
        c.fillStyle = grad([[0, '#8ca0a8'], [0.45, '#d6e2e8'], [0.85, '#eff5f8'], [1, '#ffffff']]); c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(20,24,28,0.88)';
        for (const u of [0.14, 0.36, 0.6, 0.82]) c.fillRect(U(u), 0, U(0.08), h);
      }
      irisColor = '#e03020';
    } else if (spId === 'discus') {
      if (variant === 'pigeon') {
        c.fillStyle = grad([[0, '#d83814'], [0.5, '#ff6e28'], [1, '#ffd088']]); c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(255,245,230,0.65)'; c.lineWidth = 3;
        for (let y = 12; y < h - 10; y += 10) { c.beginPath(); c.moveTo(U(0.08), y); c.bezierCurveTo(U(0.35), y - 6, U(0.65), y + 6, U(0.88), y); c.stroke(); }
      } else if (variant === 'diamond') {
        c.fillStyle = grad([[0, '#0a4898'], [0.45, '#1ca4f0'], [0.85, '#3ad8ff'], [1, '#1268b8']]); c.fillRect(0, 0, w, h);
      } else {
        // Королевский бирюзовый дискус с волнистыми неоновыми полосами
        c.fillStyle = grad([[0, '#8c3a22'], [0.5, '#c86034'], [1, '#984020']]); c.fillRect(0, 0, w, h);
        c.strokeStyle = '#38e4ff'; c.lineWidth = 4.5;
        for (let y = 10; y < h - 8; y += 11) {
          c.beginPath(); c.moveTo(U(0.06), y);
          c.bezierCurveTo(U(0.3), y + Math.sin(y) * 7, U(0.6), y - Math.sin(y) * 7, U(0.88), y);
          c.stroke();
        }
      }
      irisColor = '#ff2818';
    } else if (spId === 'goldfish') {
      if (variant === 'calico') {
        c.fillStyle = '#f5f2ea'; c.fillRect(0, 0, w, h);
        const cs = ['#ff6210', '#1c2028', '#5882b8', '#ff9830'];
        for (let i = 0; i < 20; i++) {
          c.fillStyle = cs[i % 4];
          c.beginPath(); c.ellipse(U(0.1 + rnd() * 0.78), V(0.1 + rnd() * 0.8), 8 + rnd() * 16, 7 + rnd() * 14, rnd() * 3, 0, 7); c.fill();
        }
      } else if (variant === 'oranda') {
        c.fillStyle = grad([[0, '#f4f4f6'], [0.6, '#ffffff'], [1, '#eceef2']]); c.fillRect(0, 0, w, h);
        c.fillStyle = '#e82814'; c.fillRect(0, 0, U(0.24), V(0.55));
        c.beginPath(); c.ellipse(U(0.55), V(0.32), 26, 20, 0, 0, 7); c.fill();
      } else {
        c.fillStyle = grad([[0, '#d84c08'], [0.4, '#ff7a14'], [0.75, '#ffb438'], [1, '#ffe498']]); c.fillRect(0, 0, w, h);
      }
    } else if (spId === 'apistogramma') {
      c.fillStyle = grad(sex === 'm' ? [[0, '#4a6a78'], [0.45, '#8cb2c4'], [0.8, '#e8c474'], [1, '#f4e0a0']] : [[0, '#c89e20'], [0.5, '#f2cf46'], [1, '#fff0a0']]);
      c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(20,24,28,0.75)'; c.fillRect(U(0.1), V(0.46), U(0.76), V(0.08));
      // Щёчки-полоски
      c.fillStyle = '#ff6a18'; c.fillRect(U(0.05), V(0.56), U(0.18), V(0.12));
    } else if (spId === 'rainbowfish') {
      if (sex === 'f') {
        // Самка радужницы в природе серебристо-оливковая с лёгким золотистым отливом на хвосте
        c.fillStyle = hgrad([[0, '#788c84'], [0.45, '#a8b8aa'], [0.75, '#d4cc92'], [1, '#cfc080']]);
        c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(255,255,255,0.28)'; c.fillRect(0, V(0.65), U(0.9), V(0.35));
      } else if (variant === 'neon_dwarf') {
        c.fillStyle = grad([[0, '#1868c8'], [0.45, '#42b8ff'], [0.8, '#9ae6ff'], [1, '#e8f6ff']]); c.fillRect(0, 0, w, h);
      } else {
        // Самец радужницы Боэсмана: стально-голубой перед + огненно-золотой зад!
        c.fillStyle = hgrad([[0, '#2a588c'], [0.42, '#4888c8'], [0.54, '#f0a820'], [0.82, '#ff7a18'], [1, '#f05a10']]);
        c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(0, V(0.72), U(0.45), V(0.28));
      }
    } else if (spId === 'ternetzi') {
      const glowMap = {
        pink:   ['#ff5ca8', '#ff98cc', '#ffd2ea'],
        mint:   ['#20d898', '#68f2c0', '#c8ffea'],
        sun:    ['#ffb818', '#ffe052', '#fff6b0'],
        violet: ['#8c48ff', '#b88aff', '#e4d0ff'],
      };
      if (glowMap[variant]) {
        const gp = glowMap[variant];
        c.fillStyle = grad([[0, gp[0]], [0.5, gp[1]], [1, gp[2]]]); c.fillRect(0, 0, w, h);
      } else {
        c.fillStyle = hgrad([[0, '#c8d2dc'], [0.46, '#dce4ec'], [0.52, '#242830'], [1, '#1a1d24']]); c.fillRect(0, 0, w, h);
        c.fillStyle = '#181a20'; c.fillRect(U(0.24), V(0.1), U(0.07), V(0.75)); c.fillRect(U(0.4), V(0.1), U(0.07), V(0.8));
      }
    } else if (spId === 'ember_tetra') {
      c.fillStyle = grad([[0, '#c83408'], [0.4, '#ff6818'], [0.78, '#ffa848'], [1, '#ffe0a8']]); c.fillRect(0, 0, w, h);
      irisColor = '#ffaa30';
    } else if (spId === 'ancistrus') {
      if (variant === 'gold') {
        c.fillStyle = grad([[0, '#d89a28'], [0.5, '#f2c860'], [1, '#fae2a0']]); c.fillRect(0, 0, w, h);
        c.fillStyle = 'rgba(255,255,220,0.5)';
      } else {
        c.fillStyle = grad([[0, '#2a221c'], [0.5, '#3e332a'], [1, '#6a5a4c']]); c.fillRect(0, 0, w, h);
        c.fillStyle = '#c8b68e';
      }
      for (let i = 0; i < 65; i++) { c.beginPath(); c.arc(U(0.06 + rnd() * 0.84), V(0.06 + rnd() * 0.82), 2.5 + rnd() * 3.5, 0, 7); c.fill(); }
    } else if (spId === 'corydoras') {
      if (variant === 'bronze') {
        c.fillStyle = grad([[0, '#5a4428'], [0.45, '#9c7848'], [0.8, '#d4b888'], [1, '#efe0c0']]); c.fillRect(0, 0, w, h);
      } else if (variant === 'peppered') {
        c.fillStyle = grad([[0, '#6a6c64'], [0.5, '#a8aa9e'], [1, '#e6e4dc']]); c.fillRect(0, 0, w, h);
        c.fillStyle = '#262824';
        for (let i = 0; i < 45; i++) { c.beginPath(); c.ellipse(U(0.1 + rnd() * 0.78), V(0.1 + rnd() * 0.72), 3 + rnd() * 6, 3 + rnd() * 5, 0, 0, 7); c.fill(); }
      } else {
        // Коридорас панда: кремово-розовый с чёрной «маской» через глаз и пятном у хвоста!
        c.fillStyle = grad([[0, '#d8bfa8'], [0.5, '#f4dfd0'], [1, '#fcf2ea']]); c.fillRect(0, 0, w, h);
        c.fillStyle = '#18181c';
        c.fillRect(U(0.1), 0, U(0.11), h);
        c.beginPath(); c.ellipse(U(0.84), V(0.48), 14, 24, 0, 0, 7); c.fill();
        c.beginPath(); c.ellipse(U(0.5), V(0.14), 22, 16, 0, 0, 7); c.fill();
      }
    } else if (spId === 'otocinclus') {
      c.fillStyle = grad([[0, '#62684c'], [0.38, '#969c7c'], [0.6, '#e2e6dc'], [1, '#f4f6f0']]); c.fillRect(0, 0, w, h);
      c.fillStyle = '#242820'; c.fillRect(U(0.06), V(0.42), U(0.84), V(0.14));
    }

    // Деликатный блеск чешуи (для не-сомиков)
    if (!['ancistrus', 'corydoras', 'otocinclus'].includes(spId)) {
      c.globalAlpha = 0.1; c.strokeStyle = '#ffffff'; c.lineWidth = 1;
      for (let x = 22; x < U(0.88); x += 10) for (let y = 10; y < h - 8; y += 10) {
        c.beginPath(); c.arc(x + (y % 20 ? 5 : 0), y, 4, 0.3, 2.8); c.stroke();
      }
      c.globalAlpha = 1;
    }

    // Колонка глаз (u > 0.93)
    c.fillStyle = irisColor; c.fillRect(U(0.93), 0, U(0.03), h);
    c.fillStyle = '#050505'; c.fillRect(U(0.96), 0, U(0.04), h);
  });
  texCache.set(key, tex);
  return tex;
}

function emissiveTex(spId, variant) {
  const key = `e_${spId}_${variant}`;
  if (texCache.has(key)) return texCache.get(key);
  const t = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    if (spId === 'neon' || spId === 'cardinal') {
      const sg = c.createLinearGradient(0, h * 0.28, 0, h * 0.5);
      sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(0.45, '#2ac4ff'); sg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = sg; c.fillRect(w * 0.1, h * 0.28, w * 0.74, h * 0.22);
      c.fillStyle = '#40060a'; c.fillRect(w * (spId === 'cardinal' ? 0.12 : 0.48), h * 0.5, w * 0.42, h * 0.4);
    } else if (spId === 'ternetzi' && variant !== 'classic') {
      const col = { pink: '#6a1842', mint: '#0c5a3c', sun: '#6a4c08', violet: '#381470' }[variant] || '#000';
      c.fillStyle = col; c.fillRect(0, 0, w * 0.9, h);
    } else if (spId === 'ember_tetra') {
      c.fillStyle = '#4a1804'; c.fillRect(0, 0, w * 0.9, h);
    }
  });
  texCache.set(key, t);
  return t;
}

function finTexture(spId, variant, sex) {
  const key = `f_${spId}_${variant}_${sex}`;
  if (texCache.has(key)) return texCache.get(key);
  const rnd = prng((spId.charCodeAt(0) * 53 + variant.charCodeAt(0) * 17 + (sex === 'm' ? 3 : 11)) | 0);
  const tex = canvasTex(128, 64, (c, w, h) => {
    let a = '#d8e4e8', b = '#ffffff', alpha = 0.42;
    if (spId === 'guppy' || spId === 'endler') {
      const tc = GUPPY_TAILS[variant] || GUPPY_TAILS.fire;
      [a, b] = sex === 'm' ? [tc[0], tc[1]] : ['#c9c3a8', tc[0]];
      alpha = sex === 'm' ? 0.92 : 0.5;
    } else if (spId === 'neon' || spId === 'cardinal' || spId === 'otocinclus') {
      a = '#e8f0f0'; b = '#ffffff'; alpha = 0.3;
    } else if (spId === 'danio') {
      a = variant === 'gold' ? '#e7b864' : '#9fb0d8'; b = '#f4efe0'; alpha = 0.55;
    } else if (spId === 'cherry_barb') {
      a = sex === 'm' ? '#d92836' : '#d8a87a'; b = '#ff8a80'; alpha = 0.65;
    } else if (spId === 'rasbora') {
      a = '#f08858'; b = '#ffe0c0'; alpha = 0.55;
    } else if (spId === 'swordtail') {
      a = variant === 'black' ? '#20222a' : variant === 'green' ? '#7ec876' : '#ff5518';
      b = variant === 'black' ? '#404452' : '#ffaa44'; alpha = 0.8;
    } else if (spId === 'platy') {
      a = variant === 'tuxedo' ? '#1c1e26' : '#ff7828'; b = '#ffcf70'; alpha = 0.72;
    } else if (spId === 'molly') {
      a = variant === 'black' ? '#161820' : variant === 'gold' ? '#ffbe30' : '#d8dce0'; b = a; alpha = 0.8;
    } else if (spId === 'pearl_gourami') {
      a = '#9c8a98'; b = '#f2e8ee'; alpha = 0.72;
    } else if (spId === 'dwarf_gourami') {
      if (sex === 'f') { a = '#cfd8dc'; b = '#eef4f6'; alpha = 0.42; }
      else { a = variant === 'flame' ? '#ff5018' : '#24c4e8'; b = '#ff5430'; alpha = 0.78; }
    } else if (spId === 'betta') {
      const m = { royal_blue: ['#1848d8', '#44b8ff'], crimson: ['#c8122a', '#ff5268'], turquoise: ['#109a9c', '#62f8e4'], koi: ['#e83c18', '#f6f2ea'] }[variant] || ['#1848d8', '#44b8ff'];
      [a, b] = m; alpha = sex === 'm' ? 0.92 : 0.62;
    } else if (spId === 'angelfish') {
      a = variant === 'gold' ? '#f8d878' : variant === 'marble' ? '#30343c' : '#c8d6de';
      b = '#eff6f8'; alpha = 0.78;
    } else if (spId === 'discus') {
      a = variant === 'pigeon' ? '#ff6a28' : '#20b8f0'; b = '#a8f0ff'; alpha = 0.72;
    } else if (spId === 'goldfish') {
      a = variant === 'oranda' ? '#f8f8fc' : '#ff8a24'; b = '#fff0d0'; alpha = 0.78;
    } else if (spId === 'apistogramma') {
      if (sex === 'f') { a = '#e8c438'; b = '#fff0a0'; alpha = 0.65; }
      else { a = '#ff5a14'; b = '#ffd838'; alpha = 0.88; }
    } else if (spId === 'rainbowfish') {
      if (sex === 'f') { a = '#d4d8cc'; b = '#f0f2ea'; alpha = 0.45; }
      else { a = variant === 'neon_dwarf' ? '#ff4428' : '#ff8a18'; b = '#ffe058'; alpha = 0.78; }
    } else if (spId === 'ternetzi') {
      const m = { pink: '#ff74b8', mint: '#3ce8ac', sun: '#ffd038', violet: '#9e62ff' }[variant] || '#323640';
      a = m; b = '#eef4f8'; alpha = variant === 'classic' ? 0.6 : 0.72;
    } else if (spId === 'ember_tetra') {
      a = '#ff7220'; b = '#ffd8a0'; alpha = 0.55;
    } else if (spId === 'ancistrus') {
      a = variant === 'gold' ? '#eab848' : '#3a3028'; b = variant === 'gold' ? '#fce090' : '#6c5c4c'; alpha = 0.8;
    } else if (spId === 'corydoras') {
      a = variant === 'panda' ? '#24242a' : '#9c9278'; b = '#e4dcd0'; alpha = 0.65;
    }

    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, a); g.addColorStop(1, b);
    c.globalAlpha = alpha; c.fillStyle = g; c.fillRect(0, 0, w, h);

    // Лучи плавника
    c.globalAlpha = Math.min(1, alpha + 0.12); c.strokeStyle = 'rgba(255,255,255,0.35)';
    for (let y = 2; y < h; y += 5) { c.beginPath(); c.moveTo(0, h / 2 + (y - h / 2) * 0.2); c.lineTo(w, y); c.stroke(); }

    if ((spId === 'guppy' || spId === 'endler') && sex === 'm') {
      const tc = GUPPY_TAILS[variant] || GUPPY_TAILS.fire;
      for (let i = 0; i < 14; i++) { c.fillStyle = tc[2]; c.globalAlpha = 0.6; c.beginPath(); c.arc(30 + rnd() * 90, rnd() * h, 2 + rnd() * 4, 0, 7); c.fill(); }
    } else if (spId === 'danio') {
      c.globalAlpha = 0.7; c.fillStyle = variant === 'gold' ? '#c98a2a' : '#22408e';
      for (let i = 0; i < 3; i++) c.fillRect(0, h * (0.3 + i * 0.16), w, h * 0.06);
    } else if (spId === 'swordtail' && sex === 'm') {
      // Чёрная окантовка «меча» снизу хвоста
      c.globalAlpha = 0.9; c.fillStyle = '#141418'; c.fillRect(0, h * 0.84, w, h * 0.12);
    } else if (spId === 'pearl_gourami') {
      c.fillStyle = '#ffffff'; c.globalAlpha = 0.65;
      for (let i = 0; i < 18; i++) { c.beginPath(); c.arc(10 + rnd() * 105, rnd() * h, 2.5, 0, 7); c.fill(); }
    } else if (spId === 'apistogramma' && sex === 'm') {
      c.fillStyle = '#14161a'; c.globalAlpha = 0.75;
      for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(20 + rnd() * 95, rnd() * h, 2.5 + rnd() * 3, 0, 7); c.fill(); }
    } else if (spId === 'angelfish' && variant === 'silver') {
      c.fillStyle = 'rgba(20,24,28,0.55)'; c.globalAlpha = 0.8;
      c.fillRect(w * 0.2, 0, w * 0.14, h); c.fillRect(w * 0.55, 0, w * 0.12, h);
    }

    // Мягкий прозрачный край плавника
    c.globalCompositeOperation = 'destination-out';
    const e = c.createLinearGradient(w * 0.78, 0, w, 0);
    e.addColorStop(0, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,0.58)');
    c.globalAlpha = 1; c.fillStyle = e; c.fillRect(0, 0, w, h);
  });
  texCache.set(key, tex);
  return tex;
}

// Создаёт 3D-модель рыбки / сомика. Возвращает { group, uniforms, materials }
export function makeFishMesh(spId, variant = 'classic', sex = 'm', shadows = true) {
  const sh = shapeFor(spId, sex);
  const gk = `${spId}_${sex}`;
  if (!geoCache.has(gk)) {
    const body = mergeGeoms([buildBody(sh), buildEyes(sh)]);
    geoCache.set(gk, { body, fins: buildFins(sh) });
  }
  const geo = geoCache.get(gk);
  const u = { uPhase: { value: Math.random() * 6.28 }, uFreq: { value: 8 }, uAmp: { value: 0.03 }, uTurn: { value: 0 } };
  const bodyMat = addFishBend(new THREE.MeshStandardMaterial({
    map: bodyTexture(spId, variant, sex), roughness: 0.36, metalness: 0.14,
  }), u, false);
  if (spId === 'neon' || spId === 'cardinal' || (spId === 'ternetzi' && variant !== 'classic') || spId === 'ember_tetra') {
    bodyMat.emissiveMap = emissiveTex(spId, variant);
    bodyMat.emissive = new THREE.Color(1, 1, 1);
    bodyMat.emissiveIntensity = (spId === 'neon' || spId === 'cardinal') ? 0.9 : 0.55;
  }
  const finMat = addFishBend(new THREE.MeshStandardMaterial({
    map: finTexture(spId, variant, sex), transparent: true, side: THREE.DoubleSide, roughness: 0.48, depthWrite: false,
  }), u, true);
  const body = new THREE.Mesh(geo.body, bodyMat);
  const fins = new THREE.Mesh(geo.fins, finMat);
  body.castShadow = shadows;
  fins.renderOrder = 2;
  const group = new THREE.Group();
  group.add(body, fins);
  return { group, uniforms: u, materials: [bodyMat, finMat] };
}

// ================= ПРОЦЕДУРНАЯ 3D-МОДЕЛЬ ПРЕСНОВОДНОГО КРАБИКА =================
export function makeCrabMesh(variant = 'vampire', shadows = true, sex = 'm') {
  const palettes = {
    vampire:   { shell: 0x4b2468, top: 0xe6b832, claws: sex === 'm' ? 0x8e3ec4 : 0x623080, legs: 0x3b1e54, eye: 0xffe642 },
    red_devil: { shell: 0x2a1418, top: 0xd93218, claws: sex === 'm' ? 0xff4e1e : 0xb8381c, legs: 0x5c1a16, eye: 0xffc830 },
    rainbow:   { shell: 0x24588a, top: 0xe87a24, claws: sex === 'm' ? 0xf8ae44 : 0xc8823c, legs: 0xc94e22, eye: 0x181c22 },
  };
  const pal = palettes[variant] || palettes.vampire;
  const group = new THREE.Group();

  const shellMat = new THREE.MeshStandardMaterial({ color: pal.shell, roughness: 0.42, metalness: 0.15 });
  const topMat = new THREE.MeshStandardMaterial({ color: pal.top, roughness: 0.38, metalness: 0.18 });
  const clawMat = new THREE.MeshStandardMaterial({ color: pal.claws, roughness: 0.35, metalness: 0.15 });
  const legMat = new THREE.MeshStandardMaterial({ color: pal.legs, roughness: 0.5, metalness: 0.1 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: pal.eye, emissive: pal.eye, emissiveIntensity: 0.25, roughness: 0.15 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x050505 });

  const body = new THREE.Group();
  body.position.y = 0.17;
  group.add(body);

  // Панцирь (у самки чуть шире и округлее)
  const carGeo = new THREE.SphereGeometry(0.24, 16, 12);
  carGeo.scale(sex === 'f' ? 1.24 : 1.16, 0.52, sex === 'f' ? 1.02 : 0.95);
  const carapace = new THREE.Mesh(carGeo, shellMat);
  carapace.castShadow = shadows;
  body.add(carapace);

  // Яркая спинная пластина панциря
  const capGeo = new THREE.SphereGeometry(0.18, 14, 10);
  capGeo.scale(1.12, 0.28, 0.88);
  const cap = new THREE.Mesh(capGeo, topMat);
  cap.position.y = 0.075;
  body.add(cap);

  // Глаза на стебельках (смотрят в +Z — «лицо» краба вперёд)
  for (const side of [-1, 1]) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.09, 8), legMat);
    stalk.position.set(side * 0.11, 0.11, 0.19);
    stalk.rotation.z = -side * 0.22;
    stalk.rotation.x = 0.25;
    body.add(stalk);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), eyeMat);
    eye.position.set(side * 0.125, 0.155, 0.21);
    body.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 6), pupilMat);
    pupil.position.set(side * 0.128, 0.158, 0.235);
    body.add(pupil);
  }

  // Две сочленённые клешни (у самца ощутимо крупнее и ярче, как в природе!)
  const clawScale = sex === 'm' ? 1.22 : 0.78;
  const claws = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.21, -0.02, 0.15);
    pivot.scale.setScalar(clawScale);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.032, 0.18, 8), legMat);
    arm.rotation.x = Math.PI / 2; arm.rotation.z = side * 0.45;
    arm.position.set(side * 0.04, 0, 0.08);
    pivot.add(arm);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.072, 12, 10), clawMat);
    palm.scale.set(0.85, 0.72, 1.35);
    palm.position.set(side * 0.04, 0.01, 0.2);
    palm.castShadow = shadows;
    pivot.add(palm);
    const pincer = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.11, 8), topMat);
    pincer.rotation.x = Math.PI / 2;
    pincer.rotation.z = -side * 0.35;
    pincer.position.set(side * 0.01, -0.015, 0.28);
    pivot.add(pincer);
    body.add(pivot);
    claws.push({ pivot, side });
  }

  // 8 ходильных лапок (4 слева, 4 справа) с суставами для походки
  const legs = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const zOff = 0.08 - i * 0.075;
      const spread = (1.5 - i) * 0.22;
      const hip = new THREE.Group();
      hip.position.set(side * 0.23, -0.02, zOff);
      hip.rotation.y = side * spread;

      const femur = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.2, 6), legMat);
      femur.rotation.z = side * 1.12;
      femur.position.set(side * 0.09, 0.035, 0);
      hip.add(femur);

      const tibia = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.017, 0.24, 6), legMat);
      tibia.rotation.z = -side * 0.22;
      tibia.position.set(side * 0.21, -0.06, 0);
      hip.add(tibia);

      body.add(hip);
      legs.push({ hip, side, idx: i, baseY: side * spread });
    }
  }

  const materials = [shellMat, topMat, clawMat, legMat, eyeMat, pupilMat];
  return { group, body, claws, legs, materials };
}

// ================= ПРОЦЕДУРНАЯ 3D-МОДЕЛЬ ТРИТОНА =================
export function makeNewtMesh(variant = 'classic', shadows = true, sex = 'm') {
  const group = new THREE.Group();
  const rnd = prng(variant === 'dark' ? 41 : 17);
  const skinTex = canvasTex(256, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, variant === 'dark' ? '#2c2e22' : '#4a4e2c');
    g.addColorStop(0.52, variant === 'dark' ? '#3d402c' : '#65693a');
    g.addColorStop(0.62, '#e86e18');
    g.addColorStop(1, '#ff8e24');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(20,22,14,0.65)';
    for (let i = 0; i < 110; i++) {
      c.beginPath(); c.arc(rnd() * w, rnd() * h * 0.92, 1.5 + rnd() * 3.5, 0, 7); c.fill();
    }
  });
  const bodyMat = new THREE.MeshStandardMaterial({ map: skinTex, roughness: 0.32, metalness: 0.08 });
  const legMat = new THREE.MeshStandardMaterial({ color: variant === 'dark' ? 0x3b3d28 : 0x565a34, roughness: 0.4 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xc99c38, roughness: 0.15 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x060606 });

  const body = new THREE.Group();
  body.position.y = 0.095;
  group.add(body);

  // Туловище (вытянутое вдоль +Z вперёд)
  const torsoGeo = new THREE.SphereGeometry(0.11, 16, 12);
  torsoGeo.scale(sex === 'f' ? 1.05 : 0.9, 0.72, 2.75);
  const torso = new THREE.Mesh(torsoGeo, bodyMat);
  torso.castShadow = shadows;
  body.add(torso);

  // Голова и мордочка
  const headGeo = new THREE.SphereGeometry(0.088, 14, 10);
  headGeo.scale(1.02, 0.68, 1.38);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.set(0, 0.015, 0.34);
  head.castShadow = shadows;
  body.add(head);

  // Глазки
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), eyeMat);
    eye.position.set(s * 0.062, 0.045, 0.38);
    body.add(eye);
    const pup = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 6), pupilMat);
    pup.position.set(s * 0.072, 0.048, 0.39);
    body.add(pup);
  }

  // Плоский плавательный хвост (у самца выше плавниковая складка)
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.0, -0.26);
  const tailGeo = new THREE.SphereGeometry(0.095, 14, 10);
  tailGeo.scale(0.32, sex === 'm' ? 1.08 : 0.82, 3.2);
  tailGeo.translate(0, 0.01, -0.26);
  const tail = new THREE.Mesh(tailGeo, bodyMat);
  tail.castShadow = shadows;
  tailPivot.add(tail);
  body.add(tailPivot);

  // 4 лапки
  const legs = [];
  for (const [zPos, idx] of [[0.18, 0], [-0.15, 1]]) {
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.085, -0.025, zPos);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.11, 6), legMat);
      upper.rotation.z = side * 1.15; upper.position.set(side * 0.05, -0.02, 0);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.028, 7, 5), legMat);
      foot.scale.set(1.2, 0.45, 1.45); foot.position.set(side * 0.1, -0.055, 0.02);
      hip.add(upper, foot);
      body.add(hip);
      legs.push({ hip, side, idx });
    }
  }

  return { group, body, tailPivot, legs, materials: [bodyMat, legMat, eyeMat, pupilMat] };
}

// ================= ПРОЦЕДУРНАЯ 3D-МОДЕЛЬ МУСКУСНОЙ ЧЕРЕПАХИ =================
export function makeTurtleMesh(variant = 'classic', shadows = true, sex = 'm') {
  const group = new THREE.Group();
  const rnd = prng(93);
  const shellTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#3f3828'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 180; i++) {
      c.fillStyle = i % 2 ? 'rgba(92,82,56,0.45)' : 'rgba(28,24,18,0.45)';
      c.beginPath(); c.ellipse(rnd() * w, rnd() * h, 6 + rnd() * 14, 4 + rnd() * 10, rnd() * 3, 0, 7); c.fill();
    }
    // Контуры щитков панциря
    c.strokeStyle = 'rgba(20,18,12,0.7)'; c.lineWidth = 4;
    for (let y = 32; y < h; y += 52) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    for (let x = 24; x < w; x += 56) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  });
  const neckTex = canvasTex(128, 64, (c, w, h) => {
    c.fillStyle = '#3a3c32'; c.fillRect(0, 0, w, h);
    // Знаменитые две кремово-жёлтые полоски на шее мускусной черепахи!
    c.fillStyle = '#e8df9e';
    c.fillRect(0, h * 0.28, w, h * 0.14);
    c.fillRect(0, h * 0.62, w, h * 0.12);
  });

  const shellMat = new THREE.MeshStandardMaterial({ map: shellTex, roughness: 0.48, metalness: 0.08 });
  const plastronMat = new THREE.MeshStandardMaterial({ color: 0xb9a374, roughness: 0.72 });
  const skinMat = new THREE.MeshStandardMaterial({ map: neckTex, roughness: 0.55 });
  const legMat = new THREE.MeshStandardMaterial({ color: 0x3b3e34, roughness: 0.6 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xd4c27a, roughness: 0.2 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x050505 });

  const body = new THREE.Group();
  body.position.y = 0.13;
  group.add(body);

  // Куполообразный панцирь (у самки чуть более выпуклый)
  const carGeo = new THREE.SphereGeometry(0.28, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
  carGeo.scale(0.92, sex === 'f' ? 0.88 : 0.78, 1.15);
  const carapace = new THREE.Mesh(carGeo, shellMat);
  carapace.castShadow = shadows;
  body.add(carapace);

  // Нижний щиток (пластрон)
  const plast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.2, 0.04, 16), plastronMat);
  plast.scale.set(0.9, 1, 1.12);
  plast.position.y = -0.01;
  body.add(plast);

  // Вытягивающаяся шея и голова (втягиваются при испуге!)
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.04, 0.26);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.18, 10), skinMat);
  neck.rotation.x = Math.PI / 2 - 0.32;
  neck.position.set(0, 0.03, 0.06);
  const headGeo = new THREE.SphereGeometry(0.066, 12, 10);
  headGeo.scale(0.88, 0.82, 1.35);
  const head = new THREE.Mesh(headGeo, skinMat);
  head.position.set(0, 0.075, 0.15);
  head.castShadow = shadows;
  headPivot.add(neck, head);
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), eyeMat);
    eye.position.set(s * 0.044, 0.095, 0.19);
    const pup = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), pupilMat);
    pup.position.set(s * 0.052, 0.097, 0.198);
    headPivot.add(eye, pup);
  }
  body.add(headPivot);

  // Хвостик (у самца заметно длиннее)
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.01, -0.29);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.028, sex === 'm' ? 0.18 : 0.11, 8), legMat);
  tail.rotation.x = -Math.PI / 2 - 0.15;
  tail.position.z = sex === 'm' ? -0.08 : -0.05;
  tailPivot.add(tail);
  body.add(tailPivot);

  // 4 лапки с перепонками
  const legs = [];
  for (const [zPos, idx] of [[0.14, 0], [-0.15, 1]]) {
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.17, -0.02, zPos);
      const limb = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.04, 0.15, 8), legMat);
      limb.rotation.z = side * 0.55; limb.position.set(side * 0.04, -0.05, 0);
      const paw = new THREE.Mesh(new THREE.SphereGeometry(0.044, 8, 6), legMat);
      paw.scale.set(1.1, 0.45, 1.35); paw.position.set(side * 0.07, -0.1, 0.02);
      hip.add(limb, paw);
      body.add(hip);
      legs.push({ hip, side, idx });
    }
  }

  return { group, body, headPivot, tailPivot, legs, materials: [shellMat, plastronMat, skinMat, legMat, eyeMat, pupilMat] };
}

// ================= ПРОЦЕДУРНАЯ 3D-МОДЕЛЬ ИЛИСТОГО ПРЫГУНА =================
export function makeMudskipperMesh(variant = 'classic', shadows = true, sex = 'm') {
  const group = new THREE.Group();
  const rnd = prng(71);
  const skinTex = canvasTex(256, 128, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#5a563c'); g.addColorStop(0.55, '#8a8262'); g.addColorStop(1, '#cfc8ae');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // Характерные тёмные пятна и бирюзово-голубые крапинки прыгуна
    for (let i = 0; i < 85; i++) {
      c.fillStyle = i % 3 === 0 ? 'rgba(130,210,225,0.68)' : 'rgba(52,48,32,0.5)';
      c.beginPath(); c.arc(rnd() * w, rnd() * h * 0.85, 2 + rnd() * 4, 0, 7); c.fill();
    }
  });
  const bodyMat = new THREE.MeshStandardMaterial({ map: skinTex, roughness: 0.35, metalness: 0.1 });
  const finMat = new THREE.MeshStandardMaterial({ map: skinTex, transparent: true, opacity: 0.88, side: THREE.DoubleSide, roughness: 0.45 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xd8b848, roughness: 0.12 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x050505 });

  const body = new THREE.Group();
  body.position.y = 0.11;
  group.add(body);

  // Тело (сужается к хвосту, массивная голова в +Z)
  const torsoGeo = new THREE.SphereGeometry(0.11, 16, 12);
  torsoGeo.scale(0.88, 0.82, 2.55);
  const torso = new THREE.Mesh(torsoGeo, bodyMat);
  torso.castShadow = shadows;
  body.add(torso);

  const headGeo = new THREE.SphereGeometry(0.115, 14, 12);
  headGeo.scale(1.06, 0.92, 1.18);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.set(0, 0.025, 0.25);
  head.castShadow = shadows;
  body.add(head);

  // Знаменитые выпуклые глаза-перископы на самой макушке!
  for (const s of [-1, 1]) {
    const turret = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), bodyMat);
    turret.position.set(s * 0.044, 0.125, 0.28);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), eyeMat);
    eye.position.set(s * 0.046, 0.145, 0.295);
    const pup = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 6), pupilMat);
    pup.position.set(s * 0.056, 0.148, 0.312);
    body.add(turret, eye, pup);
  }

  // Два парусных спинных плавника (у самца заметно выше!)
  const dorsals = [];
  const dScale = sex === 'm' ? 1.25 : 0.85;
  for (const [zPos, r] of [[0.06, 0.1], [-0.12, 0.12]]) {
    const dGeo = new THREE.CircleGeometry(r * dScale, 14, 0, Math.PI);
    dGeo.rotateY(Math.PI / 2);
    const dm = new THREE.Mesh(dGeo, finMat);
    dm.position.set(0, 0.075, zPos);
    body.add(dm);
    dorsals.push(dm);
  }

  // Хвостовой плавник
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0, -0.26);
  const tailGeo = new THREE.ConeGeometry(0.075, 0.22, 8);
  tailGeo.scale(0.35, 1, 1);
  tailGeo.rotateX(-Math.PI / 2);
  tailGeo.translate(0, 0, -0.11);
  tailPivot.add(new THREE.Mesh(tailGeo, finMat));
  body.add(tailPivot);

  // Сильные «шагающие» грудные плавники-опоры
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, -0.02, 0.15);
    const arm = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), finMat);
    arm.scale.set(1.15, 0.35, 1.35);
    arm.position.set(side * 0.065, -0.055, 0.01);
    arm.rotation.z = -side * 0.45;
    hip.add(arm);
    body.add(hip);
    legs.push({ hip, side, idx: 0 });
  }

  return { group, body, tailPivot, dorsals, legs, materials: [bodyMat, finMat, eyeMat, pupilMat] };
}
