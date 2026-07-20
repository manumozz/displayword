/**
 * Admin guard — returns session if user is admin, otherwise sends 401/403 response.
 * Usage:
 *   const { session, response } = await requireAdmin(env, request);
 *   if (response) return response;
 */
import { getSession } from './session.js';
import { json } from './response.js';

export async function requireAdmin(env, request) {
  const session = await getSession(env.DB, request);
  if (!session) return { response: json({ error: 'unauthorized' }, 401) };
  if (!session.isAdmin) return { response: json({ error: 'forbidden' }, 403) };
  return { session };
}
