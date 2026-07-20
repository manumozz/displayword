import { hashPassword, randomToken } from '../../../_lib/crypto.js';
import { sendEmail, verificationEmail } from '../../../_lib/email.js';
import { json, preflight } from '../../../_lib/response.js';

const TOKEN_TTL_MS = 24 * 3600 * 1000; // 24 hours

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const { email, password } = body ?? {};

  if (!email || !password) return json({ error: 'missing_fields' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'invalid_email', message: 'Неверный формат email' }, 400);
  }
  if (password.length < 8) {
    return json({ error: 'password_too_short', message: 'Минимум 8 символов' }, 400);
  }

  const normalEmail = email.toLowerCase().trim();

  const existing = await env.DB
    .prepare('SELECT id FROM users WHERE email = ?')
    .bind(normalEmail).first();

  if (existing) {
    return json({ error: 'email_taken', message: 'Email уже зарегистрирован' }, 409);
  }

  const id   = crypto.randomUUID();
  const hash = await hashPassword(password);
  const now  = new Date().toISOString();

  await env.DB.prepare(
    'INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)',
  ).bind(id, normalEmail, hash, now).run();

  // Email verification token
  const token   = randomToken(32);
  const expires = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  await env.DB.prepare(
    'INSERT INTO email_tokens (token, user_id, type, expires_at) VALUES (?, ?, ?, ?)',
  ).bind(token, id, 'verify', expires).run();

  // Send verification email (non-blocking on failure)
  const origin     = new URL(request.url).origin;
  const verifyUrl  = `${origin}/api/v1/auth/verify-email?token=${token}`;
  try {
    await sendEmail(env, verificationEmail(normalEmail, verifyUrl));
  } catch (e) {
    console.error('[register] email send failed:', e.message);
  }

  return json({
    ok: true,
    message: 'Проверьте почту — письмо с подтверждением отправлено',
  }, 201);
}
