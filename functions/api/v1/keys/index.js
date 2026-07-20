/**
 * GET /api/v1/keys — list license keys linked to the current user's applications
 *
 * Returns keys where the user has an approved application with matching community_name,
 * plus activation counts from the activations table.
 */

import { getSession } from '../../../_lib/session.js';
import { json, preflight, cors } from '../../../_lib/response.js';

export async function onRequest(ctx) {
  if (ctx.request.method === 'OPTIONS') return preflight();
  if (ctx.request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

  const session = await getSession(ctx.env.DB, ctx.request);
  if (!session) return json({ error: 'unauthorized' }, 401);

  // Keys are linked via user_id stored on the key at issuance time (phase 5).
  // For now, join through approved applications: application.community_name = key.community_name
  // and application.user_id = session.user_id.
  const rows = await ctx.env.DB.prepare(
    `SELECT
       lk.key_id,
       lk.community_name,
       lk.mode,
       lk.activation_limit,
       lk.status,
       lk.key_string,
       lk.issued_at,
       lk.expires_at,
       lk.owner_title,
       COUNT(ac.id) AS activations
     FROM license_keys lk
     INNER JOIN applications ap
       ON ap.community_name = lk.community_name
      AND ap.user_id = ?
      AND ap.status = 'approved'
     LEFT JOIN activations ac
       ON ac.key_id = lk.key_id
     WHERE lk.status != 'deleted'
     GROUP BY lk.key_id
     ORDER BY lk.issued_at DESC`
  ).bind(session.user_id).all();

  return json(rows.results ?? [], 200, cors());
}
