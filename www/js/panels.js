// Содержимое панелей: магазин (27 видов, корма, декор, аквариумы), энциклопедия видов в природе,
// уборка (губка, скребок, сифон, мини-игра промывки фильтра, сачок, подмена воды),
// оборудование (с регулировкой нагревателя), обитатели (карточка, пересадка, альбом), задания, настройки.
import { SPECIES, TANKS, DECOR, BACKGROUNDS, GROUNDS, LIGHT_COLORS, UPGRADES, FOOD_ITEMS, TASKS, DAILY_TASK } from './data.js';
import { SPECIES_BIO, SEX_DIFF } from './bio.js';
import { purchaseWarnings, bioload, waterQuality, qualityLabel, timeOfDay, lifeStage } from './sim.js';
import { h, toast, confirmDialog, sw, statBar, showDialog, closeDialog } from './ui.js';
import { curTank, newTankState, saveAlbum, wipe } from './save.js';

const spImg = (id, alt = '') => h('img', { src: `img/species/${id}.png`, alt });
const decImg = (id, alt = '') => h('img', { src: `img/decor/${id}.png`, alt });
const foodImg = (id, alt = '') => h('img', { src: `img/food/${id}.png`, alt });
const tankImg = (id, alt = '') => h('img', { src: `img/tanks/${id}.png`, alt });
const uiImg = (id, alt = '', cls = '') => h('img', { src: `img/ui/${id}.png`, alt, class: cls });
const coinEl = (n) => [String(n), uiImg('coin', 'монет', 'coin-ic')];

export class Panels {
  constructor(game) { this.g = game; }

  open(id, startTab) {
    const g = this.g, P = g.panel;
    if (id === 'shop') P.open('shop', 'Магазин', [
      ['fish', 'Рыбки'], ['cat', 'Сомики и берег'], ['food', 'Корм'], ['plants', 'Растения'], ['decor', 'Декорации'],
      ['equip', 'Оборудование'], ['tanks', 'Аквариумы'], ['looks', 'Фоны и грунт'], ['inv', 'Инвентарь'],
    ], (b, t) => this.shop(b, t), startTab);
    if (id === 'clean') { g.state.tasks.dailyChecked = true; g.updateBadge(); P.open('clean', 'Уборка', [], (b) => this.clean(b)); }
    if (id === 'equip') P.open('equip', 'Оборудование', [], (b) => this.equip(b));
    if (id === 'fish') P.open('fish', 'Обитатели', [['list', 'Питомцы'], ['album', 'Альбом'], ['memorial', 'Память']], (b, t) => this.fishList(b, t), startTab);
    if (id === 'tasks') P.open('tasks', 'Задания', [], (b) => this.tasks(b));
    if (id === 'settings') P.open('settings', 'Настройки', [], (b) => this.settings(b));
  }

  coinsBtn(price, label, onclick) {
    const can = this.g.state.coins >= price;
    return h('button', { class: 'btn', disabled: can ? false : 'disabled', onclick },
      can ? [label + ' ', ...coinEl(price)] : coinEl(price));
  }

  // ---------------- ЭНЦИКЛОПЕДИЯ: О ВИДЕ В ПРИРОДЕ ----------------
  showSpeciesBio(spId) {
    const sp = SPECIES[spId];
    const bio = SPECIES_BIO[spId];
    if (!sp) return;
    this.g.audio.click();
    showDialog(box => {
      box.append(h('div', { class: 'bio-head' },
        h('div', { class: 'em' }, spImg(spId, sp.name)),
        h('div', {},
          h('h3', {}, sp.name),
          h('small', {}, sp.latin))));
      if (bio) {
        box.append(h('div', { class: 'bio-card' },
          h('div', { class: 'bio-sec' }, h('b', {}, '🌍 Родина и ареал'), h('p', {}, bio.origin)),
          h('div', { class: 'bio-sec' }, h('b', {}, '🌿 Природная среда обитания'), h('p', {}, bio.habitat)),
          h('div', { class: 'bio-sec' }, h('b', {}, '🐟 Образ жизни в природе'), h('p', {}, bio.lifestyle)),
          SEX_DIFF[spId] ? h('div', { class: 'bio-sec' }, h('b', {}, '♂ / ♀ Отличия самца и самки'), h('p', {}, SEX_DIFF[spId])) : null,
          h('div', { class: 'bio-sec fact' }, h('b', {}, '💡 Интересный факт'), h('p', {}, bio.fact)),
        ));
      }
      box.append(h('div', { class: 'bio-care' },
        h('b', {}, '🏠 Уход в аквариуме: '),
        `${sp.tank}. Любимый корм: ${sp.favorite}. Характер: ${sp.temperament}.`));
      box.append(h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: () => closeDialog(true) }, 'Понятно')));
    }, true);
  }

  // ---------------- МАГАЗИН ----------------
  shop(b, tab) {
    const g = this.g, st = g.state, tk = curTank(st), spec = TANKS[st.activeTank];
    const item = (ic, title, desc, btn, cls = '') => h('div', { class: 'item ' + cls }, h('div', { class: 'ic' }, ic), h('div', { class: 'tx' }, h('b', {}, title), h('small', {}, desc)), h('div', { class: 'bt' }, btn));
    b.append(h('p', { class: 'section-note' }, 'У тебя ', ...coinEl(st.coins), ` · Активен: ${spec.name} (${spec.volumeL} л, ${tk.water.temp.toFixed(1)} °C).`));

    if (tab === 'fish' || tab === 'cat') {
      b.append(h('p', { class: 'section-note' }, `Нагрузка: ${bioload(tk).toFixed(0)} из ${spec.capacity}. Нажми 📖 рядом с любым видом, чтобы узнать о его жизни в природе и отличиях самца/самки.`));
      const list = Object.values(SPECIES).filter(sp => tab === 'fish' ? sp.category === 'fish' : sp.category !== 'fish');
      for (const sp of list) {
        const acts = h('div', { class: 'bt-col' },
          h('button', { class: 'btn sec mini', title: 'О виде в природе', onclick: () => this.showSpeciesBio(sp.id) }, '📖'),
          this.coinsBtn(sp.price, 'Купить', () => this.buyFish(sp.id)));
        b.append(item(spImg(sp.id, sp.name), `${sp.name} · ${sp.latin}`, `${sp.traits} Условия: ${sp.tank}.`, acts));
      }
    }

    if (tab === 'food') {
      for (const [id, f] of Object.entries(FOOD_ITEMS)) {
        const cur = st.food[id] || 0;
        b.append(item(foodImg(id, f.name), f.name, `${f.desc}. Сейчас в запасе: ${cur}.`, this.coinsBtn(f.price, 'Купить', () => {
          st.coins -= f.price; st.food[id] = (st.food[id] || 0) + f.amount; g.audio.coin(); toast(`+${f.amount}: ${f.name.split(' (')[0]}`); g.updateHud(); g.save(); g.panel.refresh();
        })));
      }
    }

    if (tab === 'plants' || tab === 'decor') {
      const kind = tab === 'plants' ? 'plant' : 'decor';
      b.append(h('p', { class: 'section-note' }, 'Нажми «Примерить» — предмет появится в аквариуме, его можно передвинуть, повернуть и изменить размер. Платишь только при установке.'));
      for (const [id, d] of Object.entries(DECOR)) if (d.kind === kind) {
        const landNote = spec.isPaludarium ? (d.landOk ? ' · можно на сушу' : ' · только в воду') : '';
        b.append(item(decImg(id, d.name), d.name, d.desc + landNote, h('button', { class: 'btn', onclick: () => {
          if (st.coins < d.price) { toast(`Нужно ${d.price} монет`); return; }
          g.startPlacement({ mode: 'buy', type: id, price: d.price });
        } }, 'Примерить · ', ...coinEl(d.price))));
      }
    }

    if (tab === 'equip') {
      for (const [id, u] of Object.entries(UPGRADES)) {
        const owned = st.owned[id];
        const ic = id === 'filterPro' ? uiImg('filter_sponge', u.name) : uiImg('equip', u.name);
        b.append(item(ic, u.name, u.desc, owned ? h('button', { class: 'btn sec', disabled: 'disabled' }, 'Установлено ✓') : this.coinsBtn(u.price, 'Купить', () => {
          st.coins -= u.price; st.owned[id] = true; g.audio.coin(); toast(`${u.name} установлен!`); g.updateHud(); g.save(); g.panel.refresh();
        })));
      }
    }

    if (tab === 'tanks') {
      b.append(h('p', { class: 'section-note' }, 'Купленные аквариумы работают одновременно — между ними можно переключаться в любой момент и пересаживать питомцев.'));
      for (const tSpec of Object.values(TANKS)) {
        const owned = st.owned.tanks.includes(tSpec.id);
        const active = st.activeTank === tSpec.id;
        const count = (st.tanks[tSpec.id]?.fish || []).length;
        const sub = `${tSpec.desc} (${tSpec.volumeL} л${owned ? ` · питомцев: ${count}` : ''})`;
        let btn;
        if (active) btn = h('button', { class: 'btn sec', disabled: 'disabled' }, 'Активен ✓');
        else if (owned) btn = h('button', { class: 'btn', onclick: () => { g.switchTank(tSpec.id); g.panel.refresh(); } }, 'Перейти');
        else btn = this.coinsBtn(tSpec.price, 'Купить', () => {
          st.coins -= tSpec.price;
          st.owned.tanks.push(tSpec.id);
          if (!st.tanks[tSpec.id]) st.tanks[tSpec.id] = newTankState(tSpec.id);
          g.audio.coin();
          if (tSpec.id === 'nursery') g.doneTask('nursery');
          else g.doneTask('bigtank');
          g.switchTank(tSpec.id);
          toast(`${tSpec.name} готов! Добро пожаловать ✨`, { gold: true });
          g.panel.refresh();
        });
        b.append(item(tankImg(tSpec.id, tSpec.name), tSpec.name, sub, btn));
      }
    }

    if (tab === 'looks') {
      b.append(h('h3', {}, 'Фон'));
      for (const [id, bg] of Object.entries(BACKGROUNDS)) {
        const owned = st.owned.bg.includes(id), on = tk.look.bg === id;
        b.append(item('🖼️', bg.name, on ? 'Сейчас установлен' : owned ? 'Куплен' : '', on ? h('button', { class: 'btn sec', disabled: 'disabled' }, '✓') : owned
          ? h('button', { class: 'btn sec', onclick: () => { tk.look.bg = id; g.tank.buildBackdrop(id); g.save(); g.panel.refresh(); } }, 'Поставить')
          : this.coinsBtn(bg.price, 'Купить', () => { st.coins -= bg.price; st.owned.bg.push(id); tk.look.bg = id; g.tank.buildBackdrop(id); g.audio.coin(); g.updateHud(); g.save(); g.panel.refresh(); })));
      }
      b.append(h('h3', {}, 'Грунт'));
      for (const [id, gr] of Object.entries(GROUNDS)) {
        const owned = st.owned.ground.includes(id), on = tk.look.ground === id;
        b.append(item('🏖️', gr.name, on ? 'Сейчас насыпан' : owned ? 'Куплен' : '', on ? h('button', { class: 'btn sec', disabled: 'disabled' }, '✓') : owned
          ? h('button', { class: 'btn sec', onclick: () => { tk.look.ground = id; g.tank.buildSubstrate(id); g.save(); g.panel.refresh(); } }, 'Насыпать')
          : this.coinsBtn(gr.price, 'Купить', () => { st.coins -= gr.price; st.owned.ground.push(id); tk.look.ground = id; g.tank.buildSubstrate(id); g.audio.coin(); g.updateHud(); g.save(); g.panel.refresh(); })));
      }
    }

    if (tab === 'inv') {
      b.append(h('div', { class: 'btn-row', style: 'margin:0 0 12px' }, h('button', { class: 'btn', onclick: () => { g.panel.close(); g.setTool('arrange'); } }, '✋ Переставить предметы в аквариуме')));
      const inv = Object.entries(st.inventory).filter(([, n]) => n > 0);
      if (!inv.length) b.append(h('p', { class: 'section-note' }, 'Инвентарь пуст. Предметы из аквариума можно убрать сюда через «Переставить» → «В инвентарь».'));
      for (const [type, n] of inv) {
        const d = DECOR[type];
        b.append(item(decImg(type, d.name), `${d.name} × ${n}`, 'Можно поставить бесплатно в любой аквариум', h('button', { class: 'btn', onclick: () => {
          st.inventory[type]--; g.startPlacement({ mode: 'inv', type });
        } }, 'Поставить')));
      }
    }
  }

  async buyFish(spId) {
    const g = this.g, st = g.state, sp = SPECIES[spId];
    let pickSex = sp.id === 'betta' ? 'm' : 'rand';
    const res = await showDialog(box => {
      box.append(h('div', { class: 'bio-head', style: 'justify-content:center' },
        h('div', { class: 'em' }, spImg(spId, sp.name)),
        h('div', {}, h('h3', {}, `Купить: ${sp.name}?`), h('small', {}, sp.temperament))));
      const sexRow = h('div', { class: 'chips', style: 'justify-content:center;margin:8px 0 10px' });
      const warnWrap = h('div');
      const renderSex = () => {
        sexRow.innerHTML = '';
        for (const [val, lbl] of [['rand', '🎲 Любой пол'], ['m', '♂ Самец'], ['f', '♀ Самка']]) {
          sexRow.append(h('button', { class: 'chip' + (pickSex === val ? ' on' : ''), onclick: () => { pickSex = val; renderSex(); } }, lbl));
        }
        warnWrap.innerHTML = '';
        const warns = purchaseWarnings(st, spId, null, pickSex === 'rand' ? null : pickSex);
        if (warns.length) {
          warnWrap.append(h('div', { class: 'warns' }, warns.map(w => h('div', { class: w.level }, (w.level === 'bad' ? '⚠️ ' : w.level === 'warn' ? '⚠️ ' : 'ℹ️ ') + w.text))));
        }
      };
      renderSex();
      box.append(sexRow, warnWrap);
      box.append(h('div', { class: 'btn-row' },
        h('button', { class: 'btn sec', onclick: () => closeDialog(null) }, 'Отмена'),
        h('button', { class: 'btn', onclick: () => closeDialog(pickSex) }, 'Купить ', ...coinEl(sp.price))));
    });
    if (!res) return;
    if (st.coins < sp.price) { toast('Не хватает монет'); return; }
    st.coins -= sp.price; g.audio.plop();
    const sex = res === 'rand' ? (Math.random() < 0.5 ? 'm' : 'f') : res;
    const variant = sp.variants[Math.floor(Math.random() * sp.variants.length)];
    g.panel.close();
    const f = g.addFish({ species: spId, sex, variant });
    toast(sp.needsPaludarium ? `${sp.name} (${sex === 'm' ? 'самец' : 'самка'}) осваивается на берегу!` : `${sp.name} (${sex === 'm' ? 'самец' : 'самка'}) в аквариуме! 🌡️`);
    const name = await showDialog(box => {
      box.append(h('h3', {}, `Новый питомец: ${sp.name}`));
      box.append(h('p', {}, `${sex === 'm' ? '♂ Самец' : '♀ Самка'}. Придумаешь имя сейчас?`));
      box.append(h('div', { class: 'btn-row' }, h('button', { class: 'btn sec', onclick: () => closeDialog(false) }, 'Позже'), h('button', { class: 'btn', onclick: () => closeDialog(true) }, 'Придумать имя')));
    });
    if (name) await g.renameFish(f);
    g.save(); g.updateHud();
  }

  // ---------------- УБОРКА (все 6 инструментов + мини-игра фильтра) ----------------
  clean(b) {
    const g = this.g, tk = curTank(g.state);
    const q = waterQuality(tk), [ql] = qualityLabel(q);
    const soft = Math.round(g.algae.softLevel() * 100);
    const hard = Math.round(g.algae.hardLevel() * 100);
    const det = (tk.detritus || []).length;
    const fDirt = Math.round(tk.filterDirt || 0);

    b.append(h('p', { class: 'section-note' },
      `Вода: ${ql} · Мягкий налёт: ${soft}% · Стойкий налёт: ${hard}% · Осадок на дне: ${det} · Засорение фильтра: ${fDirt}% · Остатки корма: ${g.food.onBottom}.`));

    const tool = (ic, t, d, label, fn) => h('div', { class: 'item' },
      h('div', { class: 'ic' }, ic),
      h('div', { class: 'tx' }, h('b', {}, t), h('small', {}, d)),
      h('div', { class: 'bt' }, h('button', { class: 'btn', onclick: fn }, label)));

    b.append(tool(uiImg('sponge', 'Губка'), 'Губка для стекла', 'Мягко стирает зелёный налёт. Води пальцем по переднему стеклу', 'Взять', () => { g.panel.close(); g.setTool('sponge'); }));
    b.append(tool(uiImg('scraper', 'Скребок'), 'Скребок для водорослей', 'Счищает плотные тёмно-зелёные известковые пятна, с которыми не справляется губка', 'Взять', () => { g.panel.close(); g.setTool('scraper'); }));
    b.append(tool(uiImg('siphon', 'Сифон'), 'Сифон для грунта', 'Веди трубкой по дну, чтобы собрать органический осадок и улучшить качество воды', 'Взять', () => { g.panel.close(); g.setTool('siphon'); }));
    b.append(tool(uiImg('filter_sponge', 'Фильтр'), 'Обслуживание фильтра', `Мини-игра: промой губку фильтра в аквариумной воде (засорение ${fDirt}%)`, fDirt > 10 ? 'Промыть' : 'Чист ✓', () => { g.panel.close(); this.openFilterGame(); }));
    b.append(tool(uiImg('net', 'Сачок'), 'Сачок', 'Собрать несъеденные остатки корма со дна, пока они не испортили воду', 'Взять', () => { g.panel.close(); g.setTool('net'); }));
    b.append(tool(uiImg('water', 'Подмена воды'), 'Подмена 20% воды', 'Часть воды сливается и доливается свежая той же температуры. Полностью менять воду не нужно!', 'Сделать', () => { g.panel.close(); g.waterChange(); }));
  }

  // Мини-игра: промывка губки фильтра в слитой аквариумной воде
  openFilterGame() {
    const g = this.g, tk = curTank(g.state);
    const startDirt = Math.max(0, Math.round(tk.filterDirt || 0));
    if (startDirt <= 5) { toast('Губка фильтра сейчас совсем чистая ✨'); return; }
    let cleanPct = Math.max(0, 100 - startDirt);

    showDialog(box => {
      box.append(h('h3', {}, 'Промывка губки фильтра'));
      box.append(h('p', {}, 'Нажимай и отжимай губку в ведре со слитой аквариумной водой! Не мой под краном — в аквариумной воде сохраняются полезные бактерии.'));

      const bucket = h('div', { class: 'filter-bucket' });
      const water = h('div', { class: 'bucket-water' });
      const sponge = h('button', { class: 'filter-sponge', type: 'button' }, uiImg('filter_sponge', 'Губка фильтра'));
      const clouds = h('div', { class: 'bucket-clouds' });
      bucket.append(water, clouds, sponge);
      box.append(bucket);

      const barWrap = h('div', { class: 'stat', style: 'text-align:left' });
      const lbl = h('span', {}, `Чистота губки: ${cleanPct}%`);
      const fill = h('i', { style: `width:${cleanPct}%;background:#4fd1c5` });
      barWrap.append(h('div', { class: 'top' }, h('span', {}, 'Прогресс промывки'), lbl), h('div', { class: 'bar2' }, fill));
      box.append(barWrap);

      const updateVis = () => {
        const dirtFrac = Math.max(0, (100 - cleanPct) / 100);
        sponge.style.filter = `sepia(${(dirtFrac * 0.95).toFixed(2)}) brightness(${(1 - dirtFrac * 0.45).toFixed(2)})`;
        water.style.background = `rgba(${Math.round(55 + (1 - dirtFrac) * 40)}, ${Math.round(95 + (1 - dirtFrac) * 65)}, ${Math.round(80 + (1 - dirtFrac) * 95)}, 0.55)`;
        lbl.textContent = `Чистота губки: ${Math.round(cleanPct)}%`;
        fill.style.width = `${Math.round(cleanPct)}%`;
      };
      updateVis();

      const squeeze = () => {
        if (cleanPct >= 100) return;
        g.audio.rinse();
        sponge.classList.remove('sq'); void sponge.offsetWidth; sponge.classList.add('sq');
        const puff = h('span', { class: 'mud-puff', style: `left:${35 + Math.random() * 30}%;top:${35 + Math.random() * 25}%` });
        clouds.append(puff);
        setTimeout(() => puff.remove(), 700);
        cleanPct = Math.min(100, cleanPct + Math.max(12, Math.round(startDirt / 5)));
        tk.filterDirt = Math.max(0, 100 - cleanPct);
        updateVis();
        if (cleanPct >= 100) {
          tk.filterDirt = 0;
          g.doneTask('filter');
          const c = g.state.counters;
          if (c.filterArmed && startDirt >= 18) {
            c.filterArmed = false;
            g.reward(15, 'Фильтр чист и снова работает в полную силу! 🌀');
          } else {
            toast('Губка фильтра промыта! 🌀');
          }
          g.save(); g.updateHud();
          setTimeout(() => closeDialog(true), 650);
        }
      };

      sponge.addEventListener('click', squeeze);
      box.append(h('div', { class: 'btn-row' },
        h('button', { class: 'btn sec', onclick: () => { g.save(); closeDialog(false); } }, 'Закрыть'),
        h('button', { class: 'btn', onclick: squeeze }, '💧 Отжать губку')));
    });
  }

  // ---------------- ОБОРУДОВАНИЕ ----------------
  equip(b) {
    const g = this.g, st = g.state, tk = curTank(st), e = tk.equip, spec = TANKS[st.activeTank];
    const row = (label, ctrl) => h('div', { class: 'row2' }, h('label', {}, label), ctrl);
    const eff = g.effectiveEquip();

    b.append(h('p', { class: 'section-note' }, `Настройки для: ${spec.name} (${spec.volumeL} л).`));
    b.append(row('💡 Подсветка' + (e.autoDay ? ' (по расписанию)' : ''), sw(eff.lightOn, v => {
      if (e.autoDay) { e.autoDay = false; toast('Автоматический режим выключен — управляешь вручную'); }
      e.lightOn = v; g.save(); g.panel.refresh();
    })));
    const chips = h('div', { class: 'chips' });
    for (const [id, c] of Object.entries(LIGHT_COLORS)) {
      const avail = c.free || st.owned.lampSpectrum;
      chips.append(h('button', { class: 'chip' + (e.lightColor === id ? ' on' : ''), disabled: avail ? false : 'disabled', style: avail ? '' : 'opacity:.4',
        onclick: () => { if (!avail) return; e.lightColor = id; g.doneTask('light'); g.save(); g.panel.refresh(); } },
        h('span', { class: 'dot', style: `background:#${c.hex.toString(16).padStart(6, '0')}` }), c.name + (avail ? '' : ' 🔒')));
    }
    b.append(h('div', { class: 'row2', style: 'display:block' }, h('label', {}, '🎨 Цвет света'), h('div', { style: 'margin-top:8px' }, chips)));
    const rng = h('input', { type: 'range', min: 20, max: 100, value: Math.round(e.brightness * 100) });
    rng.addEventListener('input', () => { e.brightness = rng.value / 100; });
    rng.addEventListener('change', () => g.save());
    b.append(row('🔆 Яркость', rng));

    const curT = e.targetTemp ?? spec.defaultTemp;
    const tVal = h('b', { style: 'min-width:56px;text-align:right' }, `${curT.toFixed(1)} °C`);
    const tRng = h('input', { type: 'range', min: 18, max: 30, step: 0.5, value: curT });
    tRng.addEventListener('input', () => {
      e.targetTemp = parseFloat(tRng.value);
      tk.water.temp = e.targetTemp;
      tVal.textContent = `${e.targetTemp.toFixed(1)} °C`;
      g.updateHud();
    });
    tRng.addEventListener('change', () => { g.save(); toast(`Нагреватель установлен на ${e.targetTemp.toFixed(1)} °C 🌡️`); });
    b.append(row('🌡️ Нагреватель', h('div', { style: 'display:flex;align-items:center;gap:8px' }, tRng, tVal)));

    b.append(row('💨 Компрессор', sw(e.compressorOn, v => { e.compressorOn = v; g.audio.setCompressor(v); toast(v ? 'Компрессор включён — пузырьки насыщают воду кислородом' : 'Компрессор выключен. Кислород будет снижаться постепенно'); g.save(); })));
    b.append(row('🕰️ Автоматический день и ночь', sw(e.autoDay, v => { e.autoDay = v; g.save(); g.panel.refresh(); })));
    if (!e.autoDay) {
      const tc = h('div', { class: 'chips' });
      for (const [id, n] of [['day', '☀️ День'], ['evening', '🌇 Вечер'], ['night', '🌙 Ночь']]) tc.append(h('button', { class: 'chip' + (e.manualTime === id ? ' on' : ''), onclick: () => { e.manualTime = id; g.save(); g.panel.refresh(); g.updateHud(); } }, n));
      b.append(h('div', { class: 'row2', style: 'display:block' }, h('label', {}, 'Атмосфера в комнате'), h('div', { style: 'margin-top:8px' }, tc)));
    } else b.append(h('p', { class: 'section-note' }, 'Авторежим: свет горит с 8:00 до 22:00, комната меняется по реальным часам. Сейчас: ' + ({ day: 'день', evening: 'вечер', night: 'ночь' }[timeOfDay(tk)]) + '.'));

    const fClean = Math.max(0, 100 - Math.round(tk.filterDirt || 0));
    b.append(row('🌀 Фильтр', h('div', { style: 'display:flex;align-items:center;gap:8px' },
      h('span', {}, `${st.owned.filterPro ? '«Кристалл»' : 'Базовый'} · чистота ${fClean}%`),
      fClean < 92 ? h('button', { class: 'btn sec mini', onclick: () => { g.panel.close(); this.openFilterGame(); } }, 'Промыть') : null)));
    b.append(h('p', { class: 'section-note' }, 'Совет: для золотых рыбок и тритонов ставь 19–22 °C, для дискусов и прыгунов 26–29 °C, для большинства тропических рыб — 24–26 °C.'));
  }

  // ---------------- ОБИТАТЕЛИ ----------------
  fishList(b, tab) {
    const g = this.g, st = g.state, spec = TANKS[st.activeTank];
    if (tab === 'album') {
      if (!g.album.length) { b.append(h('p', { class: 'section-note' }, 'Здесь появятся снимки из фоторежима (кнопка камеры справа).')); return; }
      const grid = h('div', { class: 'album' });
      g.album.slice().reverse().forEach((p) => {
        grid.append(h('div', { class: 'ph' }, h('img', { src: p.data }), h('button', { onclick: async () => {
          if (await confirmDialog('Удалить снимок?', '', 'Удалить')) { g.album.splice(g.album.indexOf(p), 1); saveAlbum(g.album); g.panel.refresh(); }
        } }, '🗑')));
      });
      b.append(grid);
      b.append(h('p', { class: 'section-note' }, 'Хранятся последние 12 снимков.'));
      return;
    }

    if (tab === 'memorial') {
      const mem = st.memorial || [];
      if (!mem.length) {
        b.append(h('p', { class: 'section-note' }, 'Здесь бережно хранятся воспоминания о питомцах, проживших долгую и счастливую жизнь в твоём аквариуме.'));
        return;
      }
      for (const m of mem) {
        const sp = SPECIES[m.species];
        const kids = m.childrenCount ? ` · потомство: ${m.childrenCount}` : '';
        b.append(h('div', { class: 'item memorial-item' },
          h('div', { class: 'ic' }, spImg(m.species, sp?.name || '')),
          h('div', { class: 'tx' },
            h('b', {}, `🕯️ ${m.name}`),
            h('small', {}, `${sp?.name || ''} · ${m.sex === 'm' ? '♂' : '♀'} · прожил(а) ${m.livedDays} дн. · поколение ${m.gen || 1}${kids}`))));
      }
      return;
    }

    if (st.owned.tanks.length > 1) {
      const chips = h('div', { class: 'chips', style: 'margin-bottom:10px' });
      for (const tid of st.owned.tanks) {
        const ts = TANKS[tid];
        const cnt = (st.tanks[tid]?.fish || []).length;
        chips.append(h('button', { class: 'chip' + (st.activeTank === tid ? ' on' : ''), onclick: () => { g.switchTank(tid); g.panel.refresh(); } },
          h('img', { src: `img/tanks/${tid}.png`, class: 'chip-ic', alt: '' }), `${ts.name} (${cnt})`));
      }
      b.append(chips);
    }

    const clutches = curTank(st).clutches || [];
    if (clutches.length) {
      for (const cl of clutches) {
        const sp = SPECIES[cl.species];
        const mins = Math.max(1, Math.ceil((cl.hatchAt - Date.now()) / 60000));
        b.append(h('div', { class: 'item clutch-item' },
          h('div', { class: 'ic' }, '🥚'),
          h('div', { class: 'tx' }, h('b', {}, `Кладка икры: ${sp?.name || ''}`), h('small', {}, `Вылупится примерно через ${mins} мин.`))));
      }
    }

    if (!g.fishes.length) b.append(h('p', { class: 'section-note' }, `В «${spec.name}» пока никого нет. Загляни в Магазин!`));
    for (const f of g.fishes) {
      const r = f.rec, sp = SPECIES[r.species];
      const stg = lifeStage(r, sp);
      const badge = r.pregnantUntil > Date.now() ? ' 🤰' : stg.isFry ? ' 🍼' : stg.isElder ? ' ✨' : '';
      const infoBtn = h('button', { class: 'btn sec mini', title: 'О виде в природе', onclick: (e) => { e.stopPropagation(); this.showSpeciesBio(r.species); } }, '📖');
      b.append(h('div', { class: 'item', onclick: () => g.openFishCard(f), style: 'cursor:pointer' },
        h('div', { class: 'ic' }, spImg(r.species, sp.name)),
        h('div', { class: 'tx' }, h('b', {}, g.displayName(r) + badge + (r.name ? '' : ' (без имени)')), h('small', {}, `${sp.name} · ${stg.label} · ${r.sex === 'm' ? '♂' : '♀'} · сытость ${Math.round(r.satiety)}%`)),
        h('div', { class: 'bt bt-row' }, infoBtn, h('span', { style: 'padding:0 4px;opacity:.6' }, '›'))));
    }
  }

  fishCard(fish) {
    this.cardFish = fish;
    this.g.panel.open('card', 'Карточка питомца', [], (b) => this.renderCard(b));
  }
  refreshCard() { if (this.g.panel.current === 'card') this.g.panel.refresh(); }

  renderCard(b) {
    const g = this.g, f = this.cardFish; if (!f) return;
    const r = f.rec, sp = SPECIES[r.species];
    const stg = lifeStage(r, sp);
    const days = Math.floor(stg.ageDays);
    b.append(h('div', { class: 'card-head' }, h('div', { class: 'em' }, spImg(r.species, sp.name)), h('div', {}, h('h3', {}, g.displayName(r)), h('small', {}, `${sp.name} · ${sp.latin}`))));
    if (r.pregnantUntil && r.pregnantUntil > Date.now()) {
      const mins = Math.max(1, Math.ceil((r.pregnantUntil - Date.now()) / 60000));
      b.append(h('p', { class: 'section-note preg-note' }, `🤰 Ожидает мальков — появятся примерно через ${mins} мин.`));
    }
    b.append(statBar('Сытость', r.satiety, '#ffcf5a'));
    b.append(statBar('Здоровье', r.health, '#6fe38a'));
    b.append(statBar('Комфорт', 100 - r.stress, '#4fd1c5'));
    const layer = sp.needsPaludarium ? 'берег и мелководье' : sp.bottom ? 'дно и укрытия' : sp.layer[1] > 0.9 ? 'верхний и средний' : sp.layer[0] < 0.3 ? 'средний и нижний' : 'средний';
    const fam = r.family || { gen: 1, mother: null, father: null, children: [] };
    const famRows = [
      h('span', {}, 'Поколение'), h('span', {}, `${fam.gen || 1}`),
    ];
    if (fam.mother || fam.father) {
      famRows.push(h('span', {}, 'Родители'), h('span', {}, [fam.mother, fam.father].filter(Boolean).join(' и ')));
    }
    if (fam.children?.length) {
      famRows.push(h('span', {}, 'Потомство'), h('span', {}, `${fam.children.length} мал.`));
    }
    b.append(h('div', { class: 'kv' },
      h('span', {}, 'Возраст'), h('span', {}, days < 1 ? 'меньше дня' : `${days} дн.`),
      h('span', {}, 'Стадия'), h('span', {}, stg.label),
      h('span', {}, 'Пол'), h('span', {}, r.sex === 'm' ? '♂ Самец' : '♀ Самка'),
      h('span', {}, 'Любимый корм'), h('span', {}, sp.favorite),
      h('span', {}, 'Температура'), h('span', {}, `${sp.temp[0]}–${sp.temp[1]} °C`),
      h('span', {}, 'Характер'), h('span', {}, sp.temperament),
      h('span', {}, 'Слой / зона'), h('span', {}, layer),
      h('span', {}, 'Компания'), h('span', {}, sp.school ? `стая от ${sp.schoolMin}` : sp.soloMale ? 'один самец' : 'можно одному'),
      ...famRows,
    ));
    if (r.stress > 55) b.append(h('p', { class: 'section-note' }, sp.school && g.fishes.filter(x => x.rec.species === r.species).length < sp.schoolMin ? '😟 Питомцу одиноко — стайным видам нужна компания сородичей.' : '😟 Питомцу некомфортно — проверь температуру, объём аквариума и совместимость соседей.'));
    if (r.satiety < 30) b.append(h('p', { class: 'section-note' }, `🥣 Проголодался — любимое угощение: ${sp.favorite}.`));
    const following = g.rig.follow === f;
    const otherTanks = g.state.owned.tanks.filter(id => id !== g.state.activeTank);
    const canNursery = stg.isFry && !sp.needsPaludarium && g.state.owned.tanks.includes('nursery') && g.state.activeTank !== 'nursery';
    b.append(h('div', { class: 'btn-row' },
      h('button', { class: 'btn sec', onclick: () => this.showSpeciesBio(r.species) }, '📖 О виде в природе'),
      h('button', { class: 'btn sec', onclick: async () => { await g.renameFish(f); g.panel.refresh(); } }, '✏️ Переименовать'),
      canNursery ? h('button', { class: 'btn gold', onclick: () => this.moveFishDirect(f, 'nursery') }, '🍼 В выростной') : null,
      otherTanks.length ? h('button', { class: 'btn sec', onclick: () => this.moveFishDialog(f, otherTanks) }, '🔄 Пересадить') : null,
      h('button', { class: 'btn', onclick: () => { g.setFollow(following ? null : f); if (!following) g.panel.close(); else g.panel.refresh(); } }, following ? '⏹ Не следить' : '🎥 Следить камерой')));
  }

  moveFishDirect(fish, targetId) {
    const g = this.g, st = g.state;
    const cur = curTank(st), dst = st.tanks[targetId];
    const idx = cur.fish.indexOf(fish.rec);
    if (idx < 0 || !dst) return;
    cur.fish.splice(idx, 1);
    dst.fish.push(fish.rec);
    fish.dispose(g.tank.tankGroup);
    g.fishes = g.fishes.filter(x => x !== fish);
    if (g.rig.follow === fish) g.setFollow(null);
    g.panel.close();
    toast(`${g.displayName(fish.rec)} бережно пересажен в «${TANKS[targetId].name}»`);
    g.save(); g.updateHud();
  }

  async moveFishDialog(fish, otherTanks) {
    const g = this.g, st = g.state;
    const isFry = lifeStage(fish.rec, SPECIES[fish.rec.species]).isFry;
    const targetId = await showDialog(box => {
      box.append(h('h3', {}, `Пересадить: ${g.displayName(fish.rec)}`));
      box.append(h('p', {}, 'Выбери аквариум назначения:'));
      for (const tid of otherTanks) {
        const ts = TANKS[tid];
        const warns = purchaseWarnings(st, fish.rec.species, tid, fish.rec.sex, isFry);
        const warnTxt = warns.length ? ` · ${warns[0].level === 'info' ? 'ℹ️' : '⚠️'} ${warns[0].text.slice(0, 68)}…` : ' · Подходит ✓';
        box.append(h('div', { class: 'item' },
          h('div', { class: 'ic' }, tankImg(tid, ts.name)),
          h('div', { class: 'tx' }, h('b', {}, ts.name), h('small', {}, `${ts.volumeL} л${warnTxt}`)),
          h('div', { class: 'bt' }, h('button', { class: 'btn', onclick: () => closeDialog(tid) }, 'Сюда'))));
      }
      box.append(h('div', { class: 'btn-row' }, h('button', { class: 'btn sec', onclick: () => closeDialog(null) }, 'Отмена')));
    });
    if (!targetId) return;
    this.moveFishDirect(fish, targetId);
  }

  // ---------------- ЗАДАНИЯ ----------------
  tasks(b) {
    const g = this.g, t = g.state.tasks;
    const dailyReady = t.dailyFed && t.dailyChecked, dailyClaimed = t.dailyClaimed === t.dailyDate;
    const mk = (title, reward, done, claimed, id, sub) => h('div', { class: 'item' + (claimed ? ' locked' : '') },
      h('div', { class: 'ic' }, claimed ? '✅' : done ? '🎁' : uiImg('tasks', 'Задание')),
      h('div', { class: 'tx' }, h('b', {}, title), h('small', {}, sub || ['Награда: ', ...coinEl(reward)])),
      h('div', { class: 'bt' }, claimed ? '' : done ? h('button', { class: 'btn gold', onclick: () => { g.claim(id); g.panel.refresh(); } }, 'Забрать') : ''));
    b.append(mk(DAILY_TASK.title, DAILY_TASK.reward, dailyReady, dailyClaimed, 'daily',
      [`${t.dailyFed ? '✓' : '○'} покормить · ${t.dailyChecked ? '✓' : '○'} заглянуть в «Уборку» · `, ...coinEl(DAILY_TASK.reward)]));
    const sorted = [...TASKS].sort((a, c) => (score(a) - score(c)));
    function score(x) { return t.claimed[x.id] ? 2 : t.done[x.id] ? 0 : 1; }
    for (const x of sorted) b.append(mk(x.title, x.reward, t.done[x.id], t.claimed[x.id], x.id));
  }

  // ---------------- НАСТРОЙКИ ----------------
  settings(b) {
    const g = this.g, s = g.state.settings;
    const row = (label, ctrl) => h('div', { class: 'row2' }, h('label', {}, label), ctrl);
    const vol = (key) => { const r = h('input', { type: 'range', min: 0, max: 100, value: Math.round(s[key] * 100) }); r.addEventListener('input', () => { s[key] = r.value / 100; g.audio.setVolumes(s.music, s.sfx); }); r.addEventListener('change', () => g.save()); return r; };
    b.append(row('🎵 Музыка', vol('music')));
    b.append(row('🔊 Звуки', vol('sfx')));
    const q = h('div', { class: 'chips' });
    for (const [id, n] of [['low', 'Низкое'], ['medium', 'Среднее'], ['high', 'Высокое']]) q.append(h('button', { class: 'chip' + (s.quality === id ? ' on' : ''), onclick: () => {
      const reload = (s.quality === 'low') !== (id === 'low');
      s.quality = id; g.applyPixelRatio(); g.tank.applyQuality(id); g.save(); g.panel.refresh();
      toast(reload ? 'Готово. Световые блики изменятся после перезапуска игры' : (id === 'high' ? 'Высокое качество: мягкие тени от рыбок' : 'Качество изменено'));
    } }, n));
    b.append(h('div', { class: 'row2', style: 'display:block' }, h('label', {}, '🖼️ Качество графики'), h('div', { style: 'margin-top:8px' }, q)));
    const fps = h('div', { class: 'chips' });
    for (const v of [30, 60]) fps.append(h('button', { class: 'chip' + (s.fps === v ? ' on' : ''), onclick: () => { s.fps = v; g.save(); g.panel.refresh(); } }, `${v} к/с`));
    b.append(row('⏱️ Частота кадров', fps));
    b.append(row('🛋️ Комфортный режим', sw(s.comfort, v => { s.comfort = v; g.save(); toast(v ? 'Комфортный режим: без болезней, старения и наказаний, голод и грязь — в безопасных пределах' : 'Обычный режим: уход важнее, но всё меняется постепенно'); })));
    b.append(h('p', { class: 'section-note' }, 'Комфортный режим подходит детям и для спокойного наблюдения.'));
    b.append(row('💕 Ухаживание и сердечки', sw(s.courtship !== false, v => { s.courtship = v; g.save(); })));
    b.append(row('🥚 Размножение и мальки', sw(s.breeding !== false, v => { s.breeding = v; g.save(); toast(v ? 'Взрослые пары смогут заводить потомство в чистом просторном аквариуме' : 'Размножение поставлено на паузу'); })));
    b.append(row('⏳ Старение и естественная смерть', sw(!!s.aging, v => { s.aging = v; g.save(); toast(v ? 'Пожилые питомцы со временем будут бережно переходить в Памятный альбом (в комфортном режиме не действует)' : 'Питомцы остаются с тобой навсегда'); })));
    b.append(row('🔬 Подробные показатели воды', sw(s.advanced, v => { s.advanced = v; g.save(); g.updateHud(); })));
    b.append(row('🎨 Творческий режим', sw(!!s.creative, v => { s.creative = v; g.save(); toast(v ? 'Творческий режим: магазин не проверяет совместимость. Это игровая условность — в настоящем аквариуме так нельзя' : 'Проверки совместимости снова включены'); })));
    b.append(h('div', { class: 'btn-row' },
      h('button', { class: 'btn sec', onclick: () => { g.setMode('observe'); } }, '👁️ Наблюдение'),
      h('button', { class: 'btn sec', onclick: () => { g.setMode('photo'); } }, '📷 Фоторежим')));
    b.append(h('p', { class: 'section-note', style: 'margin-top:18px' }, 'Мой живой аквариум · Игра работает без интернета, прогресс хранится на устройстве. Без рекламы и встроенных покупок.'));
    b.append(h('div', { class: 'btn-row' }, h('button', { class: 'btn sec', style: 'color:#ff9a9a', onclick: async () => {
      if (await confirmDialog('Начать заново?', 'Все аквариумы, питомцы, монеты и украшения будут удалены. Это нельзя отменить.', 'Удалить прогресс')) {
        if (await confirmDialog('Точно?', 'Последнее подтверждение.', 'Да, начать заново')) { wipe(); g.saveDisabled = true; location.reload(); }
      }
    } }, 'Сбросить прогресс')));
  }
}
