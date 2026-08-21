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
      SELECT r.id, r.name, r.active, r.created_at,
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

  const id = crypto.randomUUID();
  await env.DB.prepare(
    'INSERT INTO representatives (id, name, active, created_at) VALUES (?, ?, 1, ?)',
  ).bind(id, name, new Date().toISOString()).run();

  return json({ ok: true, id, name }, 201);
}
