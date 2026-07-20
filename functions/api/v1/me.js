import { getSession } from '../../_lib/session.js';
import { json, preflight } from '../../_lib/response.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();

  const session = await getSession(env.DB, request);
  if (!session) return json({ error: 'unauthorized' }, 401);

  return json({
    ok: true,
    email: session.email,
    isAdmin: !!session.is_admin,
    emailVerified: !!session.email_verified,
  });
}
