/**
 * POST /api/v1/admin/keys/:id/reveal — return one key_string (audited).
 * GET is rejected so the secret never lands in browser history / referrers.
 */
import { requireAdmin } from '../../../../../_lib/admin.js';
import { json, preflight, cors } from '../../../../../_lib/response.js';
import { logKeyAccess } from '../../../../../_lib/keylog.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors());

  const { response, session } = await requireAdmin(env, request);
  if (response) return response;

  const keyId = params?.id;
  if (!keyId) return json({ error: 'key_id_required' }, 400, cors());

  const row = await env.DB.prepare(
    'SELECT key_string, community_name, status FROM license_keys WHERE key_id = ?',
  ).bind(keyId).first();

  if (!row || row.status === 'deleted') {
    return json({ error: 'not_found' }, 404, cors());
  }

  await logKeyAccess(env, request, { keyId, action: 'reveal', session });
  return json({ ok: true, keyString: row.key_string }, 200, cors());
}
