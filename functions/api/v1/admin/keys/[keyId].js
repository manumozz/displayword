/**
 * GET  /api/v1/admin/keys/:keyId — key details (no key_string), activations, recent log
 * POST /api/v1/admin/keys/:keyId — revoke or soft-delete
 * Body optional: { "action": "revoke" | "delete" }  (default: revoke)
 */
import { requireAdmin } from '../../../../_lib/admin.js';
import { json, preflight, cors } from '../../../../_lib/response.js';
import { logKeyAccess } from '../../../../_lib/keylog.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return preflight();

  const { response, session } = await requireAdmin(env, request);
  if (response) return response;

  const keyId = params?.keyId;
  if (!keyId || typeof keyId !== 'string')
    return json({ error: 'key_id_required' }, 400, cors());

  if (request.method === 'GET')
    return handleGet(env, keyId);

  if (request.method !== 'POST')
    return json({ error: 'method_not_allowed' }, 405, cors());

  return handlePost(request, env, session, keyId);
}

async function handleGet(env, keyId) {
  const key = await env.DB.prepare(`
    SELECT lk.key_id, lk.community_name, lk.mode, lk.activation_limit, lk.owner_title,
           lk.status, lk.issued_at, lk.expires_at, lk.notes, lk.user_id, lk.country,
           lk.recipient_email,
           u.email AS user_email,
           (SELECT COUNT(*) FROM activations ac WHERE ac.key_id = lk.key_id) AS activations
    FROM license_keys lk
    LEFT JOIN users u ON u.id = lk.user_id
    WHERE lk.key_id = ?
  `).bind(keyId).first();

  if (!key) return json({ error: 'not_found' }, 404, cors());
  if (key.status === 'deleted') return json({ error: 'not_found' }, 404, cors());

  const activations = await env.DB.prepare(`
    SELECT created_at, last_seen_at, country, fingerprint, app_version
    FROM activations
    WHERE key_id = ?
    ORDER BY COALESCE(last_seen_at, created_at) DESC
  `).bind(keyId).all();

  const accessLog = await env.DB.prepare(`
    SELECT action, recipient, admin_email, at
    FROM key_access_log
    WHERE key_id = ?
    ORDER BY at DESC
    LIMIT 10
  `).bind(keyId).all();

  return json({
    key: {
      key_id: key.key_id,
      community_name: key.community_name,
      mode: key.mode,
      activation_limit: key.activation_limit,
      owner_title: key.owner_title,
      status: key.status,
      issued_at: key.issued_at,
      expires_at: key.expires_at,
      notes: key.notes,
      user_id: key.user_id,
      country: key.country,
      recipient_email: key.recipient_email,
      user_email: key.user_email,
      activations: key.activations,
    },
    activations: activations.results ?? [],
    accessLog: accessLog.results ?? [],
  }, 200, cors());
}

async function handlePost(request, env, session, keyId) {
  let action = 'revoke';
  try {
    const body = await request.json();
    if (body?.action) action = String(body.action);
  } catch {
    /* пустое тело = revoke */
  }

  if (action !== 'revoke' && action !== 'delete')
    return json({ error: 'unsupported_action' }, 400, cors());

  const row = await env.DB.prepare(
    `SELECT key_id, status, community_name FROM license_keys WHERE key_id = ?`,
  ).bind(keyId).first();

  if (!row)
    return json({ error: 'not_found' }, 404, cors());

  if (action === 'delete') {
    if (row.status === 'deleted')
      return json({ ok: true, keyId, status: 'deleted', already: true }, 200, cors());

    await env.DB.prepare(
      `UPDATE license_keys SET status = 'deleted' WHERE key_id = ?`,
    ).bind(keyId).run();

    await logKeyAccess(env, request, { keyId, action: 'delete', session });
    return json({
      ok: true,
      keyId,
      status: 'deleted',
      communityName: row.community_name,
    }, 200, cors());
  }

  // revoke
  if (row.status === 'revoked')
    return json({ ok: true, keyId, status: 'revoked', already: true }, 200, cors());
  if (row.status === 'deleted')
    return json({ error: 'deleted' }, 410, cors());

  await env.DB.prepare(
    `UPDATE license_keys SET status = 'revoked' WHERE key_id = ?`,
  ).bind(keyId).run();

  await logKeyAccess(env, request, { keyId, action: 'revoke', session });
  return json({
    ok: true,
    keyId,
    status: 'revoked',
    communityName: row.community_name,
  }, 200, cors());
}
