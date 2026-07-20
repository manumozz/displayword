/**
 * Shared cryptographic helpers.
 * Uses Web Crypto API — no external dependencies.
 */

const PBKDF2_ITERS = 100_000; // Cloudflare Workers Web Crypto max

/**
 * Hash a password with PBKDF2-SHA256.
 * Returns a string: pbkdf2:sha256:100000:<saltHex>:<hashHex>
 */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERS },
    keyMaterial, 256,
  );
  return `pbkdf2:sha256:${PBKDF2_ITERS}:${toHex(salt)}:${toHex(new Uint8Array(bits))}`;
}

/**
 * Verify a password against a stored hash.
 * Constant-time comparison to prevent timing attacks.
 */
export async function verifyPassword(password, stored) {
  const parts = stored.split(':');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2') return false;
  const [, , itersStr, saltHex, storedHex] = parts;
  const salt = fromHex(saltHex);
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: parseInt(itersStr) },
    keyMaterial, 256,
  );
  const computed = toHex(new Uint8Array(bits));
  // Constant-time comparison
  if (computed.length !== storedHex.length) return false;
  let diff = 0;
  for (let i = 0; i < computed.length; i++) {
    diff |= computed.charCodeAt(i) ^ storedHex.charCodeAt(i);
  }
  return diff === 0;
}

/** Generate a cryptographically random hex token. */
export function randomToken(bytes = 32) {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

// ── internal helpers ─────────────────────────────────────────────────────────

function toHex(bytes) {
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  return new Uint8Array(hex.match(/../g).map(b => parseInt(b, 16)));
}
