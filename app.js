'use strict';
// =====================================================================
//  ПЛАНУВАЛЬНИК — Telegram Mini App
//  Де зберігаються дані:
//   • якщо в config.js вказано apiUrl (сервер Cloudflare) — на сервері
//     (тоді працюють нагадування від бота і спільний планер);
//   • інакше — у Telegram CloudStorage (окремо для кожного користувача);
//   • у звичайному браузері — у localStorage (для тестування).
// =====================================================================

const TG = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
const USE_CLOUD = !!(TG && TG.initData && TG.CloudStorage && TG.isVersionAtLeast && TG.isVersionAtLeast('6.9'));
const CFG = window.PLANNER_CONFIG || {};
const API = String(CFG.apiUrl || '').replace(/\/+$/, '');
const USE_API = !!(API && TG && TG.initData);

const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const WD_FULL = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота'];
const SLOTS = [['b', 'Сніданок'], ['l', 'Обід'], ['d', 'Вечеря']];
const CATS = { breakfast: 'Сніданки', soup: 'Перші страви', side: 'Гарніри', main: 'Мʼясо і риба', dish: 'Готові страви', salad: 'Салати' };
const EXP_CATS = ['Продукти', 'Транспорт', 'Житло', 'Комуналка', 'Кафе', 'Одяг', 'Здоровʼя', 'Розваги', 'Подарунки', 'Тварини', 'Інше'];
const INC_CATS = ['Зарплата', 'Замовлення', 'Підробіток', 'Подарунок', 'Інше'];
const COLORS = ['#e5484d', '#f59e0b', '#eab308', '#2fa84f', '#3478f6', '#8b5cf6', '#ec4899'];

// ---------- стікери ----------
const STICKERS = {
  normal: {
    done: ['🏆 Грамота: ти просто молодець!', '🚀 Ти турбо-машина!', '💪 Сильно, як мамонт!', '🔥 Зроблено — як вогонь', '😎 Красава, так тримати', '🦾 Ще одна впала!', '👑 Королева продуктивності', '⭐ Зірка дня', '🐎 Пашеш як конячка'],
    all: '🎉 ГРАМОТА 🎉\nУсі справи на сьогодні закриті. Ти легенда!',
    load: ['🛋 Сьогодні чіл день. Нічого не заплановано — кайфуй', '🌿 Легкий день, встигнеш і відпочити', '☕ Нормальний робочий день, без паніки', '⚡ Насичений день. Ти турбо-машина, впораєшся', '💀 Сьогодні ти пашеш, поки не впадеш. Тримайся!']
  },
  spicy: {
    done: ['🏆 Грамота: їбать ти молодець!', '🚀 Ти турбо-машина, бляха!', '💪 Сильно, як мамонт!', '🔥 Розʼєбано!', '😎 Красава, бля, так тримати', '🦾 Ще одна впала, нахуй!', '👑 Королева, мать її, продуктивності', '🐎 Пашеш як конячка, капець', '🤯 Охуєнно зроблено'],
    all: '🎉 ГРАМОТА 🎉\nУсі справи закриті. Ти, бля, легенда!',
    load: ['🛋 Сьогодні чіл день. Нічого не заплановано — кайфуй', '🌿 Легкий день, встигнеш і поваляцця', '☕ Нормальний такий день, без паніки', '⚡ Насичений день. Ти турбо-машина, вивезеш', '💀 Сьогодні ти хуяриш, поки не впадеш. Тримайся!']
  }
};

// ---------- helpers ----------
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
const todayStr = () => ymd(new Date());
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const jsq = s => encodeURIComponent(String(s)).replace(/'/g, '%27'); // безпечний рядок для onclick
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.').replace(/\s/g, '')); return isFinite(n) ? n : 0; };
const money = n => (Math.round(n * 100) / 100).toLocaleString('uk-UA') + ' ₴';
const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
const prettyDate = s => { const d = parseYmd(s); return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${WD_FULL[d.getDay()]}`; };
const shortDate = s => { const d = parseYmd(s); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`; };
const monthKey = s => s.slice(0, 7).replace('-', '_');
const haptic = (t = 'light') => { try { TG && TG.HapticFeedback && TG.HapticFeedback.impactOccurred(t); } catch (e) { } };
const toast = msg => { try { if (TG && TG.showAlert && TG.initData) TG.showAlert(msg); else alert(msg); } catch (e) { alert(msg); } };
const toMin = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const byTime = (a, b) => (a.from || '99') < (b.from || '99') ? -1 : 1;

// =====================================================================
//  ЗБЕРІГАННЯ
// =====================================================================
function cGet(keys) { return new Promise(res => TG.CloudStorage.getItems(keys, (err, v) => res(err ? {} : (v || {})))); }
function cSet(k, v) { return new Promise(res => TG.CloudStorage.setItem(k, v, err => res(!err))); }
function cKeys() { return new Promise(res => TG.CloudStorage.getKeys((err, k) => res(err ? [] : (k || [])))); }
async function cloudRawGet(key) {
  const v = (await cGet([key]))[key];
  if (v && v.startsWith('#chunks:')) {
    const n = parseInt(v.slice(8), 10);
    const keys = Array.from({ length: n }, (_, i) => `${key}_c${i}`);
    const parts = await cGet(keys);
    return keys.map(k => parts[k] || '').join('');
  }
  return v || null;
}
async function cloudRawSet(key, str) {
  const LIMIT = 4000;
  if (str.length <= LIMIT) { await cSet(key, str); return; }
  const parts = [];
  for (let i = 0; i < str.length; i += LIMIT) parts.push(str.slice(i, i + LIMIT));
  for (let i = 0; i < parts.length; i++) await cSet(`${key}_c${i}`, parts[i]);
  await cSet(key, '#chunks:' + parts.length);
}
async function api(path, method = 'GET', body) {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Init-Data': TG.initData },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
  return data;
}

const Store = {
  mode: 'local', cache: {}, timers: {}, pending: {},
  async init() {
    if (USE_API) {
      try {
        let all = await api('/data');
        if (!Object.keys(all).length && USE_CLOUD) all = await migrateCloudToApi();
        this.cache = all; this.mode = 'api'; return;
      } catch (e) { console.warn('API недоступний', e); S.apiError = String(e.message || e); }
    }
    this.mode = USE_CLOUD ? 'cloud' : 'local';
  },
  async reload() {
    if (this.mode !== 'api') return;
    await this.flush();
    try { this.cache = await api('/data'); } catch (e) { console.warn(e); }
  },
  async get(key, def) {
    if (key in this.cache && this.cache[key] !== null && this.cache[key] !== undefined) return this.cache[key];
    if (key in this.cache || this.mode === 'api') { this.cache[key] = def; return def; }
    let v = def, raw = null;
    try {
      if (this.mode === 'cloud') raw = await cloudRawGet(key);
      else raw = localStorage.getItem('pl_' + key);
      if (raw) v = JSON.parse(raw);
    } catch (e) { console.warn(e); }
    this.cache[key] = v;
    return v;
  },
  set(key, v) {
    this.cache[key] = v;
    this.pending[key] = true;
    clearTimeout(this.timers[key]);
    this.timers[key] = setTimeout(() => this.write(key), 400);
  },
  async write(key) {
    if (!this.pending[key]) return;
    delete this.pending[key]; clearTimeout(this.timers[key]);
    const v = this.cache[key];
    try {
      if (this.mode === 'api') await api('/data', 'PUT', { key, value: v });
      else if (this.mode === 'cloud') await cloudRawSet(key, JSON.stringify(v));
      else localStorage.setItem('pl_' + key, JSON.stringify(v));
    } catch (e) { console.warn('Не збереглося', key, e); }
  },
  async flush() { await Promise.all(Object.keys(this.pending).map(k => this.write(k))); }
};
async function migrateCloudToApi() {
  const keys = (await cKeys()).filter(k => !/_c\d+$/.test(k));
  const items = {};
  for (const k of keys) {
    try { const raw = await cloudRawGet(k); if (raw) items[k] = JSON.parse(raw); } catch (e) { }
  }
  if (Object.keys(items).length) await api('/data', 'PUT', { items });
  return items;
}

// =====================================================================
//  СТАН
// =====================================================================
const now = new Date();
const S = {
  tab: 'calendar', y: now.getFullYear(), m: now.getMonth(),
  date: todayStr(), dayOpen: false,
  mealSub: 'menu', mealRange: 7, recipeFilter: 'all',
  newColor: '', ruleColor: COLORS[4],
  notesFolder: null,
  settings: null, goals: null, custom: null, me: null, apiError: null
};
const DEFAULT_SETTINGS = {
  stepsGoal: 8000, dayRate: 0, workDays: 0, extraIncome: 0, savePercent: 10,
  people: 1, exclude: [], kcalTarget: 2000,
  colorRules: [], stickers: 'spicy'
};
const saveSettings = () => Store.set('settings', S.settings);
const stickerMode = () => S.settings.stickers || 'spicy';
const stickerSet = () => STICKERS[stickerMode() === 'spicy' ? 'spicy' : 'normal'];

// ---------- дані ----------
async function dayTasks(ds) { const o = await Store.get('tasks_' + monthKey(ds), {}); return o[ds.slice(8)] || []; }
async function setDayTasks(ds, list) {
  const k = 'tasks_' + monthKey(ds); const o = { ...(await Store.get(k, {})) };
  if (list.length) o[ds.slice(8)] = list; else delete o[ds.slice(8)];
  Store.set(k, o);
}
async function monthMoney(ds) { return Store.get('money_' + monthKey(ds), []); }
async function getSteps(ds) { const o = await Store.get('steps_' + ds.slice(0, 4), {}); return o[ds.slice(5)] || 0; }
async function setStepsVal(ds, n) {
  const k = 'steps_' + ds.slice(0, 4); const o = { ...(await Store.get(k, {})) };
  if (n > 0) o[ds.slice(5)] = n; else delete o[ds.slice(5)];
  Store.set(k, o);
}
async function dayMeals(ds) {
  const o = await Store.get('meals_' + monthKey(ds), {});
  const d = o[ds.slice(8)] || {};
  return { b: d.b || [], l: d.l || [], d: d.d || [] };
}
async function setDayMeals(ds, day) {
  const k = 'meals_' + monthKey(ds); const o = { ...(await Store.get(k, {})) };
  if (day.b.length || day.l.length || day.d.length) o[ds.slice(8)] = day; else delete o[ds.slice(8)];
  Store.set(k, o);
}
async function getNotes() {
  return Store.get('notes', {
    folders: [{ id: 'buy', name: 'Хочу купити', emoji: '🛍' }, { id: 'mood', name: 'Мій настрій', emoji: '🌈' }, { id: 'ideas', name: 'Ідеї', emoji: '💡' }],
    items: []
  });
}

// ---------- кольори ----------
function ruleColor(title) {
  const t = String(title || '').toLowerCase();
  const r = (S.settings.colorRules || []).find(r => r.word && t.includes(r.word.toLowerCase()));
  return r ? r.color : '';
}
const taskColor = t => t.color || ruleColor(t.title);

// ---------- страви ----------
const catOf = r => r.cat || (r.meal === 'breakfast' ? 'breakfast' : 'dish');
function allRecipes() { return [...window.DEFAULT_RECIPES, ...(S.custom || [])]; }
function recipeById(id) { return allRecipes().find(r => r.id === id); }
function isExcluded(r) {
  const ex = (S.settings.exclude || []).map(x => x.toLowerCase().trim()).filter(Boolean);
  if (!ex.length) return false;
  return r.ings.some(i => { const n = i.name.toLowerCase(); return ex.some(e => n.includes(e) || e.includes(n)); });
}
const dishItem = r => (r.prep ? { id: r.id, n: r.name, p: 1 } : { id: r.id, n: r.name });
const dayKcal = d => [...d.b, ...d.l, ...d.d].reduce((s, it) => s + ((recipeById(it.id) || {}).kcal || 0), 0);

// ---------- стікери ----------
// скільки годин займає справа: за часом «з–до»; якщо часу немає — за змістом
function taskHours(t) {
  const a = toMin(t.from), b = toMin(t.to);
  if (a !== null && b !== null) { let d = b - a; if (d <= 0) d += 1440; return d / 60; }
  if (/робот|зміна|змін/i.test(t.title)) return 8;
  if (/(^|\s)пар[иаи]($|\s)|навчан|універ|лекці/i.test(t.title)) return 4;
  return a !== null ? 1 : 0.5;
}
function dayLoad(tasks) {
  const n = tasks.length;
  if (!n) return { lvl: 0, h: 0 };
  const h = tasks.reduce((s, t) => s + taskHours(t), 0);
  const lvl = (h >= 11 || n >= 10) ? 4 : (h >= 7 || n >= 7) ? 3 : (h >= 4 || n >= 4) ? 2 : 1;
  return { lvl, h };
}
function loadPhrase(tasks) {
  const { lvl, h } = dayLoad(tasks);
  const txt = stickerSet().load[lvl];
  return h >= 1 ? `${txt} · зайнято ~${Math.round(h)} год` : txt;
}
let stickerTimer = null;
function showSticker(text, big) {
  if (stickerMode() === 'off') return;
  const el = document.getElementById('sticker');
  el.innerHTML = `<div class="sticker-card ${big ? 'big' : ''}">${esc(text).replace(/\n/g, '<br>')}</div>`;
  el.classList.remove('hidden');
  el.firstChild.classList.add('pop');
  clearTimeout(stickerTimer);
  stickerTimer = setTimeout(() => el.classList.add('hidden'), big ? 3000 : 1800);
  haptic(big ? 'heavy' : 'medium');
}

// =====================================================================
//  RENDER
// =====================================================================
const TITLES = { calendar: '📅 Календар', money: '💰 Гроші', meals: '🍲 Їжа', notes: '📝 Нотатки', health: '👟 Кроки', tips: '💡 Поради', settings: '⚙️ Налаштування' };

async function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === S.tab));
  const title = (S.tab === 'calendar' && S.dayOpen) ? '🗓 ' + prettyDate(S.date) : TITLES[S.tab];
  document.getElementById('top').innerHTML = `<span>${title}</span>${S.tab !== 'settings' ? '<button class="gear" onclick="App.tab(\'settings\')">⚙️</button>' : ''}`;
  const fn = { calendar: S.dayOpen ? viewDay : viewCalendar, money: viewMoney, meals: viewMeals, notes: viewNotes, health: viewHealth, tips: viewTips, settings: viewSettings }[S.tab];
  document.getElementById('view').innerHTML = await fn();
  if (TG && TG.BackButton) {
    const back = (S.tab === 'calendar' && S.dayOpen) || S.tab === 'settings' || (S.tab === 'notes' && S.notesFolder);
    back ? TG.BackButton.show() : TG.BackButton.hide();
  }
}
function goBack() {
  if (S.tab === 'calendar' && S.dayOpen) return App.closeDay();
  if (S.tab === 'notes' && S.notesFolder) return App.openFolder(null);
  if (S.tab === 'settings') return App.tab('calendar');
}

function monthNav() {
  return `<div class="month-nav"><button onclick="App.month(-1)">‹</button><b>${MONTHS[S.m]} ${S.y}</b><button onclick="App.month(1)">›</button></div>`;
}
function cellBg(cols) {
  if (!cols.length) return '';
  if (cols.length === 1) return `background:${cols[0]}55;box-shadow:inset 0 0 0 2px ${cols[0]}`;
  const step = 100 / cols.length;
  return 'background:linear-gradient(to bottom,' + cols.map((c, i) => `${c}55 ${i * step}%,${c}55 ${(i + 1) * step}%`).join(',') + ')';
}
function colorPicker(sel, action) {
  return `<div class="colors">${['', ...COLORS].map(c => `<button class="cpick ${sel === c ? 'sel' : ''}" data-c="${c}" style="background:${c || 'var(--bg2)'}" onclick="App.${action}('${c}')">${c ? '' : '∅'}</button>`).join('')}</div>`;
}

// ---------- КАЛЕНДАР ----------
async function viewCalendar() {
  const { y, m } = S;
  const mk = `${y}_${pad(m + 1)}`;
  const tasks = await Store.get('tasks_' + mk, {});
  const mon = await Store.get('money_' + mk, []);
  const meals = await Store.get('meals_' + mk, {});
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const dim = new Date(y, m + 1, 0).getDate();
  const t = todayStr();

  let cells = WD.map(w => `<div class="wd">${w}</div>`).join('');
  for (let i = 0; i < offset; i++) cells += '<div class="cell empty"></div>';
  let totalTasks = 0, doneTasks = 0;
  for (let d = 1; d <= dim; d++) {
    const ds = `${y}-${pad(m + 1)}-${pad(d)}`;
    const list = (tasks[pad(d)] || []).slice().sort(byTime);
    const done = list.filter(x => x.done).length;
    totalTasks += list.length; doneTasks += done;
    const dm = mon.filter(x => x.d === pad(d));
    const md = meals[pad(d)];
    const hasMeal = md && ((md.b || []).length || (md.l || []).length || (md.d || []).length);
    const wd = new Date(y, m, d).getDay();
    const cols = [...new Set(list.map(taskColor).filter(Boolean))];
    cells += `<button class="cell ${ds === t ? 'today' : ''} ${wd === 0 || wd === 6 ? 'weekend' : ''}" style="${cellBg(cols)}" onclick="App.openDay('${ds}')">
      <span class="dn">${d}</span>
      ${list.length ? `<span class="badge ${done === list.length ? 'done' : ''}">${done}/${list.length}</span>` : ''}
      <span class="dots">${dm.some(x => x.type === 'in') ? '<i class="in"></i>' : ''}${dm.some(x => x.type === 'out') ? '<i class="out"></i>' : ''}${hasMeal ? '<i class="meal"></i>' : ''}</span>
    </button>`;
  }
  const inc = mon.filter(x => x.type === 'in').reduce((s, x) => s + x.amount, 0);
  const exp = mon.filter(x => x.type === 'out').reduce((s, x) => s + x.amount, 0);
  const rules = S.settings.colorRules || [];

  return `<div class="card">${monthNav()}<div class="grid">${cells}</div>
    <div class="legend"><span><i style="background:var(--accent)"></i>справи</span><span><i style="background:var(--green)"></i>дохід</span><span><i style="background:var(--red)"></i>витрата</span><span><i style="background:var(--orange)"></i>меню</span>
    ${rules.map(r => `<span><i style="background:${r.color}"></i>${esc(r.word)}</span>`).join('')}</div>
  </div>
  <div class="card"><h3>Підсумок місяця</h3>
    <div class="stats">
      <div class="stat"><b>${doneTasks}/${totalTasks}</b><span>справ виконано</span></div>
      <div class="stat"><b class="green">${money(inc)}</b><span>зароблено</span></div>
      <div class="stat"><b class="red">${money(exp)}</b><span>витрачено</span></div>
    </div>
  </div>
  <button class="btn full" onclick="App.openDay('${t}')">Відкрити сьогодні</button>`;
}

// ---------- ДЕНЬ ----------
async function viewDay() {
  const ds = S.date;
  const tasks = (await dayTasks(ds)).slice().sort(byTime);
  const mon = (await monthMoney(ds)).filter(x => x.d === ds.slice(8));
  const steps = await getSteps(ds);
  const meals = await dayMeals(ds);

  const taskHtml = tasks.length ? tasks.map(x => `
    <div class="item ${x.done ? 'done' : ''}">
      <input type="checkbox" ${x.done ? 'checked' : ''} onchange="App.toggleTask('${x.id}')">
      <button class="cdot" title="Змінити колір" style="background:${taskColor(x) || 'var(--bg2)'}" onclick="App.cycleColor('${x.id}')"></button>
      <span class="time">${x.from ? esc(x.from) + (x.to ? '–' + esc(x.to) : '') : 'без часу'}</span>
      <span class="grow title">${esc(x.title)}</span>
      <button class="icon-btn" onclick="App.delTask('${x.id}')">🗑</button>
    </div>`).join('') : '<p class="muted small">Справ поки немає</p>';

  const moneyHtml = mon.length ? mon.map(x => `
    <div class="item"><span class="grow">${esc(x.cat)}${x.note ? ` <span class="muted small">· ${esc(x.note)}</span>` : ''}</span>
    <b class="${x.type === 'in' ? 'green' : 'red'}">${x.type === 'in' ? '+' : '−'}${money(x.amount)}</b>
    <button class="icon-btn" onclick="App.delMoney('${ds}','${x.id}')">🗑</button></div>`).join('') : '<p class="muted small">Записів немає</p>';

  return `
  <div class="between" style="margin-bottom:10px">
    <button class="btn light2" onclick="App.shiftDay(-1)">‹ ${shortDate(addDays(ds, -1))}</button>
    <button class="btn light2" onclick="App.closeDay()">Місяць</button>
    <button class="btn light2" onclick="App.shiftDay(1)">${shortDate(addDays(ds, 1))} ›</button>
  </div>
  ${stickerMode() !== 'off' ? `<div class="banner">${esc(loadPhrase(tasks))}</div>` : ''}
  <div class="card"><h3>Графік дня</h3>${taskHtml}
    <label>Нова справа</label>
    <div class="row"><input type="time" id="t-from"><input type="time" id="t-to"></div>
    <div class="row" style="margin-top:6px"><input id="t-title" placeholder="Що треба зробити?" oninput="App.titleHint()"></div>
    <label>Колір у календарі <span id="t-hint" class="muted"></span></label>${colorPicker(S.newColor, 'pickColor')}
    <button class="btn full" onclick="App.addTask()">+ Додати справу</button>
    <p class="small muted" style="margin:8px 0 0">Справи з однаковою назвою отримують той самий колір автоматично. <a href="#" onclick="App.tab('settings');return false">Постійні кольори</a></p>
  </div>
  <div class="card"><div class="between"><h3>Меню</h3><span class="tag">${dayKcal(meals)} ккал / ос.</span></div>${mealEditor(ds, meals)}</div>
  <div class="card"><h3>Гроші за день</h3>${moneyHtml}${moneyForm('d', false)}</div>
  <div class="card"><h3>Кроки</h3>
    <div class="row"><input type="number" id="d-steps" inputmode="numeric" value="${steps || ''}" placeholder="Кількість кроків"><button class="btn auto" onclick="App.saveSteps('${ds}','d-steps')">Зберегти</button></div>
    ${steps ? `<div class="bar ${steps >= S.settings.stepsGoal ? 'green' : ''}"><div style="width:${Math.min(100, steps / S.settings.stepsGoal * 100)}%"></div></div><p class="muted small">${steps} з ${S.settings.stepsGoal}</p>` : ''}
  </div>`;
}

function dishSelect(ds, slot) {
  const groups = Object.entries(CATS).map(([c, label]) => {
    const list = allRecipes().filter(r => catOf(r) === c);
    if (!list.length) return '';
    return `<optgroup label="${label}">${list.map(r => `<option value="${esc(r.id)}">${isExcluded(r) ? '⚠ ' : ''}${esc(r.name)}</option>`).join('')}</optgroup>`;
  }).join('');
  return `<select class="dish-select" onchange="App.addDish('${ds}','${slot}',this.value)"><option value="">+ страва</option>${groups}</select>`;
}
function mealEditor(ds, day) {
  return SLOTS.map(([slot, label]) => `
    <div class="meal-slot"><span class="lbl">${label}</span>
      <div class="chips">${day[slot].map((it, i) => `<span class="chip">${it.p ? '🧊' : ''}<a href="#" onclick="App.recipe('${jsq(it.id)}');return false">${esc(it.n)}</a><button onclick="App.delDish('${ds}','${slot}',${i})">×</button></span>`).join('')}
      ${dishSelect(ds, slot)}</div>
    </div>`).join('');
}

function moneyForm(p, withDate) {
  return `
    <label>Новий запис</label>
    <div class="row">
      <select id="${p}-type" onchange="App.updCats('${p}')"><option value="out">Витрата</option><option value="in">Дохід</option></select>
      <input type="number" inputmode="decimal" id="${p}-amount" placeholder="Сума, ₴">
    </div>
    <div class="row" style="margin-top:6px">
      <select id="${p}-cat">${EXP_CATS.map(c => `<option>${c}</option>`).join('')}</select>
      ${withDate ? `<input type="date" id="${p}-date" value="${defaultDateInMonth()}">` : ''}
    </div>
    <div class="row" style="margin-top:6px"><input id="${p}-note" placeholder="Коментар (необовʼязково)"></div>
    <button class="btn full" onclick="App.addMoney('${p}')">+ Додати запис</button>`;
}
function defaultDateInMonth() {
  const t = todayStr();
  return (t.slice(0, 7) === `${S.y}-${pad(S.m + 1)}`) ? t : `${S.y}-${pad(S.m + 1)}-01`;
}

// ---------- ГРОШІ ----------
async function viewMoney() {
  const mk = `${S.y}_${pad(S.m + 1)}`;
  const list = (await Store.get('money_' + mk, [])).slice().sort((a, b) => b.d.localeCompare(a.d));
  const inc = list.filter(x => x.type === 'in').reduce((s, x) => s + x.amount, 0);
  const exp = list.filter(x => x.type === 'out').reduce((s, x) => s + x.amount, 0);
  const byCat = {};
  list.filter(x => x.type === 'out').forEach(x => byCat[x.cat] = (byCat[x.cat] || 0) + x.amount);
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const catHtml = cats.length ? cats.map(([c, v]) => `
    <div style="margin-bottom:8px"><div class="between small"><span>${esc(c)}</span><span>${money(v)} · ${Math.round(v / exp * 100)}%</span></div>
    <div class="bar red"><div style="width:${v / cats[0][1] * 100}%"></div></div></div>`).join('') : '<p class="muted small">Витрат цього місяця ще немає</p>';
  const listHtml = list.length ? list.map(x => `
    <div class="item"><span class="time">${x.d}.${pad(S.m + 1)}</span>
    <span class="grow">${esc(x.cat)}${x.note ? ` <span class="muted small">· ${esc(x.note)}</span>` : ''}</span>
    <b class="${x.type === 'in' ? 'green' : 'red'}">${x.type === 'in' ? '+' : '−'}${money(x.amount)}</b>
    <button class="icon-btn" onclick="App.delMoney('${S.y}-${pad(S.m + 1)}-${x.d}','${x.id}')">🗑</button></div>`).join('') : '<p class="muted small">Записів немає</p>';
  const st = S.settings;
  const forecast = st.dayRate * st.workDays + st.extraIncome;
  const toSave = forecast * st.savePercent / 100;
  const factSave = inc * st.savePercent / 100;
  const goalsHtml = S.goals.length ? S.goals.map(g => goalCard(g, toSave || factSave)).join('') : '<p class="muted small">Цілей поки немає. Додай, на що хочеш відкласти.</p>';
  return `
  <div class="card">${monthNav()}
    <div class="stats">
      <div class="stat"><b class="green">${money(inc)}</b><span>дохід</span></div>
      <div class="stat"><b class="red">${money(exp)}</b><span>витрати</span></div>
      <div class="stat"><b class="${inc - exp >= 0 ? 'green' : 'red'}">${money(inc - exp)}</b><span>баланс</span></div>
    </div>
  </div>
  <div class="card"><h3>Додати дохід / витрату</h3>${moneyForm('m', true)}</div>
  <div class="card"><h3>Куди йдуть гроші</h3>${catHtml}</div>
  <div class="card"><h3>Скільки зароблю і скільки відкласти</h3>
    <div class="row">
      <div><label>Оплата за день / зміну, ₴</label><input type="number" inputmode="decimal" id="s-rate" value="${st.dayRate || ''}" oninput="App.calc()"></div>
      <div><label>Робочих днів у місяці</label><input type="number" inputmode="numeric" id="s-days" value="${st.workDays || ''}" oninput="App.calc()"></div>
    </div>
    <div class="row">
      <div><label>Інші доходи, ₴</label><input type="number" inputmode="decimal" id="s-extra" value="${st.extraIncome || ''}" oninput="App.calc()"></div>
      <div><label>Відкладати, %</label><input type="number" inputmode="numeric" id="s-pct" value="${st.savePercent}" oninput="App.calc()"></div>
    </div>
    <button class="btn light full" onclick="App.countWorkDays()">Порахувати робочі дні з календаря</button>
    <div id="calc-out" style="margin-top:10px">${calcOut(forecast, toSave, factSave, inc)}</div>
  </div>
  <div class="card"><h3>Цілі — на що відкладаю</h3>${goalsHtml}
    <label>Нова ціль</label>
    <input id="g-name" placeholder="На що відкладаю (напр. відпустка, ноутбук)">
    <div class="row">
      <div><label>Скільки треба, ₴</label><input type="number" inputmode="decimal" id="g-target" placeholder="20000"></div>
      <div><label>Зібрати до дати (необовʼязково)</label><input type="date" id="g-deadline"></div>
    </div>
    <button class="btn full" onclick="App.addGoal()">+ Додати ціль</button>
  </div>
  ${await debtsCard()}
  <div class="card"><h3>Усі записи за ${MONTHS[S.m].toLowerCase()}</h3>${listHtml}</div>`;
}
async function debtsCard() {
  const debts = await Store.get('debts', []);
  const open = debts.filter(d => d.paid < d.amount);
  const closed = debts.filter(d => d.paid >= d.amount);
  const iOwe = open.filter(d => d.dir === 'owe').reduce((s, d) => s + d.amount - d.paid, 0);
  const owedMe = open.filter(d => d.dir === 'lent').reduce((s, d) => s + d.amount - d.paid, 0);
  const t = todayStr();
  const row = d => {
    const left = d.amount - d.paid;
    const pct = Math.min(100, d.paid / d.amount * 100);
    let due = '';
    if (d.due && left > 0) {
      const n = diffDays(t, d.due);
      due = n < 0 ? `<span class="tag warn">прострочено на ${-n} дн.</span>` : n === 0 ? '<span class="tag warn">сьогодні!</span>' : `<span class="tag ${n <= 3 ? 'warn' : ''}">до ${shortDate(d.due)}</span>`;
    }
    return `<div style="margin-bottom:14px">
      <div class="between"><b>${d.dir === 'owe' ? '🔴 Я винна' : '🟢 Мені винні'}: ${esc(d.who)}</b><button class="icon-btn" onclick="App.delDebt('${d.id}')">🗑</button></div>
      <div class="between small"><span>${left > 0 ? `лишилось ${money(left)} з ${money(d.amount)}` : `✅ повернуто ${money(d.amount)}`}</span>${due}</div>
      ${d.note ? `<p class="small muted" style="margin:4px 0">${esc(d.note)}</p>` : ''}
      <div class="bar ${d.dir === 'owe' ? 'red' : 'green'}"><div style="width:${pct}%"></div></div>
      ${left > 0 ? `<div class="row" style="margin-top:8px"><input type="number" inputmode="decimal" id="dp-${d.id}" placeholder="Сума, ₴"><button class="btn auto" onclick="App.debtPay('${d.id}')">${d.dir === 'owe' ? 'Я віддала' : 'Мені віддали'}</button></div>` : ''}
    </div>`;
  };
  return `<div class="card"><h3>💸 Борги</h3>
    <div class="stats" style="grid-template-columns:1fr 1fr">
      <div class="stat"><b class="red">${money(iOwe)}</b><span>я винна</span></div>
      <div class="stat"><b class="green">${money(owedMe)}</b><span>мені винні</span></div>
    </div>
    <div style="margin-top:12px">${open.length ? open.sort((a, b) => (a.due || '9') < (b.due || '9') ? -1 : 1).map(row).join('') : '<p class="muted small">Боргів немає 🎉</p>'}</div>
    <label>Новий борг</label>
    <div class="row"><select id="db-dir"><option value="owe">Я винна</option><option value="lent">Мені винні</option></select><input id="db-who" placeholder="Кому / хто"></div>
    <div class="row">
      <div><label>Сума, ₴</label><input type="number" inputmode="decimal" id="db-amount" placeholder="1000"></div>
      <div><label>Повернути до (необовʼязково)</label><input type="date" id="db-due"></div>
    </div>
    <input id="db-note" style="margin-top:6px" placeholder="Коментар (за що, як віддавати…)">
    <button class="btn full" onclick="App.addDebt()">+ Додати борг</button>
    ${closed.length ? `<details style="margin-top:12px"><summary class="small muted">Закриті борги (${closed.length})</summary>${closed.map(row).join('')}</details>` : ''}
  </div>`;
}
function calcOut(forecast, toSave, factSave, inc) {
  return `<div class="stats">
      <div class="stat"><b>${money(forecast)}</b><span>прогноз доходу</span></div>
      <div class="stat"><b class="green">${money(toSave)}</b><span>відкласти за місяць</span></div>
      <div class="stat"><b>${money(toSave / 4.33)}</b><span>на тиждень</span></div>
    </div>
    ${inc ? `<p class="small muted">За фактичним доходом цього місяця (${money(inc)}) відкласти треба ${money(factSave)}.</p>` : ''}`;
}
function goalCard(g, monthlySave) {
  const left = Math.max(0, g.target - g.saved);
  const pct = g.target ? Math.min(100, g.saved / g.target * 100) : 0;
  let hint;
  if (left === 0) hint = '🎉 Ціль досягнута!';
  else if (g.deadline) {
    const days = diffDays(todayStr(), g.deadline);
    hint = days <= 0 ? `Термін минув, лишилось зібрати ${money(left)}`
      : `До ${shortDate(g.deadline)}: ${money(left / Math.max(days / 30.44, 1 / 30.44))} на місяць · ${money(left / Math.max(days / 7, 1))} на тиждень · ${money(left / days)} на день`;
  } else if (monthlySave > 0) hint = `Якщо відкладати ${money(monthlySave)}/міс — збереш приблизно за ${Math.ceil(left / monthlySave)} міс.`;
  else hint = 'Додай дату або заповни калькулятор вище, щоб побачити, скільки відкладати.';
  return `<div style="margin-bottom:14px">
    <div class="between"><b>${esc(g.name)}</b><button class="icon-btn" onclick="App.delGoal('${g.id}')">🗑</button></div>
    <div class="between small"><span>${money(g.saved)} з ${money(g.target)}</span><span>${Math.round(pct)}%</span></div>
    <div class="bar green"><div style="width:${pct}%"></div></div>
    <p class="small muted" style="margin:6px 0">${hint}</p>
    <div class="row"><input type="number" inputmode="decimal" id="g-add-${g.id}" placeholder="Сума, ₴"><button class="btn auto" onclick="App.goalAdd('${g.id}')">Відкласти</button></div>
  </div>`;
}

// ---------- ЇЖА ----------
async function viewMeals() {
  const subs = { menu: 'Меню', shop: 'Покупки', prep: 'Заготовки', recipes: 'Страви', settings: 'Налаштування' };
  const nav = `<div class="subtabs">${Object.entries(subs).map(([k, v]) => `<button class="${S.mealSub === k ? 'active' : ''}" onclick="App.mealSub('${k}')">${v}</button>`).join('')}</div>`;
  const range = ['menu', 'shop', 'prep'].includes(S.mealSub)
    ? `<div class="subtabs">${[[7, 'Тиждень'], [14, '2 тижні'], [30, 'Місяць']].map(([n, l]) => `<button class="${S.mealRange === n ? 'active' : ''}" onclick="App.mealRange(${n})">${l}</button>`).join('')}</div>` : '';
  const body = await ({ menu: mealsMenu, shop: mealsShop, prep: mealsPrep, recipes: mealsRecipes, settings: mealsSettings }[S.mealSub])();
  return nav + range + body;
}
async function rangeDays() {
  const t = todayStr(); const out = [];
  for (let i = 0; i < S.mealRange; i++) { const ds = addDays(t, i); out.push({ ds, day: await dayMeals(ds) }); }
  return out;
}
function mealsSettings() {
  const st = S.settings;
  return `<div class="card"><h3>Для кого готуємо</h3>
    <label>Кількість людей у сімʼї</label>
    <input type="number" inputmode="numeric" id="ms-people" min="1" value="${st.people}">
    <label>Продукти, які не їсте (через кому)</label>
    <textarea id="ms-exclude" placeholder="напр. риба, гриби, свинина">${esc(st.exclude.join(', '))}</textarea>
    <label>Орієнтир калорій на людину в день</label>
    <input type="number" inputmode="numeric" id="ms-kcal" value="${st.kcalTarget || ''}" placeholder="напр. 2000">
    <p class="small muted">Калорійність страв приблизна.</p>
    <button class="btn full" onclick="App.saveMealSettings()">Зберегти</button>
  </div>`;
}
async function mealsMenu() {
  const days = await rangeDays();
  const target = S.settings.kcalTarget;
  const list = days.map(({ ds, day }) => {
    const k = dayKcal(day);
    const kc = target ? `<span class="tag ${k > target * 1.1 ? 'warn' : ''}">${k} / ${target} ккал</span>` : `<span class="tag">${k} ккал</span>`;
    return `<div class="meal-day"><div class="between"><b>${prettyDate(ds)}</b>${kc}</div>${mealEditor(ds, day)}</div>`;
  }).join('');
  return `<div class="card"><h3>Скласти меню</h3>
    <p class="small muted">Людей: <b>${S.settings.people}</b> · Не їсте: ${S.settings.exclude.length ? esc(S.settings.exclude.join(', ')) : 'нічого'} · <a href="#" onclick="App.mealSub('settings');return false">змінити</a></p>
    <p class="small muted">Страви можна вибирати самій у кожному дні (суп + гарнір + мʼясо) або заповнити порожні автоматично.</p>
    <div class="row"><button class="btn" onclick="App.autoFill()">✨ Заповнити порожні</button><button class="btn light" onclick="App.clearMeals()">🗑 Очистити</button></div>
  </div>
  <div class="card"><p class="small muted" style="margin-top:0">Калорії — на 1 людину. 🧊 — можна заготовити заздалегідь.</p>${list}</div>`;
}
function aggregate(days) {
  const people = S.settings.people || 1;
  const agg = {};
  days.forEach(({ day }) => [...day.b, ...day.l, ...day.d].forEach(it => {
    const r = recipeById(it.id); if (!r) return;
    r.ings.forEach(i => {
      const k = i.name.toLowerCase() + '|' + i.unit;
      if (!agg[k]) agg[k] = { name: i.name, unit: i.unit, qty: 0 };
      agg[k].qty += i.qty * people;
    });
  }));
  return Object.entries(agg).sort((a, b) => a[1].name.localeCompare(b[1].name, 'uk'));
}
function fmtQty(q, unit) {
  if (unit === 'шт') return Math.ceil(q) + ' шт';
  if ((unit === 'г' || unit === 'мл') && q >= 1000) return (Math.round(q / 100) / 10) + (unit === 'г' ? ' кг' : ' л');
  return Math.round(q) + ' ' + unit;
}
async function mealsShop() {
  const days = await rangeDays();
  const items = aggregate(days);
  if (!items.length) return '<div class="card"><p class="muted">На цей період меню ще не складене. Перейди в «Меню».</p></div>';
  const bought = await Store.get('shop_bought', {});
  const list = items.map(([k, it]) => `<div class="item ${bought[k] ? 'done' : ''}"><input type="checkbox" ${bought[k] ? 'checked' : ''} onchange="App.toggleBought('${jsq(k)}')"><span class="grow title">${esc(it.name)}</span><b>${fmtQty(it.qty, it.unit)}</b></div>`).join('');
  return `<div class="card"><div class="between"><h3>Що купити</h3><button class="btn light" onclick="App.copyShop()">Копіювати</button></div>
    <p class="small muted">На ${S.settings.people} ос., ${shortDate(days[0].ds)}–${shortDate(days[days.length - 1].ds)}. Сіль і спеції не враховано.</p>
    ${list}<button class="btn light full" onclick="App.clearBought()">Зняти всі позначки</button></div>`;
}
async function mealsPrep() {
  const days = await rangeDays();
  const people = S.settings.people || 1;
  const count = {};
  days.forEach(({ day }) => [...day.b, ...day.l, ...day.d].forEach(it => { count[it.id] = (count[it.id] || 0) + 1; }));
  const prepList = Object.entries(count).map(([id, n]) => ({ r: recipeById(id), n })).filter(x => x.r && x.r.prep);
  if (!prepList.length) return '<div class="card"><p class="muted">У меню на цей період немає страв, які можна заготовити. Шукай позначку 🧊: сирники, вареники, котлети, голубці, бульйон…</p></div>';
  const blocks = prepList.map(({ r, n }) => {
    const portions = n * people;
    return `<div class="card"><div class="between"><h3>${esc(r.name)}</h3><span class="tag">${portions} порц.</span></div>
      <p class="small muted">У меню ${n} раз(и) × ${people} ос.</p>
      <p class="small">${r.ings.map(i => `${esc(i.name)} — ${fmtQty(i.qty * portions, i.unit)}`).join('<br>')}</p>
      <div class="tip">🧊 ${esc(r.prep)}</div></div>`;
  }).join('');
  return `<div class="card"><h3>День заготовок</h3>
    <div class="tip">Вибери один вихідний. Спочатку постав варитися те, що довго готується (бульйон, рис, картопля), а поки вариться, ліпи й формуй. Заморожуй порціями й підписуй дату. Заготовки краще зʼїсти протягом 1–2 місяців.</div>
  </div>` + blocks;
}
function mealsRecipes() {
  const f = S.recipeFilter;
  const list = allRecipes().filter(r => f === 'all' || catOf(r) === f);
  const filt = `<div class="subtabs">${[['all', 'Усі'], ...Object.entries(CATS)].map(([k, v]) => `<button class="${f === k ? 'active' : ''}" onclick="App.recipeFilter('${k}')">${v}</button>`).join('')}</div>`;
  const items = list.map(r => `<div class="item"><span class="grow"><a href="#" onclick="App.recipe('${jsq(r.id)}');return false" style="color:var(--link);text-decoration:none">${esc(r.name)}</a><br>
    <span class="tag">${CATS[catOf(r)]}</span><span class="tag">${r.kcal} ккал</span>${r.prep ? '<span class="tag">🧊 заготовка</span>' : ''}${isExcluded(r) ? '<span class="tag warn">виключено</span>' : ''}${r.custom ? '<span class="tag">моя</span>' : ''}</span>
    ${r.custom ? `<button class="icon-btn" onclick="App.delRecipe('${jsq(r.id)}')">🗑</button>` : ''}</div>`).join('');
  return filt + `<div class="card"><h3>Страви (${list.length})</h3>${items}</div>
  <div class="card"><h3>Додати свою страву</h3>
    <label>Назва</label><input id="r-name">
    <div class="row">
      <div><label>Категорія</label><select id="r-cat">${Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div><label>Ккал на порцію</label><input type="number" inputmode="numeric" id="r-kcal"></div>
    </div>
    <label>Інгредієнти на 1 порцію: кожен з нового рядка, «назва; кількість; одиниця»</label>
    <textarea id="r-ings" placeholder="Картопля; 150; г&#10;Яйця; 1; шт&#10;Молоко; 100; мл"></textarea>
    <label>Як готувати (кожен крок з нового рядка)</label>
    <textarea id="r-steps"></textarea>
    <label>Як заготовити наперед (необовʼязково)</label>
    <textarea id="r-prep" placeholder="Напр.: заморозити на дошці, потім скласти в пакет"></textarea>
    <button class="btn full" onclick="App.addRecipe()">Зберегти страву</button>
  </div>`;
}

// ---------- НОТАТКИ ----------
const MOODS = ['😄', '🙂', '😐', '😔', '😢', '😡', '😴', '🥰'];
async function viewNotes() {
  const n = await getNotes();
  if (!S.notesFolder) {
    const folders = n.folders.map(f => {
      const cnt = n.items.filter(i => i.folder === f.id).length;
      return `<button class="folder" onclick="App.openFolder('${f.id}')"><span class="femoji">${esc(f.emoji || '📁')}</span><b>${esc(f.name)}</b><span class="muted small">${cnt} запис.</span></button>`;
    }).join('');
    return `<div class="folders">${folders}</div>
    <div class="card"><h3>Нова папка</h3>
      <div class="row"><input id="f-emoji" class="auto" style="width:60px" maxlength="4" placeholder="📁"><input id="f-name" placeholder="Назва папки"></div>
      <button class="btn full" onclick="App.addFolder()">+ Створити папку</button>
    </div>`;
  }
  const f = n.folders.find(x => x.id === S.notesFolder);
  if (!f) { S.notesFolder = null; return viewNotes(); }
  const items = n.items.filter(i => i.folder === f.id).sort((a, b) => b.ts - a.ts);
  const list = items.length ? items.map(i => `
    <div class="item note ${i.done ? 'done' : ''}">
      <input type="checkbox" ${i.done ? 'checked' : ''} onchange="App.toggleNote('${i.id}')">
      <span class="grow title" onclick="App.editNote('${i.id}')">${esc(i.text).replace(/\n/g, '<br>')}<br><span class="muted small">${new Date(i.ts).toLocaleString('uk-UA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></span>
      <button class="icon-btn" onclick="App.delNote('${i.id}')">🗑</button>
    </div>`).join('') : '<p class="muted small">Тут поки порожньо</p>';
  return `<div class="between" style="margin-bottom:10px"><button class="btn light2" onclick="App.openFolder(null)">‹ Усі папки</button><button class="icon-btn" onclick="App.delFolder('${f.id}')">🗑 папку</button></div>
  <div class="card"><h3>${esc(f.emoji || '📁')} ${esc(f.name)}</h3>
    ${f.id === 'mood' ? `<div class="moods">${MOODS.map(m => `<button onclick="App.moodPick('${m}')">${m}</button>`).join('')}</div>` : ''}
    <textarea id="n-text" placeholder="${f.id === 'buy' ? 'Що хочу купити…' : f.id === 'mood' ? 'Як я сьогодні…' : 'Запиши щось…'}"></textarea>
    <button class="btn full" onclick="App.addNote()">+ Додати</button>
  </div>
  <div class="card">${list}</div>`;
}

// ---------- КРОКИ ----------
async function viewHealth() {
  const t = todayStr(); const goal = S.settings.stepsGoal;
  const days = [];
  for (let i = 6; i >= 0; i--) { const ds = addDays(t, -i); days.push({ ds, n: await getSteps(ds) }); }
  const today = days[6].n;
  const max = Math.max(goal, ...days.map(d => d.n));
  const avg = Math.round(days.reduce((s, d) => s + d.n, 0) / 7);
  const chart = days.map(d => `<div class="col"><div class="${d.n >= goal ? 'ok' : ''}" style="height:${d.n / max * 100}%"></div><span>${WD[(parseYmd(d.ds).getDay() + 6) % 7]}</span></div>`).join('');
  return `
  <div class="card"><h3>Сьогодні</h3>
    <div class="row"><input type="number" inputmode="numeric" id="h-steps" value="${today || ''}" placeholder="Кроки за сьогодні"><button class="btn auto" onclick="App.saveSteps('${t}','h-steps')">Зберегти</button></div>
    <div class="bar ${today >= goal ? 'green' : ''}" style="margin-top:10px"><div style="width:${Math.min(100, today / goal * 100)}%"></div></div>
    <div class="stats" style="margin-top:10px">
      <div class="stat"><b>${today}</b><span>з ${goal} кроків</span></div>
      <div class="stat"><b>${(today * 0.75 / 1000).toFixed(1)} км</b><span>приблизно</span></div>
      <div class="stat"><b>${Math.round(today * 0.04)}</b><span>ккал (≈)</span></div>
    </div>
  </div>
  <div class="card"><h3>Останні 7 днів</h3><div class="chart">${chart}</div>
    <p class="small muted">У середньому ${avg} кроків на день. Днів з виконаною ціллю: ${days.filter(d => d.n >= goal).length} з 7.</p></div>
  <div class="card"><h3>Ціль</h3>
    <div class="row"><input type="number" inputmode="numeric" id="h-goal" value="${goal}"><button class="btn auto" onclick="App.saveStepsGoal()">Зберегти</button></div>
    <p class="small muted">Telegram не дає доступу до «Здоровʼя» / Google Fit, тож кроки вводяться вручну.</p>
  </div>`;
}

// ---------- ПОРАДИ ----------
const STATIC_TIPS = [
  'Плануй завтрашній день увечері: 5 хвилин ввечері економлять пів години зранку.',
  'Починай день з найважчої справи, поки є сили, а дрібниці лиши на потім.',
  'Схожі справи збирай в один блок: усі дзвінки підряд, усі покупки за один виїзд.',
  'Справу, яка займає менше 2 хвилин, роби одразу, не записуй.',
  'Між справами залишай 10–15 хвилин запасу: дорога і затримки трапляються завжди.',
  'Працюй блоками по 25–50 хвилин з короткою перервою (техніка «помідора»).',
  'Виділи один день заготовок їжі на тиждень або місяць: щодня звільнятиметься година.',
  'Раз на тиждень переглядай витрати: так легше помітити, де гроші «тікають».',
  'Відкладай одразу, щойно прийшли гроші, а не з того, що лишилося наприкінці місяця.'
];
async function viewTips() {
  const t = todayStr(), y = addDays(t, -1);
  const tips = [];
  const today = await dayTasks(t);
  const undone = (await dayTasks(y)).filter(x => !x.done);
  if (undone.length) tips.push({ c: 'warn', h: `Учора лишилося невиконаних справ: ${undone.length}. <button class="btn light" style="margin-top:6px" onclick="App.moveUndone('${y}','${t}')">Перенести на сьогодні</button>` });
  if (today.length > 8) tips.push({ c: 'warn', h: `Сьогодні ${today.length} справ. Це багато, спробуй перенести 2–3 некритичні на інший день.` });
  if (!today.length) tips.push({ c: '', h: 'На сьогодні справ не заплановано. Відкрий календар і склади план дня.' });
  const timed = today.filter(x => x.from).map(x => ({ ...x, a: toMin(x.from), b: toMin(x.to) ?? toMin(x.from) + 60 })).sort((p, q) => p.a - q.a);
  for (let i = 1; i < timed.length; i++) {
    if (timed[i].a < timed[i - 1].b) tips.push({ c: 'warn', h: `Справи «${esc(timed[i - 1].title)}» і «${esc(timed[i].title)}» перетинаються в часі.` });
    else if (timed[i].a - timed[i - 1].b >= 120) tips.push({ c: 'good', h: `Вільне вікно ${fromMin(timed[i - 1].b)}–${fromMin(timed[i].a)}: можна поставити відпочинок, прогулянку або справу з довгого списку.` });
  }
  const noTime = today.filter(x => !x.from).length;
  if (noTime >= 3) tips.push({ c: '', h: `${noTime} справ на сьогодні без часу. Признач їм час, так буде легше встигнути.` });
  const tm = await dayMeals(addDays(t, 1));
  const frozen = [...tm.b, ...tm.l, ...tm.d].filter(i => i.p);
  if (frozen.length) tips.push({ c: '', h: `🧊 На завтра в меню заготовки: ${frozen.map(i => esc(i.n)).join(', ')}. Якщо треба — перенеси з морозилки в холодильник.` });
  const mon = await monthMoney(t);
  const inc = mon.filter(x => x.type === 'in').reduce((s, x) => s + x.amount, 0);
  const exp = mon.filter(x => x.type === 'out').reduce((s, x) => s + x.amount, 0);
  if (exp > inc && inc > 0) tips.push({ c: 'warn', h: `Цього місяця витрати (${money(exp)}) більші за дохід (${money(inc)}).` });
  if (exp > 0) {
    const byCat = {}; mon.filter(x => x.type === 'out').forEach(x => byCat[x.cat] = (byCat[x.cat] || 0) + x.amount);
    const [topC, topV] = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    if (topV / exp > 0.4) tips.push({ c: '', h: `${Math.round(topV / exp * 100)}% витрат цього місяця йде на «${esc(topC)}». Подивись, чи можна тут зекономити.` });
  }
  (await Store.get('debts', [])).filter(d => d.due && d.paid < d.amount && diffDays(t, d.due) <= 3).forEach(d => {
    const n = diffDays(t, d.due);
    tips.push({ c: 'warn', h: `💸 ${d.dir === 'owe' ? 'Ти винна' : 'Тобі винні'} ${esc(d.who)} ${money(d.amount - d.paid)} — ${n < 0 ? 'термін минув' : n === 0 ? 'термін сьогодні' : 'до ' + shortDate(d.due)}.` });
  });
  S.goals.filter(g => g.deadline && g.saved < g.target && diffDays(t, g.deadline) > 0).forEach(g => {
    tips.push({ c: '', h: `Щоб встигнути на «${esc(g.name)}», відкладай ${money((g.target - g.saved) / Math.max(diffDays(t, g.deadline) / 7, 1))} на тиждень.` });
  });
  let stepsSum = 0, stepsDays = 0;
  for (let i = 0; i < 7; i++) { const n = await getSteps(addDays(t, -i)); if (n) { stepsSum += n; stepsDays++; } }
  if (stepsDays >= 3 && stepsSum / stepsDays < S.settings.stepsGoal * 0.6) tips.push({ c: '', h: 'Цього тижня кроків помітно менше за ціль. Спробуй пройти частину дороги пішки або погуляти 20 хвилин після вечері.' });
  const dyn = tips.length ? tips.map(x => `<div class="tip ${x.c}">${x.h}</div>`).join('') : '<div class="tip good">Усе виглядає добре, так тримати! 👍</div>';
  const shuffled = STATIC_TIPS.slice().sort(() => Math.random() - 0.5).slice(0, 4);
  return `<div class="card"><h3>Для тебе зараз</h3>${dyn}</div>
    <div class="card"><h3>Як встигати більше</h3>${shuffled.map(s => `<div class="tip">${s}</div>`).join('')}</div>`;
}

// ---------- НАЛАШТУВАННЯ ----------
async function viewSettings() {
  const st = S.settings;
  const rules = st.colorRules || [];
  const rulesHtml = rules.length ? rules.map((r, i) => `<div class="item"><span class="cdot" style="background:${r.color}"></span><span class="grow">${esc(r.word)}</span><button class="icon-btn" onclick="App.delRule(${i})">🗑</button></div>`).join('') : '<p class="muted small">Поки немає. Додай слово, напр. «робота», і всі справи з ним будуть цього кольору.</p>';
  const modes = [['spicy', '🌶 З перцем'], ['normal', '🙂 Звичайні'], ['off', '🔕 Вимкнені']];

  let server;
  if (Store.mode === 'api') {
    if (!S.me) { try { S.me = await api('/me'); } catch (e) { S.me = { error: String(e.message || e) }; } }
    const me = S.me;
    if (me.error) server = `<div class="card"><p class="red small">Сервер не відповів: ${esc(me.error)}</p></div>`;
    else {
      const shared = me.members.length > 1;
      const isOwner = String(me.space) === String(me.userId);
      server = `
      <div class="card"><h3>🔔 Нагадування від бота</h3>
        <p class="small muted">Щовечора бот напише, що в тебе заплановано на завтра: справи, меню і які заготовки дістати з морозилки.</p>
        <div class="row"><select id="rem-on"><option value="1" ${me.remindOn ? 'selected' : ''}>Увімкнено</option><option value="0" ${!me.remindOn ? 'selected' : ''}>Вимкнено</option></select>
        <select id="rem-hour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${me.remindHour === h ? 'selected' : ''}>о ${pad(h)}:00</option>`).join('')}</select></div>
        <button class="btn full" onclick="App.savePrefs()">Зберегти</button>
        <button class="btn light full" onclick="App.testReminder()">Надіслати тестове нагадування зараз</button>
      </div>
      <div class="card"><h3>👫 Спільний планер</h3>
        ${shared ? `<p class="small">Планер ведуть разом: <b>${me.members.map(m => esc(m.name || 'без імені')).join(', ')}</b></p>` : '<p class="small muted">Зараз планер бачиш тільки ти.</p>'}
        ${isOwner ? `<div class="tip small" style="line-height:1.5"><b>Як дати доступ іншій людині (напр. чоловіку):</b><br>
            1. Натисни <b>«Створити запрошення»</b> нижче.<br>
            2. Натисни <b>«Поділитися посиланням»</b> і вибери людину в Telegram (або продиктуй їй код).<br>
            3. Людина відкриває посилання — у неї відкривається цей бот — і тисне <b>Start</b>. Бот напише «💛 Готово!».<br>
            4. Людина тисне <b>«📅 Відкрити планувальник»</b> — і бачить ваш спільний планер. Ви обоє можете все змінювати.<br>
            <span class="muted">Якщо посилання не відкривається: людина сама знаходить бота, відкриває планувальник → ⚙️ → «Маєш код запрошення?» → вводить код.<br>
            Одне запрошення — для однієї людини, діє 3 дні. Для кількох людей створи кілька запрошень. Нагадування кожен налаштовує собі сам.</span></div>
          <button class="btn full" onclick="App.invite()">Створити запрошення</button><div id="invite-out"></div>
          ${shared ? `<label>Прибрати доступ</label>${me.members.filter(m => String(m.id) !== String(me.userId)).map(m => `<div class="item"><span class="grow">${esc(m.name || m.id)}</span><button class="btn light" onclick="App.kick('${m.id}')">Прибрати</button></div>`).join('')}` : ''}`
        : `<p class="small muted">Ти в спільному планері: бачиш і змінюєш те саме, що й власник. Нових людей запрошує власник планера. Твій особистий планер збережений і повернеться, якщо вийдеш.</p><button class="btn light full" onclick="App.leave()">Вийти зі спільного планера</button>`}
        <label>Маєш код запрошення?</label>
        <div class="row"><input id="join-code" placeholder="Код"><button class="btn auto" onclick="App.join()">Приєднатися</button></div>
      </div>`;
    }
  } else {
    server = `<div class="card"><h3>🔔 Нагадування і 👫 спільний планер</h3>
      <p class="small muted">${S.apiError ? `Сервер не відповідає (${esc(S.apiError)}). Зараз дані зберігаються в Telegram.` : 'Щоб бот надсилав нагадування на завтра і щоб двоє людей могли вести один планер, потрібен безкоштовний сервер Cloudflare. Як його підключити, написано в README.'}</p></div>`;
  }

  return `
  <div class="card"><h3>🎨 Постійні кольори</h3>
    <p class="small muted">Справа, в назві якої є це слово, завжди підсвічуватиметься в календарі цим кольором.</p>
    ${rulesHtml}
    <label>Нове правило</label>
    <input id="rule-word" placeholder="Напр. робота, тренування, пари">
    <div style="margin-top:8px">${colorPicker(S.ruleColor, 'pickRuleColor')}</div>
    <button class="btn full" onclick="App.addRule()">+ Додати правило</button>
  </div>
  <div class="card"><h3>🏆 Стікери</h3>
    <div class="row">${modes.map(([k, l]) => `<button class="btn ${stickerMode() === k ? '' : 'light'}" onclick="App.setStickers('${k}')">${l}</button>`).join('')}</div>
    <p class="small muted">Зʼявляються, коли виконуєш справу, і показують, наскільки завантажений день.</p>
  </div>
  ${server}
  <p class="small muted center">Дані: ${Store.mode === 'api' ? 'сервер' : Store.mode === 'cloud' ? 'хмара Telegram' : 'цей браузер'}</p>`;
}

// =====================================================================
//  ДІЇ
// =====================================================================
const App = {
  tab(t) { S.tab = t; if (t !== 'calendar') S.dayOpen = false; if (t === 'settings') S.me = null; window.scrollTo(0, 0); render(); },
  month(d) { S.m += d; if (S.m < 0) { S.m = 11; S.y--; } if (S.m > 11) { S.m = 0; S.y++; } render(); },
  openDay(ds) { S.date = ds; S.dayOpen = true; S.tab = 'calendar'; const d = parseYmd(ds); S.y = d.getFullYear(); S.m = d.getMonth(); window.scrollTo(0, 0); render(); },
  closeDay() { S.dayOpen = false; render(); },
  shiftDay(n) { App.openDay(addDays(S.date, n)); },

  // справи
  titleHint() {
    const c = ruleColor(val('t-title'));
    const el = document.getElementById('t-hint');
    if (el) el.innerHTML = c && !S.newColor ? `· буде <span class="cdot" style="display:inline-block;vertical-align:middle;background:${c}"></span> за правилом` : '';
  },
  pickColor(c) {
    S.newColor = c;
    document.querySelectorAll('.cpick').forEach(b => b.classList.toggle('sel', b.dataset.c === c));
    App.titleHint();
  },
  async addTask() {
    const title = val('t-title');
    if (!title) return toast('Напиши, що треба зробити');
    const list = await dayTasks(S.date);
    const color = S.newColor;
    // запамʼятовуємо колір для цієї назви, якщо правила ще немає
    if (color && !ruleColor(title)) { S.settings.colorRules = [...(S.settings.colorRules || []), { word: title.toLowerCase(), color }]; saveSettings(); }
    await setDayTasks(S.date, [...list, { id: uid(), from: val('t-from'), to: val('t-to'), title, done: false, color: color && ruleColor(title) !== color ? color : '' }]);
    S.newColor = ''; haptic(); render();
  },
  async toggleTask(id) {
    const list = (await dayTasks(S.date)).map(t => ({ ...t }));
    const x = list.find(t => t.id === id); if (!x) return;
    x.done = !x.done;
    await setDayTasks(S.date, list);
    if (x.done) {
      if (list.every(t => t.done) && list.length > 1) showSticker(stickerSet().all, true);
      else showSticker(pick(stickerSet().done));
    } else haptic();
    render();
  },
  async cycleColor(id) {
    const list = (await dayTasks(S.date)).map(t => ({ ...t }));
    const x = list.find(t => t.id === id); if (!x) return;
    const opts = ['', ...COLORS];
    x.color = opts[(opts.indexOf(x.color || '') + 1) % opts.length];
    await setDayTasks(S.date, list); haptic(); render();
  },
  async delTask(id) { await setDayTasks(S.date, (await dayTasks(S.date)).filter(t => t.id !== id)); render(); },
  async moveUndone(from, to) {
    const src = await dayTasks(from);
    const undone = src.filter(x => !x.done);
    await setDayTasks(from, src.filter(x => x.done));
    await setDayTasks(to, [...(await dayTasks(to)), ...undone.map(x => ({ ...x, id: uid() }))]);
    haptic(); render();
  },

  // правила кольорів і стікери
  pickRuleColor(c) { S.ruleColor = c || COLORS[4]; document.querySelectorAll('.cpick').forEach(b => b.classList.toggle('sel', b.dataset.c === S.ruleColor)); },
  addRule() {
    const word = val('rule-word').toLowerCase();
    if (!word) return toast('Напиши слово, напр. «робота»');
    const rules = (S.settings.colorRules || []).filter(r => r.word !== word);
    S.settings.colorRules = [{ word, color: S.ruleColor }, ...rules];
    saveSettings(); haptic(); render();
  },
  delRule(i) { S.settings.colorRules = (S.settings.colorRules || []).filter((_, j) => j !== i); saveSettings(); render(); },
  setStickers(k) { S.settings.stickers = k; saveSettings(); render(); if (k !== 'off') showSticker(pick(stickerSet().done)); },

  // гроші
  updCats(p) { document.getElementById(p + '-cat').innerHTML = (val(p + '-type') === 'in' ? INC_CATS : EXP_CATS).map(c => `<option>${c}</option>`).join(''); },
  async addMoney(p) {
    const amount = num(val(p + '-amount'));
    if (amount <= 0) return toast('Вкажи суму');
    const ds = p === 'd' ? S.date : (val(p + '-date') || defaultDateInMonth());
    const k = 'money_' + monthKey(ds);
    Store.set(k, [...(await Store.get(k, [])), { id: uid(), d: ds.slice(8), type: val(p + '-type'), amount, cat: val(p + '-cat'), note: val(p + '-note') }]);
    haptic(); render();
  },
  async delMoney(ds, id) { const k = 'money_' + monthKey(ds); Store.set(k, (await Store.get(k, [])).filter(x => x.id !== id)); render(); },
  async calc() {
    const st = S.settings;
    st.dayRate = num(val('s-rate')); st.workDays = num(val('s-days')); st.extraIncome = num(val('s-extra')); st.savePercent = num(val('s-pct'));
    saveSettings();
    const inc = (await Store.get(`money_${S.y}_${pad(S.m + 1)}`, [])).filter(x => x.type === 'in').reduce((s, x) => s + x.amount, 0);
    const forecast = st.dayRate * st.workDays + st.extraIncome;
    document.getElementById('calc-out').innerHTML = calcOut(forecast, forecast * st.savePercent / 100, inc * st.savePercent / 100, inc);
  },
  async countWorkDays() {
    const tasks = await Store.get(`tasks_${S.y}_${pad(S.m + 1)}`, {});
    const n = Object.values(tasks).filter(l => l.some(t => /робот|зміна|змін/i.test(t.title))).length;
    if (!n) return toast('У календарі цього місяця немає справ зі словом «робота» або «зміна». Додай їх у дні, коли працюєш.');
    document.getElementById('s-days').value = n; App.calc();
  },
  addGoal() {
    const name = val('g-name'), target = num(val('g-target'));
    if (!name || target <= 0) return toast('Вкажи назву і суму цілі');
    S.goals = [...S.goals, { id: uid(), name, target, saved: 0, deadline: val('g-deadline') }];
    Store.set('goals', S.goals); haptic(); render();
  },
  goalAdd(id) {
    const v = num(val('g-add-' + id)); if (!v) return;
    S.goals = S.goals.map(g => g.id === id ? { ...g, saved: Math.max(0, g.saved + v) } : g);
    Store.set('goals', S.goals);
    if (v > 0) showSticker('💰 +' + money(v) + ' у скарбничку!');
    render();
  },
  async addDebt() {
    const who = val('db-who'), amount = num(val('db-amount'));
    if (!who || amount <= 0) return toast('Вкажи, кому/хто, і суму');
    Store.set('debts', [...(await Store.get('debts', [])), { id: uid(), dir: val('db-dir'), who, amount, paid: 0, due: val('db-due'), note: val('db-note'), created: todayStr() }]);
    haptic(); render();
  },
  async debtPay(id) {
    const v = num(val('dp-' + id)); if (!v) return;
    let closedNow = null;
    const list = (await Store.get('debts', [])).map(d => {
      if (d.id !== id) return d;
      const paid = Math.min(d.amount, d.paid + v);
      if (paid >= d.amount) closedNow = d;
      return { ...d, paid };
    });
    Store.set('debts', list);
    if (closedNow) showSticker(closedNow.dir === 'owe' ? '🕊 Борг закрито! Вільна людина' : '💰 Тобі все повернули!', true);
    render();
  },
  async delDebt(id) { Store.set('debts', (await Store.get('debts', [])).filter(d => d.id !== id)); render(); },
  delGoal(id) { S.goals = S.goals.filter(x => x.id !== id); Store.set('goals', S.goals); render(); },

  // кроки
  async saveSteps(ds, inputId) {
    const n = Math.round(num(val(inputId)));
    await setStepsVal(ds, n);
    if (n >= S.settings.stepsGoal) showSticker('👟 Ціль по кроках виконана!');
    render();
  },
  saveStepsGoal() { const g = Math.round(num(val('h-goal'))); if (g > 0) { S.settings.stepsGoal = g; saveSettings(); } render(); },

  // їжа
  mealSub(k) { S.mealSub = k; render(); },
  mealRange(n) { S.mealRange = n; render(); },
  recipeFilter(k) { S.recipeFilter = k; render(); },
  saveMealSettings() {
    const st = S.settings;
    st.people = Math.max(1, Math.round(num(val('ms-people'))) || 1);
    st.exclude = val('ms-exclude').split(',').map(s => s.trim()).filter(Boolean);
    st.kcalTarget = Math.round(num(val('ms-kcal')));
    saveSettings(); haptic(); toast('Збережено'); render();
  },
  async addDish(ds, slot, id) {
    const r = recipeById(id); if (!r) return;
    const day = await dayMeals(ds);
    day[slot] = [...day[slot], dishItem(r)];
    await setDayMeals(ds, day); haptic(); render();
  },
  async delDish(ds, slot, i) {
    const day = await dayMeals(ds);
    day[slot] = day[slot].filter((_, j) => j !== i);
    await setDayMeals(ds, day); render();
  },
  async autoFill() {
    const pool = c => allRecipes().filter(r => catOf(r) === c && !isExcluded(r));
    const P = { breakfast: pool('breakfast'), soup: pool('soup'), side: pool('side'), main: pool('main'), dish: pool('dish'), salad: pool('salad') };
    const choose = (list, avoid) => { const l = list.filter(r => !avoid.includes(r.id)); return l.length ? pick(l) : (list.length ? pick(list) : null); };
    let prev = { b: [], l: [], d: [] };
    const second = avoid => {
      const useDish = P.dish.length && (Math.random() < 0.45 || !(P.main.length && P.side.length));
      if (useDish) return [choose(P.dish, avoid)];
      if (P.main.length && P.side.length) return [choose(P.main, avoid), choose(P.side, avoid)];
      return [];
    };
    let filled = 0;
    for (let i = 0; i < S.mealRange; i++) {
      const ds = addDays(todayStr(), i);
      const day = await dayMeals(ds);
      if (!day.b.length) { const r = choose(P.breakfast, prev.b); if (r) { day.b = [dishItem(r)]; filled++; } }
      if (!day.l.length) {
        const rs = [choose(P.soup, prev.l), ...second(prev.l)].filter(Boolean);
        if (rs.length) { day.l = rs.map(dishItem); filled++; }
      }
      if (!day.d.length) {
        const rs = (Math.random() < 0.25 && P.salad.length ? [choose(P.salad, prev.d), ...second(prev.d)] : second(prev.d)).filter(Boolean);
        if (rs.length) { day.d = rs.map(dishItem); filled++; }
      }
      prev = { b: day.b.map(x => x.id), l: day.l.map(x => x.id), d: day.d.map(x => x.id) };
      await setDayMeals(ds, day);
    }
    if (!filled) toast('Усі дні вже заповнені. Щоб скласти заново — натисни «Очистити».');
    haptic(); render();
  },
  async clearMeals() {
    const ok = await new Promise(res => (TG && TG.showConfirm && TG.initData) ? TG.showConfirm(`Очистити меню на ${S.mealRange} дн.?`, res) : res(confirm(`Очистити меню на ${S.mealRange} дн.?`)));
    if (!ok) return;
    for (let i = 0; i < S.mealRange; i++) await setDayMeals(addDays(todayStr(), i), { b: [], l: [], d: [] });
    render();
  },
  async toggleBought(k) {
    k = decodeURIComponent(k);
    const b = { ...(await Store.get('shop_bought', {})) };
    if (b[k]) delete b[k]; else b[k] = 1;
    Store.set('shop_bought', b); render();
  },
  clearBought() { Store.set('shop_bought', {}); render(); },
  async copyShop() {
    const text = 'Список покупок:\n' + aggregate(await rangeDays()).map(([, it]) => `• ${it.name} — ${fmtQty(it.qty, it.unit)}`).join('\n');
    const done = () => toast('Список скопійовано, встав його в чат або нотатки');
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    else fallbackCopy(text, done);
  },
  recipe(id) {
    const r = recipeById(decodeURIComponent(id)); if (!r) return toast('Цієї страви вже немає в списку');
    const people = S.settings.people || 1;
    openModal(`
      <h2>${esc(r.name)}</h2>
      <p><span class="tag">${CATS[catOf(r)]}</span><span class="tag">${r.kcal} ккал / порція</span>${isExcluded(r) ? '<span class="tag warn">містить виключений продукт</span>' : ''}</p>
      <h3>Інгредієнти на ${people} ${people === 1 ? 'порцію' : 'порц.'}</h3>
      ${r.ings.map(i => `<div class="item"><span class="grow">${esc(i.name)}</span><b>${fmtQty(i.qty * people, i.unit)}</b></div>`).join('')}
      <h3>Приготування</h3><ol>${(r.steps || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      ${r.prep ? `<div class="tip">🧊 <b>Заготовка:</b> ${esc(r.prep)}</div>` : ''}`);
  },
  closeModal() { document.getElementById('modal').classList.add('hidden'); },
  addRecipe() {
    const name = val('r-name');
    const ings = val('r-ings').split('\n').map(l => l.split(';').map(s => s.trim())).filter(p => p[0])
      .map(([n, q, u]) => ({ name: n, qty: num(q) || 1, unit: u || 'г' }));
    if (!name || !ings.length) return toast('Вкажи назву і хоча б один інгредієнт');
    const r = { id: 'c_' + uid(), custom: true, name, cat: val('r-cat'), kcal: Math.round(num(val('r-kcal'))), ings, steps: val('r-steps').split('\n').map(s => s.trim()).filter(Boolean) };
    const prep = val('r-prep'); if (prep) r.prep = prep;
    S.custom = [...S.custom, r]; Store.set('recipes_custom', S.custom); haptic(); toast('Страву додано'); render();
  },
  delRecipe(id) { id = decodeURIComponent(id); S.custom = S.custom.filter(r => r.id !== id); Store.set('recipes_custom', S.custom); render(); },

  // нотатки
  openFolder(id) { S.notesFolder = id; window.scrollTo(0, 0); render(); },
  async addFolder() {
    const name = val('f-name'); if (!name) return toast('Напиши назву папки');
    const n = await getNotes();
    Store.set('notes', { ...n, folders: [...n.folders, { id: uid(), name, emoji: val('f-emoji') || '📁' }] });
    haptic(); render();
  },
  async delFolder(id) {
    const n = await getNotes();
    const cnt = n.items.filter(i => i.folder === id).length;
    const ok = await new Promise(res => (TG && TG.showConfirm && TG.initData) ? TG.showConfirm(`Видалити папку${cnt ? ` разом з ${cnt} записами` : ''}?`, res) : res(confirm('Видалити папку?')));
    if (!ok) return;
    Store.set('notes', { folders: n.folders.filter(f => f.id !== id), items: n.items.filter(i => i.folder !== id) });
    S.notesFolder = null; render();
  },
  moodPick(m) { const el = document.getElementById('n-text'); el.value = m + ' ' + el.value; el.focus(); },
  async addNote() {
    const text = val('n-text'); if (!text) return;
    const n = await getNotes();
    Store.set('notes', { ...n, items: [...n.items, { id: uid(), folder: S.notesFolder, text, done: false, ts: Date.now() }] });
    haptic(); render();
  },
  async toggleNote(id) {
    const n = await getNotes();
    Store.set('notes', { ...n, items: n.items.map(i => i.id === id ? { ...i, done: !i.done } : i) });
    const it = n.items.find(i => i.id === id);
    if (it && !it.done && S.notesFolder === 'buy') showSticker('🛍 Куплено! Заслужила 😎');
    render();
  },
  async delNote(id) { const n = await getNotes(); Store.set('notes', { ...n, items: n.items.filter(i => i.id !== id) }); render(); },
  async editNote(id) {
    const n = await getNotes(); const it = n.items.find(i => i.id === id); if (!it) return;
    openModal(`<h2>Редагувати</h2><textarea id="edit-text" style="min-height:160px">${esc(it.text)}</textarea><button class="btn full" onclick="App.saveNote('${id}')">Зберегти</button>`);
  },
  async saveNote(id) {
    const text = val('edit-text'); const n = await getNotes();
    Store.set('notes', { ...n, items: n.items.map(i => i.id === id ? { ...i, text } : i) });
    App.closeModal(); render();
  },

  // сервер: нагадування і спільний планер
  async savePrefs() {
    try {
      S.me = { ...S.me, ...(await api('/prefs', 'POST', { remindOn: val('rem-on') === '1', remindHour: +val('rem-hour') })) };
      toast('Збережено'); render();
    } catch (e) { toast('Помилка: ' + e.message); }
  },
  async testReminder() {
    try { await Store.flush(); const r = await api('/test-reminder', 'POST', {}); toast(r.sent ? 'Надіслано — подивись у чат з ботом' : (r.reason || 'Не вдалося надіслати')); }
    catch (e) { toast('Помилка: ' + e.message); }
  },
  async invite() {
    try {
      const r = await api('/invite', 'POST', {});
      document.getElementById('invite-out').innerHTML = `<div class="tip" style="margin-top:10px">Надішли це посилання: <br><b>${esc(r.link || '')}</b><br>або код: <b>${esc(r.code)}</b><br><span class="small muted">Діє 3 дні, тільки для однієї людини.</span></div>
        ${r.link ? `<button class="btn full" onclick="App.shareInvite('${jsq(r.link)}')">Поділитися посиланням</button>` : ''}`;
    } catch (e) { toast('Помилка: ' + e.message); }
  },
  shareInvite(link) {
    link = decodeURIComponent(link);
    const url = 'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent('Давай вести спільний планер 💛');
    if (TG && TG.openTelegramLink) TG.openTelegramLink(url); else window.open(url);
  },
  async join() {
    const code = val('join-code'); if (!code) return;
    try { await Store.flush(); await api('/join', 'POST', { code }); await reloadAll(); toast('Готово! Тепер ви ведете спільний планер 💛'); S.me = null; render(); }
    catch (e) { toast('Помилка: ' + e.message); }
  },
  async leave() {
    try { await Store.flush(); await api('/leave', 'POST', {}); await reloadAll(); S.me = null; render(); }
    catch (e) { toast('Помилка: ' + e.message); }
  },
  async kick(id) {
    try { await api('/kick', 'POST', { id }); S.me = null; render(); }
    catch (e) { toast('Помилка: ' + e.message); }
  }
};
function openModal(html) { document.getElementById('modal-body').innerHTML = html; document.getElementById('modal').classList.remove('hidden'); }
function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); cb(); } catch (e) { toast(text); }
  ta.remove();
}
window.App = App;

// =====================================================================
//  СТАРТ
// =====================================================================
async function loadBase() {
  const raw = await Store.get('settings', {});
  S.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
  // перенесення старих налаштувань кольорів
  if (raw && raw.colorByTitle) {
    const rules = [...(S.settings.colorRules || [])];
    Object.entries(raw.colorByTitle).forEach(([word, color]) => { if (!rules.some(r => r.word === word)) rules.push({ word, color }); });
    S.settings.colorRules = rules; delete S.settings.colorByTitle; saveSettings();
  }
  S.goals = await Store.get('goals', []);
  S.custom = (await Store.get('recipes_custom', [])).map(r => ({ ...r, cat: catOf(r) }));
  // перенесення старого формату меню
  const old = await Store.get('mealplan', null);
  if (old && Array.isArray(old.days) && old.days.length && Array.isArray(old.days[0])) {
    for (let i = 0; i < old.days.length; i++) {
      const ds = addDays(old.start, i);
      const cur = await dayMeals(ds);
      if (cur.b.length || cur.l.length || cur.d.length) continue;
      const it = id => { const r = recipeById(id); return r ? [dishItem(r)] : []; };
      await setDayMeals(ds, { b: it(old.days[i][0]), l: it(old.days[i][1]), d: it(old.days[i][2]) });
    }
    Store.set('mealplan', null);
  }
}
async function reloadAll() { await Store.reload(); await loadBase(); }

(async function init() {
  if (TG) { try { TG.ready(); TG.expand(); TG.BackButton && TG.BackButton.onClick(goBack); } catch (e) { } }
  await Store.init();
  await loadBase();
  render();
  // зберегти все, коли застосунок згортають; підтягнути зміни партнера, коли повертаються
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') Store.flush();
    else if (Store.mode === 'api') {
      const a = document.activeElement;
      if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
      await reloadAll(); render();
    }
  });
})();
