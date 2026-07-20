/**
 * POST /api/v1/activate
 *
 * Body: { key, fingerprint, appVersion }
 *
 * Key format: DW1-<base64url(rawPayloadBytes)>-<base64url(signature)>
 * Parsing rule: signature = last 86 chars (Ed25519 sig = 64 bytes = 86 base64url chars)
 *               payload   = key.slice(4, -(86 + 1))  — skip "DW1-" prefix and "-<sig>"
 * Signature is over raw payload bytes, NOT re-serialised JSON.
 *
 * Required bindings (Cloudflare Pages → Settings):
 *   LICENSE_SIGNING_KEY  — Ed25519 JWK (private) for verifying DW1 key signatures
 *   TOKEN_SIGNING_KEY    — Ed25519 JWK (private) for signing activation tokens
 *   DB                   — D1 database (displayword-db)
 *
 * Activation token format: DWT-<base64url(rawPayloadBytes)>-<base64url(signature)>
 * Token payload: { keyId, fingerprint, issuedAt, ttlDays: 14 }
 */

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }

  const { key, fingerprint, appVersion } = body ?? {};

  if (!key || !fingerprint) {
    return jsonResponse({ error: 'missing_fields', message: 'key и fingerprint обязательны' }, 400);
  }

  // ── Parse key ─────────────────────────────────────────────────────────────
  // Format: DW1-<payloadB64url>-<sig86chars>
  // Do NOT split by '-' — base64url payload may contain '-'
  if (!key.startsWith('DW1-') || key.length < 4 + 1 + 86 + 1) {
    return jsonResponse({ error: 'invalid_key', message: 'Ключ недействителен' }, 403);
  }

  const sigB64url     = key.slice(-86);
  const payloadB64url = key.slice(4, -(86 + 1)); // after "DW1-", before "-<sig>"

  let rawPayloadBytes, payload;
  try {
    rawPayloadBytes = b64urlDecode(payloadB64url);
    payload = JSON.parse(new TextDecoder().decode(rawPayloadBytes));
  } catch {
    return jsonResponse({ error: 'invalid_key', message: 'Ключ недействителен' }, 403);
  }

  // ── Verify Ed25519 signature ──────────────────────────────────────────────
  let licensePublicKey;
  try {
    licensePublicKey = await importLicensePublicKey(env);
  } catch {
    return jsonResponse({ error: 'server_error', message: 'Ошибка конфигурации сервера' }, 503);
  }

  let valid = false;
  try {
    valid = await crypto.subtle.verify(
      'Ed25519',
      licensePublicKey,
      b64urlDecode(sigB64url),
      rawPayloadBytes,   // sign/verify over raw bytes, not JSON string
    );
  } catch { /* valid stays false */ }

  if (!valid) {
    return jsonResponse({ error: 'invalid_key', message: 'Ключ недействителен' }, 403);
  }

  // ── Payload fields ────────────────────────────────────────────────────────
  const { keyId, mode, activationLimit, expiresAt } = payload;

  if (!keyId || !mode) {
    return jsonResponse({ error: 'invalid_key', message: 'Ключ недействителен' }, 403);
  }

  // Check expiry (optional field)
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return jsonResponse({ error: 'key_expired', message: 'Срок действия ключа истёк' }, 403);
  }

  // ── DB check ──────────────────────────────────────────────────────────────
  if (!env.DB) {
    return jsonResponse({ error: 'db_unavailable' }, 503);
  }

  const row = await env.DB
    .prepare('SELECT status, activation_limit FROM license_keys WHERE key_id = ?')
    .bind(keyId)
    .first();

  if (!row || row.status === 'revoked') {
    return jsonResponse({
      error: 'invalid_key',
      message: 'Ключ недействителен или отозван. Обратитесь на displayword.com',
    }, 403);
  }

  // ── Offline mode: signature verified, key active — done ───────────────────
  if (mode === 'offline') {
    return jsonResponse({ ok: true, mode: 'offline' }, 200);
  }

  // ── Server mode: activation counter ──────────────────────────────────────
  const limit = row.activation_limit ?? activationLimit ?? 2;
  const now = new Date().toISOString();

  const existing = await env.DB
    .prepare('SELECT id FROM activations WHERE key_id = ? AND fingerprint = ?')
    .bind(keyId, fingerprint)
    .first();

  if (existing) {
    // Known device — refresh last_seen, re-issue token
    await env.DB
      .prepare('UPDATE activations SET last_seen = ?, app_version = ? WHERE key_id = ? AND fingerprint = ?')
      .bind(now, appVersion ?? null, keyId, fingerprint)
      .run();
  } else {
    // New device — check limit
    const { count } = await env.DB
      .prepare('SELECT COUNT(*) AS count FROM activations WHERE key_id = ?')
      .bind(keyId)
      .first();

    if (count >= limit) {
      return jsonResponse({
        error: 'activation_limit_reached',
        message: `Достигнут лимит активаций (${limit}). Обратитесь на displayword.com`,
      }, 403);
    }

    await env.DB
      .prepare('INSERT INTO activations (id, key_id, fingerprint, first_seen, last_seen, app_version) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), keyId, fingerprint, now, now, appVersion ?? null)
      .run();
  }

  // ── Issue signed activation token ─────────────────────────────────────────
  const tokenPayload = { keyId, fingerprint, issuedAt: now, ttlDays: 14 };
  const tokenPayloadBytes = new TextEncoder().encode(JSON.stringify(tokenPayload));

  let tokenPrivateKey;
  try {
    tokenPrivateKey = await importTokenPrivateKey(env);
  } catch {
    return jsonResponse({ error: 'server_error' }, 503);
  }

  const tokenSigBytes  = await crypto.subtle.sign('Ed25519', tokenPrivateKey, tokenPayloadBytes);
  const signedToken = `DWT-${b64urlEncode(tokenPayloadBytes)}-${b64urlEncode(new Uint8Array(tokenSigBytes))}`;

  return jsonResponse({ ok: true, signedToken }, 200);
}

/* ── crypto helpers ─────────────────────────────────────────────────────── */

function b64urlDecode(str) {
  const padded = str + '==='.slice((str.length + 3) % 4);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function b64urlEncode(bytes) {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

/** Extract public key from private JWK stored in LICENSE_SIGNING_KEY secret */
async function importLicensePublicKey(env) {
  const jwk = JSON.parse(env.LICENSE_SIGNING_KEY);
  // Use only the public part (x) for verification
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'OKP', crv: 'Ed25519', x: jwk.x },
    { name: 'Ed25519' },
    false,
    ['verify'],
  );
}

/** Import private key from TOKEN_SIGNING_KEY secret for signing tokens */
async function importTokenPrivateKey(env) {
  const jwk = JSON.parse(env.TOKEN_SIGNING_KEY);
  return crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'Ed25519' },
    false,
    ['sign'],
  );
}

/* ── response helpers ───────────────────────────────────────────────────── */

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type',
  };
}
