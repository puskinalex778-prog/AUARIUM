// Корм трёх видов:
// - flakes (хлопья): плавают у поверхности, затем медленно тонут;
// - granules (гранулы): мягко опускаются в толще воды;
// - tablets (донные таблетки): быстро ложатся на дно и рассчитаны на несколько укусов сомиков/крабиков.
import * as THREE from 'three';
import { TANK, groundY } from './data.js';
import { rand, clamp } from './fx.js';

const MAX = 260;

export class Food {
  constructor(root) {
    this.root = root;
    const geo = new THREE.CylinderGeometry(0.046, 0.046, 0.016, 8);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.78 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.p = [];
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._c = new THREE.Color();
    this.onDecay = null;
    root.add(this.mesh);
  }

  reattach(root) {
    if (this.root !== root) {
      this.root?.remove(this.mesh);
      this.root = root;
      root.add(this.mesh);
    }
  }

  clear() {
    this.p.length = 0;
  }

  drop(x, z, top, type = 'flakes', n = null) {
    const count = n ?? (type === 'tablets' ? 2 : type === 'granules' ? 6 : 7);
    const flakeCols = [0xd9692c, 0xe8a03a, 0x8c4a2a, 0xc9b03a, 0xb5402a];
    const granCols = [0xd45520, 0x9c3b16, 0xc26e24];
    const tabCols = [0x4c6830, 0x5c502c, 0x3f5e2c];

    for (let i = 0; i < count && this.p.length < MAX; i++) {
      const fx = clamp(x + rand(-0.24, 0.24), TANK.minX + 0.1, TANK.maxX - 0.1);
      const fz = clamp(z + rand(-0.2, 0.2), TANK.minZ + 0.1, TANK.maxZ - 0.1);
      const gy = groundY(fx, fz);
      const onDry = gy > top - 0.02;
      const colList = type === 'tablets' ? tabCols : type === 'granules' ? granCols : flakeCols;
      this.p.push({
        type,
        x: fx,
        y: onDry ? gy + 0.02 : top - 0.015,
        z: fz,
        st: onDry ? 2 : (type === 'flakes' ? 0 : 1),
        t: onDry ? 130 : (type === 'flakes' ? rand(3, 6.5) : 110),
        bites: type === 'tablets' ? 3 : 1,
        rx: rand(0, 6), ry: rand(0, 6), spin: rand(-1, 1), age: 0,
        col: colList[Math.floor(Math.random() * colList.length)],
      });
    }
  }

  get count() { return this.p.length; }
  get onBottom() { let n = 0; for (const f of this.p) if (f.st === 2) n++; return n; }

  nearest(pos, maxD, sp = null) {
    let best = -1, bestScore = maxD * maxD;
    const prefs = sp?.foodTypes;
    for (let i = 0; i < this.p.length; i++) {
      const f = this.p[i];
      // Сомики и крабики предпочитают донные таблетки или осевший корм
      if (sp?.bottom && f.st === 0) continue;
      const dx = f.x - pos.x, dy = f.y - pos.y, dz = f.z - pos.z;
      let d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= maxD * maxD) continue;
      // Приоритет любимому виду корма
      if (prefs && prefs.includes(f.type)) d2 *= 0.52;
      if (sp?.bottom && f.type === 'tablets') d2 *= 0.45;
      if (d2 < bestScore) { bestScore = d2; best = i; }
    }
    return best;
  }

  get(i) { return this.p[i]; }

  eat(i) {
    const f = this.p[i];
    if (!f) return 10;
    const gain = f.type === 'tablets' ? 18 : f.type === 'granules' ? 14 : 11;
    f.bites = (f.bites || 1) - 1;
    if (f.bites <= 0) this.p.splice(i, 1);
    return gain;
  }

  // Сачок: убрать остатки корма со дна в радиусе
  collect(x, z, r) {
    let n = 0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const f = this.p[i];
      if (f.st === 2 && Math.hypot(f.x - x, f.z - z) < r) { this.p.splice(i, 1); n++; }
    }
    return n;
  }

  update(dt, top, current, time) {
    for (let i = this.p.length - 1; i >= 0; i--) {
      const f = this.p[i];
      f.age += dt;
      if (f.st === 0) {
        f.y = top - 0.015 + Math.sin(time * 2 + f.rx) * 0.006;
        f.x += Math.sin(time * 0.6 + f.ry) * 0.05 * dt - current * 0.04 * dt;
        f.z += Math.cos(time * 0.5 + f.rx) * 0.04 * dt;
        f.t -= dt; if (f.t <= 0) f.st = 1;
      } else if (f.st === 1) {
        const sinkSpd = f.type === 'tablets' ? 0.72 : f.type === 'granules' ? 0.28 : 0.16;
        f.y -= sinkSpd * dt;
        if (f.type !== 'tablets') {
          f.x += Math.sin(time * 2.2 + f.rx) * 0.05 * dt;
          f.z += Math.cos(time * 1.8 + f.ry) * 0.04 * dt;
          f.rx += f.spin * dt * 2;
        }
        const gy = groundY(f.x, f.z) + (f.type === 'tablets' ? 0.024 : 0.015);
        if (f.y <= gy) { f.y = gy; f.st = 2; f.t = f.type === 'tablets' ? 140 : 90; }
      } else {
        f.t -= dt;
        if (f.t <= 0) { this.p.splice(i, 1); if (this.onDecay) this.onDecay(); continue; }
      }
      f.x = clamp(f.x, TANK.minX + 0.06, TANK.maxX - 0.06);
      f.z = clamp(f.z, TANK.minZ + 0.06, TANK.maxZ - 0.06);
    }

    for (let i = 0; i < MAX; i++) {
      if (i < this.p.length) {
        const f = this.p[i];
        const flat = f.st === 0 || f.st === 2 || f.type === 'tablets';
        this._e.set(flat ? 0 : f.rx, f.ry, 0);
        this._q.setFromEuler(this._e);
        this._v.set(f.x, f.y, f.z);
        if (f.type === 'tablets') {
          const b = 0.7 + 0.25 * (f.bites || 1);
          this._s.set(1.55 * b, 2.2, 1.55 * b);
        } else if (f.type === 'granules') {
          this._s.set(0.75, 2.1, 0.75);
        } else {
          this._s.set(1.0, 0.45, 1.0);
        }
        this._c.setHex(f.col || 0xd9692c);
        this.mesh.setColorAt(i, this._c);
      } else {
        this._s.set(0, 0, 0);
      }
      this._m.compose(this._v, this._q, this._s);
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  serialize() {
    return this.p.filter(f => f.st === 2).map(f => [
      +f.x.toFixed(2), +f.z.toFixed(2), Math.round(f.t), f.type || 'flakes', f.bites || 1,
    ]);
  }

  load(arr) {
    this.clear();
    for (const item of arr || []) {
      const [x, z, t, type = 'flakes', bites = 1] = item;
      const col = type === 'tablets' ? 0x4c6830 : type === 'granules' ? 0xd45520 : 0xd9692c;
      this.p.push({ x, z, y: groundY(x, z) + (type === 'tablets' ? 0.024 : 0.015), st: 2, t, type, bites, rx: 0, ry: rand(0, 6), spin: 0, age: 0, col });
    }
  }
}
