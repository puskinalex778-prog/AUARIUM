// Реалистичный физический синтез звука (Web Audio API, полностью офлайн и без чужих файлов):
// живой шум аквариумной воды и течения, резонансные пузырьки (акустика Миннаэрта),
// приглушённый гул компрессора, натуральный стук по стеклу с водой, всплеск/бульк корма,
// мокрое трение губки, скребок, сифон грунта с шуршанием гальки, промывка фильтра,
// механический затвор камеры, мягкий перезвон монет и тёплая эмбиент-музыка.

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.music = 0.45;
    this.sfx = 0.8;
    this.compressor = true;
    this.started = false;
  }

  start() {
    if (this.started) { this.ctx?.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.started = true;

    this.master = ctx.createGain();
    this.master.gain.value = 1;
    // Мягкий компрессор динамики предотвращает клиппинг при наложении звуков
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 18;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.01;
    this.comp.release.value = 0.15;
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);

    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.setVolumes(this.music, this.sfx);

    // Реверберация: тёплая комнатная реверберация с естественным спадом высоких частот
    this.verb = ctx.createConvolver();
    const sr = ctx.sampleRate;
    const irLen = Math.floor(sr * 2.8);
    const ir = ctx.createBuffer(2, irLen, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < irLen; i++) {
        const env = Math.pow(1 - i / irLen, 2.8);
        const raw = (Math.random() * 2 - 1) * env;
        lp = lp * 0.65 + raw * 0.35; // мягкое затухание ВЧ как в уютной комнате
        d[i] = lp * (i < sr * 0.04 ? 1.3 : 1.0);
      }
    }
    this.verb.buffer = ir;
    const verbGain = ctx.createGain();
    verbGain.gain.value = 0.5;
    this.verb.connect(verbGain);
    verbGain.connect(this.musicBus);

    // Короткая реверберация для эффектов (естественная акустика комнаты)
    this.sfxVerb = ctx.createGain();
    this.sfxVerb.gain.value = 0.16;
    this.sfxVerb.connect(this.verb);

    // Буферы шума: розовый (для воды и трения), коричневый (для глубины), белый (для чётких транзиентов)
    this.pinkNoise = this.makeNoise(sr * 4, 'pink');
    this.brownNoise = this.makeNoise(sr * 4, 'brown');
    this.whiteNoise = this.makeNoise(sr * 2, 'white');

    // --- Фон 1: мягкий подводный гул воды (низкие частоты 80–260 Гц) ---
    const deepSrc = ctx.createBufferSource();
    deepSrc.buffer = this.brownNoise;
    deepSrc.loop = true;
    const deepFilter = ctx.createBiquadFilter();
    deepFilter.type = 'bandpass';
    deepFilter.frequency.value = 165;
    deepFilter.Q.value = 0.7;
    const deepGain = ctx.createGain();
    deepGain.gain.value = 0.16;
    deepSrc.connect(deepFilter);
    deepFilter.connect(deepGain);
    deepGain.connect(this.sfxBus);
    deepSrc.start();

    const lfo1 = ctx.createOscillator();
    lfo1.frequency.value = 0.11;
    const lfo1g = ctx.createGain();
    lfo1g.gain.value = 48;
    lfo1.connect(lfo1g);
    lfo1g.connect(deepFilter.frequency);
    lfo1.start();

    // --- Фон 2: живое переливание потока фильтра (1100–2400 Гц, органично дышит) ---
    const flowSrc = ctx.createBufferSource();
    flowSrc.buffer = this.pinkNoise;
    flowSrc.loop = true;
    const flowBp = ctx.createBiquadFilter();
    flowBp.type = 'bandpass';
    flowBp.frequency.value = 1550;
    flowBp.Q.value = 1.6;
    const flowLp = ctx.createBiquadFilter();
    flowLp.type = 'lowpass';
    flowLp.frequency.value = 3400;
    const flowGain = ctx.createGain();
    flowGain.gain.value = 0.032;
    flowSrc.connect(flowBp);
    flowBp.connect(flowLp);
    flowLp.connect(flowGain);
    flowGain.connect(this.sfxBus);
    flowSrc.start();

    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 0.27;
    const lfo2g = ctx.createGain();
    lfo2g.gain.value = 420;
    lfo2.connect(lfo2g);
    lfo2g.connect(flowBp.frequency);
    lfo2.start();

    // --- Фон 3: тихая мягкая вибрация компрессора (без резкой пилы!) ---
    const hum1 = ctx.createOscillator();
    hum1.type = 'sine';
    hum1.frequency.value = 50;
    const hum2 = ctx.createOscillator();
    hum2.type = 'sine';
    hum2.frequency.value = 100.3;
    const hum2g = ctx.createGain();
    hum2g.gain.value = 0.35;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    hum1.connect(this.humGain);
    hum2.connect(hum2g);
    hum2g.connect(this.humGain);
    this.humGain.connect(this.sfxBus);
    hum1.start();
    hum2.start();
    this.setCompressor(this.compressor);

    this.nextBloop = ctx.currentTime + 0.2;
    this.nextTrickle = ctx.currentTime + 0.5;
    this.nextNote = ctx.currentTime + 1.2;
    // Тёплый мажорный строй (Ре мажор add9 / пентатоника)
    this.scale = [146.83, 164.81, 185.0, 220.0, 246.94, 293.66, 329.63, 369.99, 440.0, 493.88, 587.33];
    this.chordIdx = 0;
  }

  makeNoise(length, type) {
    const buf = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (type === 'white') {
      for (let i = 0; i < length; i++) d[i] = Math.random() * 2 - 1;
    } else if (type === 'brown') {
      let last = 0;
      for (let i = 0; i < length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.2;
      }
    } else {
      // Фильтр Пола Келлета для естественного розового шума
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    return buf;
  }

  panNode(panVal) {
    if (!this.ctx.createStereoPanner) return this.sfxBus;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, panVal));
    p.connect(this.sfxBus);
    return p;
  }

  setVolumes(music, sfx) {
    this.music = music;
    this.sfx = sfx;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(music * 0.48, this.ctx.currentTime, 0.2);
    this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.2);
  }

  setCompressor(on) {
    this.compressor = on;
    if (this.ctx) this.humGain.gain.setTargetAtTime(on ? 0.016 : 0, this.ctx.currentTime, 0.45);
  }

  suspend() { this.ctx?.suspend(); }
  resume() { this.ctx?.resume(); }

  tick() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    // Кластеры реалистичных пузырьков от распылителя компрессора
    if (this.compressor && t > this.nextBloop) {
      const cluster = Math.random() < 0.45 ? 2 : Math.random() < 0.2 ? 3 : 1;
      for (let i = 0; i < cluster; i++) {
        this.bubble(t + i * (0.025 + Math.random() * 0.04), 0.35 + Math.random() * 0.3, 0.022 + Math.random() * 0.018);
      }
      this.nextBloop = t + 0.07 + Math.random() * 0.28;
    }
    // Редкие деликатные водяные микро-переливы у поверхности фильтра
    if (t > this.nextTrickle) {
      this.bubble(t, -0.5 + Math.random() * 0.2, 0.008 + Math.random() * 0.007, 1100 + Math.random() * 900);
      this.nextTrickle = t + 0.35 + Math.random() * 1.1;
    }
    if (t > this.nextNote - 0.12) this.playMusic(this.nextNote);
  }

  // Физический резонанс пузырька (Миннаэрт): короткий плавный подъём высоты ~22–34% + быстрый спад
  bubble(t, pan = 0.4, vol = 0.025, baseFreq = null) {
    const ctx = this.ctx;
    const f0 = baseFreq || (380 + Math.pow(Math.random(), 1.5) * 950);
    const dur = 0.028 + (1 - Math.min(1, (f0 - 350) / 1400)) * 0.042;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const bp = ctx.createBiquadFilter();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * (1.2 + Math.random() * 0.16), t + dur);
    bp.type = 'bandpass';
    bp.frequency.value = f0 * 1.1;
    bp.Q.value = 2.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(bp);
    bp.connect(g);
    g.connect(this.panNode(pan));
    o.start(t);
    o.stop(t + dur + 0.015);
  }

  // --- Тёплая спокойная генеративная музыка (эмбиент-подложка + нежные ноты арфы/калимбы) ---
  playMusic(t) {
    const chords = [
      [0, 2, 4, 6],   // Dmaj7
      [1, 3, 5, 7],   // Em9
      [2, 4, 6, 8],   // F#m7
      [0, 3, 5, 8],   // Dadd9 / G6
    ];
    const ch = chords[this.chordIdx++ % chords.length];
    for (const n of ch) this.pad(this.scale[n] * 0.5, t, 8.6, 0.024);
    // 2–4 нежных арфовых/калимбовых перебора с мягким стерео-разнесением
    const count = 2 + (Math.random() < 0.6 ? 1 : 0) + (Math.random() < 0.35 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * this.scale.length);
      const nt = t + 0.6 + i * 2.1 + Math.random() * 0.55;
      this.harpPluck(this.scale[idx] * (Math.random() < 0.35 ? 2 : 1), nt, (Math.random() - 0.5) * 0.7);
    }
    this.nextNote = t + 8.5;
  }

  pad(freq, t, dur, vol) {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    o1.type = 'sine';
    o2.type = 'triangle';
    o1.frequency.value = freq;
    o2.frequency.value = freq * 1.0025;
    f.type = 'lowpass';
    f.frequency.setValueAtTime(420, t);
    f.frequency.linearRampToValueAtTime(760, t + dur * 0.45);
    f.frequency.linearRampToValueAtTime(380, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 2.8);
    g.gain.linearRampToValueAtTime(vol * 0.8, t + dur - 2.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o1.connect(f);
    o2.connect(f);
    f.connect(g);
    g.connect(this.musicBus);
    g.connect(this.verb);
    o1.start(t);
    o2.start(t);
    o1.stop(t + dur + 0.15);
    o2.stop(t + dur + 0.15);
  }

  harpPluck(freq, t, pan = 0) {
    const ctx = this.ctx;
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g1 = ctx.createGain();
    const g2 = ctx.createGain();
    o1.type = 'sine';
    o2.type = 'triangle';
    o1.frequency.value = freq;
    o2.frequency.value = freq * 2;
    g1.gain.setValueAtTime(0.0001, t);
    g1.gain.linearRampToValueAtTime(0.042, t + 0.012);
    g1.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.linearRampToValueAtTime(0.012, t + 0.008);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    const dest = ctx.createStereoPanner ? ctx.createStereoPanner() : this.musicBus;
    if (dest !== this.musicBus) {
      dest.pan.value = pan;
      dest.connect(this.musicBus);
      dest.connect(this.verb);
    }
    o1.connect(g1); g1.connect(dest);
    o2.connect(g2); g2.connect(dest);
    if (dest === this.musicBus) { g1.connect(this.verb); }
    o1.start(t); o2.start(t);
    o1.stop(t + 2.5); o2.stop(t + 0.5);
  }

  // ================= РЕАЛИСТИЧНЫЕ ЭФФЕКТЫ =================

  // Реалистичный стук пальцем по толстому стеклу аквариума с водой
  knock() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    // 1. Глухой отклик водной полости аквариума
    const thud = ctx.createOscillator(), tg = ctx.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(125, t);
    thud.frequency.exponentialRampToValueAtTime(76, t + 0.075);
    tg.gain.setValueAtTime(0.0001, t);
    tg.gain.linearRampToValueAtTime(0.28, t + 0.003);
    tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.095);
    thud.connect(tg); tg.connect(this.sfxBus);
    thud.start(t); thud.stop(t + 0.11);

    // 2. Модальные обертоны толстого силикатного стекла (быстро гасятся водой)
    const modes = [[520, 0.11, 0.055], [1290, 0.065, 0.042], [2540, 0.032, 0.028]];
    for (const [f, v, d] of modes) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * (0.97 + Math.random() * 0.06);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(this.sfxBus);
      o.start(t); o.stop(t + d + 0.01);
    }

    // 3. Короткий тактильный щелчок подушечки пальца о стекло
    this.noiseBurst(0.014, 1800, 0.14, 'bandpass', this.whiteNoise, 1.5);
  }

  // Лёгкий рассыпчатый всплеск хлопьев/гранул по поверхности воды
  splash() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    // Мягкий шорох падающих хлопьев + рябь
    this.noiseBurst(0.11, 2100, 0.09, 'bandpass', this.pinkNoise, 1.2);
    // 2–3 крошечных капельки-булька на поверхности
    for (let i = 0; i < 3; i++) {
      const dt = 0.015 + i * 0.035 + Math.random() * 0.02;
      this.bubble(t + dt, (Math.random() - 0.5) * 0.4, 0.045, 650 + Math.random() * 550);
    }
  }

  // Плотное «бульк!» от тонущей донной таблетки или выпуска рыбки
  plop() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(560, t + 0.065);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + 0.09);
    this.bubble(t + 0.055, 0, 0.06, 980);
    this.noiseBurst(0.07, 1400, 0.09, 'bandpass', this.pinkNoise, 1.4);
  }

  // Тёплый мягкий перезвон калимбы/колокольчика за монеты и награды
  coin() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const notes = [880, 1174.66]; // A5 -> D6
    notes.forEach((f, i) => {
      const st = t + i * 0.085;
      // Основной тон + колокольный обертон
      for (const [mul, amp, dec] of [[1, 0.11, 0.45], [2.756, 0.03, 0.18]]) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = f * mul;
        g.gain.setValueAtTime(0.0001, st);
        g.gain.linearRampToValueAtTime(amp, st + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, st + dec);
        o.connect(g); g.connect(this.sfxBus); g.connect(this.sfxVerb);
        o.start(st); o.stop(st + dec + 0.02);
      }
    });
  }

  // Мягкий тактильный клик интерфейса (деревянно-водяной щелчок, без «писка»)
  click() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(480, t);
    o.frequency.exponentialRampToValueAtTime(240, t + 0.024);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.085, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + 0.035);
  }

  // Мокрое мягкое трение губки по влажному стеклу
  scrub() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.pinkNoise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2.4;
    const fStart = 550 + Math.random() * 250;
    f.frequency.setValueAtTime(fStart, t);
    f.frequency.exponentialRampToValueAtTime(fStart * 1.65, t + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.11, t + 0.025);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    s.connect(f); f.connect(g); g.connect(this.sfxBus);
    s.start(t, Math.random() * 2);
    s.stop(t + 0.15);
  }

  // Тонкий лезвийный скребок по стойкому налёту на стекле
  scrape() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.whiteNoise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 5.0;
    f.frequency.setValueAtTime(2400 + Math.random() * 600, t);
    f.frequency.linearRampToValueAtTime(3400 + Math.random() * 600, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.075, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    s.connect(f); f.connect(g); g.connect(this.sfxBus);
    s.start(t, Math.random());
    s.stop(t + 0.12);
  }

  // Сифон грунта: подводное всасывание + перестук камешков в трубке
  siphon() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.noiseBurst(0.14, 420, 0.11, 'bandpass', this.brownNoise, 1.8);
    this.bubble(t, 0, 0.05, 320 + Math.random() * 260);
    // Мягкий стук пересыпающейся гальки в трубке сифона
    for (let i = 0; i < 2; i++) {
      const dt = 0.02 + i * 0.05 + Math.random() * 0.02;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = 1350 + Math.random() * 900;
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.linearRampToValueAtTime(0.032, t + dt + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.018);
      o.connect(g); g.connect(this.sfxBus);
      o.start(t + dt); o.stop(t + dt + 0.022);
    }
  }

  // Промывка губки фильтра под водой (мягкий сжатый всплеск + пузыри)
  rinse() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.pinkNoise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.8;
    f.frequency.setValueAtTime(320, t);
    f.frequency.exponentialRampToValueAtTime(980, t + 0.09);
    f.frequency.exponentialRampToValueAtTime(420, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.17, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    s.connect(f); f.connect(g); g.connect(this.sfxBus);
    s.start(t, Math.random() * 2);
    s.stop(t + 0.26);
    this.bubble(t + 0.04, -0.2, 0.05, 420);
    this.bubble(t + 0.09, 0.2, 0.045, 620);
  }

  // Переливание воды при подмене
  waterPour() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    this.noiseBurst(0.28, 1200, 0.08, 'bandpass', this.pinkNoise, 1.1);
    this.bubble(t + 0.05, (Math.random() - 0.5) * 0.5, 0.038, 520 + Math.random() * 480);
    this.bubble(t + 0.16, (Math.random() - 0.5) * 0.5, 0.032, 740 + Math.random() * 460);
  }

  // Реалистичный двухступенчатый затвор фотокамеры
  shutter() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const curtain = (at, pitch, vol) => {
      // Корпусной щелчок
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(pitch, at);
      o.frequency.exponentialRampToValueAtTime(pitch * 0.35, at + 0.025);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(vol, at + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
      o.connect(g); g.connect(this.sfxBus);
      o.start(at); o.stop(at + 0.035);
      // Механическая шторка
      const s = ctx.createBufferSource();
      s.buffer = this.whiteNoise;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = 1.4;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(vol * 0.9, at);
      ng.gain.exponentialRampToValueAtTime(0.0001, at + 0.028);
      s.connect(f); f.connect(ng); ng.connect(this.sfxBus);
      s.start(at, Math.random()); s.stop(at + 0.035);
    };
    curtain(t, 360, 0.18);
    curtain(t + 0.068, 280, 0.14);
  }

  // Тихий стук лапок крабика по гальке на суше
  crabClick() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(2100 + Math.random() * 500, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.014);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.025, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.016);
    o.connect(g); g.connect(this.sfxBus);
    o.start(t); o.stop(t + 0.02);
  }

  noiseBurst(dur, freq, vol, type, buf = null, q = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = buf || this.pinkNoise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxBus);
    s.start(t, Math.random() * Math.max(0.1, s.buffer.duration - dur - 0.1));
    s.stop(t + dur + 0.02);
  }
}
