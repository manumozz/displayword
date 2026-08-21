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
    'SELECT id, name, active FROM representatives WHERE id = ?',
  ).bind(repId).first();
  if (!rep) return json({ error: 'not_found' }, 404);

  if (request.method === 'GET') {
    const { results } = await env.DB.prepare(`
      SELECT email, display_name, community_name, city, country, rep_set_at
      FROM users WHERE rep_id = ?
      ORDER BY rep_set_at
    `).bind(repId).all();
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
  if (!updates.length) return json({ ok: true, rep });

  binds.push(repId);
  await env.DB.prepare(
    `UPDATE representatives SET ${updates.join(', ')} WHERE id = ?`,
  ).bind(...binds).run();

  return json({ ok: true });
}
