/**
 * POST /api/v1/admin/applications/:id/reject
 * Body: { reason }
 */
import { requireAdmin } from '../../../../../_lib/admin.js';
import { json, preflight, cors } from '../../../../../_lib/response.js';
import { sendEmail, rejectedEmail } from '../../../../../_lib/email.js';

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

  let reason = '';
  try { const b = await request.json(); reason = b.reason ?? ''; } catch { /* ok */ }

  await env.DB.prepare(
    "UPDATE applications SET status = 'rejected', notes = ? WHERE id = ?"
  ).bind(reason || null, appId).run();

  const user = await env.DB
    .prepare('SELECT email FROM users WHERE id = ?')
    .bind(app.user_id)
    .first();

  if (user?.email) {
    try {
      await sendEmail(env, rejectedEmail(user.email, app.community_name, reason));
    } catch (e) {
      console.error('Rejection email failed:', e.message);
    }
  }

  return json({ ok: true }, 200, cors());
}
