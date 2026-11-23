// Общие элементы интерфейса: уведомления, диалоги, панель с вкладками.
import { NAME_IDEAS } from './data.js';

export const $ = (s) => document.querySelector(s);
export const h = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
};
export const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let lastToast = '';
export function toast(text, opts = {}) {
  if (text === lastToast && !opts.force) return;
  lastToast = text; setTimeout(() => { if (lastToast === text) lastToast = ''; }, 2500);
  const life = opts.life || 3.2;
  const t = h('div', { class: 'toast' + (opts.gold ? ' gold' : ''), style: `--life:${life}s` }, text);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), (life + 0.5) * 1000);
}

// ---- Диалоги
let dialogResolve = null;
export function closeDialog(val) {
  $('#dialog').classList.add('hidden');
  const r = dialogResolve; dialogResolve = null; r && r(val);
}
export function dialogOpen() { return !$('#dialog').classList.contains('hidden'); }

export function showDialog(build, wide = false) {
  const box = $('#dialogBox'); box.innerHTML = ''; box.className = 'dialog-box' + (wide ? ' wide' : '');
  build(box);
  $('#dialog').classList.remove('hidden');
  return new Promise(res => { dialogResolve = res; });
}

export function confirmDialog(title, text, okLabel = 'Да', cancelLabel = 'Отмена', extra) {
  return showDialog(box => {
    box.append(h('h3', {}, title));
    if (text) box.append(h('p', {}, text));
    if (extra) box.append(extra);
    box.append(h('div', { class: 'btn-row' },
      cancelLabel ? h('button', { class: 'btn sec', onclick: () => closeDialog(false) }, cancelLabel) : null,
      h('button', { class: 'btn', onclick: () => closeDialog(true) }, okLabel)));
  });
}

export function nameDialog(title, subtitle, current = '') {
  return showDialog(box => {
    box.append(h('h3', {}, title));
    if (subtitle) box.append(h('p', {}, subtitle));
    const inp = h('input', { type: 'text', maxlength: 18, value: current, placeholder: 'Имя питомца' });
    box.append(inp);
    const ideas = h('div', { class: 'ideas' });
    const shuffle = () => {
      ideas.innerHTML = '';
      [...NAME_IDEAS].sort(() => Math.random() - 0.5).slice(0, 6).forEach(n =>
        ideas.append(h('button', { class: 'chip', onclick: () => { inp.value = n; } }, n)));
      ideas.append(h('button', { class: 'chip', onclick: shuffle }, '🎲 ещё'));
    };
    shuffle();
    box.append(ideas);
    const ok = () => { const v = inp.value.trim().slice(0, 18); if (v) closeDialog(v); else inp.focus(); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
    box.append(h('div', { class: 'btn-row' }, h('button', { class: 'btn', onclick: ok }, 'Готово')));
  });
}

// ---- Панель
export class Panel {
  constructor() {
    this.el = $('#panel'); this.body = $('#panelBody'); this.tabsEl = $('#panelTabs'); this.titleEl = $('#panelTitle');
    $('#panelClose').addEventListener('click', () => this.close());
    this.current = null; this.onClose = null;
  }
  get isOpen() { return !this.el.classList.contains('hidden'); }
  open(id, title, tabs, render, tab) {
    this.current = id; this.titleEl.textContent = title; this.render = render; this.tabs = tabs || [];
    this.tab = tab || (this.tabs[0] && this.tabs[0][0]);
    this.el.classList.remove('hidden');
    this.refresh();
  }
  refresh() {
    if (!this.isOpen) return;
    this.tabsEl.innerHTML = '';
    this.tabsEl.classList.toggle('hidden', !this.tabs.length);
    for (const [id, label] of this.tabs) this.tabsEl.append(h('button', { class: id === this.tab ? 'on' : '', onclick: () => { this.tab = id; this.refresh(); this.body.scrollTop = 0; } }, label));
    const st = this.body.scrollTop;
    this.body.innerHTML = '';
    this.render(this.body, this.tab);
    this.body.scrollTop = st;
  }
  close() {
    if (!this.isOpen) return;
    this.el.classList.add('hidden'); const id = this.current; this.current = null;
    this.onClose && this.onClose(id);
  }
}

export function sw(on, onchange) {
  const s = h('button', { class: 'switch' + (on ? ' on' : '') });
  s.addEventListener('click', () => { const v = !s.classList.contains('on'); s.classList.toggle('on', v); onchange(v); });
  return s;
}
export function statBar(label, value, color, suffix = '%') {
  return h('div', { class: 'stat' },
    h('div', { class: 'top' }, h('span', {}, label), h('span', {}, `${Math.round(value)}${suffix}`)),
    h('div', { class: 'bar2' }, h('i', { style: `width:${Math.max(2, Math.min(100, value))}%;background:${color}` })));
}
