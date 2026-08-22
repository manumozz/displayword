/**
 * GET /api/v1/keys — license keys of the current user: by owner (license_keys.user_id)
 * or, when the owner is not set, by recipient_email matching the verified account email.
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

  // #135 — ключи ищутся двумя способами: по владельцу (license_keys.user_id) и, если владелец
  // не проставлен, по совпадению почты получателя с почтой аккаунта. Таблица заявок больше
  // не используется (отменена в №101), join через неё раньше давал пустой список всем.
  // Совпадение по почте работает только для подтверждённой почты: иначе чужой ключ увидел бы
  // всякий, кто завёл аккаунт на чужой адрес и не открывал письмо.
  const emailForMatch = session.email_verified
    ? String(session.email || '').trim().toLowerCase()
    : null;

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
     LEFT JOIN activations ac
       ON ac.key_id = lk.key_id
     WHERE lk.status != 'deleted'
       AND (
             lk.user_id = ?
             OR (
                  lk.user_id IS NULL
                  AND ? IS NOT NULL
                  AND lower(lk.recipient_email) = ?
                )
           )
     GROUP BY lk.key_id
     ORDER BY lk.issued_at DESC`
  ).bind(session.user_id, emailForMatch, emailForMatch).all();

  return json(rows.results ?? [], 200, cors());
}
