'use strict';
// =====================================================================
//  ПЛАНУВАЛЬНИК — Telegram Mini App
//  Дані зберігаються в Telegram CloudStorage (окремо для кожного
//  користувача, безкоштовно). Якщо сторінку відкрити просто в браузері —
//  дані зберігаються в localStorage (для тестування).
// =====================================================================

const TG = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
const USE_CLOUD = !!(TG && TG.initData && TG.CloudStorage && TG.isVersionAtLeast && TG.isVersionAtLeast('6.9'));

const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];
const WD_FULL = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота'];
const MEALS = ['breakfast', 'lunch', 'dinner'];
const MEAL_NAMES = { breakfast: 'Сніданок', lunch: 'Обід', dinner: 'Вечеря' };
const EXP_CATS = ['Продукти', 'Транспорт', 'Житло', 'Комуналка', 'Кафе', 'Одяг', 'Здоровʼя', 'Розваги', 'Подарунки', 'Тварини', 'Інше'];
const COLORS = ['#e5484d', '#f59e0b', '#eab308', '#2fa84f', '#3478f6', '#8b5cf6', '#ec4899'];
const INC_CATS = ['Зарплата', 'Замовлення', 'Підробіток', 'Подарунок', 'Інше'];

// ---------- helpers ----------
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
const todayStr = () => ymd(new Date());
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v ?? '').replace(',', '.').replace(/\s/g, '')); return isFinite(n) ? n : 0; };
const money = n => (Math.round(n * 100) / 100).toLocaleString('uk-UA') + ' ₴';
const val = id => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
const prettyDate = s => { const d = parseYmd(s); return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}, ${WD_FULL[d.getDay()]}`; };
const shortDate = s => { const d = parseYmd(s); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`; };
const monthKey = s => s.slice(0, 7).replace('-', '_'); // '2026-11-26' -> '2026_11'
const haptic = () => { try { TG && TG.HapticFeedback && TG.HapticFeedback.impactOccurred('light'); } catch (e) { } };
const toast = msg => { try { if (TG && TG.showAlert && USE_CLOUD) TG.showAlert(msg); else alert(msg); } catch (e) { alert(msg); } };
const toMin = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

// ---------- storage (CloudStorage з розбиттям на частини по 4 КБ) ----------
function cGet(keys) {
  return new Promise(res => TG.CloudStorage.getItems(keys, (err, v) => res(err ? {} : (v || {}))));
}
function cSet(k, v) {
  return new Promise(res => TG.CloudStorage.setItem(k, v, err => res(!err)));
}
async function rawGet(key) {
  if (!USE_CLOUD) { try { return localStorage.getItem('pl_' + key); } catch (e) { return null; } }
  const v = (await cGet([key]))[key];
  if (v && v.startsWith('#chunks:')) {
    const n = parseInt(v.slice(8), 10);
    const keys = Array.from({ length: n }, (_, i) => `${key}_c${i}`);
    const parts = await cGet(keys);
    return keys.map(k => parts[k] || '').join('');
  }
  return v || null;
}
async function rawSet(key, str) {
  if (!USE_CLOUD) { try { localStorage.setItem('pl_' + key, str); } catch (e) { } return; }
  const LIMIT = 4000;
  if (str.length <= LIMIT) { await cSet(key, str); return; }
  const parts = [];
  for (let i = 0; i < str.length; i += LIMIT) parts.push(str.slice(i, i + LIMIT));
  for (let i = 0; i < parts.length; i++) await cSet(`${key}_c${i}`, parts[i]);
  await cSet(key, '#chunks:' + parts.length);
}
const Store = {
  cache: {}, timers: {},
  async get(key, def) {
    if (key in this.cache) return this.cache[key];
    let v = def;
    try { const raw = await rawGet(key); if (raw) v = JSON.parse(raw); } catch (e) { console.warn(e); }
    this.cache[key] = v;
    return v;
  },
  set(key, v) {
    this.cache[key] = v;
    clearTimeout(this.timers[key]);
    this.timers[key] = setTimeout(() => rawSet(key, JSON.stringify(v)).catch(console.warn), 300);
  }
};

// ---------- state ----------
const now = new Date();
const S = {
  tab: 'calendar',
  y: now.getFullYear(), m: now.getMonth(),
  date: todayStr(),
  dayOpen: false,
  mealSub: 'plan',
  recipeFilter: 'all',
  newColor: '',
  shopWeek: 0,
  settings: null, goals: null, custom: null, plan: null
};
const DEFAULT_SETTINGS = {
  stepsGoal: 8000,
  dayRate: 0, workDays: 0, extraIncome: 0, savePercent: 10,
  people: 1, exclude: [], kcalTarget: 2000,
  colorByTitle: {}
};
const saveSettings = () => Store.set('settings', S.settings);

// ---------- data access ----------
async function dayTasks(ds) { const o = await Store.get('tasks_' + monthKey(ds), {}); return o[ds.slice(8)] || []; }
async function setDayTasks(ds, list) {
  const k = 'tasks_' + monthKey(ds); const o = await Store.get(k, {});
  if (list.length) o[ds.slice(8)] = list; else delete o[ds.slice(8)];
  Store.set(k, o);
}
async function monthMoney(ds) { return Store.get('money_' + monthKey(ds), []); }
async function getSteps(ds) { const o = await Store.get('steps_' + ds.slice(0, 4), {}); return o[ds.slice(5)] || 0; }
async function setStepsVal(ds, n) {
  const k = 'steps_' + ds.slice(0, 4); const o = await Store.get(k, {});
  if (n > 0) o[ds.slice(5)] = n; else delete o[ds.slice(5)];
  Store.set(k, o);
}
function allRecipes() { return [...window.DEFAULT_RECIPES, ...(S.custom || [])]; }
function recipeById(id) { return allRecipes().find(r => r.id === id); }
function isExcluded(r) {
  const ex = (S.settings.exclude || []).map(x => x.toLowerCase().trim()).filter(Boolean);
  if (!ex.length) return false;
  return r.ings.some(i => { const n = i.name.toLowerCase(); return ex.some(e => n.includes(e) || e.includes(n)); });
}
function planMealsFor(ds) {
  const p = S.plan; if (!p) return null;
  const i = diffDays(p.start, ds);
  return (i >= 0 && i < p.days.length) ? p.days[i] : null;
}

// =====================================================================
//  RENDER
// =====================================================================
const TITLES = { calendar: '📅 Календар', money: '💰 Гроші', meals: '🍲 Харчування', health: '👟 Кроки і активність', tips: '💡 Поради' };

async function render() {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === S.tab));
  document.getElementById('top').textContent = (S.tab === 'calendar' && S.dayOpen) ? '🗓 ' + prettyDate(S.date) : TITLES[S.tab];
  const view = document.getElementById('view');
  const fn = { calendar: S.dayOpen ? viewDay : viewCalendar, money: viewMoney, meals: viewMeals, health: viewHealth, tips: viewTips }[S.tab];
  view.innerHTML = await fn();
  if (TG && TG.BackButton) { (S.tab === 'calendar' && S.dayOpen) ? TG.BackButton.show() : TG.BackButton.hide(); }
}

function monthNav() {
  return `<div class="month-nav">
    <button onclick="App.month(-1)">‹</button>
    <b>${MONTHS[S.m]} ${S.y}</b>
    <button onclick="App.month(1)">›</button>
  </div>`;
}

// ---------- КАЛЕНДАР (місяць) ----------
// фон клітинки дня: колір справи (або смужки, якщо кольорів кілька)
function cellBg(cols) {
  if (!cols.length) return '';
  if (cols.length === 1) return `background:${cols[0]}55;box-shadow:inset 0 0 0 2px ${cols[0]}`;
  const step = 100 / cols.length;
  return 'background:linear-gradient(to bottom,' + cols.map((c, i) => `${c}55 ${i * step}%,${c}55 ${(i + 1) * step}%`).join(',') + ')';
}
function colorPicker() {
  return `<div class="colors">${['', ...COLORS].map(c => `<button class="cpick ${S.newColor === c ? 'sel' : ''}" data-c="${c}" style="background:${c || 'var(--bg2)'}" onclick="App.pickColor('${c}')">${c ? '' : '∅'}</button>`).join('')}</div>`;
}
async function viewCalendar() {
  const { y, m } = S;
  const mk = `${y}_${pad(m + 1)}`;
  const tasks = await Store.get('tasks_' + mk, {});
  const mon = await Store.get('money_' + mk, []);
  const offset = (new Date(y, m, 1).getDay() + 6) % 7;
  const dim = new Date(y, m + 1, 0).getDate();
  const t = todayStr();

  let cells = WD.map(w => `<div class="wd">${w}</div>`).join('');
  for (let i = 0; i < offset; i++) cells += '<div class="cell empty"></div>';
  let totalTasks = 0, doneTasks = 0;
  for (let d = 1; d <= dim; d++) {
    const ds = `${y}-${pad(m + 1)}-${pad(d)}`;
    const list = tasks[pad(d)] || [];
    const done = list.filter(x => x.done).length;
    totalTasks += list.length; doneTasks += done;
    const dm = mon.filter(x => x.d === pad(d));
    const wd = new Date(y, m, d).getDay();
    const cols = [...new Set(list.slice().sort((a, b) => (a.from || '99') < (b.from || '99') ? -1 : 1).map(x => x.color).filter(Boolean))];
    cells += `<button class="cell ${ds === t ? 'today' : ''} ${wd === 0 || wd === 6 ? 'weekend' : ''}" style="${cellBg(cols)}" onclick="App.openDay('${ds}')">
      <span class="dn">${d}</span>
      ${list.length ? `<span class="badge ${done === list.length ? 'done' : ''}">${done}/${list.length}</span>` : ''}
      <span class="dots">${dm.some(x => x.type === 'in') ? '<i class="in"></i>' : ''}${dm.some(x => x.type === 'out') ? '<i class="out"></i>' : ''}${planMealsFor(ds) ? '<i class="meal"></i>' : ''}</span>
    </button>`;
  }
  const inc = mon.filter(x => x.type === 'in').reduce((s, x) => s + x.amount, 0);
  const exp = mon.filter(x => x.type === 'out').reduce((s, x) => s + x.amount, 0);

  return `<div class="card">${monthNav()}<div class="grid">${cells}</div>
    <div class="legend"><span><i style="background:var(--accent)"></i>справи</span><span><i style="background:var(--green)"></i>дохід</span><span><i style="background:var(--red)"></i>витрата</span><span><i style="background:var(--orange)"></i>меню</span></div>
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
  const tasks = (await dayTasks(ds)).slice().sort((a, b) => (a.from || '99') < (b.from || '99') ? -1 : 1);
  const mon = (await monthMoney(ds)).filter(x => x.d === ds.slice(8));
  const steps = await getSteps(ds);
  const meals = planMealsFor(ds);

  const taskHtml = tasks.length ? tasks.map(x => `
    <div class="item ${x.done ? 'done' : ''}">
      <input type="checkbox" ${x.done ? 'checked' : ''} onchange="App.toggleTask('${x.id}')">
      <button class="cdot" title="Змінити колір" style="background:${x.color || 'var(--bg2)'}" onclick="App.cycleColor('${x.id}')"></button>
      <span class="time">${x.from ? esc(x.from) + (x.to ? '–' + esc(x.to) : '') : 'без часу'}</span>
      <span class="grow title">${esc(x.title)}</span>
      <button class="icon-btn" onclick="App.delTask('${x.id}')">🗑</button>
    </div>`).join('') : '<p class="muted small">Справ поки немає</p>';

  const moneyHtml = mon.length ? mon.map(x => `
    <div class="item"><span class="grow">${esc(x.cat)}${x.note ? ` <span class="muted small">· ${esc(x.note)}</span>` : ''}</span>
    <b class="${x.type === 'in' ? 'green' : 'red'}">${x.type === 'in' ? '+' : '−'}${money(x.amount)}</b>
    <button class="icon-btn" onclick="App.delMoney('${ds}','${x.id}')">🗑</button></div>`).join('') : '<p class="muted small">Записів немає</p>';

  const mealsHtml = meals ? MEALS.map((k, i) => {
    const r = recipeById(meals[i]);
    return `<div class="meal-line"><span class="lbl">${MEAL_NAMES[k]}</span>${r ? `<a href="#" onclick="App.recipe('${r.id}');return false">${esc(r.name)}</a>` : '<span class="muted">—</span>'}</div>`;
  }).join('') : '<p class="muted small">Меню на цей день не складене. Зроби план у розділі «Харчування».</p>';

  return `
  <div class="between" style="margin-bottom:10px">
    <button class="btn light" onclick="App.shiftDay(-1)">‹ ${shortDate(addDays(ds, -1))}</button>
    <button class="btn light" onclick="App.closeDay()">Місяць</button>
    <button class="btn light" onclick="App.shiftDay(1)">${shortDate(addDays(ds, 1))} ›</button>
  </div>
  <div class="card"><h3>Графік дня</h3>${taskHtml}
    <label>Нова справа</label>
    <div class="row"><input type="time" id="t-from"><input type="time" id="t-to"></div>
    <div class="row" style="margin-top:6px"><input id="t-title" placeholder="Що треба зробити?"></div>
    <label>Колір у календарі</label>${colorPicker()}
    <button class="btn full" onclick="App.addTask()">+ Додати справу</button>
  </div>
  <div class="card"><h3>Гроші за день</h3>${moneyHtml}
    ${moneyForm('d', false)}
  </div>
  <div class="card"><h3>Меню</h3>${mealsHtml}</div>
  <div class="card"><h3>Кроки</h3>
    <div class="row"><input type="number" id="d-steps" inputmode="numeric" value="${steps || ''}" placeholder="Кількість кроків"><button class="btn auto" onclick="App.saveSteps('${ds}','d-steps')">Зберегти</button></div>
    ${steps ? `<div class="bar ${steps >= S.settings.stepsGoal ? 'green' : ''}"><div style="width:${Math.min(100, steps / S.settings.stepsGoal * 100)}%"></div></div><p class="muted small">${steps} з ${S.settings.stepsGoal}</p>` : ''}
  </div>`;
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
    <button class="btn full" onclick="App.addMoney('${p}')">+ Додати</button>`;
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
    <input id="g-name" placeholder="Напр. відпустка, ноутбук">
    <div class="row" style="margin-top:6px">
      <input type="number" inputmode="decimal" id="g-target" placeholder="Сума, ₴">
      <input type="date" id="g-deadline">
    </div>
    <button class="btn full" onclick="App.addGoal()">+ Додати ціль</button>
  </div>
  <div class="card"><h3>Усі записи за ${MONTHS[S.m].toLowerCase()}</h3>${listHtml}</div>`;
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
  let hint = '';
  if (left === 0) hint = '🎉 Ціль досягнута!';
  else if (g.deadline) {
    const days = diffDays(todayStr(), g.deadline);
    if (days <= 0) hint = `Термін минув, лишилось зібрати ${money(left)}`;
    else {
      const months = Math.max(days / 30.44, 1 / 30.44);
      hint = `До ${shortDate(g.deadline)}: ${money(left / months)} на місяць · ${money(left / Math.max(days / 7, 1))} на тиждень · ${money(left / days)} на день`;
    }
  } else if (monthlySave > 0) {
    hint = `Якщо відкладати ${money(monthlySave)}/міс — збереш приблизно за ${Math.ceil(left / monthlySave)} міс.`;
  } else hint = 'Додай дату або заповни калькулятор вище, щоб побачити, скільки відкладати.';
  return `<div style="margin-bottom:14px">
    <div class="between"><b>${esc(g.name)}</b><button class="icon-btn" onclick="App.delGoal('${g.id}')">🗑</button></div>
    <div class="between small"><span>${money(g.saved)} з ${money(g.target)}</span><span>${Math.round(pct)}%</span></div>
    <div class="bar green"><div style="width:${pct}%"></div></div>
    <p class="small muted" style="margin:6px 0">${hint}</p>
    <div class="row"><input type="number" inputmode="decimal" id="g-add-${g.id}" placeholder="Сума, ₴"><button class="btn auto" onclick="App.goalAdd('${g.id}')">Відкласти</button></div>
  </div>`;
}

// ---------- ХАРЧУВАННЯ ----------
async function viewMeals() {
  const subs = { plan: 'План', shop: 'Покупки', prep: 'Заготовки', recipes: 'Рецепти', settings: 'Налаштування' };
  const nav = `<div class="subtabs">${Object.entries(subs).map(([k, v]) => `<button class="${S.mealSub === k ? 'active' : ''}" onclick="App.mealSub('${k}')">${v}</button>`).join('')}</div>`;
  const body = { plan: mealsPlan, shop: mealsShop, prep: mealsPrep, recipes: mealsRecipes, settings: mealsSettings }[S.mealSub]();
  return nav + body;
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
    <p class="small muted">Калорійність рецептів приблизна. Орієнтир просто показує, скільки дає меню за день.</p>
    <button class="btn full" onclick="App.saveMealSettings()">Зберегти</button>
  </div>`;
}
function mealsPlan() {
  const p = S.plan;
  const head = `<div class="card"><h3>Скласти меню</h3>
    <p class="small muted">Людей: <b>${S.settings.people}</b> · Виключено: ${S.settings.exclude.length ? esc(S.settings.exclude.join(', ')) : 'нічого'} <a href="#" onclick="App.mealSub('settings');return false">змінити</a></p>
    <div class="row"><button class="btn" onclick="App.genPlan(7)">На тиждень</button><button class="btn" onclick="App.genPlan(30)">На місяць</button></div>
  </div>`;
  if (!p) return head + '<p class="muted center">Меню ще не складене</p>';
  const target = S.settings.kcalTarget;
  const days = p.days.map((ids, i) => {
    const ds = addDays(p.start, i);
    let kcal = 0;
    const lines = MEALS.map((k, j) => {
      const r = recipeById(ids[j]); if (r) kcal += r.kcal;
      return `<div class="meal-line"><span class="lbl">${MEAL_NAMES[k]}</span>${r ? `<a href="#" onclick="App.recipe('${r.id}');return false">${esc(r.name)}</a>` : '<span class="muted" style="flex:1">немає рецепта</span>'}<button class="icon-btn" title="Замінити" onclick="App.reroll(${i},${j})">🔄</button></div>`;
    }).join('');
    const kc = target ? `<span class="tag ${kcal > target * 1.1 ? 'warn' : ''}">${kcal} / ${target} ккал</span>` : `<span class="tag">${kcal} ккал</span>`;
    return `<div class="meal-day"><div class="between"><b>${prettyDate(ds)}</b>${kc}</div>${lines}</div>`;
  }).join('');
  return head + `<div class="card"><div class="between"><h3>Меню з ${shortDate(p.start)} (${p.days.length} дн.)</h3><button class="icon-btn" onclick="App.clearPlan()">🗑</button></div>
    <p class="small muted">Калорії — на 1 людину. Натисни на страву, щоб побачити рецепт і кількості на всю сімʼю.</p>${days}</div>`;
}
function shoppingList(fromDay, toDay) {
  const p = S.plan; const people = S.settings.people || 1;
  const agg = {};
  p.days.slice(fromDay, toDay).forEach(ids => ids.forEach(id => {
    const r = recipeById(id); if (!r) return;
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
function mealsShop() {
  const p = S.plan;
  if (!p) return '<div class="card"><p class="muted">Спершу склади меню у вкладці «План».</p></div>';
  const weeks = Math.ceil(p.days.length / 7);
  const w = Math.min(S.shopWeek, weeks);
  const from = w ? (w - 1) * 7 : 0, to = w ? Math.min(w * 7, p.days.length) : p.days.length;
  const items = shoppingList(from, to);
  const bought = p.bought || {};
  const sel = weeks > 1 ? `<div class="subtabs"><button class="${w === 0 ? 'active' : ''}" onclick="App.shopWeek(0)">Увесь план</button>${Array.from({ length: weeks }, (_, i) => `<button class="${w === i + 1 ? 'active' : ''}" onclick="App.shopWeek(${i + 1})">Тиждень ${i + 1}</button>`).join('')}</div>` : '';
  const list = items.map(([k, it]) => `<div class="item ${bought[k] ? 'done' : ''}"><input type="checkbox" ${bought[k] ? 'checked' : ''} onchange="App.toggleBought('${encodeURIComponent(k).replace(/'/g, '%27')}')"><span class="grow title">${esc(it.name)}</span><b>${fmtQty(it.qty, it.unit)}</b></div>`).join('');
  return sel + `<div class="card"><div class="between"><h3>Що купити</h3><button class="btn light" onclick="App.copyShop(${from},${to})">Копіювати</button></div>
    <p class="small muted">На ${S.settings.people} ос., ${shortDate(addDays(p.start, from))}–${shortDate(addDays(p.start, to - 1))}. Сіль, спеції і воду не враховано.</p>
    ${list || '<p class="muted">Порожньо</p>'}</div>`;
}
function mealsPrep() {
  const p = S.plan;
  if (!p) return '<div class="card"><p class="muted">Спершу склади меню у вкладці «План».</p></div>';
  const people = S.settings.people || 1;
  const count = {};
  p.days.forEach(ids => ids.forEach(id => { count[id] = (count[id] || 0) + 1; }));
  const prepList = Object.entries(count).map(([id, n]) => ({ r: recipeById(id), n })).filter(x => x.r && x.r.prep);
  if (!prepList.length) return '<div class="card"><p class="muted">У цьому меню немає страв, які можна заготовити заздалегідь. Додай сирники, вареники, котлети, голубці тощо.</p></div>';
  const blocks = prepList.map(({ r, n }) => {
    const portions = n * people;
    const ings = r.ings.map(i => `${esc(i.name)} — ${fmtQty(i.qty * portions, i.unit)}`).join('<br>');
    return `<div class="card"><div class="between"><h3>${esc(r.name)}</h3><span class="tag">${portions} порц.</span></div>
      <p class="small muted">У меню ${n} раз(и) × ${people} ос.</p>
      <p class="small">${ings}</p>
      <div class="tip">🧊 ${esc(r.prep)}</div></div>`;
  }).join('');
  return `<div class="card"><h3>День заготовок</h3>
    <div class="tip">Вибери один вихідний на весь план. Спочатку постав варитися те, що довго готується (бульйон, рис, картопля), а поки вариться, ліпи й формуй. Заморожуй окремими порціями й підписуй дату. Харчі в морозилці краще використати протягом 1–2 місяців.</div>
  </div>` + blocks;
}
function mealsRecipes() {
  const f = S.recipeFilter;
  const list = allRecipes().filter(r => f === 'all' || r.meal === f);
  const filt = `<div class="subtabs">${[['all', 'Усі'], ...MEALS.map(k => [k, MEAL_NAMES[k]])].map(([k, v]) => `<button class="${f === k ? 'active' : ''}" onclick="App.recipeFilter('${k}')">${v}</button>`).join('')}</div>`;
  const items = list.map(r => `<div class="item"><span class="grow"><a href="#" onclick="App.recipe('${r.id}');return false" style="color:var(--link);text-decoration:none">${esc(r.name)}</a><br>
    <span class="tag">${MEAL_NAMES[r.meal]}</span><span class="tag">${r.kcal} ккал</span>${r.prep ? '<span class="tag">🧊 заготовка</span>' : ''}${isExcluded(r) ? '<span class="tag warn">виключено</span>' : ''}${r.custom ? '<span class="tag">мій</span>' : ''}</span>
    ${r.custom ? `<button class="icon-btn" onclick="App.delRecipe('${r.id}')">🗑</button>` : ''}</div>`).join('');
  return filt + `<div class="card"><h3>Книга рецептів (${list.length})</h3>${items}</div>
  <div class="card"><h3>Додати свій рецепт</h3>
    <label>Назва</label><input id="r-name">
    <div class="row">
      <div><label>Прийом їжі</label><select id="r-meal">${MEALS.map(k => `<option value="${k}">${MEAL_NAMES[k]}</option>`).join('')}</select></div>
      <div><label>Ккал на порцію</label><input type="number" inputmode="numeric" id="r-kcal"></div>
    </div>
    <label>Інгредієнти на 1 порцію: кожен з нового рядка, «назва; кількість; одиниця»</label>
    <textarea id="r-ings" placeholder="Картопля; 150; г&#10;Яйця; 1; шт&#10;Молоко; 100; мл"></textarea>
    <label>Як готувати (кожен крок з нового рядка)</label>
    <textarea id="r-steps"></textarea>
    <label>Як заготовити наперед (необовʼязково)</label>
    <textarea id="r-prep" placeholder="Напр.: заморозити на дошці, потім скласти в пакет"></textarea>
    <button class="btn full" onclick="App.addRecipe()">Зберегти рецепт</button>
  </div>`;
}

// ---------- КРОКИ ----------
async function viewHealth() {
  const t = todayStr();
  const goal = S.settings.stepsGoal;
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
    <p class="small muted">Telegram не дає доступу до даних «Здоровʼя» / Google Fit, тож кроки вводяться вручну (цифру можна підглянути в телефоні). Автоматичну синхронізацію можна буде зробити в окремому застосунку для App Store.</p>
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
  const yest = await dayTasks(y);
  const undone = yest.filter(x => !x.done);
  if (undone.length) tips.push({ c: 'warn', h: `Учора лишилося невиконаних справ: ${undone.length}. <button class="btn light" style="margin-top:6px" onclick="App.moveUndone('${y}','${t}')">Перенести на сьогодні</button>` });
  if (today.length > 8) tips.push({ c: 'warn', h: `Сьогодні ${today.length} справ. Це багато, спробуй перенести 2–3 некритичні на інший день.` });
  if (!today.length) tips.push({ c: '', h: 'На сьогодні справ не заплановано. Відкрий календар і склади план дня.' });
  const timed = today.filter(x => x.from).map(x => ({ ...x, a: toMin(x.from), b: toMin(x.to) ?? toMin(x.from) + 60 })).sort((p, q) => p.a - q.a);
  for (let i = 1; i < timed.length; i++) {
    if (timed[i].a < timed[i - 1].b) tips.push({ c: 'warn', h: `Справи «${esc(timed[i - 1].title)}» і «${esc(timed[i].title)}» перетинаються в часі.` });
    else if (timed[i].a - timed[i - 1].b >= 120) tips.push({ c: 'good', h: `Вільне вікно ${fromMin(timed[i - 1].b)}–${fromMin(timed[i].a)}: туди можна поставити відпочинок, прогулянку або справу з довгого списку.` });
  }
  const noTime = today.filter(x => !x.from).length;
  if (noTime >= 3) tips.push({ c: '', h: `${noTime} справ на сьогодні без часу. Признач їм час, так буде легше встигнути.` });

  const mon = await monthMoney(t);
  const inc = mon.filter(x => x.type === 'in').reduce((s, x) => s + x.amount, 0);
  const exp = mon.filter(x => x.type === 'out').reduce((s, x) => s + x.amount, 0);
  if (exp > inc && inc > 0) tips.push({ c: 'warn', h: `Цього місяця витрати (${money(exp)}) більші за дохід (${money(inc)}).` });
  if (exp > 0) {
    const byCat = {}; mon.filter(x => x.type === 'out').forEach(x => byCat[x.cat] = (byCat[x.cat] || 0) + x.amount);
    const [topC, topV] = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
    if (topV / exp > 0.4) tips.push({ c: '', h: `${Math.round(topV / exp * 100)}% витрат цього місяця йде на «${esc(topC)}». Подивись, чи можна тут зекономити.` });
  }
  S.goals.filter(g => g.deadline && g.saved < g.target && diffDays(t, g.deadline) > 0).forEach(g => {
    const d = diffDays(t, g.deadline);
    tips.push({ c: '', h: `Щоб встигнути на «${esc(g.name)}», відкладай ${money((g.target - g.saved) / Math.max(d / 7, 1))} на тиждень.` });
  });

  let stepsSum = 0, stepsDays = 0;
  for (let i = 0; i < 7; i++) { const n = await getSteps(addDays(t, -i)); if (n) { stepsSum += n; stepsDays++; } }
  if (stepsDays >= 3 && stepsSum / stepsDays < S.settings.stepsGoal * 0.6) tips.push({ c: '', h: 'Цього тижня кроків помітно менше за ціль. Спробуй пройти частину дороги пішки або погуляти 20 хвилин після вечері.' });

  const dyn = tips.length ? tips.map(x => `<div class="tip ${x.c}">${x.h}</div>`).join('') : '<div class="tip good">Усе виглядає добре, так тримати! 👍</div>';
  const shuffled = STATIC_TIPS.slice().sort(() => Math.random() - 0.5).slice(0, 4);
  return `<div class="card"><h3>Для тебе зараз</h3>${dyn}</div>
    <div class="card"><h3>Як встигати більше</h3>${shuffled.map(s => `<div class="tip">${s}</div>`).join('')}</div>`;
}

// =====================================================================
//  ACTIONS
// =====================================================================
const App = {
  tab(t) { S.tab = t; if (t !== 'calendar') S.dayOpen = false; window.scrollTo(0, 0); render(); },
  month(d) { S.m += d; if (S.m < 0) { S.m = 11; S.y--; } if (S.m > 11) { S.m = 0; S.y++; } render(); },
  openDay(ds) { S.date = ds; S.dayOpen = true; S.tab = 'calendar'; const d = parseYmd(ds); S.y = d.getFullYear(); S.m = d.getMonth(); window.scrollTo(0, 0); render(); },
  closeDay() { S.dayOpen = false; render(); },
  shiftDay(n) { App.openDay(addDays(S.date, n)); },

  async addTask() {
    const title = val('t-title');
    if (!title) return toast('Напиши, що треба зробити');
    const list = await dayTasks(S.date);
    const key = title.toLowerCase();
    const map = S.settings.colorByTitle || (S.settings.colorByTitle = {});
    const color = S.newColor || map[key] || '';
    if (S.newColor) { map[key] = S.newColor; saveSettings(); }
    list.push({ id: uid(), from: val('t-from'), to: val('t-to'), title, done: false, color });
    S.newColor = '';
    await setDayTasks(S.date, list); haptic(); render();
  },
  async toggleTask(id) {
    const list = await dayTasks(S.date);
    const x = list.find(t => t.id === id); if (x) x.done = !x.done;
    await setDayTasks(S.date, list); haptic(); render();
  },
  pickColor(c) {
    S.newColor = c;
    document.querySelectorAll('.cpick').forEach(b => b.classList.toggle('sel', b.dataset.c === c));
  },
  async cycleColor(id) {
    const list = await dayTasks(S.date);
    const x = list.find(t => t.id === id); if (!x) return;
    const opts = ['', ...COLORS];
    x.color = opts[(opts.indexOf(x.color || '') + 1) % opts.length];
    const map = S.settings.colorByTitle || (S.settings.colorByTitle = {});
    if (x.color) map[x.title.toLowerCase()] = x.color; else delete map[x.title.toLowerCase()];
    saveSettings();
    await setDayTasks(S.date, list); haptic(); render();
  },
  async delTask(id) {
    await setDayTasks(S.date, (await dayTasks(S.date)).filter(t => t.id !== id)); render();
  },
  async moveUndone(from, to) {
    const src = await dayTasks(from);
    const undone = src.filter(x => !x.done);
    await setDayTasks(from, src.filter(x => x.done));
    await setDayTasks(to, [...(await dayTasks(to)), ...undone.map(x => ({ ...x, id: uid() }))]);
    haptic(); render();
  },

  updCats(p) {
    const type = val(p + '-type');
    document.getElementById(p + '-cat').innerHTML = (type === 'in' ? INC_CATS : EXP_CATS).map(c => `<option>${c}</option>`).join('');
  },
  async addMoney(p) {
    const amount = num(val(p + '-amount'));
    if (amount <= 0) return toast('Вкажи суму');
    const ds = p === 'd' ? S.date : (val(p + '-date') || defaultDateInMonth());
    const k = 'money_' + monthKey(ds);
    const list = await Store.get(k, []);
    list.push({ id: uid(), d: ds.slice(8), type: val(p + '-type'), amount, cat: val(p + '-cat'), note: val(p + '-note') });
    Store.set(k, list); haptic(); render();
  },
  async delMoney(ds, id) {
    const k = 'money_' + monthKey(ds);
    Store.set(k, (await Store.get(k, [])).filter(x => x.id !== id)); render();
  },
  async calc() {
    const st = S.settings;
    st.dayRate = num(val('s-rate')); st.workDays = num(val('s-days')); st.extraIncome = num(val('s-extra')); st.savePercent = num(val('s-pct'));
    saveSettings();
    const inc = (await Store.get(`money_${S.y}_${pad(S.m + 1)}`, [])).filter(x => x.type === 'in').reduce((s, x) => s + x.amount, 0);
    const forecast = st.dayRate * st.workDays + st.extraIncome;
    document.getElementById('calc-out').innerHTML = calcOut(forecast, forecast * st.savePercent / 100, inc * st.savePercent / 100, inc);
  },
  async countWorkDays() {
    // рахує дні місяця, де є справа зі словом «робота» або «зміна»
    const tasks = await Store.get(`tasks_${S.y}_${pad(S.m + 1)}`, {});
    const n = Object.values(tasks).filter(l => l.some(t => /робот|зміна|змін/i.test(t.title))).length;
    if (!n) return toast('У календарі цього місяця немає справ зі словом «робота» або «зміна». Додай їх у дні, коли працюєш.');
    document.getElementById('s-days').value = n; App.calc();
  },
  addGoal() {
    const name = val('g-name'), target = num(val('g-target'));
    if (!name || target <= 0) return toast('Вкажи назву і суму цілі');
    S.goals.push({ id: uid(), name, target, saved: 0, deadline: val('g-deadline') });
    Store.set('goals', S.goals); haptic(); render();
  },
  goalAdd(id) {
    const v = num(val('g-add-' + id)); if (!v) return;
    const g = S.goals.find(x => x.id === id); if (g) g.saved = Math.max(0, g.saved + v);
    Store.set('goals', S.goals); haptic(); render();
  },
  delGoal(id) { S.goals = S.goals.filter(x => x.id !== id); Store.set('goals', S.goals); render(); },

  async saveSteps(ds, inputId) { await setStepsVal(ds, Math.round(num(val(inputId)))); haptic(); render(); },
  saveStepsGoal() { const g = Math.round(num(val('h-goal'))); if (g > 0) { S.settings.stepsGoal = g; saveSettings(); } render(); },

  mealSub(k) { S.mealSub = k; render(); },
  recipeFilter(k) { S.recipeFilter = k; render(); },
  shopWeek(w) { S.shopWeek = w; render(); },
  saveMealSettings() {
    const st = S.settings;
    st.people = Math.max(1, Math.round(num(val('ms-people'))) || 1);
    st.exclude = val('ms-exclude').split(',').map(s => s.trim()).filter(Boolean);
    st.kcalTarget = Math.round(num(val('ms-kcal')));
    saveSettings(); haptic(); toast('Збережено'); render();
  },
  genPlan(days) {
    const pools = {};
    for (const k of MEALS) pools[k] = allRecipes().filter(r => r.meal === k && !isExcluded(r));
    const empty = MEALS.filter(k => !pools[k].length);
    if (empty.length) toast('Немає рецептів без виключених продуктів для: ' + empty.map(k => MEAL_NAMES[k]).join(', ') + '. Додай свої рецепти.');
    const out = [];
    for (let i = 0; i < days; i++) {
      out.push(MEALS.map((k, j) => {
        const pool = pools[k]; if (!pool.length) return null;
        const prev = out[i - 1] ? out[i - 1][j] : null;
        const choices = pool.length > 1 ? pool.filter(r => r.id !== prev) : pool;
        return choices[Math.floor(Math.random() * choices.length)].id;
      }));
    }
    S.plan = { start: todayStr(), days: out, bought: {} };
    S.shopWeek = 0;
    Store.set('mealplan', S.plan); haptic(); render();
  },
  reroll(i, j) {
    const k = MEALS[j];
    const pool = allRecipes().filter(r => r.meal === k && !isExcluded(r) && r.id !== S.plan.days[i][j]);
    if (!pool.length) return toast('Немає інших рецептів для заміни');
    S.plan.days[i][j] = pool[Math.floor(Math.random() * pool.length)].id;
    Store.set('mealplan', S.plan); haptic(); render();
  },
  clearPlan() { S.plan = null; Store.set('mealplan', null); render(); },
  toggleBought(k) {
    k = decodeURIComponent(k);
    S.plan.bought = S.plan.bought || {};
    if (S.plan.bought[k]) delete S.plan.bought[k]; else S.plan.bought[k] = 1;
    Store.set('mealplan', S.plan); render();
  },
  copyShop(from, to) {
    const text = 'Список покупок:\n' + shoppingList(from, to).map(([, it]) => `• ${it.name} — ${fmtQty(it.qty, it.unit)}`).join('\n');
    const done = () => toast('Список скопійовано, встав його в чат або нотатки');
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    else fallbackCopy(text, done);
  },
  recipe(id) {
    const r = recipeById(id); if (!r) return;
    const people = S.settings.people || 1;
    document.getElementById('modal-body').innerHTML = `
      <h2>${esc(r.name)}</h2>
      <p><span class="tag">${MEAL_NAMES[r.meal]}</span><span class="tag">${r.kcal} ккал / порція</span>${isExcluded(r) ? '<span class="tag warn">містить виключений продукт</span>' : ''}</p>
      <h3>Інгредієнти на ${people} ${people === 1 ? 'порцію' : 'порц.'}</h3>
      ${r.ings.map(i => `<div class="item"><span class="grow">${esc(i.name)}</span><b>${fmtQty(i.qty * people, i.unit)}</b></div>`).join('')}
      <h3>Приготування</h3><ol>${(r.steps || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      ${r.prep ? `<div class="tip">🧊 <b>Заготовка:</b> ${esc(r.prep)}</div>` : ''}`;
    document.getElementById('modal').classList.remove('hidden');
  },
  closeModal() { document.getElementById('modal').classList.add('hidden'); },
  addRecipe() {
    const name = val('r-name');
    const ings = val('r-ings').split('\n').map(l => l.split(';').map(s => s.trim())).filter(p => p[0])
      .map(([n, q, u]) => ({ name: n, qty: num(q) || 1, unit: u || 'г' }));
    if (!name || !ings.length) return toast('Вкажи назву і хоча б один інгредієнт');
    const r = {
      id: 'c_' + uid(), custom: true, name, meal: val('r-meal'), kcal: Math.round(num(val('r-kcal'))), ings,
      steps: val('r-steps').split('\n').map(s => s.trim()).filter(Boolean)
    };
    const prep = val('r-prep'); if (prep) r.prep = prep;
    S.custom.push(r); Store.set('recipes_custom', S.custom); haptic(); toast('Рецепт додано'); render();
  },
  delRecipe(id) { S.custom = S.custom.filter(r => r.id !== id); Store.set('recipes_custom', S.custom); render(); }
};
function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); cb(); } catch (e) { toast(text); }
  ta.remove();
}
window.App = App;

// ---------- init ----------
(async function init() {
  if (TG) {
    try { TG.ready(); TG.expand(); TG.BackButton && TG.BackButton.onClick(() => App.closeDay()); } catch (e) { }
  }
  S.settings = Object.assign({}, DEFAULT_SETTINGS, await Store.get('settings', {}));
  S.goals = await Store.get('goals', []);
  S.custom = await Store.get('recipes_custom', []);
  S.plan = await Store.get('mealplan', null);
  render();
})();
