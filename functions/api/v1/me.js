import { getSession } from '../../_lib/session.js';
import { json, preflight } from '../../_lib/response.js';

const MAX_NAME      = 80;
const MAX_COMMUNITY = 120;
const MAX_CITY      = 80;
const ROLES         = ['pastor', 'worship', 'operator', 'sound', 'other'];

// Whitelist: db column → JSON field name. Anything else in the body (email,
// password_hash, email_verified, is_admin, …) is silently ignored by virtue of
// not appearing here — the UPDATE statement only ever touches these columns.
const FIELDS = {
  display_name:   { key: 'name',      max: MAX_NAME },
  community_name: { key: 'community', max: MAX_COMMUNITY },
  city:           { key: 'city',      max: MAX_CITY },
  country:        { key: 'country' },
  role:           { key: 'role' },
};

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'GET' && request.method !== 'PATCH') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const session = await getSession(env.DB, request);
  if (!session) return json({ error: 'unauthorized' }, 401);

  if (request.method === 'PATCH') {
    return await patchProfile(request, env, session);
  }
  return json(await buildMeResponse(env.DB, session));
}

async function buildMeResponse(db, session) {
  const profile = await loadProfile(db, session.user_id);
  // #120 — имя представителя и окно однократного выбора
  profile.repName = null;
  if (profile.repId) {
    const rep = await db.prepare('SELECT name FROM representatives WHERE id = ?')
      .bind(profile.repId).first();
    profile.repName = rep?.name ?? null;
  }
  const within30 = profile.createdAt
    ? (Date.now() - new Date(profile.createdAt).getTime()) < 30 * 86400000
    : false;
  profile.repCanChoose = !profile.repId && within30;
  return {
    ok: true,
    email: session.email,
    isAdmin: !!session.is_admin,
    emailVerified: !!session.email_verified,
    profile,
  };
}

async function loadProfile(db, userId) {
  const row = await db.prepare(`
    SELECT display_name, community_name, city, country, role, role_custom,
           rep_id, rep_set_at, created_at, profile_updated_at
    FROM users WHERE id = ?
  `).bind(userId).first();
  return {
    name:       row?.display_name       ?? null,
    community:  row?.community_name     ?? null,
    city:       row?.city               ?? null,
    country:    row?.country            ?? null,
    role:       row?.role               ?? null,
    roleCustom: row?.role_custom        ?? null,
    repId:      row?.rep_id             ?? null,
    repSetAt:   row?.rep_set_at         ?? null,
    createdAt:  row?.created_at         ?? null,
    updatedAt:  row?.profile_updated_at ?? null,
  };
}

async function patchProfile(request, env, session) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'invalid_json' }, 400); }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: 'invalid_json' }, 400);
  }

  const updates = []; // SQL fragments like 'col = ?' or 'col = NULL'
  const binds   = []; // values for the '?' placeholders, in order
  const errors  = []; // collected, first one is returned if any

  for (const [col, def] of Object.entries(FIELDS)) {
    if (!(def.key in body)) continue; // field not sent — leave alone

    const raw = body[def.key];
    if (typeof raw !== 'string') {
      errors.push({ field: def.key, code: 'invalid_field', message: `Поле ${def.key} должно быть строкой` });
      continue;
    }
    const trimmed = raw.trim();

    if (def.key === 'country') {
      if (trimmed === '') { updates.push('country = NULL'); continue; }
      if (!/^[A-Za-z]{2}$/.test(trimmed)) {
        errors.push({ field: 'country', code: 'invalid_country', message: 'Код страны — две латинские буквы' });
        continue;
      }
      updates.push('country = ?');
      binds.push(trimmed.toUpperCase());
      continue;
    }

    if (def.key === 'role') {
      if (trimmed === '') { updates.push('role = NULL'); continue; }
      if (!ROLES.includes(trimmed)) {
        errors.push({ field: 'role', code: 'invalid_role', message: 'Допустимые роли: pastor, worship, operator, sound, other' });
        continue;
      }
      updates.push('role = ?');
      binds.push(trimmed);
      continue;
    }

    // name / community / city — bounded string
    if (trimmed.length > def.max) {
      errors.push({ field: def.key, code: 'too_long', message: `Максимум ${def.max} символов` });
      continue;
    }
    if (trimmed === '') {
      updates.push(`${col} = NULL`);
    } else {
      updates.push(`${col} = ?`);
      binds.push(trimmed);
    }
  }

  // #117 — вписка роли: хранится только при role = 'other'.
  const roleInBody = typeof body.role === 'string' ? body.role.trim() : undefined;
  if ('roleCustom' in body) {
    const raw = body.roleCustom;
    if (typeof raw !== 'string') {
      errors.push({ field: 'roleCustom', code: 'invalid_field', message: 'Поле roleCustom должно быть строкой' });
    } else {
      const trimmed = raw.trim();
      if (trimmed.length > 60) {
        errors.push({ field: 'roleCustom', code: 'too_long', message: 'Максимум 60 символов' });
      } else if (trimmed === '' || (roleInBody !== undefined && roleInBody !== 'other')) {
        updates.push('role_custom = NULL');
      } else {
        updates.push('role_custom = ?');
        binds.push(trimmed);
      }
    }
  } else if (roleInBody !== undefined && roleInBody !== 'other') {
    // роль сменили с «другое» на обычную, вписку не прислали — гасим осиротевшую
    updates.push('role_custom = NULL');
  }

  // #120 — представитель: пользователь может выбрать ОДИН раз в течение 30 дней
  // с регистрации; смена выбранного — только администратором (№121).
  if ('repId' in body) {
    const raw = body.repId;
    if (typeof raw !== 'string' || raw.trim() === '') {
      // пустое значение молча игнорируем: «снять» представителя нельзя
    } else {
      const row = await env.DB.prepare(
        'SELECT rep_id, created_at FROM users WHERE id = ?',
      ).bind(session.user_id).first();
      const within30 = row?.created_at
        ? (Date.now() - new Date(row.created_at).getTime()) < 30 * 86400000
        : false;
      if (row?.rep_id || !within30) {
        return json({ error: 'rep_locked', message: 'Изменить может только администратор — напишите нам' }, 403);
      }
      const rep = await env.DB.prepare(
        'SELECT id FROM representatives WHERE id = ? AND active = 1',
      ).bind(raw.trim()).first();
      if (!rep) {
        return json({ error: 'invalid_rep', message: 'Неизвестный представитель' }, 400);
      }
      const ts = new Date().toISOString();
      updates.push('rep_id = ?');    binds.push(rep.id);
      updates.push('rep_set_at = ?'); binds.push(ts);
      await env.DB.prepare(
        'INSERT INTO rep_change_log (id, ts, admin_email, user_id, old_rep_id, new_rep_id, source) VALUES (?, ?, NULL, ?, NULL, ?, ?)',
      ).bind(crypto.randomUUID(), ts, session.user_id, rep.id, 'cabinet').run();
    }
  }

  if (errors.length > 0) {
    return json({ error: errors[0].code, message: errors[0].message, errors }, 400);
  }

  if (updates.length === 0) {
    // Nothing to update — return current state so the client stays in sync.
    return json(await buildMeResponse(env.DB, session));
  }

  const now = new Date().toISOString();
  updates.push('profile_updated_at = ?');
  binds.push(now);
  binds.push(session.user_id);

  await env.DB.prepare(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`,
  ).bind(...binds).run();

  return json(await buildMeResponse(env.DB, session));
}
