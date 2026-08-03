/**
 * GET /api/v1/geo — country from Cloudflare CF-IPCountry (no session).
 * Returns only { country: 'DE' | null }.
 */
import { json, preflight, cors } from '../../_lib/response.js';

export async function onRequest({ request }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, cors());

  const raw = request.headers.get('CF-IPCountry');
  const country = (!raw || raw === 'XX' || raw === 'T1') ? null : raw;
  return json({ country }, 200, cors());
}
