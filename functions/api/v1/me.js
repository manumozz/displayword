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
  // #124 — установка и обучение: до трёх человек. reps — полный список,
  // repId/repName оставлены для совместимости со старым интерфейсом (первый по алфавиту).
  const { results: repRows } = await db.prepare(`
    SELECT r.id, r.name
    FROM user_reps ur
    JOIN representatives r ON r.id = ur.rep_id
    WHERE ur.user_id = ?
    ORDER BY r.name
  `).bind(session.user_id).all();
  profile.reps    = repRows ?? [];
  profile.repId   = profile.reps[0]?.id   ?? null;
  profile.repName = profile.reps[0]?.name ?? null;
  const within30 = profile.createdAt
    ? (Date.now() - new Date(profile.createdAt).getTime()) < 30 * 86400000
    : false;
  profile.repCanChoose = profile.reps.length === 0 && within30;
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

  // #124 — установка и обучение: выбор ОДИН раз в течение 30 дней с регистрации,
  // до трёх человек; смена состава дальше — только администратором.
  if ('repIds' in body || 'repId' in body) {
    const MAX_REPS = 3;
    const rawReps = Array.isArray(body.repIds)
      ? body.repIds
      : (typeof body.repId === 'string' && body.repId.trim() !== '' ? [body.repId] : []);
    const wanted = [];
    for (const r of rawReps) {
      if (typeof r !== 'string') continue;
      const v = r.trim();
      if (v !== '' && !wanted.includes(v)) wanted.push(v);
    }
    if (wanted.length === 0) {
      // пустой список молча игнорируем: «снять» выбор пользователь не может
    } else if (wanted.length > MAX_REPS) {
      return json({ error: 'too_many_reps', message: 'Не больше трёх' }, 400);
    } else {
      const row = await env.DB.prepare(
        'SELECT created_at FROM users WHERE id = ?',
      ).bind(session.user_id).first();
      const have = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM user_reps WHERE user_id = ?',
      ).bind(session.user_id).first();
      const within30 = row?.created_at
        ? (Date.now() - new Date(row.created_at).getTime()) < 30 * 86400000
        : false;
      if ((have?.n ?? 0) > 0 || !within30) {
        return json({ error: 'rep_locked', message: 'Изменить может только администратор — напишите нам' }, 403);
      }
      for (const v of wanted) {
        const rep = await env.DB.prepare(
          'SELECT id FROM representatives WHERE id = ? AND active = 1',
        ).bind(v).first();
        if (!rep) {
          return json({ error: 'invalid_rep', message: 'Этого имени нет в списке' }, 400);
        }
      }
      const ts = new Date().toISOString();
      for (const v of wanted) {
        await env.DB.prepare(
          'INSERT OR IGNORE INTO user_reps (user_id, rep_id) VALUES (?, ?)',
        ).bind(session.user_id, v).run();
        await env.DB.prepare(
          'INSERT INTO rep_change_log (id, ts, admin_email, user_id, old_rep_id, new_rep_id, source) VALUES (?, ?, NULL, ?, NULL, ?, ?)',
        ).bind(crypto.randomUUID(), ts, session.user_id, v, 'cabinet').run();
      }
      updates.push('rep_id = ?');     binds.push(wanted[0]);
      updates.push('rep_set_at = ?'); binds.push(ts);
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
