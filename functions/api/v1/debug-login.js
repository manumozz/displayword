import { createSession, sessionCookie } from '../../_lib/session.js';

export async function onRequest({ env }) {
  try {
    // 1. Verify and make admin
    await env.DB.prepare(
      "UPDATE users SET email_verified = 1, is_admin = 1 WHERE email = 'test-reg@example.com'"
    ).run();

    // 2. Get user
    const user = await env.DB.prepare(
      "SELECT id FROM users WHERE email = 'test-reg@example.com'"
    ).first();

    if (!user) {
      return new Response(JSON.stringify({ error: "user_not_found" }), { status: 404 });
    }

    // 3. Create session
    const { id: sessionId, expires } = await createSession(env.DB, user.id);

    return new Response(JSON.stringify({ ok: true, sessionId, cookie: sessionCookie(sessionId, expires) }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': sessionCookie(sessionId, expires)
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
