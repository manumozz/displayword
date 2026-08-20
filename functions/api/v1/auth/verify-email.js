export async function onRequest({ request, env }) {
  try {
    const token = new URL(request.url).searchParams.get('token');
    if (!token) return redirect(request, '/account/login?error=missing_token');

    const row = await env.DB.prepare(
      'SELECT user_id, expires_at FROM email_tokens WHERE token = ? AND type = ?',
    ).bind(token, 'verify').first();

    if (!row) return redirect(request, '/account/login?error=invalid_token');

    if (new Date(row.expires_at) < new Date()) {
      await env.DB.prepare('DELETE FROM email_tokens WHERE token = ?').bind(token).run();
      return redirect(request, '/account/login?error=token_expired');
    }

    await env.DB.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').bind(row.user_id).run();
    await env.DB.prepare('DELETE FROM email_tokens WHERE token = ?').bind(token).run();

    return redirect(request, '/account/login?verified=1');
  } catch (e) {
    console.error('[verify-email]', e);
    return redirect(request, '/account/login?error=server');
  }
}

function redirect(request, path) {
  return Response.redirect(new URL(path, request.url).toString(), 302);
}
