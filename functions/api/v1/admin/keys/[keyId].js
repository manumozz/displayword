/**
 * POST /api/v1/admin/keys/:keyId — revoke (soft). Body optional: { "action": "revoke" }
 * Не удаляет строку: status = revoked. Activate уже отвергает revoked.
 */
import { requireAdmin } from '../../../../_lib/admin.js';
import { json, preflight, cors } from '../../../../_lib/response.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return preflight();

  const { response } = await requireAdmin(env, request);
  if (response) return response;

  if (request.method !== 'POST')
    return json({ error: 'method_not_allowed' }, 405, cors());

  const keyId = params?.keyId;
  if (!keyId || typeof keyId !== 'string')
    return json({ error: 'key_id_required' }, 400, cors());

  let action = 'revoke';
  try {
    const body = await request.json();
    if (body?.action) action = String(body.action);
  } catch {
    /* пустое тело = revoke */
  }

  if (action !== 'revoke')
    return json({ error: 'unsupported_action' }, 400, cors());

  const row = await env.DB.prepare(
    `SELECT key_id, status, community_name FROM license_keys WHERE key_id = ?`
  ).bind(keyId).first();

  if (!row)
    return json({ error: 'not_found' }, 404, cors());
  if (row.status === 'revoked')
    return json({ ok: true, keyId, status: 'revoked', already: true }, 200, cors());
  if (row.status === 'deleted')
    return json({ error: 'deleted' }, 410, cors());

  await env.DB.prepare(
    `UPDATE license_keys SET status = 'revoked' WHERE key_id = ?`
  ).bind(keyId).run();

  return json({
    ok: true,
    keyId,
    status: 'revoked',
    communityName: row.community_name,
  }, 200, cors());
}
