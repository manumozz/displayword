/**
 * Session management — D1-backed, httpOnly cookie.
 */

const SESSION_DAYS = 30;

/** Create a new session in D1 and return { id, expires }. */
export async function createSession(db, userId) {
  const id = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.prepare(
    'INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).bind(id, userId, now.toISOString(), expires.toISOString()).run();
  return { id, expires };
}

/**
 * Look up the session from the request cookie.
 * Returns null if missing, expired, or invalid.
 */
export async function getSession(db, request) {
  const sid = parseCookie(request.headers.get('Cookie') ?? '', 'dw_session');
  if (!sid) return null;

  const row = await db.prepare(`
    SELECT s.user_id, s.expires_at,
           u.email, u.is_admin, u.email_verified
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.id = ?
  `).bind(sid).first();

  if (!row) return null;

  if (new Date(row.expires_at) < new Date()) {
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run();
    return null;
  }

  return { ...row, sessionId: sid };
}

/** Delete the session referenced by the request cookie. */
export async function deleteSession(db, request) {
  const sid = parseCookie(request.headers.get('Cookie') ?? '', 'dw_session');
  if (sid) await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run();
}

/** Build the Set-Cookie header value for a new session. */
export function sessionCookie(id, expires) {
  return `dw_session=${id}; HttpOnly; Secure; SameSite=Strict; Path=/; Expires=${expires.toUTCString()}`;
}

/** Build a Set-Cookie header value that clears the session cookie. */
export function clearCookie() {
  return 'dw_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0';
}

// ── internal ─────────────────────────────────────────────────────────────────

function parseCookie(header, name) {
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1] ?? null;
}
