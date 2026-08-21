/**
 * GET /api/v1/admin/downloads — статистика скачиваний установщиков (№118).
 */
import { requireAdmin } from '../../../_lib/admin.js';
import { json, preflight } from '../../../_lib/response.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();

  const { response } = await requireAdmin(env, request);
  if (response) return response;

  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const now = Date.now();
  const d7  = new Date(now - 7  * 86400000).toISOString();
  const d30 = new Date(now - 30 * 86400000).toISOString();

  const totals = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN ts >= ?1 THEN 1 ELSE 0 END) AS last7,
            SUM(CASE WHEN ts >= ?2 THEN 1 ELSE 0 END) AS last30
     FROM download_log`,
  ).bind(d7, d30).first();

  const { results: byPlace } = await env.DB.prepare(
    `SELECT country, city, COUNT(*) AS n
     FROM download_log
     GROUP BY country, city
     ORDER BY n DESC
     LIMIT 100`,
  ).all();

  const { results: byFile } = await env.DB.prepare(
    `SELECT file, COUNT(*) AS n FROM download_log GROUP BY file ORDER BY n DESC`,
  ).all();

  return json({
    ok: true,
    total:  totals?.total  ?? 0,
    last7:  totals?.last7  ?? 0,
    last30: totals?.last30 ?? 0,
    byPlace: byPlace ?? [],
    byFile:  byFile  ?? [],
  });
}
