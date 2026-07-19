/**
 * Cloudflare Pages Function — /releases/* proxy to R2
 *
 * Intercepts every request to /releases/stable/* and /releases/beta/*
 * and serves the file from the RELEASES_BUCKET R2 binding.
 *
 * Required setup in Cloudflare Pages dashboard:
 *   Settings → Functions → R2 bucket bindings
 *   Variable name: RELEASES_BUCKET
 *   R2 bucket:     displayword-releases
 *
 * File naming in R2 (mirrors URL path, without leading slash):
 *   releases/stable/releases.stable.json
 *   releases/stable/DisplayWordApp-Setup.exe
 *   releases/stable/DisplayWordApp-{version}-full.nupkg
 *   releases/stable/DisplayWordApp-{version}-delta.nupkg
 *   releases/stable/DisplayWordApp-{version}-Portable.zip
 *   releases/beta/releases.beta.json
 *   releases/beta/...
 *
 * Caching rules:
 *   *.json          → no-cache (auto-updater must always see latest manifest)
 *   *.exe *.nupkg *.zip → immutable (versioned, never changes once uploaded)
 */

export async function onRequest({ request, env, params }) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  // params.path is an array of URL segments after /releases/
  // e.g. /releases/stable/releases.stable.json → ['stable', 'releases.stable.json']
  const segments = params.path || [];
  const r2Key = 'releases/' + segments.join('/');

  if (!env.RELEASES_BUCKET) {
    return new Response(
      JSON.stringify({ error: 'R2 bucket binding RELEASES_BUCKET is not configured.' }),
      { status: 503, headers: { 'content-type': 'application/json', ...corsHeaders() } }
    );
  }

  try {
    if (request.method === 'HEAD') {
      const head = await env.RELEASES_BUCKET.head(r2Key);
      if (!head) return notFound(r2Key);
      const headers = buildHeaders(head, r2Key);
      return new Response(null, { status: 200, headers });
    }

    const object = await env.RELEASES_BUCKET.get(r2Key);
    if (!object) return notFound(r2Key);

    const headers = buildHeaders(object, r2Key);
    return new Response(object.body, { status: 200, headers });

  } catch (err) {
    console.error('R2 proxy error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error', detail: err.message }),
      { status: 500, headers: { 'content-type': 'application/json', ...corsHeaders() } }
    );
  }
}

/* ── helpers ─────────────────────────────────────────────── */

function notFound(key) {
  return new Response(
    JSON.stringify({ error: 'Not found', key }),
    { status: 404, headers: { 'content-type': 'application/json', ...corsHeaders() } }
  );
}

function buildHeaders(object, r2Key) {
  const headers = new Headers();

  // Copy metadata Cloudflare set when the file was uploaded
  if (object.writeHttpMetadata) {
    object.writeHttpMetadata(headers);
  }

  // ETag
  if (object.httpEtag) headers.set('etag', object.httpEtag);

  // Content-Type fallback (if not stored in R2 metadata)
  if (!headers.get('content-type')) {
    headers.set('content-type', guessMime(r2Key));
  }

  // Caching strategy
  if (r2Key.endsWith('.json')) {
    // Release manifest — never cache; auto-updater checks this on every launch
    headers.set('cache-control', 'no-cache, no-store, must-revalidate');
    headers.set('pragma', 'no-cache');
    headers.set('expires', '0');
  } else {
    // Versioned packages — content is immutable once uploaded
    headers.set('cache-control', 'public, max-age=31536000, immutable');
  }

  // CORS — allow Velopack updater and any origin
  Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));

  return headers;
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, HEAD, OPTIONS',
    'access-control-allow-headers': 'Content-Type, Range',
    'access-control-expose-headers': 'Content-Length, Content-Range, ETag',
  };
}

function guessMime(key) {
  if (key.endsWith('.json'))  return 'application/json';
  if (key.endsWith('.exe'))   return 'application/octet-stream';
  if (key.endsWith('.nupkg')) return 'application/zip';
  if (key.endsWith('.zip'))   return 'application/zip';
  return 'application/octet-stream';
}
