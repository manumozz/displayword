/**
 * POST /api/v1/subscribe — add email to Brevo list 2 (public, no session).
 * BREVO_API_KEY stays on the server; listIds are fixed here (not from the client).
 */
import { json, preflight, cors } from '../../_lib/response.js';

const LIST_ID = 2;

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const e = email.trim();
  if (!e || e.length > 254) return false;
  // Simple format check — not a full RFC validator
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflight();
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405, cors());

  if (!env.BREVO_API_KEY) {
    return json({ error: 'email_not_configured' }, 503, cors());
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid_email' }, 400, cors());
  }

  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!isValidEmail(email)) {
    return json({ error: 'invalid_email' }, 400, cors());
  }

  let res;
  try {
    res = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'api-key': env.BREVO_API_KEY,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        email,
        listIds: [LIST_ID],
        updateEnabled: true,
      }),
    });
  } catch (e) {
    console.error('Brevo subscribe fetch failed:', e && e.message ? e.message : e);
    return json({ error: 'upstream' }, 502, cors());
  }

  if (res.ok || res.status === 204) {
    return json({ ok: true }, 200, cors());
  }

  let upstreamText = '';
  let code = null;
  try {
    upstreamText = await res.text();
    const parsed = JSON.parse(upstreamText);
    code = parsed && parsed.code ? parsed.code : null;
  } catch {
    // keep raw text for logging
  }

  if (code === 'duplicate_parameter') {
    return json({ ok: true }, 200, cors());
  }

  console.error('Brevo subscribe upstream error:', res.status, upstreamText);
  return json({ error: 'upstream' }, 502, cors());
}
