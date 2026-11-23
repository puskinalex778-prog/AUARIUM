// Декорации и растения: процедурные модели, размещение, проверка пересечений.
import * as THREE from 'three';
import { DECOR, TANK, groundY, isLand } from './data.js';
import { addCaustics, addSway, canvasTex, rand, vnoise3 } from './fx.js';

const mats = {};
function M() {
  if (mats.ready) return mats;
  mats.rock = addCaustics(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }), 0.45);
  const bark = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#4b3020'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { c.strokeStyle = `rgba(${30 + Math.random() * 60},${20 + Math.random() * 30},10,0.6)`; c.lineWidth = rand(1, 3); c.beginPath(); const x = Math.random() * w; c.moveTo(x, 0); c.bezierCurveTo(x + rand(-10, 10), h * 0.3, x + rand(-10, 10), h * 0.6, x + rand(-6, 6), h); c.stroke(); }
  });
  bark.wrapS = bark.wrapT = THREE.RepeatWrapping;
  mats.wood = addCaustics(new THREE.MeshStandardMaterial({ map: bark, roughness: 0.85 }), 0.4);
  mats.ceramic = addCaustics(new THREE.MeshStandardMaterial({ color: 0xb8653a, roughness: 0.7, side: THREE.DoubleSide }), 0.4);
  const planks = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#3d2a1c'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) { c.fillStyle = `rgb(${70 + Math.random() * 30},${48 + Math.random() * 15},${30})`; c.fillRect(0, y + 1, w, 14); }
    for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(80,120,60,0.35)'; c.beginPath(); c.arc(Math.random() * w, Math.random() * h, rand(3, 12), 0, 7); c.fill(); }
  });
  planks.wrapS = planks.wrapT = THREE.RepeatWrapping;
  mats.ship = addCaustics(new THREE.MeshStandardMaterial({ map: planks, roughness: 0.8, side: THREE.DoubleSide }), 0.4);
  mats.sail = new THREE.MeshStandardMaterial({ color: 0xcfc2a0, roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const ribbon = canvasTex(32, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, h, 0, 0); g.addColorStop(0, '#3e6b2a'); g.addColorStop(0.5, '#5fa53a'); g.addColorStop(1, '#8fcf58'); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(30,60,20,0.5)'; c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke();
  });
  mats.valis = addSway(new THREE.MeshStandardMaterial({ map: ribbon, side: THREE.DoubleSide, roughness: 0.6 }), 0.06);
  mats.anubias = addSway(new THREE.MeshStandardMaterial({ color: 0x1f5a2a, roughness: 0.35, side: THREE.DoubleSide }), 0.05);
  mats.stem = addSway(new THREE.MeshStandardMaterial({ color: 0x2f6a2c, roughness: 0.6 }), 0.05);
  mats.moss = addSway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }), 0.15);
  const stoneTex = canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#7e7d78'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 24) {
      const off = (Math.floor(y / 24) % 2) * 24;
      for (let x = -24; x < w + 24; x += 48) {
        const v = 108 + Math.random() * 34;
        c.fillStyle = `rgb(${v},${v - 2},${v - 7})`;
        c.fillRect(x + off + 2, y + 2, 44, 20);
      }
    }
    for (let i = 0; i < 45; i++) {
      c.fillStyle = 'rgba(62,115,48,0.34)';
      c.beginPath(); c.arc(Math.random() * w, Math.random() * h, rand(4, 15), 0, 7); c.fill();
    }
  });
  stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;
  mats.stone = addCaustics(new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.88 }), 0.42);
  mats.roof = addCaustics(new THREE.MeshStandardMaterial({ color: 0x3b4d5a, roughness: 0.72 }), 0.35);
  mats.marble = addCaustics(new THREE.MeshStandardMaterial({ color: 0xd6d2c6, roughness: 0.65 }), 0.45);
  mats.iron = new THREE.MeshStandardMaterial({ color: 0x2a2d32, metalness: 0.72, roughness: 0.45 });
  mats.gold = new THREE.MeshStandardMaterial({ color: 0xffcb38, metalness: 0.82, roughness: 0.22, emissive: 0x6b4200, emissiveIntensity: 0.25 });
  mats.dark = new THREE.MeshStandardMaterial({ color: 0x161c20, roughness: 0.95 });
  mats.ready = true;
  return mats;
}

function rockGeo(seed, rx = 1, ry = 0.7, rz = 0.9, detail = 3) {
  const g = new THREE.SphereGeometry(0.5, 8 + detail * 6, 6 + detail * 4);
  const p = g.attributes.position, col = [];
  const base = new THREE.Color().setHSL(0.07 + seed % 0.05, 0.14, 0.3);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = vnoise3(x * 2.5 + seed, y * 2.5, z * 2.5) * 0.45 + vnoise3(x * 6 + seed, y * 6, z * 6) * 0.12;
    const k = 0.75 + n;
    x *= k * rx; y *= k * ry; z *= k * rz;
    if (y < -0.08) y = -0.08 + (y + 0.08) * 0.15;
    p.setXYZ(i, x, y + 0.08, z);
    const c = base.clone().offsetHSL(0, 0, (n - 0.3) * 0.25);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// Построение модели по типу. Возвращает THREE.Group (основание в y=0)
export function buildDecor(type, seed = 1) {
  const m = M();
  const g = new THREE.Group();
  const shadow = (o) => { o.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } }); return o; };
  if (type === 'rock') {
    g.add(new THREE.Mesh(rockGeo(seed, 1.1, 0.75, 0.9), m.rock));
    const s = new THREE.Mesh(rockGeo(seed + 3, 0.6, 0.45, 0.5, 2), m.rock); s.position.set(0.35, 0, 0.2); g.add(s);
  } else if (type === 'wood') {
    const branches = [
      [[-0.6, 0.05, 0], [-0.2, 0.25, 0.05], [0.2, 0.55, -0.05], [0.45, 1.0, 0.1]],
      [[-0.1, 0.2, 0], [-0.3, 0.6, 0.15], [-0.55, 0.95, 0.1]],
      [[0.15, 0.45, 0], [0.5, 0.55, -0.2], [0.75, 0.75, -0.3]],
      [[-0.6, 0.05, 0], [-0.75, 0.1, 0.3], [-0.95, 0.08, 0.45]],
    ];
    branches.forEach((pts, i) => {
      const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
      const geo = new THREE.TubeGeometry(curve, 20, i === 0 ? 0.1 : 0.06, 8);
      const pos = geo.attributes.position;
      for (let k = 0; k < pos.count; k++) { // утончение к концу
        const t = Math.floor(k / 9) / 20; const c = curve.getPoint(t);
        const f = 1 - t * 0.6; pos.setXYZ(k, c.x + (pos.getX(k) - c.x) * f, c.y + (pos.getY(k) - c.y) * f, c.z + (pos.getZ(k) - c.z) * f);
      }
      geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, m.wood));
    });
  } else if (type === 'grotto') {
    const arch = new THREE.TorusGeometry(0.5, 0.26, 12, 24, Math.PI);
    const p = arch.attributes.position, col = [];
    const base = new THREE.Color(0x6e6a62);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = vnoise3(x * 3 + seed, y * 3, z * 3) * 0.12;
      p.setXYZ(i, x * (1 + n), Math.max(0, y) * (1 + n), z * (1.4 + n));
      const c = base.clone().offsetHSL(0, 0, (n - 0.06) * 1.2); col.push(c.r, c.g, c.b);
    }
    arch.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); arch.computeVertexNormals();
    g.add(new THREE.Mesh(arch, m.rock));
    for (const x of [-0.55, 0.55]) { const r = new THREE.Mesh(rockGeo(seed + x, 0.6, 0.5, 0.8, 2), m.rock); r.position.set(x, -0.04, 0); g.add(r); }
    const top = new THREE.Mesh(rockGeo(seed + 9, 0.7, 0.4, 0.7, 2), m.rock); top.position.set(0.1, 0.62, 0); g.add(top);
  } else if (type === 'ceramic') {
    const tube = new THREE.CylinderGeometry(0.22, 0.22, 0.8, 20, 1, true, 0, Math.PI * 1.25);
    const t = new THREE.Mesh(tube, m.ceramic); t.rotation.z = Math.PI / 2; t.rotation.x = -Math.PI * 0.12; t.position.y = 0.2; g.add(t);
    const t2 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 18, 1, true, 0, Math.PI * 1.3), m.ceramic);
    t2.rotation.z = Math.PI / 2; t2.rotation.y = 0.6; t2.position.set(0.15, 0.48, -0.1); g.add(t2);
  } else if (type === 'ship') {
    const shape = new THREE.Shape();
    shape.moveTo(-0.9, 0.25); shape.quadraticCurveTo(-0.85, -0.05, -0.5, -0.12); shape.lineTo(0.55, -0.12);
    shape.quadraticCurveTo(0.95, 0.0, 1.05, 0.38); shape.lineTo(0.7, 0.32); shape.lineTo(-0.9, 0.32); shape.closePath();
    const hull = new THREE.ExtrudeGeometry(shape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2 });
    hull.translate(0, 0.14, -0.25);
    const hm = new THREE.Mesh(hull, m.ship); g.add(hm);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.42), m.ship); cabin.position.set(-0.55, 0.6, 0); g.add(cabin);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.4, 8), m.wood); mast.position.set(0.1, 1.05, 0); mast.rotation.z = 0.15; g.add(mast);
    const broken = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.6, 8), m.wood); broken.position.set(0.65, 0.25, 0.4); broken.rotation.set(0.3, 0, 1.4); g.add(broken);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.5, 4, 4), m.sail);
    const sp = sail.geometry.attributes.position; for (let i = 0; i < sp.count; i++) sp.setZ(i, Math.sin(sp.getY(i) * 3) * 0.05 + (sp.getX(i) > 0.1 && sp.getY(i) < -0.1 ? -0.1 : 0));
    sail.geometry.computeVertexNormals(); sail.position.set(0.12, 1.15, 0.03); sail.rotation.z = 0.15; g.add(sail);
    g.rotation.z = 0; g.children.forEach(c => { c.rotation.x += 0; });
    const tilt = new THREE.Group(); tilt.add(...g.children); tilt.rotation.x = -0.18; tilt.rotation.z = 0.12; g.add(tilt);
  } else if (type === 'valis') {
    const n = 11;
    for (let i = 0; i < n; i++) {
      const h = rand(1.5, 2.6), w = rand(0.05, 0.08);
      const geo = new THREE.PlaneGeometry(w, h, 1, 14);
      const p = geo.attributes.position;
      const bend = rand(-0.3, 0.3);
      for (let k = 0; k < p.count; k++) { const y = p.getY(k) + h / 2; p.setY(k, y); p.setZ(k, y * y * 0.03 * bend); p.setX(k, p.getX(k) * (1 - y / h * 0.4)); }
      geo.computeVertexNormals();
      const leaf = new THREE.Mesh(geo, m.valis);
      const a = rand(0, Math.PI * 2), r = rand(0, 0.16);
      leaf.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); leaf.rotation.y = rand(0, Math.PI);
      g.add(leaf);
    }
  } else if (type === 'anubias') {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
      const len = rand(0.2, 0.35);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, len, 5), m.stem);
      const dir = new THREE.Vector3(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5).normalize();
      stem.position.copy(dir.clone().multiplyScalar(len / 2)); stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      g.add(stem);
      const lg = new THREE.CircleGeometry(0.16, 14); lg.scale(1, 0.55, 1);
      const lp = lg.attributes.position; for (let k = 0; k < lp.count; k++) lp.setZ(k, -Math.abs(lp.getY(k)) * 0.3 - lp.getX(k) * lp.getX(k) * 0.4);
      lg.translate(0.15, 0, 0); lg.computeVertexNormals();
      const leaf = new THREE.Mesh(lg, m.anubias);
      leaf.position.copy(dir.clone().multiplyScalar(len)); leaf.rotation.set(-0.6, -a, 0.4);
      g.add(leaf);
    }
    const rock = new THREE.Mesh(rockGeo(seed, 0.5, 0.25, 0.45, 2), M().rock); rock.scale.setScalar(0.8); g.add(rock);
  } else if (type === 'moss') {
    g.add(new THREE.Mesh(rockGeo(seed, 0.7, 0.4, 0.6, 2), m.rock));
    const geo = new THREE.IcosahedronGeometry(0.1, 1);
    const blobs = [];
    for (let i = 0; i < 26; i++) {
      const b = geo.clone(); const s = rand(0.6, 1.5); b.scale(s, s * 0.8, s);
      const a = rand(0, 6.28), r = rand(0, 0.28);
      b.translate(Math.cos(a) * r, 0.18 + rand(0, 0.18) - r * 0.4, Math.sin(a) * r * 0.8);
      blobs.push(b);
    }
    const merged = mergeSimple(blobs);
    const p = merged.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) {
      const n = vnoise3(p.getX(i) * 12, p.getY(i) * 12, p.getZ(i) * 12);
      p.setXYZ(i, p.getX(i) * (1 + n * 0.25), p.getY(i) * (1 + n * 0.25), p.getZ(i) * (1 + n * 0.25));
      const c = new THREE.Color().setHSL(0.27 + n * 0.05, 0.55, 0.22 + n * 0.12); col.push(c.r, c.g, c.b);
    }
    merged.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); merged.computeVertexNormals();
    g.add(new THREE.Mesh(merged, m.moss));
  } else if (type === 'castle') {
    // Средневековый каменный замок с аркой и двумя башнями
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.72, 0.56), m.stone); leftWall.position.set(-0.34, 0.36, 0); g.add(leftWall);
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.72, 0.56), m.stone); rightWall.position.set(0.34, 0.36, 0); g.add(rightWall);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.54), m.stone); bridge.position.set(0, 0.61, 0); g.add(bridge);
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.06, 8, 16, Math.PI), m.stone); arch.position.set(0, 0.34, 0.25); g.add(arch);
    // Башни слева и справа
    for (const [tx, th, r] of [[-0.44, 1.05, 0.2], [0.44, 0.92, 0.18], [0.05, 1.18, 0.17]]) {
      const tz = tx === 0.05 ? -0.18 : 0.05;
      const tow = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.94, r, th, 14), m.stone);
      tow.position.set(tx, th / 2, tz); g.add(tow);
      // Зубцы и остроконечная крыша
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.12, r * 1.05, 0.1, 14), m.stone);
      cap.position.set(tx, th + 0.03, tz); g.add(cap);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.16, 0.36, 14), m.roof);
      roof.position.set(tx, th + 0.24, tz); g.add(roof);
      // Тёмное окошко-бойница
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.04), m.dark);
      win.position.set(tx, th * 0.68, tz + r * 0.94); g.add(win);
    }
    // Зубцы на стене
    for (let x = -0.3; x <= 0.3; x += 0.15) {
      const merl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.08), m.stone);
      merl.position.set(x, 0.76, 0.24); g.add(merl);
    }
  } else if (type === 'ruins') {
    // Античные мраморные руины (колонны и упавший архитрав)
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.14, 0.68), m.marble);
    plinth.position.set(0, 0.07, 0); g.add(plinth);
    const c1 = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.125, 0.98, 12), m.marble);
    c1.position.set(-0.34, 0.62, -0.05); g.add(c1);
    const cap1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.08, 0.3), m.marble);
    cap1.position.set(-0.34, 1.12, -0.05); g.add(cap1);
    const c2 = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.125, 0.62, 12), m.marble);
    c2.position.set(0.32, 0.44, -0.05); g.add(c2);
    // Упавший фрагмент колонны и балка
    const fallen = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.11, 0.48, 12), m.marble);
    fallen.rotation.z = Math.PI / 2 - 0.18; fallen.rotation.y = 0.45;
    fallen.position.set(0.28, 0.19, 0.26); g.add(fallen);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.13, 0.26), m.marble);
    beam.position.set(-0.08, 1.0, -0.05); beam.rotation.z = -0.34; g.add(beam);
    const moss = new THREE.Mesh(rockGeo(seed + 4, 0.4, 0.2, 0.35, 2), m.rock);
    moss.position.set(-0.42, 0.08, 0.22); g.add(moss);
  } else if (type === 'chest') {
    // Затонувший сундук с золотыми монетами и приоткрытой крышкой
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.34, 0.44), m.ship);
    box.position.set(0, 0.17, 0); g.add(box);
    for (const x of [-0.26, 0, 0.26]) {
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.46), m.iron);
      band.position.set(x, 0.17, 0); g.add(band);
    }
    // Горка золотых монет внутри
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), m.gold);
    mound.scale.set(1.2, 0.55, 0.78); mound.position.set(0, 0.27, 0); g.add(mound);
    for (let i = 0; i < 8; i++) {
      const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.015, 10), m.gold);
      coin.position.set(rand(-0.22, 0.22), 0.34 + rand(0, 0.04), rand(-0.1, 0.12));
      coin.rotation.set(rand(-0.4, 0.4), 0, rand(-0.4, 0.4));
      g.add(coin);
    }
    // Приоткрытая полукруглая крышка
    const lidPivot = new THREE.Group();
    lidPivot.position.set(0, 0.34, -0.22);
    lidPivot.rotation.x = -0.68;
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.66, 12, 1, false, 0, Math.PI), m.ship);
    lid.rotation.z = Math.PI / 2; lid.position.set(0, 0, 0.22);
    lidPivot.add(lid);
    g.add(lidPivot);
  } else if (type === 'pagoda') {
    // Восточная каменная пагода-фонарь с ярусными крышами
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.16, 6), m.stone); base.position.y = 0.08; g.add(base);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.34, 6), m.stone); pillar.position.y = 0.32; g.add(pillar);
    // 3 яруса крыш + окошко фонаря
    const tiers = [[0.52, 0.36, 0.14], [0.84, 0.29, 0.13], [1.1, 0.21, 0.12]];
    for (const [y, r, h] of tiers) {
      const roof = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), m.roof); roof.position.y = y; g.add(roof);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.42, r * 0.46, 0.22, 6), m.stone); body.position.y = y + 0.12; g.add(body);
    }
    const chamber = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.16, 6), m.dark); chamber.position.y = 0.64; g.add(chamber);
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.18, 6), m.stone); finial.position.y = 1.28; g.add(finial);
  }
  return shadow(g);
}

function mergeSimple(list) {
  const pos = []; const idx = []; let base = 0;
  for (const g of list) {
    pos.push(...g.attributes.position.array);
    if (g.index) for (const i of g.index.array) idx.push(i + base); else for (let i = 0; i < g.attributes.position.count; i++) idx.push(i + base);
    base += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setIndex(idx);
  return out;
}

// Менеджер размещённых предметов
export class DecorManager {
  constructor(root) {
    this.root = root;
    this.items = [];          // { rec, obj }
    this.ghost = null;
  }

  add(rec) {
    const obj = buildDecor(rec.type, rec.seed ?? (rec.x * 13.1 + rec.z * 7.7));
    obj.position.set(rec.x, groundY(rec.x, rec.z) - 0.04, rec.z);
    obj.rotation.y = rec.rot || 0;
    obj.scale.setScalar(rec.scale || 1);
    obj.userData.rec = rec;
    this.root.add(obj);
    this.items.push({ rec, obj });
    this._cacheDirty = true;
    return obj;
  }

  remove(rec) {
    const i = this.items.findIndex(it => it.rec === rec);
    if (i < 0) return;
    this.root.remove(this.items[i].obj);
    this.items.splice(i, 1);
    this._cacheDirty = true;
  }

  clear() {
    for (const it of this.items) this.root.remove(it.obj);
    this.items = [];
    this.hideGhost();
    this._cacheDirty = true;
  }

  reattach(root) {
    this.clear();
    this.root = root;
  }

  _rebuildCache() {
    this._cacheDirty = false;
    this._colliders = this.items.map(({ rec }) => {
      const d = DECOR[rec.type]; const s = rec.scale || 1;
      return { x: rec.x, z: rec.z, r: d.r * s, h: groundY(rec.x, rec.z) + d.h * s, plant: d.kind === 'plant', hide: !!d.hide || rec.type === 'moss' || rec.type === 'valis' };
    });
    this._hideSpots = this._colliders.filter(c => c.hide).map(c => ({ x: c.x, y: groundY(c.x, c.z) + 0.35, z: c.z }));
  }

  colliders() {
    if (this._cacheDirty || !this._colliders) this._rebuildCache();
    return this._colliders;
  }

  hideSpots() {
    if (this._cacheDirty || !this._hideSpots) this._rebuildCache();
    return this._hideSpots;
  }

  // Доля дна, занятая крупными декорациями (без растений) — должно оставаться место для плавания
  occupied(extra) {
    const area = (TANK.maxX - TANK.minX) * (TANK.maxZ - TANK.minZ);
    let s = 0;
    for (const c of this.colliders()) if (!c.plant) s += Math.PI * c.r * c.r;
    if (extra && DECOR[extra.type].kind !== 'plant') s += Math.PI * (DECOR[extra.type].r * (extra.scale || 1)) ** 2;
    return s / area;
  }

  // Проверка позиции: внутри дна и без пересечений
  validate(rec, ignore) {
    const d = DECOR[rec.type], r = d.r * (rec.scale || 1);
    if (rec.x - r * 0.6 < TANK.minX || rec.x + r * 0.6 > TANK.maxX || rec.z - r * 0.6 < TANK.minZ || rec.z + r * 0.6 > TANK.maxZ) return 'Слишком близко к стеклу';
    for (const it of this.items) {
      if (it.rec === ignore) continue;
      const o = DECOR[it.rec.type], ro = o.r * (it.rec.scale || 1);
      const minD = (d.kind === 'plant' || o.kind === 'plant') ? (r + ro) * 0.55 : (r + ro) * 0.8;
      if (Math.hypot(rec.x - it.rec.x, rec.z - it.rec.z) < minD) return 'Пересекается с другим предметом';
    }
    if (d.kind !== 'plant' && this.occupied(ignore ? null : rec) > 0.42) return 'Питомцам нужно свободное место';
    if (isLand(rec.x, rec.z) && !d.landOk) return 'Этот предмет можно ставить только в воду';
    // Не загораживать оборудование (фильтр и распылитель текущего аквариума)
    const [fx, fz] = TANK.filterPos || [-2.55, -1.15];
    const [ax, az] = TANK.airPos || [2.35, -1.0];
    if (Math.hypot(rec.x - fx, rec.z - fz) < r + 0.3) return 'Здесь стоит фильтр';
    if (Math.hypot(rec.x - ax, rec.z - az) < r + 0.25) return 'Здесь распылитель компрессора';
    return null;
  }

  showGhost(rec) {
    this.hideGhost();
    this.ghost = buildDecor(rec.type, 7);
    this.ghost.traverse(c => {
      if (c.isMesh) {
        c.material = c.material.clone();
        c.material.onBeforeCompile = () => {}; c.material.customProgramCacheKey = () => 'ghost';
        c.material.transparent = true; c.material.opacity = 0.75; c.material.emissive = new THREE.Color(0x00ff66); c.material.emissiveIntensity = 0.25;
        c.castShadow = false;
      }
    });
    this.root.add(this.ghost);
    this.updateGhost(rec, true);
  }
  updateGhost(rec, ok) {
    if (!this.ghost) return;
    this.ghost.position.set(rec.x, groundY(rec.x, rec.z) - 0.04, rec.z);
    this.ghost.rotation.y = rec.rot || 0;
    this.ghost.scale.setScalar(rec.scale || 1);
    const col = ok ? 0x00ff66 : 0xff2a2a;
    this.ghost.traverse(c => { if (c.isMesh) c.material.emissive.setHex(col); });
  }
  hideGhost() { if (this.ghost) { this.root.remove(this.ghost); this.ghost = null; } }
}
