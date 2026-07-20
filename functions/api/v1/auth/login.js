import { verifyPassword } from '../../../_lib/crypto.js';
import { createSession, sessionCookie } from '../../../_lib/session.js';
import { json, preflight } from '../../../_lib/response.js';

// Dummy hash used when user not found — keeps timing constant
const DUMMY_HASH = 'pbkdf2:sha256:600000:00000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const { email, password } = body ?? {};
  if (!email || !password) return json({ error: 'missing_fields' }, 400);

  const user = await env.DB.prepare(
    'SELECT id, password_hash, email_verified, is_admin FROM users WHERE email = ?',
  ).bind(email.toLowerCase().trim()).first();

  // Always run verifyPassword to avoid timing leak
  const hashToCheck = user?.password_hash ?? DUMMY_HASH;
  const valid = await verifyPassword(password, hashToCheck);

  if (!user || !valid) {
    return json({ error: 'invalid_credentials', message: 'Неверный email или пароль' }, 401);
  }

  if (!user.email_verified) {
    return json({ error: 'email_not_verified', message: 'Сначала подтвердите email' }, 403);
  }

  const { id: sessionId, expires } = await createSession(env.DB, user.id);

  return json({ ok: true, isAdmin: !!user.is_admin }, 200, {
    'set-cookie': sessionCookie(sessionId, expires),
  });
}
