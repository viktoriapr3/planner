// =====================================================================
//  СЕРВЕР ПЛАНУВАЛЬНИКА — Cloudflare Worker (безкоштовний тариф)
//  Що робить:
//   • зберігає дані планувальника (база D1), щоб їх бачили кілька людей;
//   • спільний планер: запрошення за посиланням/кодом;
//   • щогодини перевіряє, кому час надіслати нагадування на завтра;
//   • відповідає на /start у боті.
//  Потрібні налаштування у Cloudflare (див. README):
//   • D1-база, підʼєднана як DB
//   • секрет BOT_TOKEN — токен бота від @BotFather
//   • змінна WEBAPP_URL — адреса планувальника на GitHub Pages
//   • Cron Trigger: 0 * * * *   (кожну годину)
// =====================================================================

const TZ = 'Europe/Kyiv';
const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня', 'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const WD_FULL = ['неділя', 'понеділок', 'вівторок', 'середа', 'четвер', 'пʼятниця', 'субота'];
const LOAD = {
  normal: ['🛋 Завтра чіл день. Нічого не заплановано — кайфуй', '🌿 Легкий день, встигнеш і відпочити', '☕ Нормальний робочий день, без паніки', '⚡ Насичений день. Ти турбо-машина, впораєшся', '💀 Завтра ти пашеш, поки не впадеш. Виспися!'],
  spicy: ['🛋 Завтра чіл день. Нічого не заплановано — кайфуй', '🌿 Легкий день, встигнеш і поваляцця', '☕ Нормальний такий день, без паніки', '⚡ Насичений день. Ти турбо-машина, вивезеш', '💀 Завтра ти хуяриш, поки не впадеш. Виспися!']
};
const MAX_VALUE = 900 * 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Init-Data',
  'Access-Control-Max-Age': '86400'
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS } });
const pad = n => String(n).padStart(2, '0');
const escHtml = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ---------- база ----------
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT, space TEXT NOT NULL, remind_on INTEGER NOT NULL DEFAULT 1, remind_hour INTEGER NOT NULL DEFAULT 20)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS kv (space TEXT NOT NULL, k TEXT NOT NULL, v TEXT NOT NULL, updated INTEGER, PRIMARY KEY (space, k))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS invites (code TEXT PRIMARY KEY, space TEXT NOT NULL, expires INTEGER NOT NULL)')
  ]);
  schemaReady = true;
}
async function ensureUser(env, id, name) {
  id = String(id);
  await env.DB.prepare('INSERT INTO users (id, name, space) VALUES (?1, ?2, ?1) ON CONFLICT(id) DO UPDATE SET name = excluded.name').bind(id, name || '').run();
  return env.DB.prepare('SELECT * FROM users WHERE id = ?1').bind(id).first();
}
async function getSpaceData(env, space, keys) {
  if (keys) {
    const out = {};
    for (const k of keys) {
      const row = await env.DB.prepare('SELECT v FROM kv WHERE space = ?1 AND k = ?2').bind(space, k).first();
      if (row) out[k] = JSON.parse(row.v);
    }
    return out;
  }
  const { results } = await env.DB.prepare('SELECT k, v FROM kv WHERE space = ?1').bind(space).all();
  const out = {};
  for (const r of results) out[r.k] = JSON.parse(r.v);
  return out;
}

// ---------- перевірка, що запит справді з Telegram ----------
async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? new TextEncoder().encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data)));
}
const hex = buf => [...buf].map(b => b.toString(16).padStart(2, '0')).join('');
async function verifyInitData(initData, token) {
  if (!initData || !token) return null;
  const p = new URLSearchParams(initData);
  const hash = p.get('hash');
  if (!hash) return null;
  p.delete('hash');
  const check = [...p.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac('WebAppData', token);
  if (hex(await hmac(secret, check)) !== hash) return null;
  if (Date.now() / 1000 - Number(p.get('auth_date') || 0) > 30 * 86400) return null;
  try { return JSON.parse(p.get('user')); } catch (e) { return null; }
}
async function webhookSecret(token) { return hex(await hmac('planner-webhook', token)).slice(0, 32); }

// ---------- Telegram ----------
async function tg(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return r.json().catch(() => ({ ok: false }));
}
const openButton = env => ({ inline_keyboard: [[{ text: '📅 Відкрити планувальник', web_app: { url: env.WEBAPP_URL } }]] });

// ---------- дати в київському часі ----------
function kyivParts(date = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const o = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour };
}
function tomorrowKyiv() {
  const { y, m, d } = kyivParts();
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), wd: t.getUTCDay() };
}

// ---------- навантаження дня (як у застосунку) ----------
const toMin = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
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
  return { lvl: (h >= 11 || n >= 10) ? 4 : (h >= 7 || n >= 7) ? 3 : (h >= 4 || n >= 4) ? 2 : 1, h };
}

// ---------- текст нагадування ----------
async function buildReminder(env, space) {
  const t = tomorrowKyiv();
  const mk = `${t.y}_${pad(t.m)}`, dd = pad(t.d);
  const data = await getSpaceData(env, space, ['tasks_' + mk, 'meals_' + mk, 'settings', 'debts']);
  const tDate = `${t.y}-${pad(t.m)}-${dd}`;
  const debts = (data.debts || []).filter(d => d.due === tDate && d.paid < d.amount);
  const tasks = ((data['tasks_' + mk] || {})[dd] || []).slice().sort((a, b) => ((a.from || '99') < (b.from || '99') ? -1 : 1));
  const meals = (data['meals_' + mk] || {})[dd] || {};
  const mode = (data.settings || {}).stickers === 'normal' ? 'normal' : 'spicy';
  const all = [...(meals.b || []), ...(meals.l || []), ...(meals.d || [])];
  if (!tasks.length && !all.length && !debts.length) return null;

  const load = dayLoad(tasks);
  const phrase = LOAD[mode][load.lvl] + (load.h >= 1 ? ` · зайнято ~${Math.round(load.h)} год` : '');
  let text = `🗓 <b>На завтра, ${t.d} ${MONTHS_GEN[t.m - 1]} (${WD_FULL[t.wd]}), у вас заплановано:</b>\n`;
  if ((data.settings || {}).stickers !== 'off') text += `<i>${escHtml(phrase)}</i>\n`;
  if (tasks.length) {
    text += '\n📋 <b>Справи:</b>\n' + tasks.map(x => `• ${x.from ? escHtml(x.from) + (x.to ? '–' + escHtml(x.to) : '') + ' ' : ''}${escHtml(x.title)}`).join('\n') + '\n';
  }
  if (all.length) {
    text += '\n🍲 <b>Меню:</b>\n';
    for (const [k, label] of [['b', 'Сніданок'], ['l', 'Обід'], ['d', 'Вечеря']]) {
      if ((meals[k] || []).length) text += `${label}: ${meals[k].map(i => escHtml(i.n)).join(', ')}\n`;
    }
    const frozen = [...new Set(all.filter(i => i.p).map(i => i.n))];
    if (frozen.length) text += `\n🧊 Дістань заздалегідь заготовки для: ${frozen.map(escHtml).join(', ')}\n`;
  }
  if (debts.length) {
    text += '\n💸 <b>Завтра термін боргу:</b>\n' + debts.map(d => `• ${d.dir === 'owe' ? 'віддати' : 'має повернути'} ${escHtml(d.who)} — ${Math.round((d.amount - d.paid) * 100) / 100} ₴`).join('\n') + '\n';
  }
  return text;
}
async function sendReminder(env, user) {
  const text = await buildReminder(env, user.space);
  if (!text) return { sent: false, reason: 'На завтра нічого не заплановано — нагадувати нема про що' };
  const r = await tg(env, 'sendMessage', { chat_id: user.id, text, parse_mode: 'HTML', reply_markup: openButton(env) });
  return r.ok ? { sent: true } : { sent: false, reason: 'Бот не може написати. Відкрий чат з ботом і натисни Start.' };
}
async function runReminders(env) {
  await ensureSchema(env);
  const { h } = kyivParts();
  const { results } = await env.DB.prepare('SELECT * FROM users WHERE remind_on = 1 AND remind_hour = ?1').bind(h).all();
  for (const u of results) { try { await sendReminder(env, u); } catch (e) { console.log('reminder error', u.id, e); } }
  await env.DB.prepare('DELETE FROM invites WHERE expires < ?1').bind(Date.now()).run();
}

// ---------- спільний планер ----------
function randomCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(6));
  return [...b].map(x => abc[x % abc.length]).join('');
}
async function joinSpace(env, user, code) {
  code = String(code || '').trim().toUpperCase();
  const inv = await env.DB.prepare('SELECT * FROM invites WHERE code = ?1').bind(code).first();
  if (!inv || inv.expires < Date.now()) return { error: 'Код недійсний або застарів' };
  if (inv.space === user.id) return { error: 'Це твоє власне запрошення 🙂' };
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET space = ?1 WHERE id = ?2').bind(inv.space, user.id),
    env.DB.prepare('DELETE FROM invites WHERE code = ?1').bind(code)
  ]);
  const owner = await env.DB.prepare('SELECT name FROM users WHERE id = ?1').bind(inv.space).first();
  return { ok: true, ownerName: owner ? owner.name : '' };
}
async function meInfo(env, user) {
  const { results } = await env.DB.prepare('SELECT id, name FROM users WHERE space = ?1').bind(user.space).all();
  return { userId: user.id, space: user.space, remindOn: !!user.remind_on, remindHour: user.remind_hour, members: results };
}

// ---------- бот ----------
async function handleUpdate(env, upd) {
  const msg = upd.message;
  if (!msg || !msg.text || !msg.from) return;
  await ensureSchema(env);
  const user = await ensureUser(env, msg.from.id, msg.from.first_name);
  const text = msg.text.trim();
  if (text.startsWith('/start')) {
    const payload = text.split(/\s+/)[1] || '';
    if (payload.startsWith('j')) {
      const r = await joinSpace(env, user, payload.slice(1));
      await tg(env, 'sendMessage', {
        chat_id: msg.chat.id,
        text: r.ok ? `💛 Готово! Тепер у вас спільний планер${r.ownerName ? ' (власник — ' + r.ownerName + ')' : ''}. Відкривай:` : `😕 ${r.error}`,
        reply_markup: openButton(env)
      });
      return;
    }
    await tg(env, 'sendMessage', {
      chat_id: msg.chat.id,
      text: '👋 Привіт! Це планувальник дня, грошей і харчування.\n\nЩовечора я писатиму, що в тебе заплановано на завтра (час можна змінити в ⚙️ Налаштуваннях).\n\nНатисни кнопку, щоб відкрити:',
      reply_markup: openButton(env)
    });
  } else if (text === '/tomorrow') {
    const r = await sendReminder(env, user);
    if (!r.sent) await tg(env, 'sendMessage', { chat_id: msg.chat.id, text: r.reason });
  }
}

// ---------- маршрути ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    try {
      if (!env.DB) return json({ error: 'Не підʼєднана база D1 (змінна DB)' }, 500);
      if (!env.BOT_TOKEN) return json({ error: 'Не вказаний секрет BOT_TOKEN' }, 500);

      if (path === '/') return new Response('Планувальник: сервер працює ✅', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

      if (path === '/setup') {
        await ensureSchema(env);
        const secret = await webhookSecret(env.BOT_TOKEN);
        const r1 = await tg(env, 'setWebhook', { url: `${url.origin}/tg`, secret_token: secret, allowed_updates: ['message'] });
        await tg(env, 'setMyCommands', { commands: [{ command: 'start', description: 'Відкрити планувальник' }, { command: 'tomorrow', description: 'Що в мене на завтра?' }] });
        const me = await tg(env, 'getMe', {});
        return new Response(r1.ok ? `✅ Готово! Бот @${me.result && me.result.username} підключений до сервера.\nАдреса сервера для config.js:\n${url.origin}` : `❌ Помилка: ${JSON.stringify(r1)}`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }

      if (path === '/tg' && request.method === 'POST') {
        if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== await webhookSecret(env.BOT_TOKEN)) return new Response('forbidden', { status: 403 });
        await handleUpdate(env, await request.json());
        return new Response('ok');
      }

      // далі — запити із застосунку
      const tgUser = await verifyInitData(request.headers.get('X-Init-Data'), env.BOT_TOKEN);
      if (!tgUser) return json({ error: 'Не вдалося перевірити користувача Telegram' }, 401);
      await ensureSchema(env);
      const user = await ensureUser(env, tgUser.id, tgUser.first_name);
      const body = request.method === 'GET' ? {} : await request.json().catch(() => ({}));

      if (path === '/data' && request.method === 'GET') return json(await getSpaceData(env, user.space));
      if (path === '/data' && request.method === 'PUT') {
        const items = body.items || { [body.key]: body.value };
        const stmts = [];
        for (const [k, v] of Object.entries(items)) {
          if (!/^[A-Za-z0-9_\-]{1,64}$/.test(k)) return json({ error: 'Неправильний ключ' }, 400);
          if (v === null || v === undefined) { stmts.push(env.DB.prepare('DELETE FROM kv WHERE space = ?1 AND k = ?2').bind(user.space, k)); continue; }
          const s = JSON.stringify(v);
          if (s.length > MAX_VALUE) return json({ error: 'Занадто великий запис' }, 413);
          stmts.push(env.DB.prepare('INSERT INTO kv (space, k, v, updated) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(space, k) DO UPDATE SET v = excluded.v, updated = excluded.updated').bind(user.space, k, s, Date.now()));
        }
        if (stmts.length) await env.DB.batch(stmts);
        return json({ ok: true });
      }
      if (path === '/me') return json(await meInfo(env, user));
      if (path === '/prefs' && request.method === 'POST') {
        const on = body.remindOn ? 1 : 0;
        const hour = Math.min(23, Math.max(0, parseInt(body.remindHour, 10) || 0));
        await env.DB.prepare('UPDATE users SET remind_on = ?1, remind_hour = ?2 WHERE id = ?3').bind(on, hour, user.id).run();
        return json({ remindOn: !!on, remindHour: hour });
      }
      if (path === '/test-reminder' && request.method === 'POST') return json(await sendReminder(env, user));
      if (path === '/invite' && request.method === 'POST') {
        if (user.space !== user.id) return json({ error: 'Запрошувати може лише власник планера' }, 403);
        const code = randomCode();
        await env.DB.prepare('INSERT INTO invites (code, space, expires) VALUES (?1, ?2, ?3)').bind(code, user.space, Date.now() + 3 * 86400000).run();
        const me = await tg(env, 'getMe', {});
        const link = me.ok ? `https://t.me/${me.result.username}?start=j${code}` : '';
        return json({ code, link });
      }
      if (path === '/join' && request.method === 'POST') {
        const r = await joinSpace(env, user, body.code);
        return r.ok ? json(r) : json(r, 400);
      }
      if (path === '/leave' && request.method === 'POST') {
        await env.DB.prepare('UPDATE users SET space = id WHERE id = ?1').bind(user.id).run();
        return json({ ok: true });
      }
      if (path === '/kick' && request.method === 'POST') {
        if (user.space !== user.id) return json({ error: 'Прибирати людей може лише власник' }, 403);
        await env.DB.prepare('UPDATE users SET space = id WHERE id = ?1 AND space = ?2 AND id != ?2').bind(String(body.id), user.id).run();
        return json({ ok: true });
      }
      return json({ error: 'Not found' }, 404);
    } catch (e) {
      console.log(e);
      return json({ error: String(e.message || e) }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReminders(env));
  }
};
