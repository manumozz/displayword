/**
 * GET   /api/v1/admin/representatives/:id — общины этого представителя (№121)
 * PATCH /api/v1/admin/representatives/:id — переименовать / (де)активировать
 */
import { requireAdmin } from '../../../../_lib/admin.js';
import { json, preflight } from '../../../../_lib/response.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return preflight();

  const { response } = await requireAdmin(env, request);
  if (response) return response;

  const repId = params.id;
  const rep = await env.DB.prepare(
    'SELECT id, name, email, active FROM representatives WHERE id = ?',
  ).bind(repId).first();
  if (!rep) return json({ error: 'not_found' }, 404);

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(`
      SELECT u.email, u.display_name, u.community_name, u.city, u.country, u.rep_set_at,
             (SELECT GROUP_CONCAT(r2.name, ', ')
                FROM user_reps ur2
                JOIN representatives r2 ON r2.id = ur2.rep_id
               WHERE ur2.user_id = u.id AND ur2.rep_id <> ?) AS partners
      FROM user_reps ur
      JOIN users u ON u.id = ur.user_id
      WHERE ur.rep_id = ?
      ORDER BY u.rep_set_at
    `).bind(repId, repId).all();
    return json({ ok: true, rep, communities: results ?? [] });
  }

  if (request.method !== 'PATCH') return json({ error: 'method_not_allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const updates = [];
  const binds   = [];
  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name)            return json({ error: 'missing_name', message: 'Укажите имя' }, 400);
    if (name.length > 80) return json({ error: 'name_too_long', message: 'Имя — до 80 символов' }, 400);
    updates.push('name = ?'); binds.push(name);
  }
  if ('active' in body) {
    if (body.active !== 0 && body.active !== 1) {
      return json({ error: 'invalid_field', message: 'active — 0 или 1' }, 400);
    }
    updates.push('active = ?'); binds.push(body.active);
  }
  // #130 — почта обязательна: пустую не принимаем. Человека, который больше не помогает,
  // убирают из списка кнопкой «Убрать из списка», а не стиранием почты.
  if ('email' in body) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
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
      'SELECT id FROM representatives WHERE email = ? AND id <> ?',
    ).bind(email, repId).first();
    if (taken) return json({ error: 'email_taken', message: 'Эта почта уже есть в списке' }, 409);
    updates.push('email = ?'); binds.push(email);
  }
  if (!updates.length) return json({ ok: true, rep });

  binds.push(repId);
  await env.DB.prepare(
    `UPDATE representatives SET ${updates.join(', ')} WHERE id = ?`,
  ).bind(...binds).run();

  return json({ ok: true });
}
