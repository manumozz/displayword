/**
 * GET  /api/v1/admin/keys  — all keys with activation counts
 * POST /api/v1/admin/keys  — manually issue a key (no application required)
 */
import { requireAdmin } from '../../../../_lib/admin.js';
import { json, preflight, cors } from '../../../../_lib/response.js';
import { generateLicenseKey } from '../../../../_lib/keygen.js';
import { sendEmail, approvedEmail } from '../../../../_lib/email.js';
import { logKeyAccess } from '../../../../_lib/keylog.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();

  const { response, session } = await requireAdmin(env, request);
  if (response) return response;

  if (request.method === 'GET')  return handleGet(env);
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  return handlePost(request, env, session);
}

async function handleGet(env) {
  const rows = await env.DB.prepare(`
    SELECT lk.key_id, lk.community_name, lk.country, lk.mode, lk.activation_limit,
           lk.owner_title, lk.status, lk.issued_at, lk.expires_at, lk.notes,
           lk.recipient_email,
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

function normalizeExpiresAt(raw) {
  if (raw == null || raw === '') return { ok: true, value: null };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return { ok: false, error: 'invalid_expiry' };
  if (d.getTime() <= Date.now()) return { ok: false, error: 'invalid_expiry' };
  return { ok: true, value: d.toISOString() };
}

async function handlePost(request, env, session) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'invalid_json' }, 400); }

  const { communityName, mode, activationLimit, expiresAt, ownerTitle, notes, userId, email, country } = body;

  if (!communityName?.trim()) return json({ error: 'community_name_required' }, 400);
  if (!mode || !['server', 'offline'].includes(mode)) return json({ error: 'invalid_mode' }, 400);

  let countryCode = null;
  if (country != null && String(country).trim() !== '') {
    countryCode = String(country).trim();
    if (!/^[A-Z]{2}$/.test(countryCode)) return json({ error: 'invalid_country' }, 400);
  }

  const expiry = normalizeExpiresAt(expiresAt);
  if (!expiry.ok) return json({ error: expiry.error }, 400);
  if (mode === 'offline' && expiry.value != null)
    return json({ error: 'expiry_not_allowed_offline' }, 400);

  const recipientEmail = email?.trim() ? email.trim() : null;

  const keyId = crypto.randomUUID();
  // Server expiry lives only in D1 — do not embed expiresAt in the signed key string.
  const keyString = await generateLicenseKey(env, {
    keyId,
    communityName: communityName.trim(),
    mode,
    activationLimit,
    ownerTitle,
  });

  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO license_keys
      (key_id, community_name, mode, activation_limit, owner_title, status, key_string, issued_at, expires_at, notes, user_id, country, recipient_email)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    keyId, communityName.trim(), mode,
    activationLimit ?? null, ownerTitle ?? null,
    keyString, now, expiry.value,
    notes ?? null, userId ?? null, countryCode, recipientEmail,
  ).run();

  let emailed = false;
  if (recipientEmail) {
    try {
      await sendEmail(env, approvedEmail(recipientEmail, communityName.trim(), keyString, 'https://displayword.com/download'));
      emailed = true;
      await logKeyAccess(env, request, { keyId, action: 'issue_email', session, recipient: recipientEmail });
    } catch (e) {
      console.error('Manual key email failed:', e.message);
    }
  }
  return json({ ok: true, keyId, keyString, emailed }, 201, cors());
}
