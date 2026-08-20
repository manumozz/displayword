import { hashPassword } from '../../../_lib/crypto.js';
import { json, preflight } from '../../../_lib/response.js';

const MIN_LENGTH = 8;

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const { token, newPassword } = body ?? {};
  if (typeof token !== 'string' || !token || typeof newPassword !== 'string') {
    return json({ error: 'missing_fields', message: 'Не хватает данных' }, 400);
  }
  if (newPassword.length < MIN_LENGTH) {
    return json({ error: 'password_too_short', message: 'Минимум 8 символов' }, 400);
  }

  const row = await env.DB.prepare(
    'SELECT user_id, expires_at FROM email_tokens WHERE token = ? AND type = ?',
  ).bind(token, 'reset').first();

  if (!row) {
    return json({ error: 'invalid_token', message: 'Ссылка недействительна. Запросите новую.' }, 400);
  }
  if (new Date(row.expires_at) < new Date()) {
    await env.DB.prepare('DELETE FROM email_tokens WHERE token = ?').bind(token).run();
    return json({ error: 'token_expired', message: 'Ссылка истекла. Запросите новую.' }, 400);
  }

  const newHash = await hashPassword(newPassword);

  // Смена пароля + подтверждение email (решение автора 20.08.2026:
  // клик по ссылке из письма доказывает владение ящиком).
  await env.DB.prepare(
    'UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?',
  ).bind(newHash, row.user_id).run();

  // Токен одноразовый; гасим все токены сброса этого пользователя.
  await env.DB.prepare(
    'DELETE FROM email_tokens WHERE user_id = ? AND type = ?',
  ).bind(row.user_id, 'reset').run();

  // Закрыть ВСЕ сессии: пароль сбрасывают в том числе потому,
  // что им мог завладеть чужой.
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id).run();

  return json({ ok: true });
}
