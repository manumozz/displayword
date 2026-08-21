/**
 * GET /api/v1/representatives — активные представители для форм (№120).
 * Публичная ручка: отдаёт только id и имя, ничего больше.
 */
import { json, preflight } from '../../_lib/response.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const { results } = await env.DB.prepare(
    'SELECT id, name FROM representatives WHERE active = 1 ORDER BY name',
  ).all();

  return json({ ok: true, reps: results ?? [] });
}
