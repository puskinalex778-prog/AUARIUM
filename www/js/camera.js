// Камера вокруг аквариума с ограничениями и сенсорное управление:
// один палец — вращение (или инструмент), два — масштаб, короткое касание — «тап».
import * as THREE from 'three';
import { clamp, damp } from './fx.js';

export class CameraRig {
  constructor(camera, dom) {
    this.camera = camera; this.dom = dom;
    this.theta = 0; this.phi = 1.42; this.dist = 9.2;
    this.t = { theta: 0, phi: 1.42, dist: 9.2 };
    this.target = new THREE.Vector3(0, 1.65, 0);
    this.targetGoal = this.target.clone();
    this.limits = { theta: [-1.05, 1.05], phi: [1.12, 1.72], dist: [3.2, 12.5] };
    this.follow = null;          // рыбка, за которой следим
    this.enabled = true;
    this.handlers = { tap: null, dragStart: null, drag: null, dragEnd: null, wantsDrag: () => false };
    this.pointers = new Map();
    this.bind();
  }

  bind() {
    const el = this.dom;
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.t.dist = clamp(this.t.dist * (1 + Math.sign(e.deltaY) * 0.1), ...this.limits.dist); }, { passive: false });
  }

  down(e) {
    this.dom.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    if (this.pointers.size === 1) {
      this.mode = this.handlers.wantsDrag(e.clientX, e.clientY) ? 'tool' : 'orbit';
      this.moved = false;
      if (this.mode === 'tool') this.handlers.dragStart?.(e.clientX, e.clientY);
    } else if (this.pointers.size === 2) {
      if (this.mode === 'tool') this.handlers.dragEnd?.();
      this.mode = 'pinch';
      const [a, b] = [...this.pointers.values()];
      this.pinch0 = Math.hypot(a.x - b.x, a.y - b.y); this.dist0 = this.t.dist;
    }
  }

  move(e) {
    const p = this.pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > 9) this.moved = true;
    if (!this.enabled) return;
    if (this.mode === 'orbit' && this.moved) {
      const s = 3.2 / Math.max(this.dom.clientHeight, 300);
      this.t.theta = clamp(this.t.theta - dx * s, ...this.limits.theta);
      this.t.phi = clamp(this.t.phi - dy * s, ...this.limits.phi);
    } else if (this.mode === 'tool') {
      this.handlers.drag?.(e.clientX, e.clientY);
    } else if (this.mode === 'pinch' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      this.t.dist = clamp(this.dist0 * this.pinch0 / Math.max(d, 1), ...this.limits.dist);
    }
  }

  up(e, cancel) {
    const p = this.pointers.get(e.pointerId); if (!p) return;
    this.pointers.delete(e.pointerId);
    if (this.mode === 'tool' && this.pointers.size === 0) this.handlers.dragEnd?.();
    if (!cancel && this.pointers.size === 0 && !this.moved && this.mode !== 'pinch' && performance.now() - p.t < 450) {
      this.handlers.tap?.(e.clientX, e.clientY);
    }
    if (this.pointers.size === 0) this.mode = null;
  }

  setView(theta, phi, dist, instant) {
    this.t.theta = theta; this.t.phi = phi; this.t.dist = dist;
    if (instant) { this.theta = theta; this.phi = phi; this.dist = dist; }
  }

  setTankLimits(camDist, camMax, centerY = 1.65) {
    this.defaultDist = camDist;
    this.defaultY = centerY;
    this.limits.dist = [3.0, camMax];
    this.follow = null;
    this.targetGoal.set(0, centerY, 0);
    this.setView(0, 1.42, camDist, false);
  }

  update(dt) {
    if (this.follow) {
      this.targetGoal.copy(this.follow.pos);
      this.targetGoal.y = clamp(this.targetGoal.y, 0.8, 2.8);
    }
    this.target.x = damp(this.target.x, this.targetGoal.x, 3, dt);
    this.target.y = damp(this.target.y, this.targetGoal.y, 3, dt);
    this.target.z = damp(this.target.z, this.targetGoal.z, 3, dt);
    this.theta = damp(this.theta, this.t.theta, 8, dt);
    this.phi = damp(this.phi, this.t.phi, 8, dt);
    this.dist = damp(this.dist, this.t.dist, 6, dt);
    const sp = Math.sin(this.phi);
    this.camera.position.set(
      this.target.x + this.dist * sp * Math.sin(this.theta),
      this.target.y + this.dist * Math.cos(this.phi),
      this.target.z + this.dist * sp * Math.cos(this.theta));
    this.camera.lookAt(this.target);
  }
}
