import { getSession } from '../../../_lib/session.js';
import { hashPassword, verifyPassword } from '../../../_lib/crypto.js';
import { json, preflight } from '../../../_lib/response.js';

const MIN_LENGTH = 8;

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const session = await getSession(env.DB, request);
  if (!session) return json({ error: 'unauthorized' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  const { currentPassword, newPassword } = body ?? {};
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return json({ error: 'missing_fields', message: 'Укажите текущий и новый пароль' }, 400);
  }

  const row = await env.DB.prepare(
    'SELECT password_hash FROM users WHERE id = ?',
  ).bind(session.user_id).first();

  if (!row) {
    return json({ error: 'unauthorized' }, 401);
  }

  const currentOk = await verifyPassword(currentPassword, row.password_hash);
  if (!currentOk) {
    return json({ error: 'wrong_password', message: 'Текущий пароль неверен' }, 403);
  }

  if (newPassword.length < MIN_LENGTH) {
    return json({ error: 'password_too_short', message: 'Минимум 8 символов' }, 400);
  }

  // Reject "change to the same password" — must be a real change.
  if (await verifyPassword(newPassword, row.password_hash)) {
    return json({ error: 'password_unchanged', message: 'Новый пароль совпадает с текущим' }, 400);
  }

  const newHash = await hashPassword(newPassword);

  await env.DB.prepare(
    'UPDATE users SET password_hash = ? WHERE id = ?',
  ).bind(newHash, session.user_id).run();

  // Close all other sessions for this user. Keep the current one (sessionId)
  // so the user isn't kicked out of the tab they used to change the password.
  const closeRes = await env.DB.prepare(
    'DELETE FROM sessions WHERE user_id = ? AND id != ?',
  ).bind(session.user_id, session.sessionId).run();

  return json({
    ok: true,
    sessionsClosed: closeRes.meta?.changes ?? 0,
  });
}
