// Сцена: комната, тумба, аквариум или акватеррариум (стекло, вода, грунт/берег, фон),
// оборудование, свет, пузырьки, осадок (детрит) на дне и 3D-насадка сифона.
import * as THREE from 'three';
import { TANK, groundY, isLand, LIGHT_COLORS } from './data.js';
import { G, addCaustics, canvasTex, rand, damp, vnoise3 } from './fx.js';

const TIME_PRESETS = {
  day:     { sky: 0xbfd9ee, hemi: 0.78, hemiSky: 0xf2f6ff, hemiGround: 0x8a7458, lamp: 0.0, sun: 1.15, window: 0xcfe8ff, bg: 0x2a2f38 },
  evening: { sky: 0xff9a5c, hemi: 0.34, hemiSky: 0xffc89a, hemiGround: 0x4a3426, lamp: 1.0, sun: 0.32, window: 0xff9858, bg: 0x1a171c },
  night:   { sky: 0x081028, hemi: 0.07, hemiSky: 0x4a64a8, hemiGround: 0x0c0a12, lamp: 0.16, sun: 0.0, window: 0x0a132c, bg: 0x05070d },
};

const MAX_DETRITUS = 120;
const MAX_EGGS = 140;
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);

export class Tank {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.root = new THREE.Group();
    this.roomGroup = new THREE.Group();
    this.tankGroup = new THREE.Group();
    this.root.add(this.roomGroup, this.tankGroup);
    scene.add(this.root);

    this.lightState = { lamp: 1, room: 1 };
    this.bubbleOn = true;
    this.waterTopAnim = TANK.waterTop;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();

    this.buildRoom();
    this.buildLights();
    this.rebuildTank({ ground: 'sand', bg: 'blue' });
  }

  // ---------- Комната (строится один раз) ----------
  buildRoom() {
    const g = this.roomGroup;
    const floorTex = canvasTex(512, 512, (c, w, h) => {
      for (let i = 0; i < 8; i++) {
        const y = i * h / 8; const tone = 120 + Math.random() * 30;
        c.fillStyle = `rgb(${tone + 40},${tone},${tone - 40})`; c.fillRect(0, y, w, h / 8);
        c.strokeStyle = 'rgba(60,35,20,0.5)'; c.lineWidth = 3; c.strokeRect(-2, y, w + 4, h / 8);
        for (let k = 0; k < 40; k++) { c.strokeStyle = `rgba(80,50,30,${Math.random() * 0.15})`; c.lineWidth = 1; c.beginPath(); const yy = y + Math.random() * h / 8; c.moveTo(0, yy); c.lineTo(w, yy + rand(-4, 4)); c.stroke(); }
        c.fillStyle = 'rgba(40,25,10,0.6)'; c.fillRect(((i * 197) % w), y, 3, h / 8);
      }
    });
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(3, 3);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 36), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.72 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -3.6; floor.receiveShadow = true;
    g.add(floor);

    const wallTex = canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = '#cfc1ab'; c.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 64) { c.fillStyle = 'rgba(255,255,255,0.065)'; c.fillRect(x, 0, 32, h); }
      for (let i = 0; i < 3000; i++) { c.fillStyle = `rgba(90,70,50,${Math.random() * 0.055})`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    });
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(6, 2);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.94 });
    // Замкнутая уютная комната (задняя, левая, правая стены, потолок и плинтус — без «пустоты» при вращении!)
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(56, 20), wallMat);
    wall.position.set(0, 6.2, -5.2); wall.receiveShadow = true; g.add(wall);
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), wallMat);
    leftWall.rotation.y = Math.PI / 2; leftWall.position.set(-16, 6.2, 8); g.add(leftWall);
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), wallMat);
    rightWall.rotation.y = -Math.PI / 2; rightWall.position.set(16, 6.2, 8); g.add(rightWall);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(56, 40), new THREE.MeshStandardMaterial({ color: 0xebe4d8, roughness: 0.96 }));
    ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, 14.5, 8); g.add(ceiling);
    // Тёплый деревянный плинтус вдоль стен
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x5c3e28, roughness: 0.65 });
    const trimBack = new THREE.Mesh(new THREE.BoxGeometry(56, 0.34, 0.14), trimMat);
    trimBack.position.set(0, -3.43, -5.14); g.add(trimBack);
    // Уютная картина в рамке на задней стене справа
    const picTex = canvasTex(256, 192, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#8cc8dc'); gr.addColorStop(0.55, '#d6e6c8'); gr.addColorStop(1, '#58825a');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.fillStyle = '#3c6848'; c.beginPath(); c.moveTo(0, h); c.lineTo(70, 92); c.lineTo(155, 130); c.lineTo(220, 82); c.lineTo(w, 120); c.lineTo(w, h); c.fill();
      c.fillStyle = '#fff3c4'; c.beginPath(); c.arc(195, 48, 18, 0, 7); c.fill();
    });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.0, 0.12), trimMat); frame.position.set(8.8, 5.2, -5.12); g.add(frame);
    const art = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.7), new THREE.MeshStandardMaterial({ map: picTex, roughness: 0.85 })); art.position.set(8.8, 5.2, -5.05); g.add(art);

    // Окно
    this.windowMat = new THREE.MeshBasicMaterial({ color: 0xcfe8ff });
    const win = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.4), this.windowMat);
    win.position.set(-9.5, 5.4, -5.15); g.add(win);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.6 });
    for (const [w, h, x, y] of [[4.6, 0.2, 0, 1.8], [4.6, 0.2, 0, -1.8], [0.2, 3.8, -2.2, 0], [0.2, 3.8, 2.2, 0], [0.12, 3.4, 0, 0], [4.2, 0.12, 0, 0.3]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.15), frameMat); b.position.set(-9.5 + x, 5.4 + y, -5.1); g.add(b);
    }
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(0.28, 24), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
    this.moon.position.set(-8.4, 6.4, -5.12); g.add(this.moon);

    // Комнатное растение справа
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 1.2, 24), new THREE.MeshStandardMaterial({ color: 0xb8643c, roughness: 0.8 }));
    pot.position.set(7.6, -3.0, -2.0); pot.castShadow = true; g.add(pot);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f6b34, roughness: 0.6, side: THREE.DoubleSide });
    for (let i = 0; i < 14; i++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 2.2, 1, 4), leafMat);
      const p = leaf.geometry.attributes.position;
      for (let k = 0; k < p.count; k++) { const y = p.getY(k) + 1.1; p.setZ(k, y * y * 0.12); p.setX(k, p.getX(k) * Math.sin(Math.PI * y / 2.2 + 0.2)); }
      leaf.geometry.translate(0, 1.1, 0); leaf.geometry.computeVertexNormals();
      leaf.position.set(7.6, -2.4, -2.0); leaf.rotation.set(rand(-0.5, 0.5), i / 14 * Math.PI * 2, rand(-0.4, 0.4));
      g.add(leaf);
    }

    // Торшер
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.5 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6.5, 8), lampMat); pole.position.set(-7.6, -0.35, -3.0); g.add(pole);
    this.shadeMat = new THREE.MeshStandardMaterial({ color: 0xf3e2c0, emissive: 0xffb060, emissiveIntensity: 0.0, side: THREE.DoubleSide, roughness: 0.9 });
    const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 0.9, 20, 1, true), this.shadeMat); shade.position.set(-7.6, 3.2, -3.0); g.add(shade);

    this.woodTex = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#4a2f1d'; c.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { c.strokeStyle = `rgba(${110 + Math.random() * 40},${70 + Math.random() * 20},40,0.25)`; c.beginPath(); const y = Math.random() * h; c.moveTo(0, y); c.bezierCurveTo(w * 0.3, y + rand(-8, 8), w * 0.6, y + rand(-8, 8), w, y + rand(-5, 5)); c.stroke(); }
    });
  }

  // Полная перестройка аквариума/акватеррариума под текущий TANK
  rebuildTank(look = { ground: 'sand', bg: 'blue' }) {
    // Очищаем старый tankGroup
    while (this.tankGroup.children.length) {
      const ch = this.tankGroup.children[0];
      this.tankGroup.remove(ch);
    }
    this.substrate = null;
    this.backdrop = null;
    this.buildCabinet();
    this.buildTank();
    this.buildSubstrate(look.ground || 'sand');
    this.buildBackdrop(look.bg || 'blue');
    this.buildEquipment();
    this.buildBubbles();
    this.buildDetritus();
    this.buildClutches();
    this.buildSiphonTool();
    this.applyQuality(this.quality);
  }

  buildCabinet() {
    const g = this.tankGroup;
    const W = TANK.glassSide * 2 + 1.0;
    const D = TANK.glassFront * 2 + 0.6;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(W, 3.4, D), new THREE.MeshStandardMaterial({ map: this.woodTex, roughness: 0.55 }));
    cab.position.set(0, -1.95, 0); cab.receiveShadow = true; cab.castShadow = true; g.add(cab);
    const top = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.16, D + 0.2), new THREE.MeshStandardMaterial({ color: 0x2b1b12, roughness: 0.4 }));
    top.position.set(0, -0.2, 0); top.receiveShadow = true; g.add(top);
    const dw = (W - 0.3) / 2;
    for (const s of [-1, 1]) {
      const x = s * (dw / 2 + 0.04);
      const door = new THREE.Mesh(new THREE.BoxGeometry(dw - 0.08, 2.9, 0.05), new THREE.MeshStandardMaterial({ map: this.woodTex, roughness: 0.5, color: 0xdddddd }));
      door.position.set(x, -1.95, D / 2 + 0.02); g.add(door);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshStandardMaterial({ color: 0xc9a86a, metalness: 0.8, roughness: 0.3 }));
      knob.position.set(x - s * (dw * 0.36), -1.5, D / 2 + 0.08); g.add(knob);
    }
  }

  // ---------- Аквариум: стекло, рамка, вода ----------
  buildTank() {
    const g = this.tankGroup;
    const W = TANK.glassSide * 2 + 0.06, D = TANK.glassFront * 2 + 0.06, Hh = TANK.height || 3.6;
    this.glassMat = new THREE.MeshStandardMaterial({ color: 0xd8f0f4, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.12, depthWrite: false, envMapIntensity: 1.6 });
    const mk = (w, h, x, y, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.glassMat);
      m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 5; g.add(m); return m;
    };
    const cy = Hh / 2 - 0.05;
    this.frontGlass = mk(W, Hh, 0, cy, D / 2, 0);
    mk(W, Hh, 0, cy, -D / 2, Math.PI);
    mk(D, Hh, W / 2, cy, 0, Math.PI / 2);
    mk(D, Hh, -W / 2, cy, 0, -Math.PI / 2);

    const edgeMat = new THREE.MeshStandardMaterial({ color: 0x8fd1c4, transparent: true, opacity: 0.55, roughness: 0.1 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x111417, roughness: 0.35, metalness: 0.3 });
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.05, Hh, 0.05), edgeMat); e.position.set(sx * W / 2, cy, sz * D / 2); g.add(e);
    }
    for (const y of [-0.08, Hh - 0.06]) {
      for (const [w, d, x, z] of [[W + 0.1, 0.1, 0, D / 2], [W + 0.1, 0.1, 0, -D / 2], [0.1, D + 0.1, W / 2, 0], [0.1, D + 0.1, -W / 2, 0]]) {
        const r = new THREE.Mesh(new THREE.BoxGeometry(w, 0.1, d), rimMat); r.position.set(x, y, z); g.add(r);
      }
    }

    // Объём воды
    this.waterMat = new THREE.MeshBasicMaterial({ color: 0x2f8fa8, transparent: true, opacity: 0.1, depthWrite: false });
    this.waterBox = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, 1, D - 0.04), this.waterMat);
    this.waterBox.renderOrder = 4; g.add(this.waterBox);

    // Поверхность воды
    this.surfaceMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: G.uTime, uColor: { value: new THREE.Color(0x9fe6f2) }, uLamp: G.uLampPower, uCurrent: G.uCurrent },
      vertexShader: `varying vec2 vUv; varying vec3 vW; uniform float uTime; uniform float uCurrent;
        void main(){ vUv=uv; vec3 p=position; p.z += (sin(p.x*3.0+uTime*1.7)+sin(p.y*4.0-uTime*1.3))*0.012*(0.5+uCurrent);
        vW=(modelMatrix*vec4(p,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.); }`,
      fragmentShader: `varying vec2 vUv; varying vec3 vW; uniform float uTime; uniform vec3 uColor; uniform float uLamp;
        void main(){ float a = sin(vW.x*5.0+uTime*1.3)*sin(vW.z*6.0-uTime*1.1) + sin((vW.x+vW.z)*9.0+uTime*2.0)*0.5;
        float hi = smoothstep(0.75,1.2,a); vec3 col = uColor*(0.35+0.4*uLamp) + vec3(hi)*0.5*(0.3+uLamp);
        gl_FragColor = vec4(col, 0.18 + hi*0.24); }`,
    });
    this.surface = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, D - 0.04, 44, 22), this.surfaceMat);
    this.surface.rotation.x = -Math.PI / 2; this.surface.renderOrder = 3; g.add(this.surface);
    this.setWaterTop(TANK.waterTop);

    // Слой налёта на переднем стекле
    this.algaeMat = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, roughness: 0.9, color: 0xffffff });
    const algH = TANK.waterTop + 0.05;
    this.algaePlane = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.04, algH), this.algaeMat);
    this.algaePlane.position.set(0, algH / 2 - 0.03, D / 2 - 0.012);
    this.algaePlane.renderOrder = 6; g.add(this.algaePlane);
    this.frontZ = D / 2;
    this.glassW = W;
  }

  setWaterTop(y) {
    this.waterTop = y;
    const h = Math.max(0.1, y + 0.05);
    this.waterBox.scale.y = h; this.waterBox.position.y = h / 2 - 0.05;
    this.surface.position.y = y;
    G.uWaterTop.value = y;
  }

  // ---------- Грунт (включая сухой берег акватеррариума) ----------
  buildSubstrate(kind) {
    if (this.substrate) { this.tankGroup.remove(this.substrate); this.substrate.geometry.dispose(); }
    const palette = {
      sand:   ['#d9c49a', '#c8b083', '#efe0bd', '#a8916a'],
      gravel: ['#3a3836', '#55514c', '#26211f', '#6b6660'],
      river:  ['#8d8378', '#b5aa9b', '#6c6158', '#d2c6b6'],
    }[kind] || ['#d9c49a'];
    const tex = canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = palette[0]; c.fillRect(0, 0, w, h);
      const n = kind === 'sand' ? 9000 : kind === 'gravel' ? 2600 : 900;
      for (let i = 0; i < n; i++) {
        c.fillStyle = palette[1 + (i % (palette.length - 1))];
        c.globalAlpha = rand(0.4, 1);
        const r = kind === 'sand' ? rand(0.6, 1.8) : kind === 'gravel' ? rand(2, 5) : rand(5, 12);
        c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, r, r * rand(0.6, 1), Math.random() * 3, 0, 7); c.fill();
        if (kind !== 'sand') { c.globalAlpha = 0.25; c.fillStyle = '#fff'; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, r * 0.3, 0, 7); c.fill(); }
      }
      c.globalAlpha = 1;
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3.5, 1.8);
    const W = TANK.glassSide * 2, D = TANK.glassFront * 2;
    const nx = 64, nz = 28;
    const pos = [], uv = [], col = [], idx = [];
    const cTmp = new THREE.Color();
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = -W / 2 + W * i / nx, z = -D / 2 + D * j / nz;
      const y = groundY(x, z) + (vnoise3(x * 2, 0, z * 2) - 0.5) * 0.06;
      pos.push(x, y, z); uv.push(x / W + 0.5, z / D + 0.5);
      if (TANK.isPaludarium) {
        // Влажная тёмная полоса прибоя, сухой тёплый берег и чуть зелени наверху
        const distWater = y - TANK.waterTop;
        if (distWater > 0.25) cTmp.setRGB(0.95, 0.98, 0.88);
        else if (distWater > -0.1) cTmp.setRGB(0.76, 0.72, 0.68); // мокрый берег
        else cTmp.setRGB(0.88, 0.92, 0.96);
      } else {
        cTmp.setRGB(1, 1, 1);
      }
      col.push(cTmp.r, cTmp.g, cTmp.b);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + nx + 1; idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    // Срезы грунта по ВСЕМ 4 сторонам стекла (перед, зад, левый, правый) — никаких дырок под песком сбоку!
    const addSkirt = (pts) => {
      const base = pos.length / 3;
      for (let i = 0; i < pts.length; i++) {
        const [x, top, z, u] = pts[i];
        pos.push(x, top, z, x, -0.11, z);
        uv.push(u, 1, u, 0.85);
        col.push(0.82, 0.79, 0.75, 0.68, 0.65, 0.62);
      }
      for (let i = 0; i < pts.length - 1; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    };
    const frontPts = [], backPts = [], leftPts = [], rightPts = [];
    for (let i = 0; i <= nx; i++) {
      const kf = (nz * (nx + 1) + i) * 3;
      frontPts.push([pos[kf], pos[kf + 1], D / 2, i / nx]);
      const kb = (nx - i) * 3;
      backPts.push([pos[kb], pos[kb + 1], -D / 2, i / nx]);
    }
    for (let j = 0; j <= nz; j++) {
      const kl = (j * (nx + 1)) * 3;
      leftPts.push([-W / 2, pos[kl + 1], pos[kl + 2], j / nz]);
      const kr = ((nz - j) * (nx + 1) + nx) * 3;
      rightPts.push([W / 2, pos[kr + 1], pos[kr + 2], j / nz]);
    }
    addSkirt(frontPts);
    addSkirt(backPts);
    addSkirt(leftPts);
    addSkirt(rightPts);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const mat = addCaustics(new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.94, side: THREE.DoubleSide }), 0.42);
    this.substrate = new THREE.Mesh(g, mat);
    this.substrate.receiveShadow = true;
    this.tankGroup.add(this.substrate);
  }

  // ---------- Фон за задним стеклом ----------
  buildBackdrop(kind) {
    if (this.backdrop) this.tankGroup.remove(this.backdrop);
    const tex = canvasTex(512, 256, (c, w, h) => {
      if (kind === 'forest' || (TANK.isPaludarium && kind === 'blue')) {
        const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a5e44'); g.addColorStop(0.55, '#193d2d'); g.addColorStop(1, '#0a1712'); c.fillStyle = g; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 65; i++) { c.strokeStyle = `rgba(${40 + Math.random() * 45},${110 + Math.random() * 65},60,0.48)`; c.lineWidth = rand(2, 6); c.beginPath(); const x = Math.random() * w; c.moveTo(x, h); c.bezierCurveTo(x + rand(-30, 30), h * 0.6, x + rand(-40, 40), h * 0.3, x + rand(-50, 50), rand(0, h * 0.5)); c.stroke(); }
      } else if (kind === 'stone') {
        c.fillStyle = '#3d3a36'; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 70; i++) { c.fillStyle = `rgb(${70 + Math.random() * 50},${65 + Math.random() * 45},${60 + Math.random() * 40})`; c.beginPath(); c.ellipse(Math.random() * w, Math.random() * h, rand(20, 50), rand(14, 30), Math.random() * 3, 0, 7); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 3; c.stroke(); }
      } else {
        const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a6c8f'); g.addColorStop(0.6, '#103a55'); g.addColorStop(1, '#06182a'); c.fillStyle = g; c.fillRect(0, 0, w, h);
        for (let i = 0; i < 30; i++) { c.fillStyle = 'rgba(160,220,255,0.04)'; c.beginPath(); const x = Math.random() * w; c.moveTo(x, 0); c.lineTo(x + 40, 0); c.lineTo(x + 90, h); c.lineTo(x + 50, h); c.fill(); }
      }
    });
    const Hh = TANK.height || 3.6;
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(TANK.glassSide * 2 + 0.1, Hh), new THREE.MeshBasicMaterial({ map: tex }));
    this.backdrop.position.set(0, Hh / 2 - 0.05, -TANK.glassFront - 0.06);
    this.tankGroup.add(this.backdrop);
  }

  // ---------- Оборудование (под размеры текущего аквариума) ----------
  buildEquipment() {
    const g = this.tankGroup;
    const Hh = TANK.height || 3.6;
    const W = TANK.glassSide * 2;
    const dark = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.6 });

    // Светильник
    const bar = new THREE.Mesh(new THREE.BoxGeometry(W - 0.4, 0.12, 0.5), new THREE.MeshStandardMaterial({ color: 0x1b1d20, metalness: 0.6, roughness: 0.3 }));
    bar.position.set(0, Hh + 0.35, 0); g.add(bar);
    this.ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const led = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.6, 0.36), this.ledMat);
    led.rotation.x = Math.PI / 2; led.position.set(0, Hh + 0.285, 0); g.add(led);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), dark);
      leg.position.set(s * (TANK.glassSide - 0.08), Hh + 0.12, 0); g.add(leg);
    }

    // Внутренний фильтр (сзади слева)
    const [fx, fz] = TANK.filterPos || [-2.55, -1.15];
    const fh = TANK.isPaludarium ? 1.15 : 1.9;
    const fy = TANK.isPaludarium ? 0.85 : Math.min(Hh - 1.4, 2.1);
    const filt = new THREE.Mesh(new THREE.BoxGeometry(0.45, fh, 0.35), dark);
    filt.position.set(fx, fy, fz); filt.castShadow = true; g.add(filt);
    const grillMat = new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.8 });
    const slots = TANK.isPaludarium ? 5 : 8;
    for (let i = 0; i < slots; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.04, 0.02), grillMat);
      s.position.set(fx, fy - fh * 0.35 + i * 0.12, fz + 0.18); g.add(s);
    }
    this.filterBody = filt;

    // Нагреватель
    const hx = fx + 0.65, hz = fz - 0.08;
    const hh = TANK.isPaludarium ? 1.0 : 1.8;
    const hy = TANK.isPaludarium ? 0.78 : Math.min(Hh - 1.5, 1.9);
    const heater = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, hh, 12), new THREE.MeshStandardMaterial({ color: 0xcfe2e6, transparent: true, opacity: 0.6, roughness: 0.1 }));
    heater.position.set(hx, hy, hz); g.add(heater);
    this.heaterLed = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
    this.heaterLed.position.set(hx, hy + hh * 0.44, hz + 0.08); g.add(this.heaterLed);

    // Термометр на переднем стекле
    const tx = TANK.glassSide - 0.38;
    const ty = TANK.isPaludarium ? 1.15 : Hh - 1.0;
    const th = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.7, 0.02), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 }));
    th.position.set(tx, ty, TANK.glassFront - 0.02); g.add(th);
    const thr = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.4, 0.025), new THREE.MeshBasicMaterial({ color: 0xe03030 }));
    thr.position.set(tx, ty - 0.08, TANK.glassFront - 0.015); g.add(thr);

    // Распылитель и компрессор (компрессор стоит ровно НА крышке тумбы сзади справа, шланг аккуратно идёт за стекло!)
    const [ax, az] = TANK.airPos || [2.35, -1.0];
    const ay = groundY(ax, az) + 0.05;
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.12, 16), new THREE.MeshStandardMaterial({ color: 0x5f7a86, roughness: 0.95 }));
    stone.position.set(ax, ay, az); g.add(stone);
    const compX = TANK.glassSide + 0.28, compZ = -TANK.glassFront + 0.35;
    const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(ax, ay + 0.05, az),
      new THREE.Vector3(ax + 0.12, ay + 0.5, -TANK.glassFront + 0.08),
      new THREE.Vector3(ax + 0.18, Hh - 0.12, -TANK.glassFront + 0.08),
      new THREE.Vector3(TANK.glassSide + 0.1, Hh - 0.05, -TANK.glassFront + 0.05),
      new THREE.Vector3(compX, 1.4, -TANK.glassFront + 0.12),
      new THREE.Vector3(compX, 0.18, compZ),
    ]), 36, 0.022, 6), new THREE.MeshStandardMaterial({ color: 0xbfe8e0, transparent: true, opacity: 0.62, roughness: 0.2 }));
    g.add(hose);

    // Компрессор на резиновой подставке ровно на поверхности тумбы (y = -0.12 — верх столешницы)
    this.compressorBody = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.3, 0.62), new THREE.MeshStandardMaterial({ color: 0x264b6e, roughness: 0.45, metalness: 0.2 }));
    this.compressorBody.position.set(compX, 0.03, compZ);
    this.compressorBody.castShadow = true; g.add(this.compressorBody);
    this.airStone = new THREE.Vector3(ax, ay + 0.08, az);

    // Мягкие подводные лучи света от светильника (добавляют глубину и реализм)
    const rayTex = canvasTex(64, 256, (c, w, h) => {
      const gr = c.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(220,248,255,0.22)');
      gr.addColorStop(0.55, 'rgba(180,238,255,0.08)');
      gr.addColorStop(1, 'rgba(160,230,255,0)');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
    });
    this.rayMat = new THREE.MeshBasicMaterial({ map: rayTex, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.lightRays = new THREE.Group();
    const rayH = Math.max(1.0, TANK.waterTop - 0.35);
    for (const rx of [-W * 0.24, 0.15, W * 0.25]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.22, rayH), this.rayMat);
      m.position.set(rx, TANK.waterTop - rayH / 2, -0.15);
      m.rotation.z = -0.14;
      m.renderOrder = 2;
      this.lightRays.add(m);
    }
    g.add(this.lightRays);
  }

  // ---------- Осадок (детрит) на грунте для мини-игры Сифон ----------
  buildDetritus() {
    const geo = new THREE.CircleGeometry(0.11, 7);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3b2d1f, transparent: true, opacity: 0.62, roughness: 1, depthWrite: false });
    this.detritusMesh = new THREE.InstancedMesh(geo, mat, MAX_DETRITUS);
    this.detritusMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.detritusMesh.frustumCulled = false;
    this.detritusMesh.renderOrder = 2;
    this.tankGroup.add(this.detritusMesh);
    this.updateDetritus([]);
  }

  updateDetritus(list) {
    if (!this.detritusMesh) return;
    for (let i = 0; i < MAX_DETRITUS; i++) {
      if (i < list.length) {
        const d = list[i];
        const gy = groundY(d.x, d.z) + 0.018;
        this._p.set(d.x, gy, d.z);
        this._q.setFromAxisAngle(_up, d.r || 0);
        const s = (d.s || 1) * 0.95;
        this._s.set(s, 1, s * 0.85);
      } else {
        this._s.set(0, 0, 0);
      }
      this._m.compose(this._p, this._q, this._s);
      this.detritusMesh.setMatrixAt(i, this._m);
    }
    this.detritusMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- Кладки икринок (для икромечущих видов) ----------
  buildClutches() {
    const geo = new THREE.SphereGeometry(0.024, 8, 6);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xfff0c8, emissive: 0xffd890, emissiveIntensity: 0.25,
      transparent: true, opacity: 0.82, roughness: 0.12, metalness: 0.08,
    });
    this.eggMesh = new THREE.InstancedMesh(geo, mat, MAX_EGGS);
    this.eggMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.eggMesh.frustumCulled = false;
    this.eggMesh.renderOrder = 3;
    this.tankGroup.add(this.eggMesh);
    this.updateClutches([]);
  }

  updateClutches(clutches) {
    if (!this.eggMesh) return;
    let idx = 0;
    const offsets = [
      [0, 0, 0], [0.042, 0.004, 0.02], [-0.04, 0.005, 0.024], [0.02, 0.006, -0.04],
      [-0.026, 0.004, -0.036], [0.055, 0, -0.02], [-0.052, 0, -0.01], [0.008, 0.032, 0.005],
      [-0.014, 0.028, -0.012],
    ];
    for (const cl of clutches || []) {
      const gy = cl.y ?? (groundY(cl.x, cl.z) + 0.022);
      for (const [ox, oy, oz] of offsets) {
        if (idx >= MAX_EGGS) break;
        this._p.set(cl.x + ox, gy + oy, cl.z + oz);
        this._q.identity();
        this._s.set(1, 0.92, 1);
        this._m.compose(this._p, this._q, this._s);
        this.eggMesh.setMatrixAt(idx++, this._m);
      }
    }
    this._s.set(0, 0, 0);
    while (idx < MAX_EGGS) {
      this._m.compose(this._p, this._q, this._s);
      this.eggMesh.setMatrixAt(idx++, this._m);
    }
    this.eggMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- 3D-насадка сифона грунта ----------
  buildSiphonTool() {
    const g = new THREE.Group();
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.22, 1.4, 18, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x9ce8f5, transparent: true, opacity: 0.42, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false })
    );
    bell.position.y = 0.72;
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(0.22, 0.018, 8, 20),
      new THREE.MeshStandardMaterial({ color: 0x2c8ca8, roughness: 0.4 })
    );
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.02;
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 2.6, 10),
      new THREE.MeshStandardMaterial({ color: 0xb6e8e0, transparent: true, opacity: 0.55, roughness: 0.2 })
    );
    tube.position.y = 2.7;
    g.add(bell, rim, tube);
    g.visible = false;
    g.renderOrder = 7;
    this.siphonVisual = g;
    this.tankGroup.add(g);
  }

  setSiphonPos(x, z, visible) {
    if (!this.siphonVisual) return;
    this.siphonVisual.visible = !!visible;
    if (visible) this.siphonVisual.position.set(x, groundY(x, z) + 0.04, z);
  }

  // ---------- Свет ----------
  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xf2f6ff, 0x8a7458, 0.7);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dd, 1.0); this.sun.position.set(-8, 8, 4); this.scene.add(this.sun);
    this.roomLamp = new THREE.PointLight(0xffb060, 0, 22, 1.6); this.roomLamp.position.set(-7.6, 3.1, -2.5); this.scene.add(this.roomLamp);
    this.lamp = new THREE.DirectionalLight(0xffffff, 2.2);
    this.lamp.position.set(0.4, 9, 0.6); this.lamp.target.position.set(0, 0, 0);
    this.scene.add(this.lamp, this.lamp.target);
    this.tankFill = new THREE.PointLight(0xffffff, 0, 12, 1.2); this.tankFill.position.set(0, 3.2, 0.7); this.scene.add(this.tankFill);
    this.applyQuality(this.quality);
  }

  applyQuality(q) {
    this.quality = q;
    const sh = q === 'high';
    this.lamp.castShadow = sh;
    if (sh) {
      this.lamp.shadow.mapSize.set(1024, 1024);
      const halfW = TANK.glassSide + 0.3, halfD = TANK.glassFront + 0.4;
      const c = this.lamp.shadow.camera;
      c.left = -halfW; c.right = halfW; c.top = halfD; c.bottom = -halfD; c.near = 3; c.far = 12;
      c.updateProjectionMatrix();
      this.lamp.shadow.bias = -0.0008; this.lamp.shadow.normalBias = 0.02;
    }
    if (this.bubbles) this.bubbleCount = q === 'low' ? 30 : q === 'medium' ? 70 : 120;
  }

  // ---------- Пузырьки компрессора ----------
  buildBubbles() {
    const MAX = 120;
    this.bubbleCount = this.quality === 'low' ? 30 : this.quality === 'medium' ? 70 : 120;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0.1, transparent: true, opacity: 0.38, envMapIntensity: 3 });
    this.bubbles = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), mat, MAX);
    this.bubbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bubbles.frustumCulled = false; this.bubbles.renderOrder = 3;
    this.bData = [];
    for (let i = 0; i < MAX; i++) this.bData.push({ y: -1, x: 0, z: 0, s: 0, v: 0, ph: Math.random() * 6, wait: Math.random() * 3, alive: false });
    this.tankGroup.add(this.bubbles);
  }

  updateBubbles(dt, on, extraSources = null) {
    const a = this.airStone;
    if (!a || !this.bubbles) return;
    for (let i = 0; i < this.bData.length; i++) {
      const b = this.bData[i];
      if (!b.alive) {
        const fromChest = extraSources && extraSources.length && (i % 9 === 0);
        if ((on || fromChest) && i < this.bubbleCount) {
          b.wait -= dt;
          if (b.wait <= 0) {
            const src = fromChest ? extraSources[i % extraSources.length] : a;
            b.alive = true; b.y = src.y; b.x = src.x + rand(-0.1, 0.1); b.z = src.z + rand(-0.1, 0.1);
            b.s = rand(0.012, 0.026); b.v = rand(0.85, 1.45);
          }
        }
        this._s.set(0, 0, 0);
      } else {
        b.y += b.v * dt; b.s = Math.min(b.s + dt * 0.006, 0.045); b.ph += dt * 9;
        b.x += Math.sin(b.ph) * 0.12 * dt; b.z += Math.cos(b.ph * 0.8) * 0.1 * dt;
        if (b.y > this.waterTop - 0.02) { b.alive = false; b.wait = rand(0.05, 1.6); }
        const sq = 1 + Math.sin(b.ph * 1.7) * 0.15;
        this._s.set(b.s * sq, b.s / sq, b.s * sq);
      }
      this._p.set(b.x, b.y, b.z);
      this._m.compose(this._p, this._q, this._s);
      this.bubbles.setMatrixAt(i, this._m);
    }
    this.bubbles.instanceMatrix.needsUpdate = true;
  }

  // ---------- Свет и время суток (без аллокаций на кадр) ----------
  updateLighting(dt, equip, tod, turbidity) {
    const p = TIME_PRESETS[tod] || TIME_PRESETS.day;
    const k = 1.6;
    const alphaK = 1 - Math.exp(-k * dt);
    _c1.setHex(LIGHT_COLORS[equip.lightColor]?.hex ?? 0xffffff);
    const lampTarget = equip.lightOn ? equip.brightness : 0;
    this.lightState.lamp = damp(this.lightState.lamp, lampTarget, 3, dt);
    const L = this.lightState.lamp;
    this.lamp.color.lerp(_c1, 1 - Math.exp(-4 * dt));
    this.lamp.intensity = (tod === 'night' ? 0.04 : 0.15) + L * 3.0;
    this.tankFill.color.copy(this.lamp.color); this.tankFill.intensity = L * 1.6;
    this.ledMat.color.copy(this.lamp.color).multiplyScalar(0.12 + L * 1.2);
    G.uLampColor.value.copy(this.lamp.color);
    G.uLampPower.value = L;
    if (this.rayMat) {
      this.rayMat.color.copy(this.lamp.color);
      this.rayMat.opacity = L * (this.quality === 'low' ? 0 : 0.38);
      if (this.lightRays) this.lightRays.visible = L > 0.04 && this.quality !== 'low';
    }

    this.hemi.intensity = damp(this.hemi.intensity, p.hemi, k, dt);
    this.hemi.color.lerp(_c2.setHex(p.hemiSky), alphaK);
    this.hemi.groundColor.lerp(_c2.setHex(p.hemiGround), alphaK);
    this.sun.intensity = damp(this.sun.intensity, p.sun, k, dt);
    this.roomLamp.intensity = damp(this.roomLamp.intensity, p.lamp * 14, k, dt);
    this.shadeMat.emissiveIntensity = this.roomLamp.intensity / 14;
    this.windowMat.color.lerp(_c2.setHex(p.window), alphaK);
    this.moon.visible = tod === 'night';
    if (this.scene.background) this.scene.background.lerp(_c2.setHex(p.bg), alphaK);

    const tOp = 0.08 + turbidity * 0.3;
    this.waterMat.opacity = damp(this.waterMat.opacity, tOp, 1, dt);
    _c3.setHSL(0.53 - turbidity * 0.12, 0.55, 0.35 + L * 0.1);
    this.waterMat.color.lerp(_c3, 1 - Math.exp(-dt));
    this.heaterLed.material.color.setHex(Math.sin(G.uTime.value * 0.7) > 0.2 ? 0xff3030 : 0x401010);
  }
}
