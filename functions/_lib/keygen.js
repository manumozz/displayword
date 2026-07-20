/**
 * License key generator.
 *
 * Format: DW1-<base64url(rawPayloadBytes)>-<base64url(ed25519sig)>
 * Signature is over raw payload bytes (not re-serialised JSON).
 * Requires LICENSE_SIGNING_KEY secret (Ed25519 JWK).
 */

export async function generateLicenseKey(env, {
  keyId,
  communityName,
  mode = 'server',
  activationLimit = 2,
  expiresAt = null,
  ownerTitle = null,
}) {
  const payload = {
    keyId,
    communityName,
    issuedAt: new Date().toISOString(),
    mode,
    activationLimit,
  };
  if (expiresAt)   payload.expiresAt   = expiresAt;
  if (ownerTitle)  payload.ownerTitle  = ownerTitle;

  const rawBytes  = new TextEncoder().encode(JSON.stringify(payload));
  const privateKey = await importLicensePrivateKey(env);
  const sigBytes  = await crypto.subtle.sign('Ed25519', privateKey, rawBytes);

  return `DW1-${b64url(rawBytes)}-${b64url(new Uint8Array(sigBytes))}`;
}

async function importLicensePrivateKey(env) {
  const jwk = JSON.parse(env.LICENSE_SIGNING_KEY);
  return crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']);
}

function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
