/**
 * GET /api/v1/my-communities — собрания, которые указали этого человека в поле
 * «Установка и обучение» (№129). Раздел открывается, только если почта аккаунта
 * совпала с почтой активной записи справочника. Денег здесь нет — появятся с оплатой.
 * Почты собраний наружу не отдаются: помогающему видно название, город, страну,
 * дату закрепления и имена соучастников.
 */
import { getSession } from '../../_lib/session.js';
import { json, preflight } from '../../_lib/response.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const session = await getSession(env.DB, request);
  if (!session) return json({ error: 'unauthorized' }, 401);

  const email = String(session.email || '').trim().toLowerCase();
  const rep = await env.DB.prepare(
    'SELECT id, name FROM representatives WHERE email = ? AND active = 1',
  ).bind(email).first();

  if (!rep) return json({ ok: true, isHelper: false, communities: [] });

  const { results } = await env.DB.prepare(`
    SELECT u.community_name, u.city, u.country, u.rep_set_at,
           (SELECT GROUP_CONCAT(r2.name, ', ')
              FROM user_reps ur2
              JOIN representatives r2 ON r2.id = ur2.rep_id
             WHERE ur2.user_id = u.id AND ur2.rep_id <> ?) AS partners
    FROM user_reps ur
    JOIN users u ON u.id = ur.user_id
    WHERE ur.rep_id = ?
    ORDER BY u.rep_set_at
  `).bind(rep.id, rep.id).all();

  return json({ ok: true, isHelper: true, name: rep.name, communities: results ?? [] });
}
