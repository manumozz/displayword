/**
 * POST /api/v1/admin/applications/:id/approve
 *
 * Body (optional): { mode, activationLimit, expiresAt, ownerTitle, notes }
 *
 * Approves the application, generates a license key, stores it in D1,
 * links it to the user, and sends an approval email.
 */
import { requireAdmin } from '../../../../../_lib/admin.js';
import { json, preflight, cors } from '../../../../../_lib/response.js';
import { generateLicenseKey } from '../../../../../_lib/keygen.js';
import { sendEmail, approvedEmail } from '../../../../../_lib/email.js';

export async function onRequest({ request, env, params }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const { response } = await requireAdmin(env, request);
  if (response) return response;

  const appId = params.id;
  const app = await env.DB
    .prepare('SELECT * FROM applications WHERE id = ?')
    .bind(appId)
    .first();

  if (!app) return json({ error: 'not_found' }, 404);
  if (app.status !== 'pending') return json({ error: 'already_processed', status: app.status }, 409);

  let body = {};
  try { body = await request.json(); } catch { /* optional body */ }

  const mode            = body.mode ?? (app.edition === 'server' ? 'server' : 'offline');
  const activationLimit = body.activationLimit ?? (mode === 'server' ? 3 : undefined);
  const expiresAt       = body.expiresAt ?? null;
  const ownerTitle      = body.ownerTitle ?? null;
  const adminNotes      = body.notes ?? null;

  const keyId = crypto.randomUUID();

  // Generate signed license key
  const keyString = await generateLicenseKey(env, {
    keyId,
    communityName: app.community_name,
    mode,
    activationLimit,
    expiresAt,
    ownerTitle,
  });

  const now = new Date().toISOString();

  // Store key in D1
  await env.DB.prepare(`
    INSERT INTO license_keys
      (key_id, community_name, mode, activation_limit, owner_title, status, key_string, issued_at, expires_at, notes, user_id)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
  `).bind(
    keyId, app.community_name, mode,
    activationLimit ?? null, ownerTitle,
    keyString, now, expiresAt,
    adminNotes, app.user_id,
  ).run();

  // Update application status
  await env.DB.prepare(
    "UPDATE applications SET status = 'approved', notes = ? WHERE id = ?"
  ).bind(adminNotes, appId).run();

  // Get user email
  const user = await env.DB
    .prepare('SELECT email FROM users WHERE id = ?')
    .bind(app.user_id)
    .first();

  // Send approval email
  if (user?.email) {
    try {
      await sendEmail(env, approvedEmail(
        user.email,
        app.community_name,
        keyString,
        'https://displayword.com/download',
      ));
    } catch (e) {
      console.error('Approval email failed:', e.message);
    }
  }

  return json({ ok: true, keyId, keyString, mode }, 200, cors());
}
