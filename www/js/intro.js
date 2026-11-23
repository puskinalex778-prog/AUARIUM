// Вступительная кат-сцена (≈30 с + выбор рыбки): зоомагазин → выбор → пакет → дорога домой →
// адаптация пакета в аквариуме → выпуск → имя → первое кормление. Можно пропустить.
import * as THREE from 'three';
import { SPECIES, TANK } from './data.js';
import { makeFishMesh } from './fishmodel.js';
import { canvasTex, rand, damp } from './fx.js';
import { $, h, showDialog, closeDialog } from './ui.js';

export class Intro {
  constructor(game) { this.game = game; this.skipped = false; this.anim = null; this.t = 0; }

  caption(text) {
    const c = $('#caption');
    if (!text) { c.classList.remove('show'); return; }
    c.classList.remove('show');
    setTimeout(() => { c.textContent = text; c.classList.add('show'); }, 150);
  }
  fade(on) { $('#introFade').style.opacity = on ? 1 : 0; }
  wait(sec) {
    return new Promise(res => {
      if (this.skipped) return res();
      const end = performance.now() + sec * 1000;
      const tick = () => { if (this.skipped || performance.now() >= end) res(); else requestAnimationFrame(tick); };
      tick();
    });
  }

  // --- Зоомагазин
  buildShop() {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x2a1f1a);
    s.add(new THREE.HemisphereLight(0xffe8cc, 0x3a2a20, 0.9));
    const p1 = new THREE.PointLight(0xffd6a0, 25, 30, 1.6); p1.position.set(0, 4.5, 4); s.add(p1);
    const floorTex = canvasTex(256, 256, (c, w, hh) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { c.fillStyle = (x + y) % 2 ? '#d8c9b0' : '#b9a78a'; c.fillRect(x * 32, y * 32, 32, 32); } });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(6, 6);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.6 }));
    floor.rotation.x = -Math.PI / 2; s.add(floor);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 10), new THREE.MeshStandardMaterial({ color: 0x6b8f7a, roughness: 0.9 }));
    wall.position.set(0, 5, -1.2); s.add(wall);
    // Вывеска
    const sign = canvasTex(640, 140, (c, w, hh) => {
      c.fillStyle = '#183a4a'; c.fillRect(0, 0, w, hh); c.strokeStyle = '#ffcf5a'; c.lineWidth = 8; c.strokeRect(6, 6, w - 12, hh - 12);
      c.fillStyle = '#ffe9b0'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ЗООМАГАЗИН «РЫБКА»', w / 2, hh / 2 + 2, w - 48);
    });
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), new THREE.MeshBasicMaterial({ map: sign })); sg.position.set(0, 5.0, -1.1); sg.scale.setScalar(0.8); s.add(sg);
    // Стеллаж с аквариумами
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.7 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xcfeff5, transparent: true, opacity: 0.18, roughness: 0.05 });
    this.shopFish = [];
    const hues = [0.52, 0.48, 0.58, 0.45];
    const species = ['guppy', 'neon', 'danio'];
    for (let row = 0; row < 3; row++) {
      const y = 0.6 + row * 1.45;
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.12, 1.3), shelfMat); shelf.position.set(0, y - 0.08, -0.4); s.add(shelf);
      for (let col = 0; col < 4; col++) {
        const x = -3.45 + col * 2.3;
        const water = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.1, 0.95), new THREE.MeshStandardMaterial({
          color: new THREE.Color().setHSL(hues[(row + col) % 4], 0.6, 0.35), emissive: new THREE.Color().setHSL(hues[(row + col) % 4], 0.7, 0.25), transparent: true, opacity: 0.55 }));
        water.position.set(x, y + 0.55, -0.4); s.add(water);
        const gl = new THREE.Mesh(new THREE.BoxGeometry(2.04, 1.16, 1.0), glassMat); gl.position.copy(water.position); s.add(gl);
        const sp = species[(row * 4 + col) % 3];
        for (let k = 0; k < 4; k++) {
          const m = makeFishMesh(sp, SPECIES[sp].variants[k % SPECIES[sp].variants.length], k % 2 ? 'f' : 'm', false);
          m.group.scale.setScalar(0.42); s.add(m.group);
          this.shopFish.push({ m, cx: x, cy: y + 0.55, cz: -0.4, r: rand(0.3, 0.7), sp: rand(0.6, 1.2) * (k % 2 ? 1 : -1), ph: rand(0, 6), yph: rand(0, 6) });
        }
      }
    }
    // Прилавок
    const counter = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.6 }));
    counter.position.set(3.5, 0.6, 3.0); s.add(counter);
    this.shopScene = s;
  }

  buildBag(spId, variant, sex) {
    const g = new THREE.Group();
    const pts = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; const y = t * 1.4; const r = t < 0.65 ? 0.48 * Math.sin(Math.PI * (0.15 + t * 0.75)) + 0.05 : 0.48 * (1 - (t - 0.65) / 0.35) * 0.55 + 0.03; pts.push(new THREE.Vector2(Math.max(r, 0.03), y)); }
    const bag = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), new THREE.MeshStandardMaterial({ color: 0xeaf8ff, transparent: true, opacity: 0.25, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
    const wpts = pts.slice(0, 10).map(p => new THREE.Vector2(p.x * 0.95, p.y));
    const water = new THREE.Mesh(new THREE.LatheGeometry(wpts, 24), new THREE.MeshStandardMaterial({ color: 0x5fc7e0, transparent: true, opacity: 0.3, depthWrite: false }));
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffcf5a })); knot.position.y = 1.42;
    const fish = makeFishMesh(spId, variant, sex, false); fish.group.scale.setScalar(0.38); fish.group.position.y = 0.42;
    g.add(water, fish.group, bag, knot);
    bag.renderOrder = 6; water.renderOrder = 5;
    g.userData = { fish, bag, water };
    return g;
  }

  update(dt) {
    this.t += dt;
    if (this.shopFish && this.game.activeScene === this.shopScene) {
      for (const f of this.shopFish) {
        f.ph += dt * f.sp * 0.8;
        const x = f.cx + Math.cos(f.ph) * f.r, z = f.cz + Math.sin(f.ph) * 0.25, y = f.cy + Math.sin(this.t * 0.8 + f.yph) * 0.2;
        f.m.group.position.set(x, y, z);
        f.m.group.rotation.y = -f.ph - (f.sp > 0 ? Math.PI / 2 : -Math.PI / 2);
        f.m.uniforms.uAmp.value = 0.04; f.m.uniforms.uFreq.value = 10;
      }
    }
    if (this.anim) this.anim(dt);
  }

  async run() {
    const g = this.game;
    $('#intro').classList.remove('hidden');
    $('#btnSkip').onclick = () => { this.skipped = true; this.fade(false); this.caption(''); };
    this.buildShop();
    g.activeScene = this.shopScene;
    // 1. Проход по магазину
    const cam = g.camera; cam.position.set(-1, 2.4, 11); cam.lookAt(0, 2, 0);
    let p = 0;
    this.anim = (dt) => {
      p = Math.min(1, p + dt / 7);
      const e = p * p * (3 - 2 * p);
      cam.position.set(-1 + e * 1.2, 2.9 - e * 0.3, 12 - e * 4.6);
      cam.lookAt(e * 0.3, 2.5, -0.4);
    };
    this.fade(false);
    this.caption('Сегодня особенный день: ты пришёл в зоомагазин за своим первым питомцем!');
    await this.wait(4);
    this.caption('Рыбки здесь разные — посмотри и выбери ту, что понравится.');
    await this.wait(3);
    this.anim = null;
    this.caption('');
    // 2. Выбор
    const spId = await this.pickFish();
    const sp = SPECIES[spId];
    const sex = spId === 'guppy' ? 'm' : (Math.random() < 0.5 ? 'm' : 'f');
    const variant = sp.variants[Math.floor(Math.random() * sp.variants.length)];
    this.choice = { spId, sex, variant };
    // 3. Пакет
    if (!this.skipped) {
      const bag = this.buildBag(spId, variant, sex);
      bag.position.set(0.3, 0.9, 3.4); this.shopScene.add(bag);
      const bf = bag.userData.fish;
      let q = 0;
      this.anim = (dt) => {
        q += dt;
        bag.position.y = 0.9 + Math.min(q / 2.5, 1) * 1.1; bag.position.x = 0.3 + Math.sin(q * 1.3) * 0.05; bag.rotation.y = Math.sin(q * 0.7) * 0.3;
        bf.group.position.set(Math.cos(q * 1.4) * 0.18, 0.4 + Math.sin(q * 2) * 0.05, Math.sin(q * 1.4) * 0.18);
        bf.group.rotation.y = -q * 1.4 - Math.PI / 2;
        cam.position.lerp(new THREE.Vector3(0.6, 2.2, 6.2), 1 - Math.exp(-2 * dt)); cam.lookAt(bag.position.x, bag.position.y + 0.6, bag.position.z);
      };
      this.caption(`Продавец бережно сажает ${sp.name.toLowerCase()} в пакет с водой и воздухом.`);
      await this.wait(4.5);
      // 4. Дорога домой
      this.fade(true); this.caption('Дорога домой… Пакет держим ровно, в тепле и тени.');
      await this.wait(2.8);
    }
    this.anim = null;
    // 5. Дом, адаптация
    g.activeScene = g.scene;
    g.rig.setView(0.15, 1.38, 6.4, true); g.rig.targetGoal.set(0.4, 2.6, 0.2); g.rig.target.copy(g.rig.targetGoal);
    let bag = null;
    if (!this.skipped) {
      bag = this.buildBag(spId, variant, sex);
      bag.scale.setScalar(0.85);
      bag.position.set(0.4, TANK.waterTop - 0.55, 0.2); g.scene.add(bag);
      this.fade(false);
      this.caption('Пакет плавает в аквариуме, чтобы температура воды сравнялась. Так рыбке будет спокойнее.');
      $('#thermo').classList.remove('hidden');
      let a = 0;
      const bf = bag.userData.fish;
      this.anim = (dt) => {
        a += dt;
        bag.position.y = TANK.waterTop - 0.55 + Math.sin(a * 1.6) * 0.04; bag.rotation.z = Math.sin(a * 1.1) * 0.06;
        bf.group.position.set(Math.cos(a * 1.2) * 0.16, 0.4, Math.sin(a * 1.2) * 0.16); bf.group.rotation.y = -a * 1.2 - Math.PI / 2;
        $('#thermo .bar i').style.width = Math.min(100, a / 6 * 100) + '%';
      };
      await this.wait(6.5);
      $('#thermo').classList.add('hidden');
    }
    // 6. Выпуск
    const fish = g.addFish({ species: spId, sex, variant, name: '' }, bag ? bag.position.clone().add(new THREE.Vector3(0, 0.3, 0)) : null, true);
    if (bag) {
      fish.vel.set(0, -0.3, 0.2);
      this.caption('Пакет открыт — добро пожаловать домой!');
      let k = 0;
      this.anim = (dt) => {
        k += dt; bag.position.y += dt * 0.5; bag.traverse(o => { if (o.material) { o.material.transparent = true; o.material.opacity = Math.max(0, (o.material.opacity ?? 1) - dt * 0.35); } });
        if (k > 2.8) { g.scene.remove(bag); this.anim = null; }
      };
      g.rig.follow = fish;
      g.rig.setView(0.1, 1.42, 5.2);
      await this.wait(3.5);
    }
    this.anim = null; if (bag) g.scene.remove(bag);
    this.caption('');
    $('#intro').classList.add('hidden');
    return fish;
  }

  pickFish() {
    return showDialog(box => {
      box.append(h('h3', {}, 'Выбери первую рыбку'));
      box.append(h('p', {}, 'Потом в магазине можно будет завести ещё питомцев.'));
      const row = h('div', { class: 'pick-row' });
      for (const id of ['guppy', 'neon', 'danio']) {
        const sp = SPECIES[id];
        row.append(h('div', { class: 'pick-card' },
          h('div', { class: 'em' }, h('img', { src: `img/species/${id}.png`, alt: sp.name })), h('h3', {}, sp.name), h('p', {}, sp.traits),
          h('button', { class: 'btn', onclick: () => closeDialog(id) }, 'Выбрать')));
      }
      box.append(row);
    }, true);
  }
}
