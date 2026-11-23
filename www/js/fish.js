// Поведение рыбок, донных сомиков и пресноводного крабика:
// блуждание в своём слое, стайность, донное поведение сомиков (поедание водорослей и таблеток),
// территориальность, поиск корма по типу, реакция на стук, ночной отдых.
// Класс Crab — ходьба по мелководью и суше акватеррариума, анимация лапок, питание клешнями, укрывание.
import * as THREE from 'three';
import { SPECIES, TANK, groundY, isLand } from './data.js';
import { makeFishMesh, makeCrabMesh, makeNewtMesh, makeTurtleMesh, makeMudskipperMesh } from './fishmodel.js';
import { lifeStage } from './sim.js';
import { rand, clamp, damp } from './fx.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), tmp3 = new THREE.Vector3(), tmp4 = new THREE.Vector3(), tmp5 = new THREE.Vector3();
const mtx = new THREE.Matrix4(), q = new THREE.Quaternion();

export class Fish {
  constructor(rec, root, shadows) {
    this.rec = rec;
    this.sp = SPECIES[rec.species];
    const m = makeFishMesh(rec.species, rec.variant, rec.sex, shadows);
    this.group = m.group; this.u = m.uniforms; this.materials = m.materials;
    root.add(this.group);
    const [l0, l1] = this.sp.layer;
    const wt = TANK.waterTop;
    const x = rand(TANK.minX + 0.5, TANK.maxX - 0.5);
    const z = rand(TANK.minZ + 0.35, TANK.maxZ - 0.35);
    const gy = groundY(x, z);
    const y = this.sp.bottom ? gy + 0.14 : clamp(wt * rand(l0, l1), gy + 0.25, wt - 0.12);
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize().multiplyScalar(0.2);
    this.fwd = this.vel.clone().normalize();
    this.target = new THREE.Vector3(); this.pickTarget();
    this.targetTimer = rand(2, 6);
    this.cruise = rand(0.45, 0.8);
    this.fear = 0; this.fearFrom = new THREE.Vector3();
    this.curious = 0; this.curiousAt = new THREE.Vector3();
    this.hover = 0;
    this.clingTimer = 0;
    this.clingPos = null;
    this.territory = null;
    this.prevYaw = 0; this.turn = 0;
    this.personality = clamp(this.sp.boldness + rand(-0.15, 0.15), 0.05, 0.95);
    this.schoolOffset = new THREE.Vector3(rand(-0.6, 0.6), rand(-0.22, 0.22), rand(-0.45, 0.45));
    this.lastEat = 0;
    this.courtTimer = 0;
    this.courtMate = null;
    this.lastHeart = 0;
    this.isElder = false;
    this.isFry = false;
    this.updateScale();
  }

  get size() { return this.sp.length * this.growth; }

  updateScale() {
    const stg = lifeStage(this.rec, this.sp);
    this.growth = stg.growth;
    this.stage = stg.label;
    this.isFry = stg.isFry;
    this.isElder = stg.isElder;
    const sp = this.rec.species, f = this.rec.sex === 'f';
    let sexMul = 1;
    if (f && sp === 'guppy') sexMul = 1.15;
    else if (f && sp === 'endler') sexMul = 1.24;
    else if (f && (sp === 'swordtail' || sp === 'platy' || sp === 'molly')) sexMul = 1.08;
    else if (f && sp === 'corydoras') sexMul = 1.12;
    else if (!f && (sp === 'betta' || sp === 'rainbowfish' || sp === 'dwarf_gourami')) sexMul = 1.09;
    else if (!f && sp === 'apistogramma') sexMul = 1.16;
    const s = this.sp.length * this.growth * sexMul;
    const preg = !!(this.rec.pregnantUntil && this.rec.pregnantUntil > Date.now());
    this.group.scale.set(s, s * (preg ? 1.12 : 1), s * (preg ? 1.18 : 1));
  }

  startCourt(mate) {
    this.courtMate = mate;
    this.courtTimer = rand(4.5, 7.5);
  }

  pickTarget() {
    const wt = TANK.waterTop;
    const [l0, l1] = this.sp.layer;
    const xMax = TANK.isPaludarium ? -0.3 : TANK.maxX - 0.4;
    const x = rand(TANK.minX + 0.4, Math.max(TANK.minX + 0.6, xMax));
    const z = rand(TANK.minZ + 0.3, TANK.maxZ - 0.3);
    const gy = groundY(x, z);
    if (this.sp.bottom) {
      this.target.set(x, gy + rand(0.08, 0.26), z);
    } else {
      const lo = Math.max(gy + 0.32, wt * l0), hi = Math.min(wt - 0.15, wt * l1);
      this.target.set(x, rand(lo, Math.max(lo, hi)), z);
    }
  }

  startle(point, strength) {
    const d = this.pos.distanceTo(point);
    if (d > 3.4) return 0;
    const k = (1 - d / 3.4) * strength;
    this.clingTimer = 0;
    if (this.personality > 0.62 && Math.random() < this.personality * 0.6 && strength < 1.2) {
      this.curious = 2.5; this.curiousAt.copy(point); this.curiousAt.z -= 0.35;
      this.rec.stress = clamp(this.rec.stress + 3 * k, 0, 100);
      return 1;
    }
    this.fear = 1.2 + (1 - this.personality) * 1.8; this.fearFrom.copy(point);
    this.rec.stress = clamp(this.rec.stress + (6 + 10 * (1 - this.personality)) * k, 0, 100);
    return 2;
  }

  // ctx: { dt, time, fishes, food, colliders, hideSpots, night, schoolTargets, schoolCount, current, algae, onEat }
  update(ctx) {
    const { dt } = ctx;
    const sp = this.sp, r = this.rec;
    const wt = TANK.waterTop;
    const steer = tmp.set(0, 0, 0);
    let speedMul = this.cruise;

    // --- Анциструс / отоцинклюс: иногда присасываются к переднему стеклу и счищают мягкий налёт!
    if (sp.glassCling && this.clingTimer > 0 && this.fear <= 0 && !ctx.night) {
      this.clingTimer -= dt;
      if (this.clingPos) {
        this.pos.lerp(this.clingPos, 1 - Math.exp(-3 * dt));
        // слегка ползёт вдоль стекла
        this.clingPos.x = clamp(this.clingPos.x + Math.sin(ctx.time * 0.6 + this.u.uPhase.value) * 0.08 * dt, TANK.minX + 0.4, TANK.maxX - 0.4);
        this.clingPos.y = clamp(this.clingPos.y + Math.cos(ctx.time * 0.45 + this.u.uPhase.value) * 0.05 * dt, groundY(this.clingPos.x, TANK.maxZ - 0.1) + 0.25, wt - 0.35);
        // счищает немного мягкого налёта прямо под собой
        if (ctx.algae && Math.random() < dt * 2.5) {
          const u = (this.pos.x + TANK.glassSide) / (TANK.glassSide * 2);
          const v = (this.pos.y + 0.03) / (wt + 0.05);
          if (u > 0 && u < 1 && v > 0 && v < 1) {
            const rem = ctx.algae.scrub(u, v, 0.025, 0.06 * (sp.algaeEater || 0.5));
            if (rem > 0) r.satiety = clamp(r.satiety + 0.5, 0, 100);
          }
        }
        // ориентация присосанного сомика к стеклу (носом вверх/вбок)
        this.group.position.copy(this.pos);
        tmp2.set(Math.sin(ctx.time * 0.3 + this.u.uPhase.value) * 0.4, 0.9, 0.1).normalize();
        const right = tmp3.set(0, 0, -1).cross(tmp2).normalize();
        const up = tmp4.crossVectors(right, tmp2);
        mtx.makeBasis(tmp2, up, right);
        q.setFromRotationMatrix(mtx);
        this.group.quaternion.slerp(q, 1 - Math.exp(-5 * dt));
        this.u.uFreq.value = damp(this.u.uFreq.value, 3.5, 4, dt);
        this.u.uAmp.value = damp(this.u.uAmp.value, 0.012, 4, dt);
        return;
      }
    }

    // --- голод и поиск подходящего корма
    let seeking = false;
    if (r.satiety < 88 && ctx.food.count && this.fear <= 0) {
      const i = ctx.food.nearest(this.pos, 5.2, sp);
      if (i >= 0) {
        const f = ctx.food.get(i);
        const reachable = !isLand(f.x, f.z) && (f.st !== 2 || sp.id !== 'danio');
        if (reachable) {
          seeking = true;
          tmp2.set(f.x - this.pos.x, f.y - this.pos.y, f.z - this.pos.z);
          const d = tmp2.length();
          steer.addScaledVector(tmp2.normalize(), 3.4);
          speedMul = 1.18;
          if (d < 0.12 + this.size * 0.25 && ctx.time - this.lastEat > 0.38) {
            const gain = ctx.food.eat(i);
            this.lastEat = ctx.time;
            const before = r.satiety;
            r.satiety = clamp(r.satiety + gain, 0, 100);
            ctx.onEat(this, before);
          }
        }
      }
    }

    // --- испуг / любопытство
    if (this.fear > 0) {
      this.fear -= dt;
      tmp2.subVectors(this.pos, this.fearFrom); tmp2.y *= 0.3; tmp2.z -= 0.6;
      steer.addScaledVector(tmp2.normalize(), 4.5);
      if (this.personality < 0.5 && ctx.hideSpots.length) {
        let best = null, bd = 99;
        for (const h of ctx.hideSpots) {
          if (isLand(h.x, h.z)) continue;
          const d = Math.hypot(h.x - this.pos.x, h.z - this.pos.z);
          if (d < bd) { bd = d; best = h; }
        }
        if (best) { tmp2.set(best.x - this.pos.x, best.y - this.pos.y, best.z - this.pos.z); steer.addScaledVector(tmp2.normalize(), 3); }
      }
      speedMul = 1.95;
    } else if (this.curious > 0 && !seeking) {
      this.curious -= dt;
      tmp2.subVectors(this.curiousAt, this.pos);
      if (tmp2.length() > 0.3) steer.addScaledVector(tmp2.normalize(), 1.6);
      speedMul = 0.6;
    }

    // --- территориальность (петушки, апистограммы, лялиусы, скалярии)
    if (!seeking && this.fear <= 0 && sp.territorial && !ctx.night) {
      if (!this.territory) {
        const spot = ctx.hideSpots.find(h => !isLand(h.x, h.z));
        this.territory = spot
          ? new THREE.Vector3(spot.x + rand(-0.4, 0.4), clamp(wt * rand(sp.layer[0], sp.layer[1]), groundY(spot.x, spot.z) + 0.25, wt - 0.2), spot.z)
          : this.pos.clone();
      }
      // Мягко отгоняем конкурентов (тот же территориальный вид или конфликтный)
      for (const o of ctx.fishes) {
        if (o === this || o.isCrab) continue;
        const rival = (o.sp.id === sp.id && o.rec.sex === 'm' && r.sex === 'm')
          || (sp.conflicts && sp.conflicts.includes(o.sp.id))
          || (sp.eatsTiny && o.sp.tiny);
        if (!rival) continue;
        const d = o.pos.distanceTo(this.pos);
        if (d < 1.15) {
          tmp2.subVectors(o.pos, this.pos).normalize();
          steer.addScaledVector(tmp2, 1.3);
          speedMul = 1.05;
          o.fear = Math.max(o.fear, 0.45);
          o.fearFrom.copy(this.pos);
          break;
        }
      }
    }

    // --- ухаживание и сердечки (если включено в настройках)
    if (ctx.courtship && !ctx.night && !seeking && this.fear <= 0 && !this.isFry && !this.isElder && r.sex === 'm' && r.health > 70 && r.stress < 45) {
      if (this.courtTimer > 0 && this.courtMate && ctx.fishes.includes(this.courtMate)) {
        this.courtTimer -= dt;
        tmp2.subVectors(this.courtMate.pos, this.pos);
        const d = tmp2.length();
        if (d > 0.32) steer.addScaledVector(tmp2.normalize(), 1.35);
        speedMul = 0.72;
        if (d < 0.72 && ctx.onHeart && ctx.time - this.lastHeart > 1.8) {
          this.lastHeart = ctx.time;
          tmp3.addVectors(this.pos, this.courtMate.pos).multiplyScalar(0.5);
          tmp3.y += 0.25;
          ctx.onHeart(tmp3);
        }
      } else if (Math.random() < dt * 0.045) {
        for (const o of ctx.fishes) {
          if (o !== this && o.sp.id === sp.id && o.rec.sex === 'f' && !o.isFry && !o.isElder && o.rec.health > 70) {
            if (o.pos.distanceTo(this.pos) < 1.8) { this.startCourt(o); break; }
          }
        }
      }
    }

    // --- блуждание / стая / донное поведение / ночной отдых
    if (!seeking && this.fear <= 0 && this.curious <= 0 && this.courtTimer <= 0) {
      if (ctx.night) {
        if (!this.restSpot || Math.random() < dt * 0.02) {
          const waterHides = ctx.hideSpots.filter(h => !isLand(h.x, h.z));
          const p = waterHides.length && Math.random() < 0.7 ? waterHides[Math.floor(Math.random() * waterHides.length)] : null;
          const x = p ? p.x + rand(-0.4, 0.4) : rand(TANK.minX + 0.5, TANK.maxX - 0.5);
          const z = p ? p.z + rand(-0.4, 0.4) : rand(TANK.minZ + 0.3, TANK.maxZ - 0.3);
          this.restSpot = new THREE.Vector3(x, Math.min(wt * 0.55, groundY(x, z) + (sp.bottom ? 0.1 : rand(0.3, 0.85))), z);
        }
        tmp2.subVectors(this.restSpot, this.pos);
        if (tmp2.length() > 0.2) steer.addScaledVector(tmp2.normalize(), 0.8);
        speedMul = 0.2;
      } else if (sp.school && ctx.schoolCount[sp.id] > 1) {
        const st = ctx.schoolTargets[sp.id];
        tmp2.copy(st).add(this.schoolOffset);
        if (sp.bottom) tmp2.y = groundY(tmp2.x, tmp2.z) + 0.14;
        tmp2.sub(this.pos);
        steer.addScaledVector(tmp2.normalize(), 1.1);
        let n = 0; const ali = tmp3.set(0, 0, 0), coh = tmp4.set(0, 0, 0);
        for (const o of ctx.fishes) {
          if (o === this || o.sp.id !== sp.id) continue;
          const d = o.pos.distanceTo(this.pos);
          if (d < 1.5) { ali.add(o.vel); coh.add(o.pos); n++; }
        }
        if (n) { steer.addScaledVector(ali.normalize(), 0.9); coh.divideScalar(n).sub(this.pos); steer.addScaledVector(coh, 0.6); }
        speedMul = sp.bottom ? 0.72 : 0.78;
      } else {
        this.targetTimer -= dt;
        tmp2.subVectors(this.target, this.pos);
        if (tmp2.length() < 0.35 || this.targetTimer <= 0) {
          this.pickTarget();
          this.targetTimer = sp.bottom ? rand(4, 10) : rand(3, 8);
          this.cruise = rand(0.35, 0.85);
          if ((sp.id === 'guppy' || sp.id === 'betta' || sp.id === 'angelfish' || sp.id === 'discus') && Math.random() < 0.3) {
            this.hover = rand(1.2, 3.0);
          }
          // Сомики периодически отдыхают на грунте или присасываются к стеклу
          if (sp.bottom && Math.random() < 0.35) this.hover = rand(2.5, 6.0);
          if (sp.glassCling && !TANK.isPaludarium && ctx.algae && ctx.algae.level() > 0.03 && Math.random() < 0.28) {
            const cx = rand(TANK.minX + 0.5, TANK.maxX - 0.5);
            this.clingPos = new THREE.Vector3(cx, rand(groundY(cx, TANK.maxZ - 0.1) + 0.4, wt - 0.5), TANK.maxZ - 0.04);
            this.clingTimer = rand(6, 14);
          }
        }
        steer.addScaledVector(tmp2.normalize(), 1.0);
        if (this.hover > 0) { this.hover -= dt; speedMul = sp.bottom ? 0.05 : 0.14; }
      }
    }

    // --- раздвигаться с соседями
    for (const o of ctx.fishes) {
      if (o === this) continue;
      tmp2.subVectors(this.pos, o.pos); const d = tmp2.length();
      const min = (this.size + o.size) * 0.62;
      if (d < min && d > 1e-4) steer.addScaledVector(tmp2.divideScalar(d), (min - d) / min * 4);
    }

    // --- стёкла, дно, поверхность (и граница берега в акватеррариуме)
    const m = 0.45, k = 6;
    const gy = groundY(this.pos.x, this.pos.z) + (sp.bottom ? 0.06 : 0.18);
    if (this.pos.x > TANK.maxX - m) steer.x -= k * ((this.pos.x - TANK.maxX + m) / m) ** 2;
    if (this.pos.x < TANK.minX + m) steer.x += k * ((TANK.minX + m - this.pos.x) / m) ** 2;
    if (TANK.isPaludarium && this.pos.x > -0.25) steer.x -= k * 1.5;
    if (this.pos.z > TANK.maxZ - m) steer.z -= k * ((this.pos.z - TANK.maxZ + m) / m) ** 2;
    if (this.pos.z < TANK.minZ + m) steer.z += k * ((TANK.minZ + m - this.pos.z) / m) ** 2;
    if (this.pos.y < gy + (sp.bottom ? 0.05 : m * 0.6)) steer.y += k * ((gy + (sp.bottom ? 0.05 : m * 0.6) - this.pos.y) / m) ** 2;
    if (this.pos.y > wt - 0.25) steer.y -= k * ((this.pos.y - wt + 0.25) / 0.25) ** 2 * (seeking ? 0.2 : 1);
    if (sp.bottom && this.pos.y > gy + 0.55) steer.y -= 2.2;

    // --- декорации
    for (const c of ctx.colliders) {
      if (c.plant) continue;
      const dx = this.pos.x - c.x, dz = this.pos.z - c.z;
      const d = Math.hypot(dx, dz), R = c.r + 0.15;
      if (d < R && this.pos.y < c.h + 0.15) {
        const f = (R - d) / R * 5;
        steer.x += dx / (d || 1) * f; steer.z += dz / (d || 1) * f; steer.y += f * 0.6;
      }
    }

    // --- лёгкое течение от компрессора
    steer.x -= ctx.current * (sp.bottom ? 0.02 : 0.05);

    // --- интеграция (без аллокаций на кадр)
    const maxSpd = sp.speed * speedMul * (r.health < 40 ? 0.6 : 1) * (this.isElder ? 0.8 : 1);
    const desired = steer.lengthSq() > 1e-6 ? tmp5.copy(steer).normalize().multiplyScalar(maxSpd) : tmp5.copy(this.vel);
    const accel = 2.2 + (this.fear > 0 ? 5 : 0);
    this.vel.lerp(desired, 1 - Math.exp(-accel * dt));
    if (this.vel.length() > sp.speed * 2.2) this.vel.setLength(sp.speed * 2.2);
    this.vel.y *= sp.bottom ? 0.85 : 0.92;
    this.pos.addScaledVector(this.vel, dt);
    const maxWaterX = TANK.isPaludarium ? -0.1 : TANK.maxX - 0.12;
    this.pos.x = clamp(this.pos.x, TANK.minX + 0.12, maxWaterX);
    this.pos.z = clamp(this.pos.z, TANK.minZ + 0.1, TANK.maxZ - 0.1);
    const minY = groundY(this.pos.x, this.pos.z) + (sp.bottom ? 0.07 : 0.12);
    this.pos.y = clamp(this.pos.y, minY, Math.max(minY, wt - 0.06));

    // --- ориентация
    const spd = this.vel.length();
    if (spd > 0.025) {
      tmp2.copy(this.vel).normalize(); tmp2.y = clamp(tmp2.y, -0.42, 0.42); tmp2.normalize();
      this.fwd.lerp(tmp2, 1 - Math.exp(-5 * dt)).normalize();
    }
    const right = tmp2.crossVectors(this.fwd, UP).normalize();
    const up = tmp3.crossVectors(right, this.fwd);
    mtx.makeBasis(this.fwd, up, right);
    q.setFromRotationMatrix(mtx);
    this.group.quaternion.slerp(q, 1 - Math.exp(-8 * dt));
    this.group.position.copy(this.pos);

    // --- анимация тела и плавников
    const yaw = Math.atan2(this.fwd.z, this.fwd.x);
    let dy = yaw - this.prevYaw; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;
    this.prevYaw = yaw;
    this.turn = damp(this.turn, clamp(dy / Math.max(dt, 1e-3) * 0.02, -0.12, 0.12), 6, dt);
    const sn = clamp(spd / sp.speed, 0, 2);
    this.u.uFreq.value = damp(this.u.uFreq.value, 5 + sn * 9, 4, dt);
    this.u.uAmp.value = damp(this.u.uAmp.value, 0.018 + sn * 0.04, 4, dt);
    this.u.uTurn.value = this.turn;
  }

  hit(ray) {
    const c = this.pos;
    tmp2.subVectors(c, ray.origin);
    const t = tmp2.dot(ray.direction);
    if (t < 0) return Infinity;
    const p = ray.origin.clone().addScaledVector(ray.direction, t);
    const d = p.distanceTo(c);
    return d < Math.max(0.32, this.size * 0.78) ? t : Infinity;
  }

  dispose(root) {
    root.remove(this.group);
    this.materials.forEach(m => m.dispose());
  }
}

// ================= ОБИТАТЕЛИ АКВАТЕРРАРИУМА: ТРИТОН, ЧЕРЕПАХА, ИЛИСТЫЙ ПРЫГУН =================
export class Amphibian {
  constructor(rec, root, shadows) {
    this.isAmphibian = true;
    this.rec = rec;
    this.sp = SPECIES[rec.species];
    const sex = rec.sex || 'm';
    const m = rec.species === 'newt'
      ? makeNewtMesh(rec.variant, shadows, sex)
      : rec.species === 'musk_turtle'
        ? makeTurtleMesh(rec.variant, shadows, sex)
        : makeMudskipperMesh(rec.variant, shadows, sex);
    this.group = m.group;
    this.body = m.body;
    this.headPivot = m.headPivot || null;
    this.tailPivot = m.tailPivot || null;
    this.dorsals = m.dorsals || null;
    this.legs = m.legs || [];
    this.materials = m.materials;
    root.add(this.group);

    // Старт у кромки воды / на берегу
    const x = TANK.isPaludarium ? rand(-0.6, 1.4) : rand(-1.5, 1.5);
    const z = rand(TANK.minZ + 0.35, TANK.maxZ - 0.35);
    const gy = groundY(x, z);
    this.pos = new THREE.Vector3(x, gy + 0.02, z);
    this.yaw = rand(-Math.PI, Math.PI);
    this.target = new THREE.Vector3(x, gy, z);
    this.state = 'move'; // 'move' | 'bask' | 'hide'
    this.timer = rand(3, 6);
    this.phase = rand(0, 6.28);
    this.hopY = 0;
    this.fear = 0;
    this.lastEat = 0;
    this.updateScale();
  }

  get size() { return this.sp.length * this.growth; }

  updateScale() {
    const stg = lifeStage(this.rec, this.sp);
    this.growth = stg.growth;
    this.stage = stg.label;
    this.isFry = stg.isFry;
    this.isElder = stg.isElder;
    const sexMul = (this.rec.species === 'newt' && this.rec.sex === 'f') ? 1.08 : 1.0;
    this.group.scale.setScalar(this.sp.length * this.growth * sexMul * 1.15);
  }

  pickTarget(hideSpots, night) {
    if ((night || this.fear > 0) && hideSpots.length && Math.random() < 0.7) {
      const s = hideSpots[Math.floor(Math.random() * hideSpots.length)];
      this.target.set(clamp(s.x + rand(-0.3, 0.3), TANK.minX + 0.4, TANK.maxX - 0.4), groundY(s.x, s.z), clamp(s.z + rand(-0.3, 0.3), TANK.minZ + 0.3, TANK.maxZ - 0.3));
      this.state = 'hide';
      return;
    }
    // Предпочтения: прыгун больше любит берег (65%), черепаха 50/50, тритон чаще в воде (60%)
    const landProb = this.rec.species === 'mudskipper' ? 0.65 : this.rec.species === 'musk_turtle' ? 0.48 : 0.38;
    const goLand = TANK.isPaludarium && Math.random() < landProb;
    const x = goLand ? rand(0.25, TANK.maxX - 0.45) : rand(TANK.minX + 0.45, TANK.isPaludarium ? 0.2 : TANK.maxX - 0.45);
    const z = rand(TANK.minZ + 0.35, TANK.maxZ - 0.35);
    const gy = groundY(x, z);
    const swimY = (!goLand && gy < TANK.waterTop - 0.32 && this.rec.species !== 'mudskipper')
      ? rand(gy + 0.08, TANK.waterTop - 0.16)
      : gy + 0.01;
    this.target.set(x, swimY, z);
    this.state = 'move';
  }

  startle(point, strength) {
    const d = this.pos.distanceTo(point);
    if (d > 3.5) return 0;
    this.fear = 2.8 + strength;
    this.rec.stress = clamp(this.rec.stress + 7 * strength, 0, 100);
    // При испуге прыгун и тритон ныряют в воду; черепашка прячет голову в панцирь!
    if (this.rec.species !== 'musk_turtle' && TANK.isPaludarium) {
      this.target.set(rand(TANK.minX + 0.5, -0.4), groundY(-1.2, 0) + 0.15, rand(-0.6, 0.6));
      this.state = 'move';
    } else {
      this.state = 'hide';
    }
    return 2;
  }

  update(ctx) {
    const { dt } = ctx;
    const r = this.rec, sp = this.sp;
    const inWater = !isLand(this.pos.x, this.pos.z) && this.pos.y < TANK.waterTop - 0.05;
    let moving = false;

    if (this.fear > 0) this.fear -= dt;

    // 1. Поиск корма (таблетки / гранулы на дне и берегу)
    let foodTarget = null, foodIdx = -1;
    if (r.satiety < 90 && ctx.food.count && this.fear <= 0) {
      const i = ctx.food.nearest(this.pos, 4.8, sp);
      if (i >= 0) { foodTarget = ctx.food.get(i); foodIdx = i; }
    }

    if (foodTarget) {
      this.target.set(foodTarget.x, Math.max(groundY(foodTarget.x, foodTarget.z) + 0.02, foodTarget.y), foodTarget.z);
      const dist = this.pos.distanceTo(this.target);
      if (dist < 0.3) {
        if (ctx.time - this.lastEat > 0.55) {
          const gain = ctx.food.eat(foodIdx);
          this.lastEat = ctx.time;
          const before = r.satiety;
          r.satiety = clamp(r.satiety + gain, 0, 100);
          ctx.onEat(this, before);
        }
      } else {
        this.state = 'move';
      }
    } else {
      this.timer -= dt;
      if (this.timer <= 0) {
        if (this.state === 'move' && Math.random() < 0.45 && this.fear <= 0) {
          this.state = 'bask';
          this.timer = rand(3, 7);
        } else {
          this.pickTarget(ctx.hideSpots, ctx.night);
          this.timer = rand(4, 9);
        }
      }
    }

    // 2. Движение (плавание под водой или ходьба/прыжки по берегу)
    const turtleTucked = r.species === 'musk_turtle' && this.fear > 0.4;
    if (this.state === 'move' && !turtleTucked) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const dist2d = Math.hypot(dx, dz);
      if (dist2d > 0.16) {
        moving = true;
        const spd = sp.speed * (this.fear > 0 ? 1.8 : ctx.night ? 0.45 : inWater ? 1.15 : 0.85);
        const vx = (dx / dist2d) * spd, vz = (dz / dist2d) * spd;
        this.pos.x = clamp(this.pos.x + vx * dt, TANK.minX + 0.32, TANK.maxX - 0.32);
        this.pos.z = clamp(this.pos.z + vz * dt, TANK.minZ + 0.28, TANK.maxZ - 0.28);
        const gy = groundY(this.pos.x, this.pos.z);
        const goalY = (isLand(this.pos.x, this.pos.z) || r.species === 'mudskipper')
          ? gy + 0.01
          : clamp(this.target.y, gy + 0.02, TANK.waterTop - 0.12);
        this.pos.y = damp(this.pos.y, goalY, 4.5, dt);

        const goalYaw = Math.atan2(vx, vz);
        let dy = goalYaw - this.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.yaw += dy * (1 - Math.exp(-5.5 * dt));
        this.phase += dt * (this.fear > 0 ? 14 : inWater ? 8 : 9);
      } else {
        this.state = 'bask';
        this.timer = rand(2.5, 6);
      }
    } else {
      const gy = groundY(this.pos.x, this.pos.z);
      if (isLand(this.pos.x, this.pos.z)) this.pos.y = damp(this.pos.y, gy + 0.01, 6, dt);
    }

    // 3. Ориентация по склону берега / воде + весёлые подпрыгивания илистого прыгуна на суше!
    const gy = groundY(this.pos.x, this.pos.z);
    const onGround = Math.abs(this.pos.y - gy) < 0.14;
    if (r.species === 'mudskipper' && moving && !inWater) {
      this.hopY = Math.max(0, Math.sin(this.phase * 1.15)) * 0.095;
    } else {
      this.hopY = damp(this.hopY, 0, 12, dt);
    }

    this.group.position.set(this.pos.x, this.pos.y + this.hopY, this.pos.z);
    if (onGround) {
      const gx = (groundY(this.pos.x + 0.15, this.pos.z) - groundY(this.pos.x - 0.15, this.pos.z)) / 0.3;
      const gz = (groundY(this.pos.x, this.pos.z + 0.15) - groundY(this.pos.x, this.pos.z - 0.15)) / 0.3;
      const norm = tmp.set(-gx, 1, -gz).normalize();
      const fwd = tmp2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      const right = tmp3.crossVectors(norm, fwd).normalize();
      const trueFwd = tmp4.crossVectors(right, norm).normalize();
      mtx.makeBasis(right, norm, trueFwd);
      q.setFromRotationMatrix(mtx);
    } else {
      q.setFromAxisAngle(UP, this.yaw);
    }
    this.group.quaternion.slerp(q, 1 - Math.exp(-8 * dt));

    // 4. Анимация хвоста, лапок, головы черепахи и спинных плавников прыгуна
    if (this.tailPivot) {
      const amp = moving ? (inWater ? 0.55 : 0.22) : 0.05;
      this.tailPivot.rotation.y = Math.sin(this.phase) * amp;
    }
    if (this.headPivot) {
      // Мускусная черепаха втягивает голову при испуге и любопытно вытягивает в покое!
      const zGoal = turtleTucked ? 0.14 : 0.26;
      this.headPivot.position.z = damp(this.headPivot.position.z, zGoal, 8, dt);
      this.headPivot.rotation.y = turtleTucked ? 0 : Math.sin(ctx.time * 0.9) * 0.16;
    }
    if (this.dorsals) {
      // Илистый прыгун гордо расправляет спинные плавники на суше!
      const flare = (!inWater && !moving) ? (0.85 + Math.sin(ctx.time * 1.4) * 0.2) : (moving ? 0.95 : 0.55);
      for (const dm of this.dorsals) dm.scale.y = damp(dm.scale.y, flare, 5, dt);
    }
    for (const leg of this.legs) {
      if (r.species === 'mudskipper') {
        const push = moving ? Math.sin(this.phase * 1.15) * 0.55 : 0;
        leg.hip.rotation.x = damp(leg.hip.rotation.x, push, 12, dt);
      } else {
        const ph = this.phase + leg.idx * Math.PI + (leg.side > 0 ? 0 : Math.PI);
        const swing = moving ? Math.sin(ph) * (inWater ? 0.55 : 0.38) : 0;
        leg.hip.rotation.y = damp(leg.hip.rotation.y, swing, 10, dt);
        leg.hip.rotation.z = damp(leg.hip.rotation.z, moving && !inWater ? leg.side * Math.max(0, Math.cos(ph)) * 0.22 : 0, 10, dt);
      }
    }
  }

  hit(ray) {
    const c = tmp.copy(this.pos); c.y += 0.16;
    tmp2.subVectors(c, ray.origin);
    const t = tmp2.dot(ray.direction);
    if (t < 0) return Infinity;
    const p = ray.origin.clone().addScaledVector(ray.direction, t);
    return p.distanceTo(c) < 0.52 ? t : Infinity;
  }

  dispose(root) {
    root.remove(this.group);
    this.materials.forEach(m => m.dispose());
  }
}

// ================= ПРЕСНОВОДНЫЙ КРАБИК (АКВАТЕРРАРИУМ) =================
export class Crab {
  constructor(rec, root, shadows) {
    this.isCrab = true;
    this.rec = rec;
    this.sp = SPECIES.crab;
    const m = makeCrabMesh(rec.variant || 'vampire', shadows, rec.sex || 'm');
    this.group = m.group;
    this.body = m.body;
    this.claws = m.claws;
    this.legs = m.legs;
    this.materials = m.materials;
    root.add(this.group);

    // Старт на берегу акватеррариума или у кромки воды
    const x = TANK.isPaludarium ? rand(0.4, 2.1) : rand(-1.5, 1.5);
    const z = rand(TANK.minZ + 0.35, TANK.maxZ - 0.35);
    this.pos = new THREE.Vector3(x, groundY(x, z), z);
    this.vel = new THREE.Vector3();
    this.yaw = rand(-Math.PI, Math.PI);
    this.target = new THREE.Vector3(x, this.pos.y, z);
    this.state = 'walk'; // 'walk' | 'idle' | 'eat' | 'hide'
    this.timer = rand(2, 5);
    this.walkPhase = rand(0, 6.28);
    this.eatAnim = 0;
    this.fear = 0;
    this.lastEat = 0;
    this.stepTick = 0;
    this.updateScale();
  }

  get size() { return this.sp.length * this.growth; }

  updateScale() {
    const stg = lifeStage(this.rec, this.sp);
    this.growth = stg.growth;
    this.stage = stg.label;
    this.isFry = stg.isFry;
    this.isElder = stg.isElder;
    this.group.scale.setScalar(this.growth * 1.15);
  }

  pickTarget(hideSpots, night) {
    if ((night || this.fear > 0) && hideSpots.length) {
      const s = hideSpots[Math.floor(Math.random() * hideSpots.length)];
      this.target.set(clamp(s.x + rand(-0.25, 0.25), TANK.minX + 0.35, TANK.maxX - 0.35), 0, clamp(s.z + rand(-0.25, 0.25), TANK.minZ + 0.3, TANK.maxZ - 0.3));
      this.state = 'hide';
      return;
    }
    // 65% времени любит гулять на суше/берегу, 35% — спускаться на мелководье
    const onShore = TANK.isPaludarium && Math.random() < 0.68;
    const x = onShore ? rand(0.25, TANK.maxX - 0.45) : rand(TANK.minX + 0.45, TANK.maxX - 0.45);
    const z = rand(TANK.minZ + 0.35, TANK.maxZ - 0.35);
    this.target.set(x, groundY(x, z), z);
    this.state = 'walk';
  }

  startle(point, strength) {
    const d = this.pos.distanceTo(point);
    if (d > 3.5) return 0;
    this.fear = 2.8 + strength;
    this.rec.stress = clamp(this.rec.stress + 8 * strength, 0, 100);
    this.state = 'hide';
    return 2;
  }

  update(ctx) {
    const { dt } = ctx;
    const r = this.rec;
    let moving = false;

    if (this.fear > 0) this.fear -= dt;
    if (this.eatAnim > 0) this.eatAnim = Math.max(0, this.eatAnim - dt);

    // 1. Поиск корма (таблетки или крошки на дне / берегу)
    let foodTarget = null, foodIdx = -1;
    if (r.satiety < 90 && ctx.food.count && this.fear <= 0) {
      const i = ctx.food.nearest(this.pos, 4.5, this.sp);
      if (i >= 0) {
        const f = ctx.food.get(i);
        if (f.st === 2 || Math.abs(f.y - groundY(f.x, f.z)) < 0.35) {
          foodTarget = f; foodIdx = i;
        }
      }
    }

    if (foodTarget) {
      this.target.set(foodTarget.x, groundY(foodTarget.x, foodTarget.z), foodTarget.z);
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.28) {
        this.state = 'eat';
        if (ctx.time - this.lastEat > 0.65) {
          const gain = ctx.food.eat(foodIdx);
          this.lastEat = ctx.time;
          this.eatAnim = 1.4;
          const before = r.satiety;
          r.satiety = clamp(r.satiety + gain, 0, 100);
          ctx.onEat(this, before);
        }
      } else {
        this.state = 'walk';
      }
    } else {
      this.timer -= dt;
      if (this.fear > 0 && this.state !== 'hide') this.pickTarget(ctx.hideSpots, ctx.night);
      if (this.timer <= 0) {
        if (this.state === 'walk' && Math.random() < 0.45 && this.fear <= 0) {
          this.state = 'idle';
          this.timer = rand(2.5, 5.5);
        } else {
          this.pickTarget(ctx.hideSpots, ctx.night);
          this.timer = rand(4, 9);
        }
      }
    }

    // 2. Движение по поверхности дна и берега
    if (this.state === 'walk' || this.state === 'hide') {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.14) {
        moving = true;
        const spd = this.sp.speed * (this.fear > 0 ? 1.85 : ctx.night ? 0.55 : 1.0);
        const vx = (dx / dist) * spd, vz = (dz / dist) * spd;
        this.pos.x = clamp(this.pos.x + vx * dt, TANK.minX + 0.28, TANK.maxX - 0.28);
        this.pos.z = clamp(this.pos.z + vz * dt, TANK.minZ + 0.25, TANK.maxZ - 0.25);
        // Краб ходит чуть боком (примерно 55° к направлению движения — очень естественно!)
        const moveAng = Math.atan2(vx, vz);
        const goalYaw = moveAng + (this.fear > 0 ? 1.15 : 0.75);
        let dy = goalYaw - this.yaw;
        while (dy > Math.PI) dy -= Math.PI * 2;
        while (dy < -Math.PI) dy += Math.PI * 2;
        this.yaw += dy * (1 - Math.exp(-5 * dt));
        this.walkPhase += dt * (this.fear > 0 ? 18 : 11);
        // Тихий хруст гальки, если краб идёт по суше
        if (isLand(this.pos.x, this.pos.z) && ctx.audio) {
          this.stepTick += dt;
          if (this.stepTick > 0.65) { this.stepTick = 0; if (Math.random() < 0.35) ctx.audio.crabClick(); }
        }
      } else if (this.state === 'walk') {
        this.state = 'idle';
        this.timer = rand(2, 5);
      }
    }

    // 3. Прилегание к рельефу грунта/берега (наклон по склону)
    const gy = groundY(this.pos.x, this.pos.z);
    const gx = (groundY(this.pos.x + 0.15, this.pos.z) - groundY(this.pos.x - 0.15, this.pos.z)) / 0.3;
    const gz = (groundY(this.pos.x, this.pos.z + 0.15) - groundY(this.pos.x, this.pos.z - 0.15)) / 0.3;
    this.pos.y = gy + 0.01;
    this.group.position.copy(this.pos);
    const norm = tmp.set(-gx, 1, -gz).normalize();
    const fwd = tmp2.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = tmp3.crossVectors(norm, fwd).normalize();
    const trueFwd = tmp4.crossVectors(right, norm).normalize();
    mtx.makeBasis(right, norm, trueFwd);
    q.setFromRotationMatrix(mtx);
    this.group.quaternion.slerp(q, 1 - Math.exp(-9 * dt));

    // 4. Анимация лапок, клешней и приседания при укрывании
    const bob = moving ? Math.abs(Math.sin(this.walkPhase)) * 0.018 : Math.sin(ctx.time * 2) * 0.005;
    const crouch = (this.state === 'hide' && !moving) ? -0.045 : 0;
    this.body.position.y = damp(this.body.position.y, 0.17 + bob + crouch, 10, dt);

    for (const leg of this.legs) {
      const ph = this.walkPhase + leg.idx * 1.4 + (leg.side > 0 ? 0 : Math.PI);
      const lift = moving ? Math.max(0, Math.sin(ph)) * 0.35 : 0;
      const swing = moving ? Math.cos(ph) * 0.24 : 0;
      leg.hip.rotation.z = damp(leg.hip.rotation.z, leg.side * lift, 14, dt);
      leg.hip.rotation.y = damp(leg.hip.rotation.y, leg.baseY + swing, 14, dt);
    }

    for (const cl of this.claws) {
      if (this.eatAnim > 0) {
        // Попеременно подносит клешни ко рту!
        const chomp = Math.sin(ctx.time * 9 + (cl.side > 0 ? 0 : Math.PI)) * 0.35;
        cl.pivot.rotation.x = damp(cl.pivot.rotation.x, -0.35 + chomp, 14, dt);
        cl.pivot.rotation.y = damp(cl.pivot.rotation.y, -cl.side * (0.45 + chomp * 0.3), 14, dt);
      } else if (this.fear > 0) {
        // Защитная стойка: приподнимает клешни
        cl.pivot.rotation.x = damp(cl.pivot.rotation.x, -0.45, 10, dt);
        cl.pivot.rotation.y = damp(cl.pivot.rotation.y, cl.side * 0.2, 10, dt);
      } else {
        const idle = Math.sin(ctx.time * 1.8 + cl.side) * 0.06;
        cl.pivot.rotation.x = damp(cl.pivot.rotation.x, idle, 6, dt);
        cl.pivot.rotation.y = damp(cl.pivot.rotation.y, idle * 0.5, 6, dt);
      }
    }
  }

  hit(ray) {
    const c = tmp.copy(this.pos); c.y += 0.18;
    tmp2.subVectors(c, ray.origin);
    const t = tmp2.dot(ray.direction);
    if (t < 0) return Infinity;
    const p = ray.origin.clone().addScaledVector(ray.direction, t);
    return p.distanceTo(c) < 0.45 ? t : Infinity;
  }

  dispose(root) {
    root.remove(this.group);
    this.materials.forEach(m => m.dispose());
  }
}
