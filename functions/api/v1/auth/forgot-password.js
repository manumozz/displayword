import { randomToken } from '../../../_lib/crypto.js';
import { sendEmail, resetEmail } from '../../../_lib/email.js';
import { json, preflight } from '../../../_lib/response.js';

const TOKEN_TTL_MS = 3600 * 1000; // 1 hour

// Один и тот же ответ для существующего и несуществующего адреса —
// форма не должна работать проверялкой чужих email.
const OK_RESPONSE = {
  ok: true,
  message: 'Если этот адрес зарегистрирован, мы отправили на него письмо со ссылкой для смены пароля.',
};

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const { email } = body ?? {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'invalid_email', message: 'Неверный формат email' }, 400);
  }

  const normalEmail = email.toLowerCase().trim();

  const user = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ?',
  ).bind(normalEmail).first();

  if (!user) return json(OK_RESPONSE);

  const token   = randomToken(32);
  const now     = new Date().toISOString();
  const expires = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  // Действует только последняя ссылка — прежние токены сброса гасим.
  await env.DB.prepare(
    'DELETE FROM email_tokens WHERE user_id = ? AND type = ?',
  ).bind(user.id, 'reset').run();

  await env.DB.prepare(
    'INSERT INTO email_tokens (id, token, user_id, type, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(crypto.randomUUID(), token, user.id, 'reset', expires, now).run();

  const origin   = new URL(request.url).origin;
  const resetUrl = `${origin}/account/reset?token=${token}`;

  // Письмо — в фоне: время ответа не должно выдавать, существует ли адрес.
  context.waitUntil(
    sendEmail(env, resetEmail(normalEmail, resetUrl))
      .catch(e => console.error('[forgot-password] email send failed:', e.message)),
  );

  return json(OK_RESPONSE);
}
