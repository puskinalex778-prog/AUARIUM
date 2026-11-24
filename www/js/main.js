// «Мой живой аквариум» — точка входа, игровой цикл, переключение аквариумов,
// инструменты кормления (3 вида корма) и уборки (губка, скребок, сифон, сачок, фильтр, подмена).
import * as THREE from 'three';
import { RoomEnvironment } from '../lib/RoomEnvironment.js';
import { TANK, TANKS, setActiveTankSpec, SPECIES, DECOR, FOOD_ITEMS, groundY, TASKS, DAILY_TASK } from './data.js';
import { G, clamp, rand } from './fx.js';
import { Tank } from './tank.js';
import { Fish, Crab, Amphibian } from './fish.js';
import { Food } from './food.js';
import { Algae } from './algae.js';
import { DecorManager } from './decor.js';
import { CameraRig } from './camera.js';
import { AudioSys } from './audio.js';
import { Intro } from './intro.js';
import { loadState, saveState, newState, curTank, allFish, loadAlbum, saveAlbum } from './save.js';
import { simulate, catchUp, timeOfDay, autoLamp, waterQuality, qualityLabel, effectiveLifespan } from './sim.js';
import { $, h, toast, nameDialog, dialogOpen, closeDialog, Panel } from './ui.js';
import { Panels } from './panels.js';
import { requestNotifPermission, clearNotifications, scheduleNotifications } from './notify.js';

const today = () => new Date().toISOString().slice(0, 10);

class Game {
  constructor() {
    this.state = loadState();
    this.isNew = !this.state;
    if (!this.state) this.state = newState();
    const st = this.state;
    const tk = curTank(st);
    setActiveTankSpec(st.activeTank, tk.water.temp);
    G.caustics = st.settings.quality !== 'low';

    // --- рендер
    this.canvas = $('#view');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: st.settings.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2a2f38);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.4;
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 90);
    this.activeScene = this.scene;
    this.applyPixelRatio();
    this.resize();
    addEventListener('resize', () => this.resize());

    // --- мир
    this.tank = new Tank(this.scene, st.settings.quality);
    this.algae = new Algae(this.tank.algaeMat);
    this.decor = new DecorManager(this.tank.tankGroup);
    this.food = new Food(this.tank.tankGroup);
    this.food.onDecay = () => {
      const c = curTank(this.state);
      c.water.waste = clamp(c.water.waste + 0.8, 0, this.state.settings.comfort ? 40 : 100);
    };
    this.fishes = [];
    this.schoolTargets = {}; this.schoolGoals = {}; this.schoolTimer = {};
    for (const id of Object.keys(SPECIES)) {
      this.schoolTargets[id] = new THREE.Vector3(0, 1.8, 0);
      this.schoolGoals[id] = new THREE.Vector3(0, 1.8, 0);
      this.schoolTimer[id] = 0;
    }

    // --- управление
    this.rig = new CameraRig(this.camera, this.canvas);
    this.rig.handlers.tap = (x, y) => this.onTap(x, y);
    this.rig.handlers.wantsDrag = () => ['sponge', 'scraper', 'siphon', 'place', 'net'].includes(this.tool);
    this.rig.handlers.dragStart = (x, y) => this.onDrag(x, y, true);
    this.rig.handlers.drag = (x, y) => this.onDrag(x, y, false);
    this.rig.handlers.dragEnd = () => this.onDragEnd();
    this.raycaster = new THREE.Raycaster();
    this.tool = 'view';
    this.feedType = 'flakes';
    this.feedPickerOpen = false;
    this.knockTimes = [];

    this.audio = new AudioSys();
    this.audio.music = st.settings.music;
    this.audio.sfx = st.settings.sfx;
    this.audio.compressor = tk.equip.compressorOn;
    this.panel = new Panel();
    this.panels = new Panels(this);
    this.album = loadAlbum();

    this.loadCurrentTank(true);
    const catchEvents = catchUp(st, this.algae);
    this.tank.updateDetritus(curTank(st).detritus);
    this.tank.updateClutches(curTank(st).clutches);
    this.handleSimEvents(catchEvents, true);
    this.checkDay();

    this.clock = new THREE.Clock();
    this.simAcc = 0; this.hudAcc = 0; this.saveAcc = 0; this.algaeAcc = 0; this.scaleAcc = 0; this.lastFrame = 0; this.time = 0;
    this.paused = false;
    this.bindUI();
    this.tank.updateLighting(10, this.effectiveEquip(), timeOfDay(curTank(st)), 0);
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  // Загрузить 3D-объекты активного аквариума
  loadCurrentTank(initial = false) {
    const st = this.state, tk = curTank(st), spec = TANKS[st.activeTank];
    setActiveTankSpec(st.activeTank, tk.water.temp);
    if (!initial) {
      this.fishes.forEach(f => f.dispose(this.tank.tankGroup));
      this.fishes = [];
      this.tank.rebuildTank(tk.look);
    } else {
      this.tank.buildSubstrate(tk.look.ground);
      this.tank.buildBackdrop(tk.look.bg);
    }
    this.algae.bindMaterial(this.tank.algaeMat);
    if (tk.algae) this.algae.load(tk.algae); else this.algae.seedInitial();
    this.algae.refresh();
    this.decor.reattach(this.tank.tankGroup);
    for (const d of tk.decor) this.decor.add(d);
    this.food.reattach(this.tank.tankGroup);
    this.food.load(tk.leftovers);
    this.tank.updateDetritus(tk.detritus || []);
    this.tank.updateClutches(tk.clutches || []);
    this.fishes = tk.fish.map(r => this.makePet(r));
    this.rig.setTankLimits(spec.camDist, spec.camMax, spec.isPaludarium ? 1.25 : spec.isNursery ? 1.35 : 1.65);
    if (initial) this.rig.setView(0, 1.42, spec.camDist, true);
    this.audio.setCompressor(tk.equip.compressorOn);
    this.tank.updateLighting(10, this.effectiveEquip(), timeOfDay(tk), 0);
  }

  makePet(rec) {
    const bl = effectiveLifespan(this.state.settings);
    if (rec.species === 'crab') return new Crab(rec, this.tank.tankGroup, true, bl);
    if (rec.species === 'newt' || rec.species === 'musk_turtle' || rec.species === 'mudskipper') return new Amphibian(rec, this.tank.tankGroup, true, bl);
    return new Fish(rec, this.tank.tankGroup, true, bl);
  }

  // Переключиться на другой купленный аквариум
  switchTank(tankId) {
    const st = this.state;
    if (st.activeTank === tankId || !st.tanks[tankId]) return;
    if (this.placing) this.placeAction('cancel');
    this.setTool('view');
    this.saveCurrentTankData();
    st.activeTank = tankId;
    this.loadCurrentTank(false);
    this.save();
    this.updateHud();
    toast(`${TANKS[tankId].icon} ${TANKS[tankId].name}`);
  }

  saveCurrentTankData() {
    const tk = curTank(this.state);
    tk.algae = this.algae.serialize();
    tk.leftovers = this.food.serialize();
  }

  applyPixelRatio() {
    const q = this.state.settings.quality, dpr = window.devicePixelRatio || 1;
    this.renderer.setPixelRatio(q === 'low' ? Math.min(dpr, 1) : q === 'medium' ? Math.min(dpr, 1.5) : Math.min(dpr, 2));
  }
  resize() {
    const w = innerWidth, hh = innerHeight;
    this.renderer.setSize(w, hh, false);
    this.camera.aspect = w / hh;
    this.camera.fov = w / hh < 1.2 ? 58 : 42;
    this.camera.updateProjectionMatrix();
  }

  effectiveEquip() {
    const e = curTank(this.state).equip;
    return { ...e, lightOn: e.autoDay ? autoLamp() : e.lightOn };
  }

  // ================= ЦИКЛ =================
  loop(now) {
    requestAnimationFrame(this.loop);
    if (this.paused) return;
    const fps = this.state.settings.fps || 60;
    if (fps < 60 && now - this.lastFrame < 1000 / fps - 3) return;
    this.lastFrame = now;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.time += dt;
    G.uTime.value = this.time;
    const st = this.state, tk = curTank(st);
    const eq = this.effectiveEquip();
    const tod = timeOfDay(tk);

    if (this.intro) this.intro.update(dt);

    // симуляция воды, самочувствия, размножения и жизненного цикла (раз в секунду)
    this.simAcc += dt;
    if (this.simAcc >= 1) {
      const prevDet = (tk.detritus || []).length;
      const prevCl = (tk.clutches || []).length;
      const events = { born: [], hatched: [], pregnant: [], clutchesAdded: [], departed: [], courtship: [] };
      simulate(st, this.simAcc / 3600, { lampOn: eq.lightOn, algae: this.algae, events });
      if ((tk.detritus || []).length !== prevDet) this.tank.updateDetritus(tk.detritus);
      if ((tk.clutches || []).length !== prevCl) this.tank.updateClutches(tk.clutches);
      this.handleSimEvents(events, false);
      if (this.algae.hardLevel() > 0.05) st.counters.scrapeArmed = true;
      if ((tk.detritus || []).length >= 8) st.counters.siphonArmed = true;
      if ((tk.filterDirt || 0) >= 25) st.counters.filterArmed = true;
      st.lastSim = Date.now();
      this.simAcc = 0;
    }

    // плавное обновление размера растущих мальков каждые 25 сек
    this.scaleAcc += dt;
    if (this.scaleAcc > 25) {
      this.scaleAcc = 0;
      const bl = effectiveLifespan(st.settings);
      for (const f of this.fishes) f.updateScale(bl);
    }

    // питомцы (рыбки, сомики, обитатели берега)
    G.uCurrent.value += ((tk.equip.compressorOn ? 1 : 0.35) - G.uCurrent.value) * Math.min(1, dt);
    const night = tod === 'night' && !eq.lightOn;
    this.updateSchools(dt);
    const colliders = this.decor.colliders();
    const hideSpots = this.decor.hideSpots();
    const schoolCount = {}; for (const f of this.fishes) schoolCount[f.sp.id] = (schoolCount[f.sp.id] || 0) + 1;
    const ctx = {
      dt, time: this.time, fishes: this.fishes, food: this.food, colliders, hideSpots, night,
      schoolTargets: this.schoolTargets, schoolCount, current: G.uCurrent.value,
      algae: this.algae, audio: this.audio,
      courtship: st.settings.courtship !== false,
      onHeart: (pos) => this.spawnHeart(pos),
      onEat: (f, b) => this.onFishEat(f, b),
    };
    for (const f of this.fishes) f.update(ctx);
    this.food.update(dt, this.tank.waterTop, G.uCurrent.value, this.time, this.tool === 'net');
    const chests = tk.decor.filter(d => d.type === 'chest').map(d => ({ x: d.x, y: groundY(d.x, d.z) + 0.32, z: d.z }));
    this.tank.updateBubbles(dt, tk.equip.compressorOn, chests);
    const turb = clamp((tk.water.waste - 25) / 75, 0, 1);
    this.tank.updateLighting(dt, eq, tod, turb);
    const envI = { day: 0.45, evening: 0.28, night: 0.08 }[tod] ?? 0.4;
    this.scene.environmentIntensity += (envI - this.scene.environmentIntensity) * Math.min(1, dt);
    this.algaeAcc += dt;
    if (this.algaeAcc > 2 || ((this.tool === 'sponge' || this.tool === 'scraper') && this.algaeAcc > 0.05)) {
      this.algae.refresh();
      this.algaeAcc = 0;
    }
    if (this.waterAnim) this.waterAnim(dt);

    if (this.activeScene === this.scene) this.rig.update(dt);
    this.updateLabel();
    this.audio.tick();

    this.renderer.render(this.activeScene, this.camera);
    if (this.captureNext) { this.captureNext(); this.captureNext = null; }

    this.hudAcc += dt;
    if (this.hudAcc > 0.5) { this.hudAcc = 0; this.updateHud(); }
    this.saveAcc += dt;
    if (this.saveAcc > 15) { this.saveAcc = 0; this.save(); }
  }

  updateSchools(dt) {
    const wt = TANK.waterTop;
    for (const id of Object.keys(this.schoolTargets)) {
      const sp = SPECIES[id];
      if (!sp || sp.needsPaludarium) continue;
      this.schoolTimer[id] -= dt;
      if (this.schoolTimer[id] <= 0) {
        this.schoolTimer[id] = rand(4, 9);
        const xMax = TANK.isPaludarium ? -0.3 : TANK.maxX - 0.9;
        const x = rand(TANK.minX + 0.9, Math.max(TANK.minX + 1.0, xMax));
        const z = rand(TANK.minZ + 0.45, TANK.maxZ - 0.45);
        const gy = groundY(x, z);
        const y = sp.bottom ? gy + 0.14 : clamp(wt * rand(sp.layer[0], sp.layer[1]), gy + 0.5, wt - 0.35);
        this.schoolGoals[id].set(x, y, z);
      }
      this.schoolTargets[id].lerp(this.schoolGoals[id], 1 - Math.exp(-0.35 * dt));
    }
  }

  // ================= ВВОД =================
  ray(x, y) {
    const v = new THREE.Vector2(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    return this.raycaster.ray;
  }
  tankBox() {
    return new THREE.Box3(
      new THREE.Vector3(-TANK.glassSide, -0.05, -TANK.glassFront),
      new THREE.Vector3(TANK.glassSide, (TANK.height || 3.6) + 0.2, TANK.glassFront)
    );
  }
  groundHit(ray) {
    const box = this.tankBox(); const p = new THREE.Vector3();
    if (!ray.intersectBox(box, p)) return null;
    for (let i = 0; i < 320; i++) {
      if (p.y <= groundY(p.x, p.z)) return p;
      p.addScaledVector(ray.direction, 0.04);
      if (!box.containsPoint(p)) return null;
    }
    return null;
  }
  decorHit(ray) {
    const box = this.tankBox(); const p = new THREE.Vector3();
    if (!ray.intersectBox(box, p)) return null;
    for (let i = 0; i < 320; i++) {
      for (const it of this.decor.items) {
        const d = DECOR[it.rec.type], s = it.rec.scale || 1;
        if (Math.hypot(p.x - it.rec.x, p.z - it.rec.z) < d.r * s * 0.9 && p.y < groundY(it.rec.x, it.rec.z) + d.h * s) return it.rec;
      }
      p.addScaledVector(ray.direction, 0.04);
      if (!box.containsPoint(p) || p.y < -0.1) return null;
    }
    return null;
  }

  onTap(x, y) {
    if (this.introRunning || dialogOpen()) return;
    this.audio.start();
    const ray = this.ray(x, y);
    if (this.mode === 'observe' || this.mode === 'photo') return;
    if (this.tool === 'feed') return this.feedAt(ray);
    if (this.tool === 'net') return this.netAt(ray);
    if (this.tool === 'place') return this.placeDrag(ray);
    if (this.tool === 'arrange') {
      const rec = this.decorHit(ray);
      if (rec) this.startPlacement({ mode: 'move', rec });
      else toast('Коснись предмета, который хочешь переставить');
      return;
    }
    if (this.tool === 'sponge' || this.tool === 'scraper' || this.tool === 'siphon') return;

    // режим «Смотреть»: питомец → карточка; иначе — лёгкий стук по стеклу
    let best = null, bt = Infinity;
    for (const f of this.fishes) { const t = f.hit(ray); if (t < bt) { bt = t; best = f; } }
    if (best) { this.openFishCard(best); return; }
    const p = new THREE.Vector3();
    const box = new THREE.Box3(
      new THREE.Vector3(-TANK.glassSide - 0.05, -0.05, -TANK.glassFront - 0.05),
      new THREE.Vector3(TANK.glassSide + 0.05, TANK.height || 3.6, TANK.glassFront + 0.05)
    );
    if (ray.intersectBox(box, p)) this.knock(p, x, y);
  }

  knock(point, sx, sy) {
    const now = performance.now();
    this.knockTimes = this.knockTimes.filter(t => now - t < 4000); this.knockTimes.push(now);
    const strength = this.knockTimes.length >= 3 ? 1.5 : 1;
    this.audio.knock();
    const r = h('div', { class: 'ripple', style: `left:${sx}px;top:${sy}px` }); $('#ripples').append(r); setTimeout(() => r.remove(), 800);
    for (const f of this.fishes) f.startle(point, strength);
    this.state.stats.knocks++;
    if (this.knockTimes.length >= 3) toast('Питомцы пугаются — давай дадим им отдохнуть 🐟');
  }

  feedAt(ray) {
    const st = this.state;
    const ft = this.feedType || 'flakes';
    if ((st.food[ft] || 0) <= 0) {
      this.feedPickerOpen = true;
      this.renderToolHint();
      toast('Этот корм закончился — выбери другой или загляни в магазин 🛒');
      return;
    }
    const box = new THREE.Box3(new THREE.Vector3(TANK.minX, 0, TANK.minZ), new THREE.Vector3(TANK.maxX, TANK.height || 3.6, TANK.maxZ));
    const a = new THREE.Vector3();
    if (!ray.intersectBox(box, a)) { toast('Коснись воды или берега в аквариуме'); return; }
    const far = a.clone().addScaledVector(ray.direction, 16);
    const back = new THREE.Ray(far, ray.direction.clone().negate());
    const b = new THREE.Vector3(); back.intersectBox(box, b);
    const m = a.clone().lerp(b, 0.5);
    const allFull = this.fishes.length && this.fishes.every(f => f.rec.satiety > 85);
    if (allFull) toast('Питомцы сыты 🙂 Лишний корм опустится на дно и загрязнит воду');
    st.food[ft]--;
    this.feedPickerOpen = st.food[ft] <= 0;
    this.food.drop(m.x, clamp(m.z, TANK.minZ + 0.3, TANK.maxZ - 0.3), this.tank.waterTop, ft);
    if (ft === 'tablets') this.audio.plop(); else this.audio.splash();
    if (this.tutorialStep === 1) this.setTutorial(2);
    this.renderToolHint();
    this.updateHud();
  }

  netAt(ray) {
    const p = this.groundHit(ray);
    if (!p) return;
    const n = this.food.collect(p.x, p.z, 0.95);
    if (n) {
      this.audio.click();
      this.renderToolHint();
      toast(this.food.onBottom === 0 ? 'Дно полностью очищено от корма! ✨' : `Собрано остатков корма: ${n}`);
    } else {
      toast(this.food.onBottom > 0
        ? 'Проведи пальцем по подсвеченным крошкам на дне'
        : 'На дне уже чисто ✨');
    }
  }

  glassHitUV(ray) {
    const z = this.tank.frontZ;
    if (Math.abs(ray.direction.z) < 1e-3) return null;
    const t = (z - ray.origin.z) / ray.direction.z;
    if (t < 0) return null;
    const p = ray.origin.clone().addScaledVector(ray.direction, t);
    const W = this.tank.glassW, H = this.tank.waterTop + 0.05;
    const u = (p.x + W / 2) / W, v = (p.y + 0.03) / H;
    return { u, v };
  }

  onDrag(x, y, start) {
    const ray = this.ray(x, y);
    if (this.tool === 'sponge' || this.tool === 'scraper') {
      const isScr = this.tool === 'scraper';
      if (start) {
        this.spongeStart = this.algae.softLevel();
        this.hardStart = this.algae.hardLevel();
      }
      this.showCursor(x, y, isScr ? 'scraper' : 'sponge');
      const uv = this.glassHitUV(ray);
      if (!uv || uv.u < 0 || uv.u > 1 || uv.v < 0 || uv.v > 1) return;
      if (isScr) {
        const res = this.algae.scrape(uv.u, uv.v, 0.055, 0.72);
        if ((res.hard > 0 || res.soft > 0) && (!this.lastScrub || performance.now() - this.lastScrub > 120)) {
          this.audio.scrape();
          this.lastScrub = performance.now();
          if (res.hard > 0.0001) this.spawnFlakeFX(x, y);
        }
      } else {
        const rem = this.algae.scrub(uv.u, uv.v, 0.058, 0.36);
        if (rem > 0 && (!this.lastScrub || performance.now() - this.lastScrub > 140)) {
          this.audio.scrub();
          this.lastScrub = performance.now();
        }
      }
    } else if (this.tool === 'siphon') {
      if (start) {
        this.siphonRemoved = 0;
        this.siphonStartCount = (curTank(this.state).detritus || []).length;
        this.lastSiphonPt = null;
      }
      const p = this.groundHit(ray);
      if (!p) { this.tank.setSiphonPos(0, 0, false); return; }
      this.tank.setSiphonPos(p.x, p.z, true);
      const tk = curTank(this.state);
      // Если водить слишком быстро, пугливые рыбки отплывают
      if (this.lastSiphonPt && this.lastSiphonPt.distanceTo(p) > 0.45) {
        for (const f of this.fishes) f.startle(p, 0.7);
      }
      this.lastSiphonPt = p.clone();
      // Собираем осадок и остатки корма в радиусе воронки
      let removed = 0;
      const list = tk.detritus || [];
      for (let i = list.length - 1; i >= 0; i--) {
        if (Math.hypot(list[i].x - p.x, list[i].z - p.z) < 0.42) {
          list.splice(i, 1);
          removed++;
        }
      }
      const foodRem = this.food.collect(p.x, p.z, 0.4);
      if (removed > 0 || foodRem > 0) {
        this.siphonRemoved += removed + foodRem;
        tk.water.waste = clamp(tk.water.waste - (removed * 0.9 + foodRem * 0.4), 0, 100);
        this.tank.updateDetritus(list);
        if (!this.lastSiphonSfx || performance.now() - this.lastSiphonSfx > 160) {
          this.audio.siphon();
          this.lastSiphonSfx = performance.now();
        }
      }
    } else if (this.tool === 'place') {
      this.placeDrag(ray);
    } else if (this.tool === 'net') {
      const p = this.groundHit(ray);
      if (p) {
        const n = this.food.collect(p.x, p.z, 0.75);
        if (n) {
          this.audio.click();
          this.renderToolHint();
          if (this.food.onBottom === 0) toast('Дно полностью очищено от корма! ✨');
        }
      }
    }
  }

  onDragEnd() {
    const c = this.state.counters;
    if (this.tool === 'sponge') {
      $('#ripples .sponge')?.remove();
      this.algae.refresh();
      const soft = this.algae.softLevel(), hard = this.algae.hardLevel();
      if (soft > 0.1) c.cleanArmed = true;
      if (c.cleanArmed && this.spongeStart > 0.04 && soft < 0.025) {
        c.cleanArmed = false;
        this.reward(10, 'Стекло сияет! ✨');
        this.doneTask('glass');
      } else if (this.spongeStart - soft > 0.01) {
        if (soft < 0.03 && hard > 0.025) toast('Мягкий налёт снят! Стойкие тёмные пятна легко убрать Скребком 🪒');
        else toast(`Чистота стекла: ${Math.round((1 - this.algae.level()) * 100)}%`);
      }
    } else if (this.tool === 'scraper') {
      $('#ripples .sponge')?.remove();
      this.algae.refresh();
      const hard = this.algae.hardLevel();
      if (c.scrapeArmed && this.hardStart > 0.02 && hard < 0.012) {
        c.scrapeArmed = false;
        this.reward(15, 'Стойкий налёт полностью счищен! ✨');
        this.doneTask('scrape');
      } else if (this.hardStart - hard > 0.005) {
        toast(`Стойкий налёт: осталось ${Math.round(hard * 100)}%`);
      }
    } else if (this.tool === 'siphon') {
      this.tank.setSiphonPos(0, 0, false);
      const tk = curTank(this.state);
      const left = (tk.detritus || []).length;
      if (this.siphonRemoved > 0) {
        if (c.siphonArmed && this.siphonStartCount >= 4 && left <= 2) {
          c.siphonArmed = false;
          this.reward(15, 'Грунт идеально просифонен! 🌀');
          this.doneTask('siphon');
        } else {
          if (this.siphonRemoved >= 4) this.doneTask('siphon');
          toast(left > 0 ? `Собрано осадка: ${this.siphonRemoved}. На дне осталось: ${left}` : 'Дно полностью чистое! ✨');
        }
        this.save();
        this.updateHud();
      }
    }
  }

  showCursor(x, y, toolId) {
    let s = $('#ripples .sponge');
    if (!s) {
      s = h('div', { class: 'sponge' }, h('img', { src: `img/ui/${toolId}.png`, alt: '' }));
      $('#ripples').append(s);
    } else {
      const im = s.querySelector('img');
      if (im && !im.src.endsWith(`${toolId}.png`)) im.src = `img/ui/${toolId}.png`;
    }
    s.style.left = x + 'px'; s.style.top = (y - 28) + 'px';
  }

  spawnFlakeFX(x, y) {
    const f = h('div', { class: 'alg-flake', style: `left:${x + rand(-14, 14)}px;top:${y + rand(-8, 8)}px` });
    $('#ripples').append(f);
    setTimeout(() => f.remove(), 650);
  }

  renderToolHint() {
    const hint = $('#toolHint');
    const txt = $('#toolHintText');
    if (this.tool === 'view' || this.tool === 'place') {
      hint.classList.add('hidden');
      hint.classList.remove('picker-open');
      return;
    }
    const shortFood = (id) => id === 'flakes' ? 'Хлопья' : id === 'granules' ? 'Гранулы' : 'Таблетки';
    if (this.tool === 'feed') {
      const st = this.state;
      txt.innerHTML = '';
      if (this.feedPickerOpen) {
        hint.classList.add('picker-open');
        const wrap = h('div', { class: 'feed-chips' });
        wrap.append(h('div', { class: 'feed-picker-head' }, 'Выбери корм:'));
        for (const id of Object.keys(FOOD_ITEMS)) {
          const cnt = st.food[id] || 0;
          wrap.append(h('button', {
            class: 'chip' + (this.feedType === id ? ' on' : ''),
            onclick: (e) => {
              e.stopPropagation();
              this.feedType = id;
              this.feedPickerOpen = false;
              this.audio.click();
              this.renderToolHint();
              this.updateHud();
              if (!this.tutorialStep) toast(`Выбрано: ${shortFood(id)} — коснись воды`, { life: 2.2 });
            },
          }, h('img', { src: `img/food/${id}.png`, class: 'chip-ic', alt: '' }), `${shortFood(id)} (${cnt})`));
        }
        txt.append(wrap);
      } else {
        hint.classList.remove('picker-open');
        const ft = this.feedType || 'flakes';
        const cnt = st.food[ft] || 0;
        txt.append(h('button', {
          class: 'tool-switch',
          title: 'Сменить корм',
          onclick: (e) => { e.stopPropagation(); this.feedPickerOpen = true; this.audio.click(); this.renderToolHint(); },
        }, h('img', { src: `img/food/${ft}.png`, class: 'chip-ic', alt: '' }), `${shortFood(ft)} · ${cnt} ▾`));
      }
      hint.classList.remove('hidden');
      return;
    }

    hint.classList.remove('picker-open');
    txt.innerHTML = '';
    const tk = curTank(this.state);
    const glass = Math.round((1 - this.algae.level()) * 100);
    const meta = {
      sponge:  { img: 'img/ui/sponge.png',  label: 'Губка',  sub: `${glass}%` },
      scraper: { img: 'img/ui/scraper.png', label: 'Скребок', sub: `${glass}%` },
      siphon:  { img: 'img/ui/siphon.png',  label: 'Сифон',  sub: `${(tk.detritus || []).length}` },
      net:     { img: 'img/ui/net.png',     label: 'Сачок',  sub: `${this.food.onBottom}` },
      arrange: { img: null,                 label: '✋ Перестановка', sub: '' },
    }[this.tool];
    if (!meta) { hint.classList.add('hidden'); return; }
    const pill = h('span', { class: 'tool-pill' },
      meta.img ? h('img', { src: meta.img, alt: '' }) : null,
      meta.label,
      meta.sub !== '' ? h('span', { class: 'tool-sub' }, `· ${meta.sub}`) : null);
    txt.append(pill);
    hint.classList.remove('hidden');
  }

  setTool(tool) {
    if (this.tool === 'siphon') this.tank.setSiphonPos(0, 0, false);
    $('#ripples .sponge')?.remove();
    const prev = this.tool;
    this.tool = tool;
    if (tool === 'feed') this.feedPickerOpen = true;
    else this.feedPickerOpen = false;
    document.querySelectorAll('#toolbar button').forEach(b => b.classList.toggle('active', b.dataset.act === 'feed' && tool === 'feed'));
    $('#hud').classList.toggle('tool-active', tool !== 'view');
    if (tool !== 'place') {
      $('#placeBar').classList.add('hidden');
      $('#toolbar').classList.toggle('hidden', tool !== 'view');
    }
    this.renderToolHint();
    if (tool !== prev && tool !== 'view' && tool !== 'place' && tool !== 'feed') {
      const tips = {
        sponge: 'Води пальцем по переднему стеклу, чтобы снять мягкий налёт',
        scraper: 'Счищай тёмные пятна на переднем стекле',
        siphon: 'Веди трубкой сифона по дну, чтобы собрать осадок',
        net: this.food.onBottom > 0
          ? 'Коснись или проведи по подсвеченным остаткам корма на дне'
          : 'На дне сейчас нет остатков корма ✨',
        arrange: 'Коснись предмета в аквариуме, чтобы переставить',
      };
      if (tips[tool]) toast(tips[tool], { life: 2.6 });
    }
    this.updateTutorialVisibility();
  }

  // ================= СОБЫТИЯ ЖИЗНЕННОГО ЦИКЛА И СЕРДЕЧКИ =================
  spawnHeart(worldPos) {
    if (this.mode === 'photo' || this.introRunning || this.activeScene !== this.scene) return;
    const p = worldPos.clone().project(this.camera);
    if (p.z > 1) return;
    const sx = (p.x + 1) / 2 * innerWidth;
    const sy = (1 - p.y) / 2 * innerHeight;
    const el = h('div', { class: 'heart-fx', style: `left:${sx}px;top:${sy}px` }, '💗');
    $('#ripples').append(el);
    setTimeout(() => el.remove(), 1450);
  }

  handleSimEvents(ev, fromCatchUp) {
    if (!ev) return;
    const activeId = this.state.activeTank;
    for (const c of ev.courtship || []) {
      if (c.tankId !== activeId || this.state.settings.courtship === false) continue;
      const m = this.fishes.find(f => f.rec.id === c.maleId);
      const fm = this.fishes.find(f => f.rec.id === c.femaleId);
      if (m && fm && m.startCourt) {
        m.startCourt(fm);
        this.spawnHeart(m.pos.clone().add(fm.pos).multiplyScalar(0.5));
      }
    }
    for (const p of ev.pregnant || []) {
      if (p.tankId === activeId) {
        const f = this.fishes.find(x => x.rec === p.female);
        if (f) f.updateScale(effectiveLifespan(this.state.settings));
        if (!fromCatchUp) toast(`${this.displayName(p.female)} скоро станет мамой! 🤰`);
      }
    }
    for (const ca of ev.clutchesAdded || []) {
      if (ca.tankId === activeId) {
        this.tank.updateClutches(curTank(this.state).clutches);
        if (!fromCatchUp) toast(`В аквариуме появилась кладка икринок (${SPECIES[ca.clutch.species]?.name})! 🥚`, { gold: true });
      }
    }
    for (const b of [...(ev.born || []), ...(ev.hatched || [])]) {
      this.doneTask('fry');
      if (b.tankId === activeId && !this.fishes.some(x => x.rec.id === b.fry.id)) {
        const nf = this.makePet(b.fry);
        if (b.pos) nf.pos.set(b.pos.x, b.pos.y + 0.08, b.pos.z);
        else if (b.mother) {
          const mf = this.fishes.find(x => x.rec === b.mother);
          if (mf) nf.pos.copy(mf.pos);
        }
        this.fishes.push(nf);
      }
      if (!fromCatchUp) {
        this.audio.coin();
        const spName = SPECIES[b.fry.species]?.name || 'питомца';
        toast(`Ура! Появился малёк: ${spName} 🍼`, { gold: true, life: 4.5 });
      }
    }
    if (fromCatchUp && ((ev.born?.length || 0) + (ev.hatched?.length || 0) > 0)) {
      const total = (ev.born?.length || 0) + (ev.hatched?.length || 0);
      toast(`Пока тебя не было, в аквариуме появились мальки (${total})! 🍼`, { gold: true, life: 4.5 });
    }
    for (const d of ev.departed || []) {
      if (d.tankId === activeId) {
        const idx = this.fishes.findIndex(x => x.rec.id === d.fishId);
        if (idx >= 0) {
          if (this.rig.follow === this.fishes[idx]) this.setFollow(null);
          this.fishes[idx].dispose(this.tank.tankGroup);
          this.fishes.splice(idx, 1);
        }
      }
      toast(`${d.mem.name} прожил(а) долгую счастливую жизнь (${d.mem.livedDays} дн.) и остался в Памятном альбоме 🕯️`, { life: 5 });
    }
    if (ev.born?.length || ev.hatched?.length || ev.departed?.length) {
      this.tank.updateClutches(curTank(this.state).clutches);
      this.checkTasks();
      this.save();
    }
  }

  // ================= ПИТОМЦЫ =================
  addFish(partial, pos, first = false) {
    const st = this.state, tk = curTank(st);
    const now = Date.now();
    const sp = SPECIES[partial.species];
    const rec = {
      id: 'f' + (st.nextId++), species: partial.species, sex: partial.sex, variant: partial.variant, name: partial.name || '',
      bornAt: now - (first ? 0 : rand(0, 0.4) * sp.adultDays * 86400000), boughtAt: now,
      satiety: 60, health: 100, stress: 22,
    };
    tk.fish.push(rec);
    const f = this.makePet(rec);
    if (pos) f.pos.copy(pos);
    else if (!f.isCrab && !f.isAmphibian) {
      const maxX = TANK.isPaludarium ? -0.4 : TANK.maxX - 0.6;
      f.pos.set(rand(TANK.minX + 0.6, maxX), this.tank.waterTop - 0.3, rand(0, 0.8));
      f.vel.set(0, -0.4, 0);
    }
    this.fishes.push(f);
    this.checkTasks();
    return f;
  }

  displayName(rec) { return rec.name || SPECIES[rec.species]?.name || 'Питомец'; }

  onFishEat(fish, before) {
    const st = this.state;
    st.stats.fedTotal++;
    st.tasks.dailyFed = true;
    if (!st.tasks.done.feed) this.doneTask('feed');
    this.checkDay();
    if (before < 70 && st.counters.feedCoins < 40) { st.counters.feedCoins++; this.reward(1, null, true); }
    if (this.tutorialStep === 2 || this.tutorialStep === 1) this.finishTutorial(fish);
  }

  openFishCard(fish) { this.selected = fish; this.panels.fishCard(fish); this.updateTutorialVisibility(); }

  async renameFish(fish, first) {
    const name = await nameDialog(first ? 'Как назовём питомца?' : 'Новое имя', first ? 'Имя появится над питомцем, когда ты его выберешь.' : '', fish.rec.name);
    if (name) { fish.rec.name = name; this.doneTask('name'); this.checkTasks(); this.save(); }
    return name;
  }

  updateLabel() {
    const f = this.rig.follow || (this.panel.current === 'card' ? this.selected : null);
    const el = $('#fishLabel');
    if (!f || this.mode === 'photo' || this.introRunning) { el.classList.add('hidden'); return; }
    const p = f.pos.clone(); p.y += 0.38; p.project(this.camera);
    if (p.z > 1) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.textContent = (this.rig.follow === f ? '🎥 ' : '') + this.displayName(f.rec);
    el.style.left = ((p.x + 1) / 2 * innerWidth) + 'px';
    el.style.top = ((1 - p.y) / 2 * innerHeight) + 'px';
  }

  setFollow(fish) {
    this.rig.follow = fish;
    const spec = TANKS[this.state.activeTank];
    if (fish) { this.rig.t.dist = Math.min(this.rig.t.dist, 5.0); this.doneTask('follow'); }
    else { this.rig.targetGoal.set(0, spec.isPaludarium ? 1.25 : 1.65, 0); this.rig.t.dist = spec.camDist; }
  }

  // ================= РАЗМЕЩЕНИЕ =================
  startPlacement({ mode, type, rec, price }) {
    this.panel.close();
    const r = rec ? rec : { id: 'd' + Date.now(), type, x: rand(-1, 1), z: rand(-0.3, 0.5), rot: rand(0, 6.28), scale: 1 };
    this.placing = { mode, rec: r, orig: rec ? { ...rec } : null, price };
    if (mode === 'move') this.decor.remove(rec);
    this.decor.showGhost(r);
    this.tool = 'place';
    $('#toolHint').classList.add('hidden');
    $('#toolbar').classList.add('hidden');
    $('#placeBar').classList.remove('hidden');
    $('#placeBar [data-p=store]').classList.toggle('hidden', mode !== 'move');
    $('#placeBar [data-p=ok]').textContent = mode === 'buy' ? `Купить за ${price} 💰` : 'Поставить';
    this.validatePlacement();
    this.updateTutorialVisibility();
  }
  placeDrag(ray) {
    if (!this.placing) return;
    const p = this.groundHit(ray);
    if (!p) return;
    const r = this.placing.rec;
    r.x = clamp(p.x, TANK.minX + 0.2, TANK.maxX - 0.2); r.z = clamp(p.z, TANK.minZ + 0.2, TANK.maxZ - 0.2);
    this.validatePlacement();
  }
  validatePlacement() {
    const err = this.decor.validate(this.placing.rec, this.placing.mode === 'move' ? this.placing.rec : null);
    this.placing.err = err;
    this.decor.updateGhost(this.placing.rec, !err);
    const info = $('#placeInfo');
    info.textContent = err || `${DECOR[this.placing.rec.type].name}: перетащи пальцем по дну`;
    info.classList.toggle('err', !!err);
  }
  placeAction(a) {
    const P = this.placing; if (!P) return;
    const r = P.rec;
    if (a === 'rotL') r.rot = (r.rot || 0) + 0.4;
    if (a === 'rotR') r.rot = (r.rot || 0) - 0.4;
    if (a === 'smaller') r.scale = clamp((r.scale || 1) - 0.1, 0.7, 1.3);
    if (a === 'bigger') r.scale = clamp((r.scale || 1) + 0.1, 0.7, 1.3);
    if (['rotL', 'rotR', 'smaller', 'bigger'].includes(a)) { this.validatePlacement(); return; }
    const st = this.state, tk = curTank(st);
    if (a === 'cancel') {
      if (P.mode === 'move') this.decor.add(P.orig ? Object.assign(r, P.orig) : r);
      if (P.mode === 'inv') st.inventory[r.type] = (st.inventory[r.type] || 0) + 1;
    } else if (a === 'store') {
      tk.decor = tk.decor.filter(d => d !== r);
      st.inventory[r.type] = (st.inventory[r.type] || 0) + 1;
      toast(`${DECOR[r.type].name} убран в инвентарь`);
    } else if (a === 'ok') {
      if (P.err) { toast(P.err); return; }
      if (P.mode === 'buy') {
        if (st.coins < P.price) { toast('Не хватает монет'); return; }
        st.coins -= P.price; this.audio.coin();
      }
      if (P.mode !== 'move') tk.decor.push(r);
      this.decor.add(r);
      this.doneTask(DECOR[r.type].kind === 'plant' ? 'plant' : 'decor');
      if (['castle', 'ruins', 'chest', 'pagoda'].includes(r.type)) this.doneTask('castle');
      toast(P.mode === 'move' ? 'Готово!' : `${DECOR[r.type].name} теперь в аквариуме`);
    }
    this.decor.hideGhost();
    this.placing = null;
    this.setTool('view');
    this.save(); this.updateHud();
  }

  // ================= ВОДА =================
  waterChange() {
    if (this.waterAnim) return;
    const st = this.state, tk = curTank(st);
    const top = TANK.waterTop, low = top - (TANK.isPaludarium ? 0.35 : 0.65);
    let t = 0, pourAcc = 0;
    toast('Сливаем 20% воды сифоном…');
    this.audio.waterPour();
    this.waterAnim = (dt) => {
      t += dt; pourAcc += dt;
      if (pourAcc > 0.45 && (t < 2.2 || (t > 3 && t < 5.5))) { pourAcc = 0; this.audio.waterPour(); }
      let y;
      if (t < 2.2) y = top - (top - low) * (t / 2.2);
      else if (t < 3) { y = low; if (!this._msg) { this._msg = 1; toast('Доливаем отстоянную воду той же температуры'); } }
      else if (t < 5.5) y = low + (top - low) * ((t - 3) / 2.5);
      else {
        y = top; this.waterAnim = null; this._msg = 0;
        tk.water.waste *= 0.72; tk.water.oxygen = Math.min(100, tk.water.oxygen + 5);
        for (const f of this.fishes) f.rec.stress = clamp(f.rec.stress + 4, 0, 100);
        this.doneTask('water');
        if (st.counters.waterDay !== today()) { st.counters.waterDay = today(); this.reward(5, 'Вода свежая 💧'); } else toast('Вода свежая 💧');
        this.save();
      }
      this.tank.setWaterTop(y);
    };
  }

  // ================= НАГРАДЫ И ЗАДАНИЯ =================
  reward(n, msg, quiet) {
    this.state.coins += n;
    const c = $('#coins'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
    if (!quiet) this.audio.coin();
    if (msg) toast(`${msg}  +${n} 💰`, { gold: true });
    this.updateHud();
  }
  doneTask(id) {
    const t = this.state.tasks;
    if (t.done[id]) return;
    t.done[id] = true;
    const task = TASKS.find(x => x.id === id);
    if (task && this.state.introDone) toast(`⭐ Задание выполнено: ${task.title}. Забери награду в «Заданиях»`, { gold: true, life: 4 });
    this.updateBadge();
  }
  checkTasks() {
    const st = this.state, tk = curTank(st), all = allFish(st);
    const c = {}; tk.fish.forEach(f => c[f.species] = (c[f.species] || 0) + 1);
    if (all.length >= 2) this.doneTask('second');
    for (const [spId, n] of Object.entries(c)) {
      const sp = SPECIES[spId];
      if (sp?.school && n >= sp.schoolMin) this.doneTask('school');
    }
    if (all.some(f => SPECIES[f.species]?.category === 'catfish')) this.doneTask('catfish');
    if (all.some(f => SPECIES[f.species]?.needsPaludarium)) this.doneTask('crab');
    if (all.length >= 2 && all.every(f => f.name)) this.doneTask('allnames');
    this.updateBadge();
  }
  checkDay() {
    const t = this.state.tasks, d = today();
    if (t.dailyDate !== d) { t.dailyDate = d; t.dailyFed = false; t.dailyChecked = false; }
    if (this.state.counters.feedDay !== d) { this.state.counters.feedDay = d; this.state.counters.feedCoins = 0; }
    this.updateBadge();
  }
  claimable() {
    const t = this.state.tasks;
    const list = TASKS.filter(x => t.done[x.id] && !t.claimed[x.id]).length;
    const daily = t.dailyFed && t.dailyChecked && t.dailyClaimed !== t.dailyDate;
    return list + (daily ? 1 : 0);
  }
  claim(id) {
    const t = this.state.tasks;
    if (id === 'daily') { t.dailyClaimed = t.dailyDate; this.reward(DAILY_TASK.reward, 'Ежедневный уход'); }
    else { const task = TASKS.find(x => x.id === id); t.claimed[id] = true; this.reward(task.reward, task.title); }
    this.updateBadge(); this.save();
  }
  updateBadge() { $('#taskBadge')?.classList.toggle('hidden', !this.claimable()); }

  // ================= HUD =================
  updateHud() {
    const st = this.state, tk = curTank(st), spec = TANKS[st.activeTank];
    $('#coins b').textContent = st.coins;
    $('#foodLeft').innerHTML = `<img class="pill-ic" src="img/food/${this.feedType}.png" alt=""><b>${st.food[this.feedType] || 0}</b>`;
    const tod = timeOfDay(tk);
    $('#clock').textContent = { day: '☀️ День', evening: '🌇 Вечер', night: '🌙 Ночь' }[tod];

    // Кнопка быстрого переключения аквариумов (появляется, когда куплено >1 аквариума)
    const tp = $('#tankPill');
    if (tp) {
      tp.classList.toggle('hidden', (st.owned.tanks || []).length <= 1);
      tp.innerHTML = `<img class="pill-ic" src="img/tanks/${spec.id}.png" alt="">${spec.name} ▾`;
    }

    const q = waterQuality(tk), [ql, qc] = qualityLabel(q);
    const lvl = this.algae.level();
    const glass = Math.round((1 - lvl) * 100);
    const gc = glass > 85 ? 'good' : glass > 65 ? 'ok' : glass > 45 ? 'warn' : 'bad';
    const oc = tk.water.oxygen > 85 ? 'good' : tk.water.oxygen > 70 ? 'ok' : tk.water.oxygen > 55 ? 'warn' : 'bad';
    let html = `<div class="wrow"><span>Качество воды</span><b class="${qc}">${ql}</b></div>
      <div class="wrow"><span>Чистота стекла</span><b class="${gc}">${glass}%</b></div>
      <div class="wrow"><span>Температура</span><b class="good">${tk.water.temp.toFixed(1)} °C</b></div>
      <div class="wrow"><span>Кислород</span><b class="${oc}">${Math.round(tk.water.oxygen)}%</b></div>`;
    if (st.settings.advanced) {
      const w = tk.water.waste;
      html += `<div class="wrow"><span>Аммиак NH₃</span><b>${(w * 0.004).toFixed(2)} мг/л</b></div>
        <div class="wrow"><span>Нитриты NO₂</span><b>${(w * 0.008).toFixed(2)} мг/л</b></div>
        <div class="wrow"><span>Нитраты NO₃</span><b>${Math.round(w * 0.6)} мг/л</b></div>
        <div class="wrow"><span>Фильтр</span><b>${Math.max(0, 100 - Math.round(tk.filterDirt || 0))}%</b></div>
        <div class="wrow"><span>Осадок / корм</span><b>${(tk.detritus || []).length} / ${this.food.onBottom}</b></div>`;
    }
    $('#waterPanel').innerHTML = html;
    const bottom = this.food.onBottom;
    if (bottom > 8 && (!this.lastLeftoverHint || this.time - this.lastLeftoverHint > 90)) {
      this.lastLeftoverHint = this.time;
      toast('На дне много остатков корма — их можно собрать сачком или сифоном (Уборка)');
    }
    if (this.tool !== 'view' && this.tool !== 'place' && !(this.tool === 'feed' && this.feedPickerOpen)) {
      this.renderToolHint();
    }
    if (this.panel.current === 'card' && this.selected) this.panels.refreshCard();
  }

  // ================= РЕЖИМЫ =================
  setMode(mode) {
    this.mode = mode;
    const ui = !mode;
    $('#hud').classList.toggle('hidden', !ui);
    $('#obsExit').classList.toggle('hidden', mode !== 'observe');
    $('#photoBar').classList.toggle('hidden', mode !== 'photo');
    if (!ui) { this.panel.close(); this.setTool('view'); }
    this.updateTutorialVisibility();
  }
  takePhoto() {
    this.audio.shutter();
    this.captureNext = () => {
      const src = this.canvas;
      const w = 720, hgt = Math.round(720 * src.height / src.width);
      const c = document.createElement('canvas'); c.width = w; c.height = hgt;
      c.getContext('2d').drawImage(src, 0, 0, w, hgt);
      const data = c.toDataURL('image/jpeg', 0.82);
      this.album.push({ t: Date.now(), data });
      while (this.album.length > 12) this.album.shift();
      saveAlbum(this.album);
      const f = h('div', { id: 'flash' }); document.body.append(f); setTimeout(() => f.remove(), 450);
      this.state.stats.photos++;
      this.doneTask('photo');
      toast('Снимок сохранён в альбом: Обитатели → Альбом 📷');
    };
  }

  // ================= ТУТОРИАЛ =================
  setTutorial(step) {
    this.tutorialStep = step;
    const feedBtn = document.querySelector('#toolbar [data-act=feed]');
    feedBtn.classList.toggle('pulse', step === 1);
    const text = { 1: 'Нажми «Корм» внизу экрана 👇', 2: 'Теперь коснись воды — корм упадёт сверху' }[step];
    const el = $('#tutorial');
    if (text) el.textContent = text;
    this.updateTutorialVisibility();
  }
  updateTutorialVisibility() {
    const el = $('#tutorial');
    const show = !!this.tutorialStep && !this.panel.isOpen && !this.mode && (this.tool === 'view' || this.tool === 'feed');
    el.classList.toggle('hidden', !show);
  }
  finishTutorial(fish) {
    if (this.state.tutorialDone) return;
    this.state.tutorialDone = true;
    this.setTutorial(0);
    this.setFollow(fish);
    this.rig.t.dist = 3.8;
    toast(`${this.displayName(fish.rec)} с удовольствием ест! За заботу ты получаешь монетки 💰`, { life: 4.5 });
    setTimeout(() => { this.setTool('view'); this.setFollow(null); }, 4500);
    const tips = [
      'Коснись рыбки — откроется карточка, а кнопка 📖 расскажет о её жизни в природе',
      'В «Уборке» доступны губка, скребок, сифон грунта и промывка фильтра',
      'В «Магазине» тебя ждут разные рыбки, сомики, украшения и новые аквариумы!',
    ];
    tips.forEach((t, i) => setTimeout(() => toast(t, { life: 4.5 }), 6000 + i * 5200));
    this.save();
  }

  // ================= СТАРТ =================
  async start() {
    this.audio.start();
    $('#splash').classList.add('hidden');
    const st = this.state;
    if (!st.introDone) {
      this.introRunning = true;
      this.intro = new Intro(this);
      const fish = await this.intro.run();
      this.introRunning = false;
      st.introDone = true;
      $('#hud').classList.remove('hidden');
      this.rig.follow = fish;
      await this.renameFish(fish, true);
      this.rig.follow = null; this.rig.targetGoal.set(0, 1.65, 0); this.rig.setView(0, 1.42, TANKS[st.activeTank].camDist);
      this.setTutorial(1);
      this.save();
    } else {
      this.activeScene = this.scene;
      $('#hud').classList.remove('hidden');
      if (!st.tutorialDone) this.setTutorial(1);
      const away = (Date.now() - st.lastSaved) / 3600000;
      if (away > 6) toast(`С возвращением! Питомцы рады тебя видеть 🐠`, { life: 4 });
    }
    this.updateHud();
    clearNotifications();
    if (st.settings.notifications !== false) requestNotifPermission();
  }

  save() {
    if (this.saveDisabled) return;
    this.saveCurrentTankData();
    saveState(this.state);
  }

  bindUI() {
    $('#toolbar').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      this.audio.start(); this.audio.click();
      const a = b.dataset.act;
      if (a === 'feed') {
        this.panel.close();
        this.setTool(this.tool === 'feed' ? 'view' : 'feed');
        if (this.tool === 'feed' && this.tutorialStep === 1) this.setTutorial(2);
        return;
      }
      if (this.panel.current === a) { this.panel.close(); return; }
      this.panels.open(a);
      this.updateTutorialVisibility();
    });
    $('#tankPill')?.addEventListener('click', () => {
      this.audio.click();
      const list = this.state.owned.tanks || ['tank60'];
      if (list.length <= 1) return;
      const next = list[(list.indexOf(this.state.activeTank) + 1) % list.length];
      this.switchTank(next);
    });
    $('#toolExit').addEventListener('click', () => { this.audio.click(); this.setTool('view'); if (this.tutorialStep === 2) this.setTutorial(1); });
    $('#placeBar').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { this.audio.click(); this.placeAction(b.dataset.p); } });
    $('#btnObserve').addEventListener('click', () => { this.setMode('observe'); toast('Режим наблюдения. Кнопка вверху справа вернёт интерфейс'); });
    $('#btnPhoto').addEventListener('click', () => this.setMode('photo'));
    $('#obsExit').addEventListener('click', () => this.setMode(null));
    $('#photoExit').addEventListener('click', () => this.setMode(null));
    $('#photoShot').addEventListener('click', () => this.takePhoto());
    $('#dialog').addEventListener('pointerdown', (e) => e.stopPropagation());

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.save();
        scheduleNotifications(this.state);
        this.audio.suspend();
        this.paused = true;
      } else {
        clearNotifications();
        const ev = catchUp(this.state, this.algae); this.checkDay();
        const bl = effectiveLifespan(this.state.settings);
        this.fishes.forEach(f => f.updateScale(bl));
        this.tank.updateDetritus(curTank(this.state).detritus);
        this.tank.updateClutches(curTank(this.state).clutches);
        this.handleSimEvents(ev, true);
        this.clock.getDelta(); this.paused = false; this.audio.resume(); this.updateHud();
      }
    });
    addEventListener('pagehide', () => { this.save(); scheduleNotifications(this.state); });

    // Кнопка «Назад» на Android
    const App = window.Capacitor?.Plugins?.App;
    if (App) App.addListener('backButton', () => {
      if (dialogOpen()) { closeDialog(null); return; }
      if (this.placing) { this.placeAction('cancel'); return; }
      if (this.panel.isOpen) { this.panel.close(); return; }
      if (this.mode) { this.setMode(null); return; }
      if (this.tool !== 'view') { this.setTool('view'); return; }
      if (this.rig.follow) { this.setFollow(null); return; }
      this.save(); scheduleNotifications(this.state); App.minimizeApp();
    });
    this.panel.onClose = () => { this.selected = null; this.updateTutorialVisibility(); };
  }
}

// ---- запуск
let game;
try {
  game = new Game();
  window.__game = game;
  const btn = $('#btnStart');
  btn.disabled = false;
  btn.textContent = game.state.introDone ? 'Продолжить' : 'Начать';
  btn.addEventListener('click', () => game.start(), { once: true });
} catch (e) {
  console.error(e);
  $('#btnStart').textContent = 'Ошибка запуска: ' + e.message;
}
