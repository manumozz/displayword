import { hashPassword, randomToken } from '../../../_lib/crypto.js';
import { sendEmail, verificationEmail } from '../../../_lib/email.js';
import { json, preflight } from '../../../_lib/response.js';

const TOKEN_TTL_MS = 24 * 3600 * 1000; // 24 hours

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }

  const { email, password, name, repId } = body ?? {};

  if (!email || !password) return json({ error: 'missing_fields' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'invalid_email', message: 'Неверный формат email' }, 400);
  }
  if (password.length < 8) {
    return json({ error: 'password_too_short', message: 'Минимум 8 символов' }, 400);
  }

  const displayName = typeof name === 'string' ? name.trim() : '';
  if (!displayName)            return json({ error: 'missing_name', message: 'Укажите имя' }, 400);
  if (displayName.length > 80) return json({ error: 'name_too_long', message: 'Имя — до 80 символов' }, 400);

  // #124 — установка и обучение: до трёх человек; пустой список = «Никто, нашли сами».
  // Принимаем и новый repIds (массив), и старый repId (строка) — интерфейс переедет в №126.
  const MAX_REPS = 3;
  const rawReps = Array.isArray(body?.repIds)
    ? body.repIds
    : (typeof repId === 'string' && repId.trim() !== '' ? [repId] : []);
  const repIds = [];
  for (const r of rawReps) {
    if (typeof r !== 'string') continue;
    const v = r.trim();
    if (v !== '' && !repIds.includes(v)) repIds.push(v);
  }
  if (repIds.length > MAX_REPS) {
    return json({ error: 'too_many_reps', message: 'Не больше трёх' }, 400);
  }
  for (const v of repIds) {
    const rep = await env.DB.prepare(
      'SELECT id FROM representatives WHERE id = ? AND active = 1',
    ).bind(v).first();
    if (!rep) return json({ error: 'invalid_rep', message: 'Этого имени нет в списке' }, 400);
  }
  const repIdValue = repIds[0] ?? null;

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
    'INSERT INTO users (id, email, password_hash, display_name, rep_id, rep_set_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(id, normalEmail, hash, displayName, repIdValue, repIdValue ? now : null, now).run();

  for (const v of repIds) {
    await env.DB.prepare(
      'INSERT OR IGNORE INTO user_reps (user_id, rep_id) VALUES (?, ?)',
    ).bind(id, v).run();
    await env.DB.prepare(
      'INSERT INTO rep_change_log (id, ts, admin_email, user_id, old_rep_id, new_rep_id, source) VALUES (?, ?, NULL, ?, NULL, ?, ?)',
    ).bind(crypto.randomUUID(), now, id, v, 'registration').run();
  }

  // Email verification token
  const token   = randomToken(32);
  const expires = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  await env.DB.prepare(
    'INSERT INTO email_tokens (id, token, user_id, type, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(crypto.randomUUID(), token, id, 'verify', expires, now).run();

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
