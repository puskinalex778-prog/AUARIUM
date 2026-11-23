// Игровые данные: аквариумы, все 24 вида (20 рыб, 3 сомика, пресноводный крабик),
// магазин, корма, декорации, задания.

export const TANKS = {
  tank60: {
    id: 'tank60', name: 'Аквариум 60 л', icon: '🟦', price: 0,
    desc: 'Уютный стартовый аквариум — отлично подходит для небольших мирных рыбок.',
    minX: -2.9, maxX: 2.9, minZ: -1.32, maxZ: 1.32,
    bottom: 0.0, waterTop: 3.2, height: 3.6,
    glassFront: 1.42, glassBack: -1.42, glassSide: 3.0,
    volumeL: 60, capacity: 30, defaultTemp: 24.5,
    camDist: 9.2, camMax: 12.5,
    filterPos: [-2.55, -1.15], airPos: [2.35, -1.0],
    isPaludarium: false,
  },
  tank120: {
    id: 'tank120', name: 'Аквариум 120 л', icon: '🔷', price: 180,
    desc: 'Просторный аквариум для скалярий, золотых рыбок, гурами, радужниц и больших стай.',
    minX: -3.85, maxX: 3.85, minZ: -1.62, maxZ: 1.62,
    bottom: 0.0, waterTop: 3.6, height: 4.0,
    glassFront: 1.72, glassBack: -1.72, glassSide: 3.95,
    volumeL: 120, capacity: 65, defaultTemp: 24.5,
    camDist: 11.4, camMax: 15.2,
    filterPos: [-3.48, -1.42], airPos: [3.25, -1.25],
    isPaludarium: false,
  },
  tank200: {
    id: 'tank200', name: 'Панорамный 200 л', icon: '💎', price: 360,
    desc: 'Большой панорамный аквариум — идеален для дискусов, крупных стай и акваскейпа.',
    minX: -4.75, maxX: 4.75, minZ: -1.88, maxZ: 1.88,
    bottom: 0.0, waterTop: 4.0, height: 4.4,
    glassFront: 1.98, glassBack: -1.98, glassSide: 4.85,
    volumeL: 200, capacity: 110, defaultTemp: 26.0,
    camDist: 13.4, camMax: 18.0,
    filterPos: [-4.35, -1.68], airPos: [4.1, -1.5],
    isPaludarium: false,
  },
  paludarium: {
    id: 'paludarium', name: 'Акватеррариум', icon: '🏝️', price: 140,
    desc: 'Неглубокий водоём с песчано-каменистым берегом и сушей — дом для крабиков, тритонов, мускусной черепахи и илистого прыгуна.',
    minX: -2.9, maxX: 2.9, minZ: -1.32, maxZ: 1.32,
    bottom: 0.0, waterTop: 1.55, height: 3.6,
    glassFront: 1.42, glassBack: -1.42, glassSide: 3.0,
    volumeL: 45, capacity: 24, defaultTemp: 24.0,
    camDist: 9.0, camMax: 12.5,
    filterPos: [-2.55, -1.15], airPos: [-1.45, -1.05],
    isPaludarium: true,
  },
  nursery: {
    id: 'nursery', name: 'Выростной отсек', icon: '🍼', price: 90,
    desc: 'Уютный тихий аквариум 30 л с мхом для подращивания мальков — здесь они в безопасности и растут в 1,5 раза быстрее.',
    minX: -2.1, maxX: 2.1, minZ: -1.05, maxZ: 1.05,
    bottom: 0.0, waterTop: 2.55, height: 2.9,
    glassFront: 1.15, glassBack: -1.15, glassSide: 2.2,
    volumeL: 30, capacity: 18, defaultTemp: 25.0,
    camDist: 7.4, camMax: 10.5,
    filterPos: [-1.8, -0.88], airPos: [1.65, -0.8],
    isPaludarium: false, isNursery: true, growthMul: 1.5,
  },
};

// Активный аквариум (обновляется при переключении, чтобы все модули читали актуальные границы)
export const TANK = { ...TANKS.tank60, tempC: 24.5 };

export function setActiveTankSpec(tankId, tempC) {
  const spec = TANKS[tankId] || TANKS.tank60;
  Object.assign(TANK, spec);
  TANK.tempC = tempC ?? spec.defaultTemp;
  return spec;
}

// Высота грунта: в обычных аквариумах терраса (сзади выше), в акватеррариуме — берег и суша справа
export function groundY(x, z) {
  if (TANK.isPaludarium) {
    // Плавный переход от мелкого водоёма слева (x < -0.2) к сухому берегу справа (x > 0.5)
    const tx = Math.max(0, Math.min(1, (x + 0.65) / 1.9));
    const s = tx * tx * (3 - 2 * tx);
    const backSlope = ((TANK.maxZ - z) / (TANK.maxZ - TANK.minZ)) * 0.28;
    const ripple = 0.035 * Math.sin(x * 2.3) * Math.cos(z * 2.5);
    return 0.28 + s * 1.55 + backSlope * (0.65 + 0.5 * s) + ripple;
  }
  const t = (TANK.maxZ - z) / (TANK.maxZ - TANK.minZ); // 0 спереди … 1 сзади
  return 0.32 + 0.28 * t + 0.03 * Math.sin(x * 2.1) * Math.cos(z * 2.7);
}

export function isLand(x, z) {
  return !!TANK.isPaludarium && groundY(x, z) > TANK.waterTop - 0.02;
}

// ---------- ВСЕ ВИДЫ (20 рыбок + 3 сомика + 1 крабик = 24 вида) ----------
export const SPECIES = {
  // === Этап 1 + начало этапа 2 ===
  guppy: {
    id: 'guppy', name: 'Гуппи', latin: 'Poecilia reticulata', category: 'fish', price: 40,
    length: 0.74, bodyH: 0.24, bodyW: 0.12,
    speed: 0.75, activity: 0.85, boldness: 0.75,
    layer: [0.45, 0.95], school: false, schoolMin: 0,
    bioload: 2, temp: [22, 28], minVolumeL: 30, livebearer: true, adultDays: 3,
    favorite: 'Хлопья', foodTypes: ['flakes', 'granules'], longFins: true,
    temperament: 'Мирная и любопытная',
    traits: 'Самцы — с пышными яркими хвостами, самки крупнее и скромнее окрашены. Живородящие.',
    tank: 'от 30 л, 22–28 °C, верхний и средний слой',
    variants: ['fire', 'blue', 'red', 'violet', 'cobra'],
  },
  neon: {
    id: 'neon', name: 'Неон голубой', latin: 'Paracheirodon innesi', category: 'fish', price: 25,
    length: 0.58, bodyH: 0.2, bodyW: 0.1,
    speed: 0.7, activity: 0.7, boldness: 0.3,
    layer: [0.25, 0.7], school: true, schoolMin: 6,
    bioload: 1, temp: [20, 26], minVolumeL: 40, livebearer: false, adultDays: 4,
    favorite: 'Хлопья', foodTypes: ['flakes', 'granules'], tiny: true,
    temperament: 'Мирный, пугливый',
    traits: 'Светящаяся голубая полоса и красный «хвостик». Держится стайкой — от 6 рыбок.',
    tank: 'от 40 л, 20–26 °C, средний слой, растения и полумрак',
    variants: ['classic'],
  },
  danio: {
    id: 'danio', name: 'Данио-рерио', latin: 'Danio rerio', category: 'fish', price: 30,
    length: 0.7, bodyH: 0.17, bodyW: 0.1,
    speed: 1.15, activity: 1.0, boldness: 0.65,
    layer: [0.6, 0.97], school: true, schoolMin: 5,
    bioload: 1.5, temp: [18, 26], minVolumeL: 40, livebearer: false, adultDays: 3,
    favorite: 'Хлопья', foodTypes: ['flakes'], hyperactive: true,
    temperament: 'Очень подвижный, мирный',
    traits: 'Полосатый неутомимый пловец. Любит простор у поверхности и компанию сородичей.',
    tank: 'от 40 л, 18–26 °C, верхний слой, течение',
    variants: ['classic', 'gold'],
  },
  endler: {
    id: 'endler', name: 'Эндлер', latin: 'Poecilia wingei', category: 'fish', price: 45,
    length: 0.5, bodyH: 0.2, bodyW: 0.1,
    speed: 0.85, activity: 0.95, boldness: 0.7,
    layer: [0.45, 0.95], school: false, schoolMin: 0,
    bioload: 1, temp: [24, 28], minVolumeL: 30, livebearer: true, adultDays: 3,
    favorite: 'Хлопья', foodTypes: ['flakes', 'granules'], tiny: true,
    temperament: 'Мирный, очень активный',
    traits: 'Маленький родственник гуппи: самцы с неоновыми оранжевыми и чёрными пятнами. Живородящий.',
    tank: 'от 30 л, 24–28 °C, верхний и средний слой',
    variants: ['tiger', 'orange'],
  },
  cardinal: {
    id: 'cardinal', name: 'Кардинал', latin: 'Paracheirodon axelrodi', category: 'fish', price: 35,
    length: 0.62, bodyH: 0.2, bodyW: 0.1,
    speed: 0.7, activity: 0.7, boldness: 0.3,
    layer: [0.25, 0.7], school: true, schoolMin: 6,
    bioload: 1, temp: [24, 28], minVolumeL: 50, livebearer: false, adultDays: 4,
    favorite: 'Хлопья', foodTypes: ['flakes', 'granules'], tiny: true,
    temperament: 'Мирный, пугливый',
    traits: 'Красный неон: голубая полоса, а красный цвет занимает всё брюшко. Стайка от 6 рыбок.',
    tank: 'от 50 л, 24–28 °C, средний слой, мягкий полумрак',
    variants: ['classic'],
  },

  // === Этап 2: остальные 15 видов рыб ===
  cherry_barb: {
    id: 'cherry_barb', name: 'Вишнёвый барбус', latin: 'Puntius titteya', category: 'fish', price: 40,
    length: 0.68, bodyH: 0.23, bodyW: 0.12,
    speed: 0.88, activity: 0.82, boldness: 0.55,
    layer: [0.2, 0.65], school: true, schoolMin: 5,
    bioload: 1.5, temp: [22, 27], minVolumeL: 40, livebearer: false, adultDays: 4,
    favorite: 'Хлопья и гранулы', foodTypes: ['flakes', 'granules'],
    temperament: 'Мирный, игривый',
    traits: 'Самый спокойный из барбусов: самцы рубиново-вишнёвые, самки золотисто-бронзовые с тёмной полосой.',
    tank: 'от 40 л, 22–27 °C, средний и нижний слой, растения',
    variants: ['cherry', 'albino'],
  },
  rasbora: {
    id: 'rasbora', name: 'Расбора клинопятнистая', latin: 'Trigonostigma heteromorpha', category: 'fish', price: 35,
    length: 0.62, bodyH: 0.22, bodyW: 0.1,
    speed: 0.78, activity: 0.75, boldness: 0.45,
    layer: [0.32, 0.78], school: true, schoolMin: 6,
    bioload: 1.2, temp: [22, 28], minVolumeL: 40, livebearer: false, adultDays: 4,
    favorite: 'Хлопья', foodTypes: ['flakes', 'granules'], tiny: true,
    temperament: 'Мирная, дружная',
    traits: 'Медно-розовая рыбка с узнаваемым чёрным «клином» на боку. Очень красиво плавает плотной стайкой.',
    tank: 'от 40 л, 22–28 °C, средний слой, живые растения',
    variants: ['classic', 'espei'],
  },
  swordtail: {
    id: 'swordtail', name: 'Меченосец', latin: 'Xiphophorus hellerii', category: 'fish', price: 50,
    length: 0.96, bodyH: 0.26, bodyW: 0.13,
    speed: 0.9, activity: 0.88, boldness: 0.75,
    layer: [0.35, 0.88], school: false, schoolMin: 0,
    bioload: 3, temp: [22, 28], minVolumeL: 60, livebearer: true, adultDays: 5,
    favorite: 'Хлопья и гранулы', foodTypes: ['flakes', 'granules'],
    temperament: 'Подвижный, мирный',
    traits: 'У самцов нижние лучи хвоста вытянуты в яркий «меч». Энергичная живородящая рыбка.',
    tank: 'от 60 л, 22–28 °C, средний и верхний слой',
    variants: ['red', 'kohaku', 'green', 'black'],
  },
  platy: {
    id: 'platy', name: 'Пецилия', latin: 'Xiphophorus maculatus', category: 'fish', price: 45,
    length: 0.76, bodyH: 0.28, bodyW: 0.14,
    speed: 0.72, activity: 0.8, boldness: 0.78,
    layer: [0.35, 0.85], school: false, schoolMin: 0,
    bioload: 2, temp: [20, 26], minVolumeL: 40, livebearer: true, adultDays: 4,
    favorite: 'Хлопья', foodTypes: ['flakes', 'granules'],
    temperament: 'Дружелюбная, спокойная',
    traits: 'Уютная округлая рыбка солнечных оттенков. Неприхотлива, ладит почти со всеми мирными соседями.',
    tank: 'от 40 л, 20–26 °C, средний слой',
    variants: ['sunset', 'coral', 'mickey', 'tuxedo'],
  },
  molly: {
    id: 'molly', name: 'Моллинезия', latin: 'Poecilia sphenops', category: 'fish', price: 50,
    length: 0.88, bodyH: 0.26, bodyW: 0.14,
    speed: 0.76, activity: 0.82, boldness: 0.7,
    layer: [0.35, 0.88], school: false, schoolMin: 0,
    bioload: 3, temp: [24, 28], minVolumeL: 60, livebearer: true, adultDays: 5,
    favorite: 'Хлопья и водоросли', foodTypes: ['flakes', 'granules', 'tablets'], algaeEater: 0.25,
    temperament: 'Мирная, общительная',
    traits: 'Бархатисто-чёрные, пятнистые «далматинцы» и золотистые моллинезии. Любят пощипывать мягкий налёт.',
    tank: 'от 60 л, 24–28 °C, средний и верхний слой',
    variants: ['black', 'dalmatian', 'gold'],
  },
  pearl_gourami: {
    id: 'pearl_gourami', name: 'Жемчужный гурами', latin: 'Trichopodus leerii', category: 'fish', price: 75,
    length: 1.18, bodyH: 0.42, bodyW: 0.14,
    speed: 0.56, activity: 0.58, boldness: 0.48,
    layer: [0.42, 0.92], school: false, schoolMin: 0,
    bioload: 4, temp: [24, 28], minVolumeL: 100, livebearer: false, adultDays: 6,
    favorite: 'Гранулы и хлопья', foodTypes: ['granules', 'flakes'],
    temperament: 'Изящный, спокойный, немного робкий',
    traits: 'Тело усыпано перламутровыми «жемчужинами», длинные нитевидные усики ощупывают растения и соседей.',
    tank: 'от 100 л, 24–28 °C, верхний и средний слой, тихий свет',
    variants: ['pearl'],
    conflicts: ['betta'],
  },
  dwarf_gourami: {
    id: 'dwarf_gourami', name: 'Лялиус', latin: 'Trichogaster lalius', category: 'fish', price: 65,
    length: 0.82, bodyH: 0.36, bodyW: 0.14,
    speed: 0.58, activity: 0.65, boldness: 0.55,
    layer: [0.45, 0.93], school: false, schoolMin: 0,
    bioload: 2.5, temp: [24, 28], minVolumeL: 50, livebearer: false, adultDays: 5,
    favorite: 'Гранулы и хлопья', foodTypes: ['granules', 'flakes'],
    territorial: true,
    temperament: 'Спокойный, слегка территориальный',
    traits: 'Компактный полосатый лабиринтовый красавец в бирюзово-коралловую полоску с тонкими усиками.',
    tank: 'от 50 л, 24–28 °C, верхний и средний слой, укрытия',
    variants: ['classic', 'neon_blue', 'flame'],
    conflicts: ['betta'],
  },
  betta: {
    id: 'betta', name: 'Петушок', latin: 'Betta splendens', category: 'fish', price: 85,
    length: 0.92, bodyH: 0.25, bodyW: 0.13,
    speed: 0.52, activity: 0.6, boldness: 0.88,
    layer: [0.42, 0.95], school: false, schoolMin: 0,
    bioload: 2.5, temp: [24, 28], minVolumeL: 30, livebearer: false, adultDays: 4,
    favorite: 'Гранулы', foodTypes: ['granules', 'flakes'],
    territorial: true, soloMale: true, longFins: true,
    temperament: 'Гордый, территориальный',
    traits: 'Самцы с роскошными вуалевыми плавниками. Двух самцов вместе сажать нельзя; не любит пышнохвостых конкурентов.',
    tank: 'от 30 л, 24–28 °C, верхний слой, спокойное течение',
    variants: ['royal_blue', 'crimson', 'turquoise', 'koi'],
    conflicts: ['guppy', 'pearl_gourami', 'dwarf_gourami', 'goldfish'],
  },
  angelfish: {
    id: 'angelfish', name: 'Скалярия', latin: 'Pterophyllum scalare', category: 'fish', price: 95,
    length: 1.15, bodyH: 0.62, bodyW: 0.11,
    speed: 0.5, activity: 0.55, boldness: 0.68,
    layer: [0.28, 0.82], school: false, schoolMin: 0,
    bioload: 6, temp: [24, 29], minVolumeL: 120, livebearer: false, adultDays: 8,
    favorite: 'Гранулы', foodTypes: ['granules', 'flakes'],
    territorial: true, eatsTiny: true,
    temperament: 'Величественная, полутерриториальная',
    traits: 'Высокое плоское тело и треугольные «крылья» плавников. Нужен высокий аквариум от 120 л; мелких рыбок может обижать.',
    tank: 'от 120 л, 24–29 °C, средний слой, простор в высоту',
    variants: ['silver', 'marble', 'koi', 'gold'],
    conflicts: ['betta', 'goldfish'],
  },
  discus: {
    id: 'discus', name: 'Дискус', latin: 'Symphysodon aequifasciatus', category: 'fish', price: 150,
    length: 1.32, bodyH: 0.66, bodyW: 0.12,
    speed: 0.44, activity: 0.48, boldness: 0.42,
    layer: [0.25, 0.78], school: true, schoolMin: 4,
    bioload: 8, temp: [27, 30], minVolumeL: 200, livebearer: false, adultDays: 10,
    favorite: 'Гранулы', foodTypes: ['granules'],
    sensitive: true,
    temperament: 'Королевский, неторопливый, чуткий',
    traits: 'Круглый «король аквариума» с бирюзовыми или огненными узорами. Любит тёплую (27–30 °C) чистую воду и стайку.',
    tank: 'от 200 л, 27–30 °C, средний слой, чистая тёплая вода',
    variants: ['turquoise', 'pigeon', 'diamond'],
    conflicts: ['goldfish', 'danio'],
  },
  goldfish: {
    id: 'goldfish', name: 'Золотая рыбка', latin: 'Carassius auratus', category: 'fish', price: 70,
    length: 1.18, bodyH: 0.44, bodyW: 0.24,
    speed: 0.62, activity: 0.78, boldness: 0.85,
    layer: [0.22, 0.82], school: false, schoolMin: 0,
    bioload: 8, temp: [18, 23], minVolumeL: 120, livebearer: false, adultDays: 7,
    favorite: 'Гранулы и хлопья', foodTypes: ['granules', 'flakes', 'tablets'],
    coldwater: true, longFins: true,
    temperament: 'Добродушная, прожорливая',
    traits: 'Пухлая золотистая красавица с вуалевым хвостом. Любит прохладную воду (18–23 °C) и просторный аквариум.',
    tank: 'от 120 л, 18–23 °C (прохладная вода), мощная фильтрация',
    variants: ['orange', 'calico', 'oranda'],
    conflicts: ['betta', 'angelfish', 'discus'],
  },
  apistogramma: {
    id: 'apistogramma', name: 'Апистограмма', latin: 'Apistogramma cacatuoides', category: 'fish', price: 85,
    length: 0.82, bodyH: 0.26, bodyW: 0.13,
    speed: 0.68, activity: 0.72, boldness: 0.72,
    layer: [0.08, 0.45], school: false, schoolMin: 0,
    bioload: 2.5, temp: [24, 28], minVolumeL: 60, livebearer: false, adultDays: 6,
    favorite: 'Гранулы и таблетки', foodTypes: ['granules', 'tablets', 'flakes'],
    territorial: true,
    temperament: 'Карликовая цихлида, любит укрытия',
    traits: 'У самца огненно-гребенчатый спинной плавник. Занимает уютный уголок у грота или коряги, верхних рыб не трогает.',
    tank: 'от 60 л, 24–28 °C, нижний слой, гроты и коряги',
    variants: ['double_red', 'orange_flash'],
  },
  rainbowfish: {
    id: 'rainbowfish', name: 'Радужница Боэсмана', latin: 'Melanotaenia boesemani', category: 'fish', price: 80,
    length: 1.02, bodyH: 0.34, bodyW: 0.14,
    speed: 0.96, activity: 0.92, boldness: 0.7,
    layer: [0.35, 0.88], school: true, schoolMin: 5,
    bioload: 4, temp: [24, 28], minVolumeL: 120, livebearer: false, adultDays: 6,
    favorite: 'Гранулы и хлопья', foodTypes: ['granules', 'flakes'],
    temperament: 'Яркая, активная, мирная',
    traits: 'Переливается двумя цветами: стально-голубая спереди и солнечно-оранжевая сзади. Любит простор для плавания.',
    tank: 'от 120 л, 24–28 °C, средний и верхний слой, стайка от 5',
    variants: ['boesemani', 'neon_dwarf'],
  },
  ternetzi: {
    id: 'ternetzi', name: 'Тернеция', latin: 'Gymnocorymbus ternetzi', category: 'fish', price: 45,
    length: 0.72, bodyH: 0.34, bodyW: 0.11,
    speed: 0.78, activity: 0.8, boldness: 0.62,
    layer: [0.3, 0.78], school: true, schoolMin: 5,
    bioload: 2, temp: [22, 27], minVolumeL: 50, livebearer: false, adultDays: 5,
    favorite: 'Хлопья и гранулы', foodTypes: ['flakes', 'granules'],
    temperament: 'Живая, стайная',
    traits: 'Ромбовидная тетра: бывает классической серебристо-чёрной и яркой пастельной «гло». Комфортнее в стайке от 5.',
    tank: 'от 50 л, 22–27 °C, средний слой, стайка от 5',
    variants: ['classic', 'pink', 'mint', 'sun', 'violet'],
  },
  ember_tetra: {
    id: 'ember_tetra', name: 'Тетра Аманда', latin: 'Hyphessobrycon amandae', category: 'fish', price: 35,
    length: 0.48, bodyH: 0.19, bodyW: 0.09,
    speed: 0.72, activity: 0.72, boldness: 0.4,
    layer: [0.25, 0.7], school: true, schoolMin: 6,
    bioload: 0.8, temp: [23, 28], minVolumeL: 30, livebearer: false, adultDays: 4,
    favorite: 'Хлопья', foodTypes: ['flakes', 'granules'], tiny: true,
    temperament: 'Крошечная, нежная, стайная',
    traits: 'Янтарно-огненная мини-тетра, светящаяся среди зелёных растений. Идеальна для стайки от 6 рыбок.',
    tank: 'от 30 л, 23–28 °C, средний слой, густые растения',
    variants: ['amber'],
  },

  // === Этап 2: 3 вида сомиков (донное поведение, донные таблетки) ===
  ancistrus: {
    id: 'ancistrus', name: 'Анциструс', latin: 'Ancistrus dolichopterus', category: 'catfish', price: 65,
    length: 1.05, bodyH: 0.18, bodyW: 0.24,
    speed: 0.48, activity: 0.55, boldness: 0.5,
    layer: [0.02, 0.16], school: false, schoolMin: 0,
    bioload: 3.5, temp: [22, 27], minVolumeL: 60, livebearer: false, adultDays: 7,
    favorite: 'Донные таблетки и налёт', foodTypes: ['tablets'],
    bottom: true, algaeEater: 0.8, glassCling: true,
    temperament: 'Трудолюбивый донный чистильщик',
    traits: 'Сом-присоска в пятнистом панцире (у самцов — забавные усики на носу). Помогает счищать мягкий налёт со стёкол и коряг!',
    tank: 'от 60 л, 22–27 °C, дно и коряги, донные таблетки',
    variants: ['classic', 'gold'],
  },
  corydoras: {
    id: 'corydoras', name: 'Коридорас', latin: 'Corydoras panda', category: 'catfish', price: 50,
    length: 0.72, bodyH: 0.22, bodyW: 0.18,
    speed: 0.62, activity: 0.85, boldness: 0.65,
    layer: [0.02, 0.18], school: true, schoolMin: 4,
    bioload: 2, temp: [20, 26], minVolumeL: 40, livebearer: false, adultDays: 5,
    favorite: 'Донные таблетки', foodTypes: ['tablets', 'granules', 'flakes'],
    bottom: true,
    temperament: 'Весёлый, мирный донный стайный сомик',
    traits: 'Усатый исследователь дна: роется в песке, собирает донные таблетки и упавшие крошки. Любит стайку от 4.',
    tank: 'от 40 л, 20–26 °C, дно, мягкий песок, донные таблетки',
    variants: ['panda', 'peppered', 'bronze'],
  },
  otocinclus: {
    id: 'otocinclus', name: 'Отоцинклюс', latin: 'Otocinclus vittatus', category: 'catfish', price: 55,
    length: 0.56, bodyH: 0.15, bodyW: 0.14,
    speed: 0.66, activity: 0.75, boldness: 0.42,
    layer: [0.04, 0.35], school: true, schoolMin: 5,
    bioload: 1, temp: [22, 26], minVolumeL: 40, livebearer: false, adultDays: 4,
    favorite: 'Мягкий налёт и таблетки', foodTypes: ['tablets'],
    bottom: true, algaeEater: 1.0, glassCling: true,
    temperament: 'Крошечный, робкий, мирный',
    traits: 'Миниатюрный сомик-водорослеед. Аккуратно полирует листья растений и стёкла; лучше всего живёт стайкой от 5.',
    tank: 'от 40 л, 22–26 °C, растения и дно, стайка от 5',
    variants: ['classic'],
  },

  // === Этап 2: Обитатели акватеррариума (суша + мелководье) ===
  crab: {
    id: 'crab', name: 'Пресноводный крабик', latin: 'Geosesarma dennerle', category: 'crab', price: 90,
    length: 0.62, bodyH: 0.24, bodyW: 0.52,
    speed: 0.48, activity: 0.7, boldness: 0.55,
    layer: [0.0, 0.2], school: false, schoolMin: 0,
    bioload: 2, temp: [22, 27], minVolumeL: 40, livebearer: false, adultDays: 6,
    favorite: 'Донные таблетки', foodTypes: ['tablets', 'granules'],
    needsPaludarium: true,
    temperament: 'Любознательный сухопутно-водный житель',
    traits: 'Живёт в акватеррариуме: гуляет по песчаному берегу и мелководью, ест клешнями и прячется в гротах.',
    tank: 'Акватеррариум с сушей и укрытиями, 22–27 °C',
    variants: ['vampire', 'red_devil', 'rainbow'],
  },
  newt: {
    id: 'newt', name: 'Огненнобрюхий тритон', latin: 'Cynops orientalis', category: 'crab', price: 95,
    length: 0.96, bodyH: 0.2, bodyW: 0.22,
    speed: 0.52, activity: 0.68, boldness: 0.62,
    layer: [0.0, 0.65], school: false, schoolMin: 0,
    bioload: 2.5, temp: [18, 24], minVolumeL: 40, livebearer: false, adultDays: 6,
    favorite: 'Гранулы и таблетки', foodTypes: ['granules', 'tablets'],
    needsPaludarium: true,
    temperament: 'Спокойный, изящный земноводный',
    traits: 'Хвостатая амфибия с оливковой спинкой и огненно-оранжевым пятнистым брюшком. Плавает в воде и выходит отдыхать на влажный мох.',
    tank: 'Акватеррариум с водой и влажным берегом, прохладная вода 18–24 °C',
    variants: ['classic', 'dark'],
  },
  musk_turtle: {
    id: 'musk_turtle', name: 'Мускусная черепаха', latin: 'Sternotherus odoratus', category: 'crab', price: 135,
    length: 0.95, bodyH: 0.36, bodyW: 0.62,
    speed: 0.44, activity: 0.65, boldness: 0.72,
    layer: [0.0, 0.5], school: false, schoolMin: 0,
    bioload: 5, temp: [20, 26], minVolumeL: 45, livebearer: false, adultDays: 8,
    favorite: 'Гранулы и таблетки', foodTypes: ['granules', 'tablets'],
    needsPaludarium: true,
    temperament: 'Любопытная, спокойная, любит греться на берегу',
    traits: 'Миниатюрная водная черепашка с куполообразным панцирем и полосками на шее. Плавает у дна и выползает греться под лампой.',
    tank: 'Акватеррариум с берегом и лампой, 20–26 °C',
    variants: ['classic'],
  },
  mudskipper: {
    id: 'mudskipper', name: 'Илистый прыгун', latin: 'Periophthalmus barbarus', category: 'crab', price: 110,
    length: 0.92, bodyH: 0.22, bodyW: 0.24,
    speed: 0.56, activity: 0.82, boldness: 0.76,
    layer: [0.0, 0.35], school: false, schoolMin: 0,
    bioload: 3, temp: [24, 29], minVolumeL: 45, livebearer: false, adultDays: 6,
    favorite: 'Гранулы и таблетки', foodTypes: ['granules', 'tablets'],
    needsPaludarium: true,
    temperament: 'Забавная «ходячая» рыба-амфибия',
    traits: 'Рыбка с глазами-перископами на макушке и сильными грудными плавниками: умеет ходить и подпрыгивать по песчаному берегу!',
    tank: 'Акватеррариум с пологим песчаным берегом, 24–29 °C',
    variants: ['classic'],
  },
};

export const NAME_IDEAS = [
  'Искорка', 'Бублик', 'Звёздочка', 'Пузырь', 'Капитан', 'Лучик', 'Жемчужинка', 'Шустрик', 'Кнопка',
  'Сапфир', 'Ириска', 'Мармелад', 'Волна', 'Огонёк', 'Нептун', 'Кекс', 'Фантик', 'Плюшка', 'Рыжик',
  'Блёстка', 'Тефтелька', 'Комета', 'Бусинка', 'Апельсинка', 'Ветерок', 'Зефир', 'Карамелька', 'Клешня', 'Панда',
];

// Декорации и растения. landOk — можно ставить и на сушу в акватеррариуме.
export const DECOR = {
  rock:     { name: 'Камень', icon: '🪨', price: 10, r: 0.45, h: 0.6, kind: 'decor', landOk: true, desc: 'Гладкий речной камень' },
  wood:     { name: 'Коряга', icon: '🪵', price: 25, r: 0.6, h: 1.1, kind: 'decor', landOk: true, desc: 'Мангровая коряга — рыбки, сомики и крабики любят прятаться в ветвях', hide: true },
  grotto:   { name: 'Грот', icon: '⛰️', price: 35, r: 0.65, h: 1.0, kind: 'decor', landOk: true, desc: 'Каменная арка, сквозь которую можно проплыть или укрыться', hide: true },
  ceramic:  { name: 'Керамическое укрытие', icon: '🏺', price: 20, r: 0.45, h: 0.45, kind: 'decor', landOk: true, desc: 'Тёплая терракота, уютная тень для сомиков и крабиков', hide: true },
  ship:     { name: 'Затонувший кораблик', icon: '🚢', price: 60, r: 0.85, h: 1.0, kind: 'decor', landOk: false, desc: 'Старый парусник с пробоиной', hide: true },
  castle:   { name: 'Замок с башнями', icon: '🏰', price: 75, r: 0.72, h: 1.35, kind: 'decor', landOk: true, desc: 'Каменный средневековый замок с аркой — рыбки любят проплывать внутри', hide: true },
  ruins:    { name: 'Античные колонны', icon: '🏛️', price: 55, r: 0.65, h: 1.15, kind: 'decor', landOk: true, desc: 'Затонувшие мраморные колонны, слегка тронутые мхом', hide: true },
  chest:    { name: 'Сундук с сокровищами', icon: '🧰', price: 65, r: 0.48, h: 0.65, kind: 'decor', landOk: false, desc: 'Приоткрытый сундук с золотым сиянием и лёгкими пузырьками' },
  pagoda:   { name: 'Каменная пагода', icon: '🏯', price: 60, r: 0.5, h: 1.25, kind: 'decor', landOk: true, desc: 'Восточный каменный фонарь-пагода для спокойного акваскейпа', hide: true },
  valis:    { name: 'Валлиснерия', icon: '🌿', price: 20, r: 0.25, h: 2.4, kind: 'plant', landOk: false, desc: 'Длинные ленты, красиво колышутся в течении' },
  anubias:  { name: 'Анубиас', icon: '🍃', price: 25, r: 0.35, h: 0.6, kind: 'plant', landOk: true, desc: 'Неприхотливое растение с широкими листьями — растёт и у берега' },
  moss:     { name: 'Мох на камне', icon: '🌱', price: 15, r: 0.3, h: 0.4, kind: 'plant', landOk: true, desc: 'Пушистый яванский мох — укрытие и в воде, и на влажном берегу' },
};

export const BACKGROUNDS = {
  blue:   { name: 'Глубокая синева', price: 0 },
  forest: { name: 'Лесной сумрак', price: 30 },
  stone:  { name: 'Каменная стена', price: 30 },
};
export const GROUNDS = {
  sand:   { name: 'Светлый песок', price: 0 },
  gravel: { name: 'Тёмный гравий', price: 40 },
  river:  { name: 'Речная галька', price: 40 },
};

export const LIGHT_COLORS = {
  white: { name: 'Дневной', hex: 0xfff6e8, free: true },
  warm:  { name: 'Тёплый', hex: 0xffcf8a, free: true },
  blue:  { name: 'Лунный', hex: 0x7fb4ff, free: true },
  plant: { name: 'Фито', hex: 0xff9be0, free: false },
  sea:   { name: 'Морской', hex: 0x6ff0e0, free: false },
  sun:   { name: 'Закат', hex: 0xffa060, free: false },
};

export const UPGRADES = {
  filterPro:     { name: 'Фильтр «Кристалл»', icon: '🌀', price: 80, desc: 'Очищает воду вдвое быстрее и медленнее засоряется' },
  lampSpectrum:  { name: 'Светильник «Спектр»', icon: '🌈', price: 50, desc: 'Открывает цвета Фито, Морской и Закат' },
};

export const FOOD_ITEMS = {
  flakes:   { name: 'Хлопья (40 порций)', icon: '🥣', price: 15, amount: 40, desc: 'Плавают у поверхности, потом медленно тонут — для большинства рыб' },
  granules: { name: 'Гранулы (35 порций)', icon: '🟠', price: 20, amount: 35, desc: 'Медленно опускаются в толще воды — любят скалярии, дискусы, гурами, петушки и золотые' },
  tablets:  { name: 'Донные таблетки (30 шт.)', icon: '🟤', price: 20, amount: 30, desc: 'Быстро ложатся на дно — любимая еда сомиков и пресноводного крабика' },
};

export const TASKS = [
  { id: 'feed',     title: 'Впервые покормить рыбку', reward: 10 },
  { id: 'name',     title: 'Придумать питомцу имя', reward: 10 },
  { id: 'glass',    title: 'Очистить переднее стекло губкой', reward: 15 },
  { id: 'scrape',   title: 'Счистить стойкий налёт скребком', reward: 20 },
  { id: 'siphon',   title: 'Просифонить грунт на дне', reward: 20 },
  { id: 'filter',   title: 'Промыть губку фильтра', reward: 20 },
  { id: 'plant',    title: 'Посадить растение', reward: 15 },
  { id: 'decor',    title: 'Поставить украшение', reward: 15 },
  { id: 'light',    title: 'Сменить цвет подсветки', reward: 5 },
  { id: 'follow',   title: 'Последить за рыбкой камерой', reward: 5 },
  { id: 'photo',    title: 'Сделать снимок в фоторежиме', reward: 10 },
  { id: 'second',   title: 'Завести второго питомца', reward: 15 },
  { id: 'school',   title: 'Создать полноценную стайку', reward: 40 },
  { id: 'catfish',  title: 'Поселить донного сомика', reward: 25 },
  { id: 'bigtank',  title: 'Приобрести новый аквариум', reward: 35 },
  { id: 'nursery',  title: 'Приобрести выростной отсек для мальков', reward: 25 },
  { id: 'crab',     title: 'Поселить обитателя в акватеррариуме', reward: 45 },
  { id: 'fry',      title: 'Дождаться первого потомства', reward: 45 },
  { id: 'castle',   title: 'Поставить замок, колонны, пагоду или сундук', reward: 20 },
  { id: 'allnames', title: 'Дать имена всем питомцам', reward: 20 },
  { id: 'water',    title: 'Подменить часть воды', reward: 10 },
];
export const DAILY_TASK = { id: 'daily', title: 'Ежедневный уход: покормить и проверить воду', reward: 15 };

// Продолжительность жизни вида в реальных днях (при включённом естественном старении)
export function lifespanDays(sp) {
  return Math.round((sp?.adultDays || 4) * 4.5 + 10);
}
