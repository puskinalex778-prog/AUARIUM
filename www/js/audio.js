// Аудиосистема на реальных записанных звуках (CC0, без шума «ветра»):
// - Живая фортепианная эмбиент-музыка (audio/music.ogg)
// - Реальные мягкие пузырьки компрессора (audio/bubbles.ogg)
// - Реальные всплески, бульк, переливание воды, стук по стеклу, мокрая губка,
//   отжим фильтра, сифон с галькой, механический затвор камеры и мягкие клики.

const SFX_FILES = {
  bubbles: 'audio/bubbles.ogg',
  pour:    'audio/pour.ogg',
  siphon:  'audio/siphon.ogg',
  splash1: 'audio/splash1.ogg',
  splash2: 'audio/splash2.ogg',
  plop:    'audio/plop.ogg',
  scrub:   'audio/scrub.ogg',
  rinse:   'audio/rinse.ogg',
  knock:   'audio/knock.ogg',
  scrape:  'audio/scrape.ogg',
  rock:    'audio/rock.ogg',
  shutter: 'audio/shutter.wav',
  click:   'audio/click.wav',
};

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.music = 0.45;
    this.sfx = 0.8;
    this.compressor = true;
    this.started = false;
    this.buffers = new Map();
    this.bubbleSrc = null;
    this.musicEl = null;
  }

  start() {
    if (this.started) {
      this.ctx?.resume();
      this._syncMusic();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.started = true;

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.sfx;
    this.sfxBus.connect(ctx.destination);

    // Плавный канал для пузырьков компрессора (без гула и «ветра»!)
    this.bubbleGain = ctx.createGain();
    this.bubbleGain.gain.value = 0;
    this.bubbleGain.connect(this.sfxBus);

    // Спокойная фоновая фортепианная музыка (потоковое воспроизведение, без задержек)
    this.musicEl = new Audio('audio/music.ogg');
    this.musicEl.loop = true;
    this.musicEl.preload = 'auto';
    this._syncMusic();

    // Асинхронная загрузка всех реальных сэмплов
    this._loadAll();
  }

  async _loadAll() {
    const entries = Object.entries(SFX_FILES);
    await Promise.all(entries.map(async ([key, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const arr = await res.arrayBuffer();
        const buf = await this.ctx.decodeAudioData(arr);
        this.buffers.set(key, buf);
        if (key === 'bubbles') this._startBubbleLoop();
      } catch (e) {
        // если декодирование не удалось — тихо игнорируем
      }
    }));
  }

  _startBubbleLoop() {
    if (!this.ctx || this.bubbleSrc || !this.buffers.has('bubbles')) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers.get('bubbles');
    src.loop = true;
    // Лёгкий фильтр смягчает верхние частоты, чтобы пузырьки звучали уютно и ненавязчиво
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    src.connect(lp);
    lp.connect(this.bubbleGain);
    src.start();
    this.bubbleSrc = src;
    this.setCompressor(this.compressor);
  }

  _syncMusic() {
    if (!this.musicEl) return;
    this.musicEl.volume = Math.max(0, Math.min(1, this.music * 0.55));
    if (this.music > 0.01 && !this._suspended) {
      if (this.musicEl.paused) this.musicEl.play().catch(() => {});
    } else {
      if (!this.musicEl.paused) this.musicEl.pause();
    }
  }

  setVolumes(music, sfx) {
    this.music = music;
    this.sfx = sfx;
    this._syncMusic();
    if (this.ctx && this.sfxBus) {
      this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.12);
    }
  }

  setCompressor(on) {
    this.compressor = on;
    if (this.ctx && this.bubbleGain) {
      this.bubbleGain.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.45);
    }
  }

  suspend() {
    this._suspended = true;
    this.ctx?.suspend();
    if (this.musicEl && !this.musicEl.paused) this.musicEl.pause();
  }

  resume() {
    this._suspended = false;
    this.ctx?.resume();
    this._syncMusic();
  }

  tick() {
    // Фоновые пузырьки и музыка играют нативными циклами без нагрузки на JS-поток
  }

  _play(key, vol = 0.6, rate = 1.0, rateJitter = 0.06, offset = 0, dur = null) {
    const ctx = this.ctx;
    const buf = this.buffers.get(key);
    if (!ctx || !buf || ctx.state === 'suspended') return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.max(0.5, rate + (Math.random() - 0.5) * 2 * rateJitter);
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    g.connect(this.sfxBus);
    if (dur) {
      const t = ctx.currentTime;
      g.gain.setValueAtTime(vol, t);
      g.gain.linearRampToValueAtTime(0.001, t + dur);
      src.start(t, offset, dur + 0.02);
    } else {
      src.start(0, offset);
    }
  }

  // --- Реальные звуковые эффекты ---
  knock() { this._play('knock', 0.55, 0.92, 0.06); }
  splash() { this._play(Math.random() < 0.5 ? 'splash1' : 'splash2', 0.42, 1.08, 0.09); }
  plop() { this._play('plop', 0.6, 0.96, 0.08); }
  click() { this._play('click', 0.42, 1.0, 0.04); }
  scrub() { this._play('scrub', 0.34, 1.12, 0.1); }
  scrape() { this._play('scrape', 0.24, 1.35, 0.1, 0, 0.14); }
  rinse() { this._play('rinse', 0.52, 0.95, 0.08); }
  siphon() {
    this._play('siphon', 0.38, 0.92, 0.1);
    if (Math.random() < 0.55) this._play('rock', 0.2, 1.25, 0.15);
  }
  waterPour() { this._play('pour', 0.26, 1.0, 0.04, Math.random() * 1.2, 0.55); }
  shutter() { this._play('shutter', 0.55, 1.05, 0.02); }
  crabClick() { this._play('rock', 0.16, 1.55, 0.12); }

  // Мягкий приятный перезвон за монеты и награды (чистые синусоидальные колокольчики, без шума)
  coin() {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    [880, 1174.66].forEach((f, i) => {
      const st = t + i * 0.08;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.linearRampToValueAtTime(0.11, st + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.38);
      o.connect(g); g.connect(this.sfxBus);
      o.start(st); o.stop(st + 0.42);
    });
  }
}
