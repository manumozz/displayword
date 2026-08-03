/**
 * Audit log for admin key reveal / email actions.
 * Table may be missing until the author applies the D1 migration — never throw.
 */
export async function logKeyAccess(env, request, { keyId, action, session, recipient }) {
  try {
    await env.DB.prepare(`
      INSERT INTO key_access_log (key_id, action, admin_user_id, admin_email, recipient, ip, at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      keyId, action,
      session?.user_id ?? null, session?.email ?? null,
      recipient ?? null,
      request.headers.get('CF-Connecting-IP') ?? null,
      new Date().toISOString(),
    ).run();
  } catch (e) {
    console.error('key_access_log failed:', e.message);
  }
}
