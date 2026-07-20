/**
 * GET  /api/v1/admin/keys  — all keys with activation counts
 * POST /api/v1/admin/keys  — manually issue a key (no application required)
 */
import { requireAdmin } from '../../../../_lib/admin.js';
import { json, preflight, cors } from '../../../../_lib/response.js';
import { generateLicenseKey } from '../../../../_lib/keygen.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();

  const { response } = await requireAdmin(env, request);
  if (response) return response;

  if (request.method === 'GET')  return handleGet(env);
  if (request.method === 'POST') return handlePost(request, env);
  return json({ error: 'method_not_allowed' }, 405);
}

async function handleGet(env) {
  const rows = await env.DB.prepare(`
    SELECT lk.key_id, lk.community_name, lk.mode, lk.activation_limit,
           lk.owner_title, lk.status, lk.issued_at, lk.expires_at, lk.notes,
           COUNT(ac.id) AS activations,
           u.email AS user_email
    FROM license_keys lk
    LEFT JOIN activations ac ON ac.key_id = lk.key_id
    LEFT JOIN users u ON u.id = lk.user_id
    WHERE lk.status != 'deleted'
    GROUP BY lk.key_id
    ORDER BY lk.issued_at DESC
  `).all();
  return json(rows.results ?? [], 200, cors());
}

async function handlePost(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'invalid_json' }, 400); }

  const { communityName, mode, activationLimit, expiresAt, ownerTitle, notes, userId } = body;

  if (!communityName?.trim()) return json({ error: 'community_name_required' }, 400);
  if (!mode || !['server', 'offline'].includes(mode)) return json({ error: 'invalid_mode' }, 400);

  const keyId = crypto.randomUUID();
  const keyString = await generateLicenseKey(env, {
    keyId,
    communityName: communityName.trim(),
    mode,
    activationLimit,
    expiresAt,
    ownerTitle,
  });

  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO license_keys
      (key_id, community_name, mode, activation_limit, owner_title, status, key_string, issued_at, expires_at, notes, user_id)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
  `).bind(
    keyId, communityName.trim(), mode,
    activationLimit ?? null, ownerTitle ?? null,
    keyString, now, expiresAt ?? null,
    notes ?? null, userId ?? null,
  ).run();

  return json({ ok: true, keyId, keyString }, 201, cors());
}
