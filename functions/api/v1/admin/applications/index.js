/**
 * GET /api/v1/admin/applications  — list all applications (admin only)
 * Query params: ?status=pending|approved|rejected  (default: all)
 */
import { requireAdmin } from '../../../../_lib/admin.js';
import { json, preflight, cors } from '../../../../_lib/response.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();

  const { response } = await requireAdmin(env, request);
  if (response) return response;

  const url    = new URL(request.url);
  const status = url.searchParams.get('status');

  let query = `
    SELECT a.id, a.community_name, a.city_country, a.contact_info,
           a.edition, a.members_count, a.message, a.status, a.notes,
           a.created_at, u.email AS user_email
    FROM applications a
    JOIN users u ON u.id = a.user_id
  `;
  const params = [];
  if (status) { query += ' WHERE a.status = ?'; params.push(status); }
  query += ' ORDER BY a.created_at DESC';

  const rows = await env.DB.prepare(query).bind(...params).all();
  return json(rows.results ?? [], 200, cors());
}
