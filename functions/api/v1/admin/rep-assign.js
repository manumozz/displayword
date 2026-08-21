/**
 * GET  /api/v1/admin/rep-assign?email=… — кто помогал собранию + журнал правок (№124)
 * POST /api/v1/admin/rep-assign {email, repIds} — задать состав (0…3 человека).
 * repIds: [] или '' — снять всех. Каждое добавление и удаление — строка в rep_change_log
 * (admin_email из сессии, source='admin').
 */
import { requireAdmin } from '../../../_lib/admin.js';
import { json, preflight } from '../../../_lib/response.js';

const MAX_REPS = 3;

async function currentReps(db, userId) {
  const { results } = await db.prepare(`
    SELECT r.id, r.name
    FROM user_reps ur
    JOIN representatives r ON r.id = ur.rep_id
    WHERE ur.user_id = ?
    ORDER BY r.name
  `).bind(userId).all();
  return results ?? [];
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();

  const { response, session } = await requireAdmin(env, request);
  if (response) return response;

  if (request.method === 'GET') {
    const email = (new URL(request.url).searchParams.get('email') || '').toLowerCase().trim();
    if (!email) return json({ error: 'missing_email' }, 400);
    const user = await env.DB.prepare(
      'SELECT id, email, display_name, community_name, rep_set_at, created_at FROM users WHERE email = ?',
    ).bind(email).first();
    if (!user) return json({ error: 'user_not_found', message: 'Пользователь не найден' }, 404);
    const reps = await currentReps(env.DB, user.id);
    const { results: log } = await env.DB.prepare(`
      SELECT l.ts, l.admin_email, l.source,
             (SELECT name FROM representatives WHERE id = l.old_rep_id) AS old_name,
             (SELECT name FROM representatives WHERE id = l.new_rep_id) AS new_name
      FROM rep_change_log l WHERE l.user_id = ? ORDER BY l.ts DESC LIMIT 50
    `).bind(user.id).all();
    return json({ ok: true, user: {
      email: user.email, name: user.display_name, community: user.community_name,
      reps,
      repId: reps[0]?.id ?? null, repName: reps[0]?.name ?? null,
      repSetAt: user.rep_set_at, createdAt: user.created_at,
    }, log: log ?? [] });
  }

  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const email = typeof body?.email === 'string' ? body.email.toLowerCase().trim() : '';
  if (!email) return json({ error: 'missing_email' }, 400);

  const user = await env.DB.prepare(
    'SELECT id, rep_set_at FROM users WHERE email = ?',
  ).bind(email).first();
  if (!user) return json({ error: 'user_not_found', message: 'Пользователь не найден' }, 404);

  const rawReps = Array.isArray(body.repIds)
    ? body.repIds
    : (typeof body.repId === 'string' && body.repId.trim() !== '' ? [body.repId] : []);
  const wanted = [];
  for (const r of rawReps) {
    if (typeof r !== 'string') continue;
    const v = r.trim();
    if (v !== '' && !wanted.includes(v)) wanted.push(v);
  }
  if (wanted.length > MAX_REPS) {
    return json({ error: 'too_many_reps', message: 'Не больше трёх' }, 400);
  }
  for (const v of wanted) {
    const rep = await env.DB.prepare(
      'SELECT id FROM representatives WHERE id = ?',
    ).bind(v).first();
    if (!rep) return json({ error: 'invalid_rep', message: 'Этого имени нет в списке' }, 400);
  }

  const before  = (await currentReps(env.DB, user.id)).map(r => r.id);
  const added   = wanted.filter(v => !before.includes(v));
  const removed = before.filter(v => !wanted.includes(v));

  if (added.length === 0 && removed.length === 0) {
    return json({ ok: true, unchanged: true });
  }

  const ts = new Date().toISOString();

  for (const v of removed) {
    await env.DB.prepare(
      'DELETE FROM user_reps WHERE user_id = ? AND rep_id = ?',
    ).bind(user.id, v).run();
    await env.DB.prepare(
      'INSERT INTO rep_change_log (id, ts, admin_email, user_id, old_rep_id, new_rep_id, source) VALUES (?, ?, ?, ?, ?, NULL, ?)',
    ).bind(crypto.randomUUID(), ts, session.email, user.id, v, 'admin').run();
  }
  for (const v of added) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO user_reps (user_id, rep_id) VALUES (?, ?)',
    ).bind(user.id, v).run();
    await env.DB.prepare(
      'INSERT INTO rep_change_log (id, ts, admin_email, user_id, old_rep_id, new_rep_id, source) VALUES (?, ?, ?, ?, NULL, ?, ?)',
    ).bind(crypto.randomUUID(), ts, session.email, user.id, v, 'admin').run();
  }

  // Дата закрепления — одна на собрание: ставится при первом непустом составе,
  // при правке состава не сдвигается, снимается только когда не осталось никого.
  const firstId = wanted[0] ?? null;
  let setAt = user.rep_set_at ?? null;
  if (wanted.length === 0)      setAt = null;
  else if (setAt === null)      setAt = ts;

  await env.DB.prepare(
    'UPDATE users SET rep_id = ?, rep_set_at = ? WHERE id = ?',
  ).bind(firstId, setAt, user.id).run();

  return json({ ok: true, added: added.length, removed: removed.length });
}
