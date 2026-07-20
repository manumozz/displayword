export async function onRequest({ request, env }) {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return redirect('/account/login?error=missing_token');

  const row = await env.DB.prepare(
    'SELECT user_id, expires_at FROM email_tokens WHERE token = ? AND type = ?',
  ).bind(token, 'verify').first();

  if (!row) return redirect('/account/login?error=invalid_token');

  if (new Date(row.expires_at) < new Date()) {
    await env.DB.prepare('DELETE FROM email_tokens WHERE token = ?').bind(token).run();
    return redirect('/account/login?error=token_expired');
  }

  await env.DB.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').bind(row.user_id).run();
  await env.DB.prepare('DELETE FROM email_tokens WHERE token = ?').bind(token).run();

  return redirect('/account/login?verified=1');
}

function redirect(url) {
  return Response.redirect(url, 302);
}
