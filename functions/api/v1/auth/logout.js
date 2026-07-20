import { deleteSession, clearCookie } from '../../../_lib/session.js';
import { json, preflight } from '../../../_lib/response.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  await deleteSession(env.DB, request);
  return json({ ok: true }, 200, { 'set-cookie': clearCookie() });
}
