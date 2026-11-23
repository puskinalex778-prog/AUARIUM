// Модель воды, самочувствия, фильтрации, осадка, совместимости видов,
// а также жизненный цикл (малёк → молодая → взрослая → пожилая),
// размножение (живородящие и икромечущие), наследование окраски и бережное старение.
import { SPECIES, TANKS, lifespanDays, groundY } from './data.js';
import { curTank, makeDetritus } from './save.js';
import { clamp } from './fx.js';

export function bioload(tank) {
  return (tank.fish || []).reduce((s, f) => {
    const sp = SPECIES[f.species];
    if (!sp) return s + 1;
    // Мальки создают значительно меньшую нагрузку на воду
    const st = lifeStage(f, sp);
    return s + sp.bioload * (st.isFry ? 0.35 : 1);
  }, 0);
}

export function timeOfDay(tank, date = new Date()) {
  if (!tank.equip.autoDay) return tank.equip.manualTime;
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 7 && h < 18) return 'day';
  if (h >= 18 && h < 22) return 'evening';
  return 'night';
}

export function autoLamp(date = new Date()) { const h = date.getHours(); return h >= 8 && h < 22; }

export function plantsCount(tank) {
  return (tank.decor || []).filter(d => ['valis', 'anubias', 'moss'].includes(d.type)).length;
}

export function waterQuality(tank) {
  const w = tank.water;
  const q = 100 - w.waste * 0.72 - Math.max(0, 80 - w.oxygen) * 0.85 - Math.max(0, (tank.filterDirt || 0) - 65) * 0.25;
  return clamp(q, 0, 100);
}

export function qualityLabel(q) {
  if (q >= 75) return ['Отлично', 'good'];
  if (q >= 55) return ['Хорошо', 'ok'];
  if (q >= 35) return ['Нужен уход', 'warn'];
  return ['Плохо', 'bad'];
}

// Стадии жизненного цикла: малёк → молодая → взрослая → пожилая
export function lifeStage(rec, sp, now = Date.now()) {
  const adultD = sp?.adultDays || 4;
  const maxD = lifespanDays(sp);
  const ageDays = Math.max(0, (now - (rec.bornAt || now)) / 86400000 + (rec.bonusDays || 0));
  const fryEnd = adultD * 0.35;
  if (rec.isFry && ageDays < fryEnd) {
    const t = clamp(ageDays / Math.max(0.2, fryEnd), 0, 1);
    return { key: 'fry', label: 'Малёк', growth: 0.38 + 0.24 * t, ageDays, maxDays: maxD, isFry: true, isAdult: false, isElder: false };
  }
  if (ageDays < adultD) {
    const startG = rec.isFry ? 0.62 : 0.72;
    const baseD = rec.isFry ? fryEnd : 0;
    const t = clamp((ageDays - baseD) / Math.max(0.4, adultD - baseD), 0, 1);
    return { key: 'young', label: 'Молодая', growth: startG + (1 - startG) * t, ageDays, maxDays: maxD, isFry: false, isAdult: false, isElder: false };
  }
  if (ageDays < maxD * 0.78) {
    return { key: 'adult', label: 'Взрослая', growth: 1.0, ageDays, maxDays: maxD, isFry: false, isAdult: true, isElder: false };
  }
  return { key: 'elder', label: 'Пожилая', growth: 1.0, ageDays, maxDays: maxD, isFry: false, isAdult: false, isElder: true };
}

// Наследование окраски от родителей (45% мама, 45% папа, 10% редкая вариация вида)
export function inheritVariant(sp, vMother, vFather) {
  const r = Math.random();
  if (r < 0.45 && vMother && sp.variants.includes(vMother)) return vMother;
  if (r < 0.90 && vFather && sp.variants.includes(vFather)) return vFather;
  return sp.variants[Math.floor(Math.random() * sp.variants.length)];
}

function makeFryRecord(state, spId, motherName, fatherName, motherVar, fatherVar, gen, now) {
  const sp = SPECIES[spId];
  const sex = Math.random() < 0.5 ? 'm' : 'f';
  const variant = inheritVariant(sp, motherVar, fatherVar);
  return {
    id: 'f' + (state.nextId++),
    species: spId, sex, variant, name: '',
    bornAt: now, boughtAt: now, bonusDays: 0, isFry: true,
    satiety: 72, health: 100, stress: 10,
    family: {
      gen: Math.max(2, gen || 2),
      mother: motherName || sp.name,
      father: fatherName || sp.name,
      children: [],
    },
  };
}

// Один шаг симуляции для конкретного аквариума на dtH часов
export function simulateTank(tank, spec, state, dtH, opts = {}) {
  const { lampOn = true, algae = null, now = Date.now(), events = null } = opts;
  const comfort = state.settings.comfort;
  const w = tank.water;
  const load = bioload(tank);
  const plants = plantsCount(tank);
  const detritusN = (tank.detritus || []).length;

  // Засорение губки фильтра
  const dirtRate = (state.owned.filterPro ? 0.55 : 1.0) * (0.35 + load * 0.08);
  tank.filterDirt = clamp((tank.filterDirt ?? 15) + dirtRate * dtH, 0, comfort ? 55 : 100);
  const filterEff = 1 - (tank.filterDirt / 100) * 0.55;

  // Загрязнение воды
  const kFilter = (state.owned.filterPro ? 0.15 : 0.075) * filterEff;
  const volFactor = 60 / Math.max(30, spec.volumeL);
  const wasteIn = (0.32 + load * 0.21 + detritusN * 0.04) * volFactor;
  w.waste = clamp(w.waste + wasteIn * dtH - w.waste * kFilter * dtH, 0, comfort ? 40 : 100);

  // Осадок на дне
  const maxDet = comfort ? 18 : 42;
  if (Array.isArray(tank.detritus) && tank.detritus.length < maxDet) {
    const chance = (0.15 + load * 0.07) * dtH;
    if (Math.random() < chance) {
      const added = makeDetritus(spec.id, 1);
      if (added.length) tank.detritus.push(added[0]);
    }
  }

  // Кислород
  const targetO2 = clamp(
    (tank.equip.compressorOn ? 96 : 80) - load * 0.65 * volFactor + plants * (lampOn ? 1.2 : -0.5) - w.waste * 0.08,
    40, 100
  );
  w.oxygen = clamp(w.oxygen + (targetO2 - w.oxygen) * Math.min(1, dtH * 2.5), comfort ? 75 : 30, 100);

  // Температура нагревателя
  const targetT = tank.equip.targetTemp ?? spec.defaultTemp;
  w.temp = clamp((w.temp ?? targetT) + (targetT - (w.temp ?? targetT)) * Math.min(1, dtH * 1.8), 16, 32);

  // Водоросли на свету
  if (algae) {
    algae.cap = comfort ? 0.5 : 1;
    const grazers = tank.fish.reduce((s, f) => s + (SPECIES[f.species]?.algaeEater || 0), 0);
    const grazerMul = Math.max(0.3, 1 - grazers * 0.22);
    const rate = (lampOn ? (0.0085 + w.waste * 0.00024) * (0.5 + tank.equip.brightness * 0.6) : 0.0014) * grazerMul;
    algae.grow(dtH, rate);
  }

  // Самочувствие и ускоренный рост мальков в выростном отсеке
  const q = waterQuality(tank);
  const cap = spec.capacity;
  const counts = {};
  let fryCount = 0;
  tank.fish.forEach(f => {
    counts[f.species] = (counts[f.species] || 0) + 1;
    if (lifeStage(f, SPECIES[f.species], now).isFry) fryCount++;
  });
  const hides = (tank.decor || []).filter(d => ['grotto', 'ceramic', 'wood', 'ship', 'moss', 'castle', 'ruins', 'pagoda'].includes(d.type)).length;

  for (const f of tank.fish) {
    const sp = SPECIES[f.species];
    if (!sp) continue;
    const stg = lifeStage(f, sp, now);
    if (spec.isNursery && stg.isFry) {
      f.bonusDays = (f.bonusDays || 0) + (dtH / 24) * ((spec.growthMul || 1.5) - 1);
    }
    f.satiety = clamp(f.satiety - 3.8 * dtH, comfort ? 50 : 5, 100);
    let targetH = 100;
    if (f.satiety < 25) targetH -= (25 - f.satiety) * 1.2;
    if (q < 60) targetH -= (60 - q) * (sp.sensitive ? 1.25 : 0.85);
    if (w.oxygen < 65) targetH -= (65 - w.oxygen) * 1.4;
    if (f.stress > 60) targetH -= (f.stress - 60) * 0.4;
    if (!state.settings.creative) {
      if (w.temp < sp.temp[0] - 0.5) targetH -= (sp.temp[0] - w.temp) * 5;
      if (w.temp > sp.temp[1] + 0.5) targetH -= (w.temp - sp.temp[1]) * 5;
    }
    // Здоровье не опускается ниже безопасного порога — отсутствие игрока никогда не приводит к гибели
    targetH = clamp(targetH, comfort ? 85 : 25, 100);
    f.health = clamp(f.health + (targetH - f.health) * Math.min(1, dtH * 0.15), 0, 100);

    let base = 5;
    if (!state.settings.creative) {
      if (sp.school && counts[f.species] < sp.schoolMin) base += (sp.schoolMin - counts[f.species]) * 3.5;
      if (load > cap) base += (load - cap) * 2.5;
      if (!spec.isNursery && spec.volumeL < sp.minVolumeL && !stg.isFry) base += 14;
      if (sp.territorial && hides === 0) base += 8;
      for (const o of tank.fish) {
        if (o === f) continue;
        const osp = SPECIES[o.species];
        if (!osp) continue;
        if (sp.soloMale && o.species === f.species && f.sex === 'm' && o.sex === 'm') base += 28;
        else if (sp.conflicts?.includes(o.species) || osp.conflicts?.includes(f.species)) base += 12;
        else if (osp.eatsTiny && sp.tiny) base += 15;
      }
    }
    f.stress = clamp(f.stress + (clamp(base, 0, 85) - f.stress) * Math.min(1, dtH * 5), 0, 100);
  }

  // ---------- Размножение: живородящие и икромечущие (с защитой от перенаселения) ----------
  if (!Array.isArray(tank.clutches)) tank.clutches = [];
  const maxPop = Math.max(8, Math.floor(cap * 0.68));
  const overcrowded = load >= cap * 0.85 || fryCount >= 6 || tank.fish.length >= maxPop;

  if (state.settings.breeding) {
    // 1. Рождение мальков у беременных живородящих самок
    for (const f of [...tank.fish]) {
      if (!f.pregnantUntil || now < f.pregnantUntil) continue;
      const sp = SPECIES[f.species];
      const mi = f.mateInfo || {};
      delete f.pregnantUntil;
      delete f.mateInfo;
      if (!sp || tank.fish.length >= maxPop + 2) continue;
      const count = tank.fish.length < maxPop - 1 && Math.random() < 0.45 ? 2 : 1;
      const mName = f.name || sp.name;
      if (!f.family) f.family = { gen: 1, mother: null, father: null, children: [] };
      const fatherRec = tank.fish.find(x => x.id === mi.fatherId);
      if (fatherRec && !fatherRec.family) fatherRec.family = { gen: 1, mother: null, father: null, children: [] };
      const gen = Math.max(f.family.gen || 1, mi.gen || 1) + 1;
      for (let i = 0; i < count; i++) {
        const fry = makeFryRecord(state, f.species, mName, mi.fatherName || sp.name, f.variant, mi.fatherVar, gen, now);
        tank.fish.push(fry);
        f.family.children.push(fry.id);
        if (fatherRec) fatherRec.family.children.push(fry.id);
        state.stats.bornTotal = (state.stats.bornTotal || 0) + 1;
        events?.born.push({ tankId: spec.id, fry, mother: f });
      }
    }

    // 2. Вылупление мальков из кладок икры (икромечущие)
    for (let i = tank.clutches.length - 1; i >= 0; i--) {
      const cl = tank.clutches[i];
      if (now < cl.hatchAt) continue;
      tank.clutches.splice(i, 1);
      const sp = SPECIES[cl.species];
      if (!sp || tank.fish.length >= maxPop + 2) continue;
      const count = tank.fish.length < maxPop - 1 && Math.random() < 0.45 ? 2 : 1;
      const motherRec = tank.fish.find(x => x.id === cl.motherId);
      const fatherRec = tank.fish.find(x => x.id === cl.fatherId);
      if (motherRec && !motherRec.family) motherRec.family = { gen: 1, mother: null, father: null, children: [] };
      if (fatherRec && !fatherRec.family) fatherRec.family = { gen: 1, mother: null, father: null, children: [] };
      for (let k = 0; k < count; k++) {
        const fry = makeFryRecord(state, cl.species, cl.motherName, cl.fatherName, cl.motherVar, cl.fatherVar, (cl.gen || 1) + 1, now);
        tank.fish.push(fry);
        if (motherRec) motherRec.family.children.push(fry.id);
        if (fatherRec) fatherRec.family.children.push(fry.id);
        state.stats.bornTotal = (state.stats.bornTotal || 0) + 1;
        events?.hatched.push({ tankId: spec.id, fry, pos: { x: cl.x, y: cl.y, z: cl.z } });
      }
    }

    // 3. Новые пары (ухаживание → беременность у живородящих или кладка икры у икромечущих)
    if (!overcrowded && q >= 58 && !spec.isNursery) {
      const bySp = {};
      for (const f of tank.fish) {
        const sp = SPECIES[f.species];
        if (!sp) continue;
        const stg = lifeStage(f, sp, now);
        if (!stg.isAdult || f.health < 72 || f.satiety < 45 || f.stress > 45) continue;
        if ((f.breedCooldown || 0) > now || f.pregnantUntil) continue;
        (bySp[f.species] ||= { m: [], f: [] })[f.sex].push(f);
      }
      for (const [spId, pair] of Object.entries(bySp)) {
        if (!pair.m.length || !pair.f.length) continue;
        const sp = SPECIES[spId];
        // Умеренная вероятность за час (в живой игре пара заводит потомство примерно за 15–35 минут)
        if (Math.random() > 1.35 * dtH) continue;
        const male = pair.m[Math.floor(Math.random() * pair.m.length)];
        const fem = pair.f[Math.floor(Math.random() * pair.f.length)];
        const gen = Math.max(male.family?.gen || 1, fem.family?.gen || 1);
        events?.courtship.push({ tankId: spec.id, maleId: male.id, femaleId: fem.id });

        if (sp.livebearer) {
          fem.pregnantUntil = now + 18 * 60000; // ~18 минут до появления мальков
          fem.mateInfo = { fatherId: male.id, fatherName: male.name || sp.name, fatherVar: male.variant, gen };
          fem.breedCooldown = now + 45 * 60000;
          male.breedCooldown = now + 35 * 60000;
          events?.pregnant.push({ tankId: spec.id, female: fem });
        } else if (tank.clutches.length < 2) {
          // Ищем уютное место для кладки икры (рядом с растением/декором или на дне)
          const dec = (tank.decor || []).find(d => d.type === 'moss' || d.type === 'anubias' || d.type === 'rock' || d.type === 'grotto' || d.type === 'wood');
          const cx = clamp((dec ? dec.x + (Math.random() - 0.5) * 0.45 : (Math.random() - 0.5) * (spec.maxX - spec.minX) * 0.6), spec.minX + 0.45, spec.isPaludarium ? -0.35 : spec.maxX - 0.45);
          const cz = clamp((dec ? dec.z + (Math.random() - 0.5) * 0.35 : (Math.random() - 0.5) * (spec.maxZ - spec.minZ) * 0.6), spec.minZ + 0.35, spec.maxZ - 0.35);
          const cy = groundY(cx, cz) + 0.025;
          const clutch = {
            id: 'cl' + (state.nextId++),
            species: spId, x: +cx.toFixed(2), y: +cy.toFixed(2), z: +cz.toFixed(2),
            motherId: fem.id, motherName: fem.name || sp.name, motherVar: fem.variant,
            fatherId: male.id, fatherName: male.name || sp.name, fatherVar: male.variant,
            gen, laidAt: now, hatchAt: now + 14 * 60000, // ~14 минут до вылупления
          };
          tank.clutches.push(clutch);
          fem.breedCooldown = now + 50 * 60000;
          male.breedCooldown = now + 40 * 60000;
          events?.clutchesAdded.push({ tankId: spec.id, clutch });
        }
      }
    }
  }

  // ---------- Деликатное естественное старение (только если включено и НЕ комфортный режим) ----------
  if (state.settings.aging && !comfort && !opts.departedOnce) {
    for (let i = 0; i < tank.fish.length; i++) {
      const f = tank.fish[i];
      const sp = SPECIES[f.species];
      if (!sp) continue;
      const stg = lifeStage(f, sp, now);
      if (stg.ageDays >= stg.maxDays && Math.random() < 0.25 * dtH) {
        tank.fish.splice(i, 1);
        const mem = {
          id: f.id, name: f.name || sp.name, species: f.species, sex: f.sex, variant: f.variant,
          livedDays: Math.max(1, Math.round(stg.ageDays)),
          gen: f.family?.gen || 1,
          childrenCount: f.family?.children?.length || 0,
          departedAt: now,
        };
        if (!Array.isArray(state.memorial)) state.memorial = [];
        state.memorial.unshift(mem);
        if (state.memorial.length > 40) state.memorial.pop();
        opts.departedOnce = true; // не более одного ухода за визит — никаких массовых потерь
        events?.departed.push({ tankId: spec.id, fishId: f.id, mem });
        break;
      }
    }
  }
}

export function simulate(state, dtH, opts = {}) {
  const tank = curTank(state);
  const spec = TANKS[state.activeTank] || TANKS.tank60;
  simulateTank(tank, spec, state, dtH, opts);
}

export function catchUp(state, activeAlgae) {
  const now = Date.now();
  let totalH = clamp((now - (state.lastSim || now)) / 3600000, 0, 24 * 7);
  state.lastSim = now;
  const events = { born: [], hatched: [], pregnant: [], clutchesAdded: [], departed: [], courtship: [] };
  if (totalH <= 0.001) return events;
  const step = 0.25;
  const sharedOpts = { departedOnce: false };
  for (const tid of state.owned.tanks || ['tank60']) {
    const tank = state.tanks[tid];
    const spec = TANKS[tid];
    if (!tank || !spec) continue;
    const isAct = tid === state.activeTank;
    let rem = totalH;
    let t = now - totalH * 3600000;
    while (rem > 0) {
      const h = Math.min(step, rem);
      const d = new Date(t);
      const lampOn = tank.equip.autoDay ? autoLamp(d) : tank.equip.lightOn;
      simulateTank(tank, spec, state, h, { lampOn, algae: isAct ? activeAlgae : null, now: t + h * 3600000, events, departedOnce: sharedOpts.departedOnce });
      if (events.departed.length) sharedOpts.departedOnce = true;
      rem -= h; t += h * 3600000;
    }
  }
  return events;
}

// Полная проверка совместимости при покупке или пересадке питомца
export function purchaseWarnings(state, spId, tankId = null, chosenSex = null, isFry = false) {
  if (state.settings.creative) return [];
  const tid = tankId || state.activeTank;
  const tank = state.tanks[tid];
  const spec = TANKS[tid] || TANKS.tank60;
  const sp = SPECIES[spId];
  if (!sp || !tank) return [];
  const out = [];
  const temp = tank.equip.targetTemp ?? tank.water.temp ?? spec.defaultTemp;

  // Выростной отсек — специально для мальков!
  if (spec.isNursery) {
    if (sp.needsPaludarium) {
      out.push({ level: 'bad', text: `${sp.name} нуждается в Акватеррариуме с выходом на сушу.` });
    } else if (!isFry && sp.minVolumeL >= 100) {
      out.push({ level: 'warn', text: `Выростной отсек (30 л) создан для мальков — взрослому питомцу «${sp.name}» здесь будет тесно.` });
    } else if (isFry) {
      out.push({ level: 'info', text: `В выростном отсеке мальки в полной безопасности и растут в 1,5 раза быстрее!` });
    }
  }

  // 1. Акватеррариум vs обычный аквариум
  if (sp.needsPaludarium && !spec.isPaludarium && !spec.isNursery) {
    out.push({ level: 'bad', text: `${sp.name} нуждается в Акватеррариуме с выходом на сушу! Купи Акватеррариум во вкладке «Аквариумы» и переключись в него.` });
  }
  if (!sp.needsPaludarium && spec.isPaludarium) {
    out.push({ level: 'bad', text: `В Акватеррариуме слишком мелко для рыбки «${sp.name}» — он предназначен для обитателей берега и мелководья.` });
  }

  // 2. Минимальный объём аквариума
  if (!sp.needsPaludarium && !isFry && !spec.isNursery && spec.volumeL < sp.minVolumeL) {
    out.push({ level: 'bad', text: `Аквариум ${spec.volumeL} л маловат для вида «${sp.name}» (нужно от ${sp.minVolumeL} л). Лучше завести более просторный аквариум.` });
  }

  // 3. Бионагрузка / перенаселение
  const load = bioload(tank) + sp.bioload * (isFry ? 0.35 : 1);
  if (load > spec.capacity) {
    out.push({ level: 'bad', text: `Аквариум будет перенаселён (${load.toFixed(0)} из ${spec.capacity}). Питомцам станет тесно, а вода будет быстрее портиться.` });
  } else if (load > spec.capacity * 0.82) {
    out.push({ level: 'warn', text: `Аквариум почти заполнен (${load.toFixed(0)} из ${spec.capacity}).` });
  }

  // 4. Температура нагревателя
  if (temp < sp.temp[0] || temp > sp.temp[1]) {
    out.push({ level: 'bad', text: `Сейчас в аквариуме ${temp.toFixed(1)} °C, а виду «${sp.name}» нужно ${sp.temp[0]}–${sp.temp[1]} °C. Температуру можно настроить в «Оборудовании».` });
  }

  // 5. Совместимость с уже живущими обитателями
  const seenConflict = new Set();
  let maleBettas = 0;
  let territorialCount = 0;
  for (const f of tank.fish) {
    const o = SPECIES[f.species];
    if (!o) continue;
    if (o.id === 'betta' && f.sex === 'm') maleBettas++;
    if (o.territorial) territorialCount++;

    if (!seenConflict.has('temp_' + o.id) && (sp.temp[1] < o.temp[0] || sp.temp[0] > o.temp[1])) {
      seenConflict.add('temp_' + o.id);
      out.push({ level: 'bad', text: `Несовместимы по температуре с видом «${o.name}» (${o.temp[0]}–${o.temp[1]} °C и ${sp.temp[0]}–${sp.temp[1]} °C).` });
    }
    if (!seenConflict.has('conf_' + o.id) && (sp.conflicts?.includes(o.id) || o.conflicts?.includes(sp.id))) {
      seenConflict.add('conf_' + o.id);
      out.push({ level: 'bad', text: `Конфликт характеров с видом «${o.name}»: они будут беспокоить друг друга.` });
    }
    if (!seenConflict.has('tiny_' + o.id) && sp.eatsTiny && o.tiny) {
      seenConflict.add('tiny_' + o.id);
      out.push({ level: 'warn', text: `Крупная «${sp.name}» может обижать маленьких рыбок вроде «${o.name}».` });
    }
    if (!seenConflict.has('pred_' + o.id) && o.eatsTiny && sp.tiny) {
      seenConflict.add('pred_' + o.id);
      out.push({ level: 'warn', text: `В аквариуме живёт «${o.name}» — она может гонять крошечную рыбку «${sp.name}».` });
    }
  }

  if (sp.soloMale && maleBettas > 0 && chosenSex !== 'f') {
    out.push({ level: 'bad', text: `В этом аквариуме уже живёт самец петушка! Два самца петушка в одном аквариуме будут конфликтовать.` });
  }
  if (sp.territorial && territorialCount >= (spec.volumeL >= 120 ? 3 : 2)) {
    out.push({ level: 'warn', text: `В аквариуме уже несколько территориальных рыб — добавь гроты или коряги для разграничения зон.` });
  }

  // 6. Стайность
  const same = tank.fish.filter(f => f.species === spId).length + 1;
  if (sp.school && same < sp.schoolMin && !spec.isNursery) {
    out.push({ level: 'info', text: `${sp.name} — стайный вид. Спокойнее всего в стайке от ${sp.schoolMin} (сейчас будет ${same}).` });
  }

  // 7. Совет про донные таблетки для сомиков/акватеррариума
  if ((sp.bottom || sp.needsPaludarium) && (state.food.tablets || 0) <= 0) {
    out.push({ level: 'info', text: `Не забудь купить донные таблетки в Магазине → Корм — это любимая еда вида «${sp.name}».` });
  }

  return out;
}
