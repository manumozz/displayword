/**
 * GET  /api/v1/admin/representatives — весь справочник + счётчик общин (№121)
 * POST /api/v1/admin/representatives — добавить представителя
 */
import { requireAdmin } from '../../../../_lib/admin.js';
import { json, preflight } from '../../../../_lib/response.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();

  const { response } = await requireAdmin(env, request);
  if (response) return response;

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(`
      SELECT r.id, r.name, r.email, r.active, r.created_at,
             (SELECT COUNT(*) FROM user_reps ur WHERE ur.rep_id = r.id) AS communities
      FROM representatives r
      ORDER BY r.active DESC, r.name
    `).all();
    return json({ ok: true, reps: results ?? [] });
  }

  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  if (!name)            return json({ error: 'missing_name', message: 'Укажите имя' }, 400);
  if (name.length > 80) return json({ error: 'name_too_long', message: 'Имя — до 80 символов' }, 400);

  // #130 — почта обязательна: по ней человек попадает в свой раздел кабинета,
  // запись без почты бесполезна. Хранится в нижнем регистре, повторов не допускаем.
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email === '') {
    return json({ error: 'missing_email', message: 'Укажите почту' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'invalid_email', message: 'Неверный формат email' }, 400);
  }
  if (email.length > 120) {
    return json({ error: 'email_too_long', message: 'Email — до 120 символов' }, 400);
  }
  const taken = await env.DB.prepare(
    'SELECT id FROM representatives WHERE email = ?',
  ).bind(email).first();
  if (taken) return json({ error: 'email_taken', message: 'Эта почта уже есть в списке' }, 409);

  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO representatives (id, name, email, active, created_at) VALUES (?, ?, ?, 1, ?)',
  ).bind(id, name, email || null, new Date().toISOString()).run();

  return json({ ok: true, id, name, email: email || null }, 201);
}
