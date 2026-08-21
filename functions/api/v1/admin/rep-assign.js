/**
 * GET  /api/v1/admin/rep-assign?email=… — представитель общины + журнал правок (№121)
 * POST /api/v1/admin/rep-assign {email, repId} — проставить/сменить/снять (repId: '' = снять)
 * Каждая правка — строка в rep_change_log (admin_email из сессии, source='admin').
 */
import { requireAdmin } from '../../../_lib/admin.js';
import { json, preflight } from '../../../_lib/response.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();

  const { response, session } = await requireAdmin(env, request);
  if (response) return response;

  if (request.method === 'GET') {
    const email = (new URL(request.url).searchParams.get('email') || '').toLowerCase().trim();
    if (!email) return json({ error: 'missing_email' }, 400);
    const user = await env.DB.prepare(
      'SELECT id, email, display_name, community_name, rep_id, rep_set_at, created_at FROM users WHERE email = ?',
    ).bind(email).first();
    if (!user) return json({ error: 'user_not_found', message: 'Пользователь не найден' }, 404);
    let repName = null;
    if (user.rep_id) {
      const r = await env.DB.prepare('SELECT name FROM representatives WHERE id = ?').bind(user.rep_id).first();
      repName = r?.name ?? null;
    }
    const { results: log } = await env.DB.prepare(`
      SELECT l.ts, l.admin_email, l.source,
             (SELECT name FROM representatives WHERE id = l.old_rep_id) AS old_name,
             (SELECT name FROM representatives WHERE id = l.new_rep_id) AS new_name
      FROM rep_change_log l WHERE l.user_id = ? ORDER BY l.ts DESC LIMIT 50
    `).bind(user.id).all();
    return json({ ok: true, user: {
      email: user.email, name: user.display_name, community: user.community_name,
      repId: user.rep_id, repName, repSetAt: user.rep_set_at, createdAt: user.created_at,
    }, log: log ?? [] });
  }

  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : '';
  if (!email) return json({ error: 'missing_email' }, 400);

  const user = await env.DB.prepare(
    'SELECT id, rep_id FROM users WHERE email = ?',
  ).bind(email).first();
  if (!user) return json({ error: 'user_not_found', message: 'Пользователь не найден' }, 404);

  const rawRep = typeof body.repId === 'string' ? body.repId.trim() : '';
  let newRepId = null;
  if (rawRep !== '') {
    const rep = await env.DB.prepare(
      'SELECT id FROM representatives WHERE id = ?',
    ).bind(rawRep).first();
    if (!rep) return json({ error: 'invalid_rep', message: 'Этого имени нет в списке' }, 400);
    newRepId = rep.id;
  }

  if ((user.rep_id ?? null) === newRepId) {
    return json({ ok: true, unchanged: true });
  }

  const ts = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE users SET rep_id = ?, rep_set_at = ? WHERE id = ?',
  ).bind(newRepId, newRepId ? ts : null, user.id).run();

  await env.DB.prepare(
    'INSERT INTO rep_change_log (id, ts, admin_email, user_id, old_rep_id, new_rep_id, source) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(crypto.randomUUID(), ts, session.email, user.id, user.rep_id ?? null, newRepId, 'admin').run();

  return json({ ok: true });
}
