// Локальные сохранения с резервной копией, поддержкой нескольких аквариумов и миграцией версий (v1 -> v2).
import { TANKS, SPECIES } from './data.js';

const KEY = 'mza_save_v1';
const BACKUP = 'mza_save_v1_backup';
const ALBUM = 'mza_album_v1';
export const SAVE_VERSION = 2;

export function makeDetritus(tankId, count = 14) {
  const spec = TANKS[tankId] || TANKS.tank60;
  const out = [];
  const maxX = spec.isPaludarium ? -0.35 : spec.maxX - 0.35;
  for (let i = 0; i < count; i++) {
    out.push({
      x: +(spec.minX + 0.35 + Math.random() * Math.max(0.4, maxX - (spec.minX + 0.35))).toFixed(2),
      z: +(spec.minZ + 0.25 + Math.random() * (spec.maxZ - spec.minZ - 0.5)).toFixed(2),
      s: +(0.7 + Math.random() * 0.7).toFixed(2),
      r: +(Math.random() * 6.28).toFixed(2),
    });
  }
  return out;
}

export function newTankState(tankId = 'tank60') {
  const spec = TANKS[tankId] || TANKS.tank60;
  let decor = [];
  if (tankId === 'tank60') {
    decor = [
      { id: 'd1', type: 'valis', x: -1.6, z: -0.85, rot: 0.3, scale: 1 },
      { id: 'd2', type: 'valis', x: 1.3, z: -0.9, rot: 1.2, scale: 0.9 },
      { id: 'd3', type: 'anubias', x: -0.4, z: 0.15, rot: 0.6, scale: 1 },
      { id: 'd4', type: 'rock', x: 0.9, z: 0.35, rot: 2.1, scale: 1 },
    ];
  } else if (tankId === 'paludarium') {
    decor = [
      { id: 'p1', type: 'grotto', x: 1.65, z: -0.45, rot: 0.4, scale: 0.9 },
      { id: 'p2', type: 'ceramic', x: 1.15, z: 0.55, rot: 2.3, scale: 0.85 },
      { id: 'p3', type: 'moss', x: 0.45, z: -0.3, rot: 1.1, scale: 1 },
      { id: 'p4', type: 'wood', x: -0.5, z: -0.45, rot: 0.5, scale: 0.85 },
    ];
  } else if (tankId === 'nursery') {
    decor = [
      { id: 'n1', type: 'moss', x: -0.85, z: -0.35, rot: 0.6, scale: 1.1 },
      { id: 'n2', type: 'moss', x: 0.8, z: 0.15, rot: 2.1, scale: 1.0 },
      { id: 'n3', type: 'anubias', x: 0.1, z: -0.45, rot: 1.2, scale: 0.95 },
    ];
  } else {
    decor = [
      { id: 'd1', type: 'valis', x: spec.minX + 1.3, z: spec.minZ + 0.55, rot: 0.4, scale: 1.1 },
      { id: 'd2', type: 'valis', x: spec.maxX - 1.4, z: spec.minZ + 0.55, rot: 1.5, scale: 1.0 },
      { id: 'd3', type: 'rock', x: 0.4, z: 0.25, rot: 1.8, scale: 1.1 },
    ];
  }
  return {
    id: tankId,
    fish: [],
    decor,
    equip: {
      lightOn: true, lightColor: 'white', brightness: 0.85,
      compressorOn: true, autoDay: true, manualTime: 'day',
      targetTemp: spec.defaultTemp,
    },
    look: { bg: tankId === 'paludarium' ? 'forest' : 'blue', ground: 'sand' },
    water: { waste: 8, oxygen: 92, temp: spec.defaultTemp },
    algae: '',
    leftovers: [],
    detritus: makeDetritus(tankId, tankId === 'paludarium' || tankId === 'nursery' ? 6 : 14),
    filterDirt: 22,
    clutches: [],
  };
}

export function newState() {
  const now = Date.now();
  return {
    version: SAVE_VERSION, createdAt: now, lastSaved: now, lastSim: now,
    introDone: false, tutorialDone: false,
    coins: 60,
    food: { flakes: 40, granules: 10, tablets: 10 },
    activeTank: 'tank60',
    tanks: { tank60: newTankState('tank60') },
    inventory: {},
    owned: { filterPro: false, lampSpectrum: false, bg: ['blue'], ground: ['sand'], tanks: ['tank60'] },
    tasks: { done: {}, claimed: {}, dailyDate: '', dailyFed: false, dailyChecked: false, dailyClaimed: '' },
    counters: {
      feedDay: '', feedCoins: 0,
      cleanArmed: true, scrapeArmed: true, siphonArmed: true, filterArmed: true,
      collectCoins: 0, waterDay: '',
    },
    settings: {
      music: 0.45, sfx: 0.8, quality: 'medium', fps: 60,
      comfort: false, advanced: false, creative: false,
      courtship: true, breeding: true, aging: false,
    },
    memorial: [],
    stats: { knocks: 0, photos: 0, fedTotal: 0, bornTotal: 0 },
    nextId: 1,
  };
}

export function curTank(state) {
  if (!state.tanks[state.activeTank]) state.activeTank = 'tank60';
  return state.tanks[state.activeTank];
}

export function allFish(state) {
  const out = [];
  for (const t of Object.values(state.tanks || {})) {
    if (Array.isArray(t.fish)) out.push(...t.fish);
  }
  return out;
}

function fixSpeciesId(fishList) {
  const legacyMap = { barb: 'cherry_barb' };
  for (const f of fishList || []) {
    if (legacyMap[f.species]) f.species = legacyMap[f.species];
    if (!SPECIES[f.species]) f.species = 'guppy';
    const sp = SPECIES[f.species];
    if (!sp.variants.includes(f.variant)) f.variant = sp.variants[0];
  }
}

function migrate(s) {
  const base = newState();

  // Миграция с формата v1 (один аквариум в корне сохранения) -> v2 (state.tanks)
  if (!s.tanks || typeof s.tanks !== 'object') {
    const t60 = newTankState('tank60');
    if (Array.isArray(s.fish)) t60.fish = s.fish;
    if (Array.isArray(s.decor)) t60.decor = s.decor;
    if (s.equip) t60.equip = { ...t60.equip, ...s.equip };
    if (s.look) t60.look = { ...t60.look, ...s.look };
    if (s.water) t60.water = { ...t60.water, ...s.water };
    if (typeof s.algae === 'string') t60.algae = s.algae;
    if (Array.isArray(s.leftovers)) t60.leftovers = s.leftovers;
    s.tanks = { tank60: t60 };
    s.activeTank = 'tank60';
    delete s.fish; delete s.decor; delete s.equip; delete s.look;
    delete s.water; delete s.algae; delete s.leftovers;
  }

  // Рекурсивно дополняем отсутствующие поля
  const fill = (dst, src) => {
    for (const k of Object.keys(src)) {
      if (dst[k] === undefined) dst[k] = JSON.parse(JSON.stringify(src[k]));
      else if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && typeof dst[k] === 'object') fill(dst[k], src[k]);
    }
  };
  fill(s, base);

  if (!Array.isArray(s.owned.tanks) || !s.owned.tanks.length) s.owned.tanks = ['tank60'];
  for (const tid of s.owned.tanks) {
    if (!s.tanks[tid]) s.tanks[tid] = newTankState(tid);
  }
  for (const [tid, t] of Object.entries(s.tanks)) {
    const def = newTankState(tid);
    fill(t, def);
    if (!Array.isArray(t.detritus)) t.detritus = makeDetritus(tid, 10);
    if (!Array.isArray(t.clutches)) t.clutches = [];
    if (typeof t.filterDirt !== 'number') t.filterDirt = 20;
    fixSpeciesId(t.fish);
  }
  if (!Array.isArray(s.memorial)) s.memorial = [];
  if (!s.tanks[s.activeTank]) s.activeTank = 'tank60';

  s.version = SAVE_VERSION;
  return s;
}

function parse(str) {
  if (!str) return null;
  const s = JSON.parse(str);
  if (!s || typeof s !== 'object' || (!Array.isArray(s.fish) && !s.tanks)) throw new Error('bad save');
  return migrate(s);
}

export function loadState() {
  try { const s = parse(localStorage.getItem(KEY)); if (s) return s; } catch (e) { console.warn('Основное сохранение повреждено, пробуем резервную копию', e); }
  try { const s = parse(localStorage.getItem(BACKUP)); if (s) return s; } catch (e) { console.warn('Резервная копия тоже повреждена', e); }
  return null;
}

let lastBackup = 0;
export function saveState(state) {
  try {
    state.lastSaved = Date.now();
    const str = JSON.stringify(state);
    localStorage.setItem(KEY, str);
    if (Date.now() - lastBackup > 120000) { localStorage.setItem(BACKUP, str); lastBackup = Date.now(); }
    return true;
  } catch (e) { console.warn('Не удалось сохранить', e); return false; }
}

export function wipe() { localStorage.removeItem(KEY); localStorage.removeItem(BACKUP); localStorage.removeItem(ALBUM); }

export function loadAlbum() { try { return JSON.parse(localStorage.getItem(ALBUM) || '[]'); } catch { return []; } }
export function saveAlbum(a) {
  try { localStorage.setItem(ALBUM, JSON.stringify(a)); return true; }
  catch { a.shift(); try { localStorage.setItem(ALBUM, JSON.stringify(a)); return true; } catch { return false; } }
}
