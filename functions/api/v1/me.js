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
  return {
    ok: true,
    email: session.email,
    isAdmin: !!session.is_admin,
    emailVerified: !!session.email_verified,
    profile: await loadProfile(db, session.user_id),
  };
}

async function loadProfile(db, userId) {
  const row = await db.prepare(`
    SELECT display_name, community_name, city, country, role, role_custom, profile_updated_at
    FROM users WHERE id = ?
  `).bind(userId).first();
  return {
    name:       row?.display_name       ?? null,
    community:  row?.community_name     ?? null,
    city:       row?.city               ?? null,
    country:    row?.country            ?? null,
    role:       row?.role               ?? null,
    roleCustom: row?.role_custom        ?? null,
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
