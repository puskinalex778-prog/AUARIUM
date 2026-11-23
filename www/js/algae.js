// Налёт водорослей на переднем стекле:
// 1) Мягкий зелёный налёт (grid) — стирается губкой и пощипывается сомиками;
// 2) Стойкие тёмно-зелёные известковые пятна (hardGrid) — счищаются скребком.
import * as THREE from 'three';
import { vnoise3 } from './fx.js';

export class Algae {
  constructor(material, gw = 96, gh = 48) {
    this.gw = gw; this.gh = gh;
    this.grid = new Float32Array(gw * gh);
    this.hardGrid = new Float32Array(gw * gh);
    this.pattern = new Float32Array(gw * gh);
    this.hardPattern = new Float32Array(gw * gh);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      const n = vnoise3(x * 0.09, y * 0.12, 3) * 0.65 + vnoise3(x * 0.3, y * 0.3, 7) * 0.35;
      const edge = Math.max(0, 1 - Math.min(x, gw - 1 - x, y * 1.2, gh - 1 - y) / 10) * 0.35;
      const bottom = (1 - y / gh) * 0.25;
      this.pattern[i] = Math.min(1, n * 0.9 + edge + bottom);
      // Очаги стойких водорослей (пятнистый ксенококус)
      const h1 = vnoise3(x * 0.16 + 11, y * 0.18 + 5, 13);
      const h2 = vnoise3(x * 0.45, y * 0.45, 21);
      const spot = h1 > 0.62 ? (h1 - 0.62) * 2.6 * (0.5 + h2 * 0.6) : 0;
      this.hardPattern[i] = Math.min(1, spot + (bottom > 0.18 && h2 > 0.65 ? 0.35 : 0));
    }
    this.canvas = document.createElement('canvas'); this.canvas.width = gw; this.canvas.height = gh;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(gw, gh);
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.magFilter = THREE.LinearFilter;
    this.bindMaterial(material);
    this.dirty = true;
    this.cap = 1;
  }

  bindMaterial(material) {
    if (!material) return;
    material.map = this.tex;
    material.needsUpdate = true;
  }

  reset() {
    this.grid.fill(0);
    this.hardGrid.fill(0);
    this.dirty = true;
  }

  // Рост мягкого и (медленнее) стойкого налёта за dtHours часов
  grow(dtHours, rate) {
    if (rate <= 0) return;
    const g = this.grid, hg = this.hardGrid, p = this.pattern, hp = this.hardPattern, cap = this.cap;
    const hardCap = cap * 0.85;
    for (let i = 0; i < g.length; i++) {
      const v = g[i] + dtHours * rate * (0.25 + p[i] * 1.2);
      g[i] = v > cap ? Math.max(g[i], cap) : v;
      if (hp[i] > 0.05) {
        const hv = hg[i] + dtHours * rate * 0.42 * hp[i];
        hg[i] = hv > hardCap ? Math.max(hg[i], hardCap) : hv;
      }
    }
    this.dirty = true;
  }

  // Засеять умеренный стартовый слой (чтобы игрок сразу мог попробовать и губку, и скребок)
  seedInitial() {
    this.grow(15, 0.012);
    for (let i = 0; i < this.hardGrid.length; i++) {
      if (this.hardPattern[i] > 0.12) this.hardGrid[i] = Math.min(0.65, this.hardPattern[i] * 0.55);
    }
    this.dirty = true;
  }

  // Стереть губкой (мягкий налёт стирается хорошо, стойкие пятна — почти не поддаются!)
  scrub(u, v, radius = 0.06, strength = 0.5) {
    const { gw, gh, grid, hardGrid } = this;
    const cx = u * gw, cy = (1 - v) * gh, r = radius * gw;
    let removed = 0;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
      const d = Math.hypot(x - cx, y - cy) / r; if (d > 1) continue;
      const i = y * gw + x, k = strength * (1 - d * d);
      const nv = Math.max(0, grid[i] - k);
      removed += grid[i] - nv;
      grid[i] = nv;
      // Губка лишь слегка ослабляет стойкие пятна
      hardGrid[i] = Math.max(0, hardGrid[i] - k * 0.03);
    }
    if (removed > 0) this.dirty = true;
    return removed / (gw * gh);
  }

  // Счистить скребком (удаляет стойкий налёт полосой и заодно снимает мягкий!)
  scrape(u, v, radius = 0.055, strength = 0.72) {
    const { gw, gh, grid, hardGrid } = this;
    const cx = u * gw, cy = (1 - v) * gh;
    const rx = radius * gw * 1.15, ry = radius * gh * 0.65; // лезвие шире по горизонтали
    let removedHard = 0, removedSoft = 0;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
      const d = Math.hypot((x - cx) / rx, (y - cy) / ry); if (d > 1) continue;
      const i = y * gw + x, k = strength * (1 - d * d * 0.6);
      const nh = Math.max(0, hardGrid[i] - k);
      removedHard += hardGrid[i] - nh;
      hardGrid[i] = nh;
      const ns = Math.max(0, grid[i] - k * 0.85);
      removedSoft += grid[i] - ns;
      grid[i] = ns;
    }
    if (removedHard > 0 || removedSoft > 0) this.dirty = true;
    return { hard: removedHard / (gw * gh), soft: removedSoft / (gw * gh) };
  }

  softLevel() { let s = 0; for (const v of this.grid) s += v; return s / this.grid.length; }
  hardLevel() { let s = 0; for (const v of this.hardGrid) s += v; return s / this.hardGrid.length; }
  level() { return Math.min(1, this.softLevel() + this.hardLevel() * 1.35); }

  refresh() {
    if (!this.dirty) return;
    this.dirty = false;
    const d = this.img.data, g = this.grid, hg = this.hardGrid, p = this.pattern;
    for (let i = 0; i < g.length; i++) {
      const sv = Math.min(1, g[i]);
      const hv = Math.min(1, hg[i]);
      const shade = p[i];
      // Смешиваем светло-зелёную мягкую плёнку и тёмно-изумрудные известковые пятна
      const wHard = hv > 0.02 ? Math.min(1, hv * 1.8) : 0;
      const r = (74 + shade * 28) * (1 - wHard) + 32 * wHard;
      const gr = (126 + shade * 38) * (1 - wHard) + 78 * wHard;
      const b = (52 + shade * 12) * (1 - wHard) + 34 * wHard;
      const aSoft = Math.min(175, sv * 195 + sv * sv * 35);
      const aHard = Math.min(225, hv * 255);
      d[i * 4] = r; d[i * 4 + 1] = gr; d[i * 4 + 2] = b;
      d[i * 4 + 3] = Math.min(235, Math.max(aSoft, aHard) + Math.min(aSoft, aHard) * 0.3);
    }
    this.ctx.putImageData(this.img, 0, 0);
    this.tex.needsUpdate = true;
  }

  serialize() {
    let s = '', h = '';
    for (let i = 0; i < this.grid.length; i++) {
      s += String.fromCharCode(Math.round(Math.min(1, this.grid[i]) * 255));
      h += String.fromCharCode(Math.round(Math.min(1, this.hardGrid[i]) * 255));
    }
    return JSON.stringify({ s: btoa(s), h: btoa(h) });
  }

  load(str) {
    this.reset();
    if (!str) return;
    try {
      if (str.startsWith('{')) {
        const obj = JSON.parse(str);
        const s = atob(obj.s || '');
        if (s.length === this.grid.length) for (let i = 0; i < s.length; i++) this.grid[i] = s.charCodeAt(i) / 255;
        const h = atob(obj.h || '');
        if (h.length === this.hardGrid.length) for (let i = 0; i < h.length; i++) this.hardGrid[i] = h.charCodeAt(i) / 255;
      } else {
        // Миграция формата v1 (только мягкий налёт)
        const s = atob(str);
        if (s.length === this.grid.length) for (let i = 0; i < s.length; i++) this.grid[i] = s.charCodeAt(i) / 255;
      }
      this.dirty = true;
    } catch (e) { /* повреждённые данные игнорируем */ }
  }
}
