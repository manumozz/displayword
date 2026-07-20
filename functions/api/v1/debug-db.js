import { hashPassword } from './auth/register.js'; // Wait! Register.js imports from crypto.js, but let's just import directly from crypto.js:
import { hashPassword, randomToken } from '../../_lib/crypto.js';

export async function onRequest({ env }) {
  try {
    const hash = await hashPassword('TestPass123');
    return new Response(JSON.stringify({ ok: true, hash, token: randomToken(32) }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
}
