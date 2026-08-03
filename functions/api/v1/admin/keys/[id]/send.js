/**
 * POST /api/v1/admin/keys/:id/send — resend license key by email (audited).
 * Body optional: { email }
 */
import { requireAdmin } from '../../../../../_lib/admin.js';
import { json, preflight, cors } from '../../../../../_lib/response.js';
import { sendEmail, approvedEmail } from '../../../../../_lib/email.js';
import { logKeyAccess } from '../../../../../_lib/keylog.js';

function isSimpleEmail(s) {
  const at = s.indexOf('@');
  return at > 0 && s.indexOf('.', at + 1) > at + 1;
}

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors());

  const { response, session } = await requireAdmin(env, request);
  if (response) return response;

  const keyId = params?.id;
  if (!keyId) return json({ error: 'key_id_required' }, 400, cors());

  let body = {};
  try { body = await request.json(); } catch { /* optional */ }

  const row = await env.DB.prepare(`
    SELECT lk.key_string, lk.community_name, u.email AS user_email
    FROM license_keys lk
    LEFT JOIN users u ON u.id = lk.user_id
    WHERE lk.key_id = ?
  `).bind(keyId).first();

  if (!row) return json({ error: 'not_found' }, 404, cors());

  const recipient = (body.email?.trim() || row.user_email || '').trim();
  if (!recipient) return json({ error: 'no_recipient' }, 400, cors());
  if (!isSimpleEmail(recipient)) return json({ error: 'invalid_email' }, 400, cors());

  try {
    await sendEmail(env, approvedEmail(
      recipient,
      row.community_name,
      row.key_string,
      'https://displayword.com/download',
    ));
  } catch (e) {
    return json({ error: 'send_failed', detail: e.message }, 502, cors());
  }

  await logKeyAccess(env, request, { keyId, action: 'resend', session, recipient });
  return json({ ok: true, sentTo: recipient }, 200, cors());
}
