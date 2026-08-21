/**
 * Cloudflare Pages Function — /releases/* proxy to R2
 *
 * Intercepts every request to /releases/stable/* and /releases/beta/*
 * and serves the file from the RELEASES_BUCKET R2 binding.
 *
 * Required setup in Cloudflare Pages dashboard:
 *   Settings → Functions → R2 bucket bindings
 *   Variable name: RELEASES_BUCKET
 *   R2 bucket:     displayword-releases-dw   ← canonical (№071); old displayword-releases retired
 *
 * Key layout in R2 (same as releases.displayword.com custom domain — NO "releases/" prefix):
 *   stable/releases.stable.json                         ← Velopack update feed
 *   stable/download.stable.json                         ← site download feed
 *   stable/DisplayWordApp-<ver>-stable-Setup.exe
 *   stable/DisplayWordApp-<ver>-stable-Portable.zip
 *   stable/DisplayWordApp-<ver>-stable-full.nupkg
 *   stable/DisplayWordApp-<ver>-stable-delta.nupkg
 *
 * URL /releases/stable/foo → R2 key stable/foo
 * (params.path is segments after /releases/)
 *
 * Caching rules:
 *   *.json                         → no-cache
 *   versioned *.exe/*.zip/*.nupkg  → immutable
 *   legacy unversioned assets      → max-age=300 (immutable only with version in name)
 */

export async function onRequest(context) {
  const { request, env, params } = context;
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  // params.path is an array of URL segments after /releases/
  // e.g. /releases/stable/releases.stable.json → ['stable', 'releases.stable.json']
  // Canonical bucket displayword-releases-dw keys start at channel (stable/…), no "releases/" prefix.
  const segments = params.path || [];
  const r2Key = segments.join('/');

  if (!env.RELEASES_BUCKET) {
    return new Response(
      JSON.stringify({ error: 'R2 bucket binding RELEASES_BUCKET is not configured.' }),
      { status: 503, headers: { 'content-type': 'application/json', ...corsHeaders() } }
    );
  }

  // #118 — счёт человеческих скачиваний (Setup/Portable). Страна и город из
  // request.cf (геолокация Cloudflare), IP не читается и не хранится.
  // Докачки не считаются: только запрос без Range либо первый кусок (bytes=0-).
  try {
    if (request.method === 'GET' && env.DB && /-(Setup\.exe|Portable\.zip)$/i.test(r2Key)) {
      const rangeHdr = request.headers.get('range');
      if (!rangeHdr || /^\s*bytes=0-/i.test(rangeHdr)) {
        const cf = request.cf || {};
        context.waitUntil(
          env.DB.prepare(
            'INSERT INTO download_log (id, ts, file, country, city) VALUES (?, ?, ?, ?, ?)',
          ).bind(
            crypto.randomUUID(),
            new Date().toISOString(),
            r2Key.split('/').pop(),
            cf.country || null,
            cf.city || null,
          ).run().catch(e => console.error('[dl-log]', e.message)),
        );
      }
    }
  } catch (e) { console.error('[dl-log]', e.message); }

  try {
    if (request.method === 'HEAD') {
      const head = await env.RELEASES_BUCKET.head(r2Key);
      if (!head) return notFound(r2Key);
      const totalSize = head.size;
      const rangeResult = resolveRange(request.headers.get('range'), totalSize);
      if (rangeResult && rangeResult.unsatisfiable) {
        return rangeNotSatisfiable(totalSize);
      }
      const headers = buildHeaders(head, r2Key);
      headers.set('accept-ranges', 'bytes');
      headers.set('content-length', String(
        rangeResult ? rangeResult.length : totalSize
      ));
      if (rangeResult) {
        headers.set(
          'content-range',
          `bytes ${rangeResult.offset}-${rangeResult.offset + rangeResult.length - 1}/${totalSize}`
        );
        return new Response(null, { status: 206, headers });
      }
      return new Response(null, { status: 200, headers });
    }

    // Need size first when a Range header is present
    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      const head = await env.RELEASES_BUCKET.head(r2Key);
      if (!head) return notFound(r2Key);
      const totalSize = head.size;
      const rangeResult = resolveRange(rangeHeader, totalSize);
      if (rangeResult === null) {
        // Unparseable Range → full body (per assignment)
        const object = await env.RELEASES_BUCKET.get(r2Key);
        if (!object) return notFound(r2Key);
        const headers = buildHeaders(object, r2Key);
        headers.set('accept-ranges', 'bytes');
        return new Response(object.body, { status: 200, headers });
      }
      if (rangeResult.unsatisfiable) {
        return rangeNotSatisfiable(totalSize);
      }
      const object = await env.RELEASES_BUCKET.get(r2Key, {
        range: { offset: rangeResult.offset, length: rangeResult.length },
      });
      if (!object) return notFound(r2Key);
      const headers = buildHeaders(object, r2Key);
      headers.set('accept-ranges', 'bytes');
      headers.set('content-length', String(rangeResult.length));
      headers.set(
        'content-range',
        `bytes ${rangeResult.offset}-${rangeResult.offset + rangeResult.length - 1}/${totalSize}`
      );
      return new Response(object.body, { status: 206, headers });
    }

    const object = await env.RELEASES_BUCKET.get(r2Key);
    if (!object) return notFound(r2Key);

    const headers = buildHeaders(object, r2Key);
    headers.set('accept-ranges', 'bytes');
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

function rangeNotSatisfiable(totalSize) {
  const headers = new Headers({
    'content-range': `bytes */${totalSize}`,
    'accept-ranges': 'bytes',
    'content-type': 'application/json',
    ...corsHeaders(),
  });
  return new Response(
    JSON.stringify({ error: 'Range Not Satisfiable' }),
    { status: 416, headers }
  );
}

/**
 * Parse `bytes=<start>-<end>` or `bytes=<start>-`.
 * Returns null if absent / unparseable (caller serves full 200).
 * Returns { unsatisfiable: true } if outside file size.
 * Returns { offset, length } for a valid range.
 */
function resolveRange(rangeHeader, totalSize) {
  if (!rangeHeader) return null;
  const m = /^\s*bytes=(\d+)-(\d*)\s*$/i.exec(rangeHeader);
  if (!m) return null; // unparseable → full body

  const start = parseInt(m[1], 10);
  if (Number.isNaN(start) || start < 0) return null;

  let end;
  if (m[2] === '') {
    end = totalSize - 1;
  } else {
    end = parseInt(m[2], 10);
    if (Number.isNaN(end)) return null;
  }

  if (totalSize === 0) return { unsatisfiable: true };
  if (start >= totalSize) return { unsatisfiable: true };
  if (end < start) return { unsatisfiable: true };

  end = Math.min(end, totalSize - 1);
  return { offset: start, length: end - start + 1 };
}

function isVersionedAsset(r2Key) {
  const name = r2Key.split('/').pop() || '';
  return /DisplayWordApp-\d+\.\d+\.\d+-/i.test(name);
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

  // Caching strategy — immutable ONLY for versioned names (Ч1/Ч2)
  // Set both Cache-Control and CDN-Cache-Control so Cloudflare edge does not
  // rewrite a short origin TTL into a longer default (observed max-age=14400).
  // *.json and Velopack RELEASES-* (no extension) must never be cached stale
  const baseName = (r2Key.split('/').pop() || '');
  if (r2Key.endsWith('.json') || baseName.startsWith('RELEASES')) {
    const cc = 'no-cache, no-store, must-revalidate';
    headers.set('cache-control', cc);
    headers.set('cdn-cache-control', cc);
    headers.set('pragma', 'no-cache');
    headers.set('expires', '0');
  } else if (isVersionedAsset(r2Key)) {
    const cc = 'public, max-age=31536000, immutable';
    headers.set('cache-control', cc);
    if (/-(Setup\.exe|Portable\.zip)$/i.test(baseName)) {
      // #118 — Setup/Portable не кэшируются на КРАЮ, чтобы каждый скачивающий
      // доходил до функции и попадал в счёт. Кэш браузера остаётся immutable.
      // Фидов, nupkg и прямой двери releases.displayword.com это не касается.
      headers.set('cdn-cache-control', 'no-store');
    } else {
      headers.set('cdn-cache-control', cc);
    }
  } else {
    // Legacy unversioned Setup.exe / Portable.zip etc.
    const cc = 'public, max-age=300';
    headers.set('cache-control', cc);
    headers.set('cdn-cache-control', cc);
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
    'access-control-expose-headers': 'Content-Length, Content-Range, ETag, Accept-Ranges',
  };
}

function guessMime(key) {
  const name = key.split('/').pop() || '';
  if (key.endsWith('.json'))  return 'application/json';
  if (name.startsWith('RELEASES')) return 'text/plain';
  if (key.endsWith('.exe'))   return 'application/vnd.microsoft.portable-executable';
  if (key.endsWith('.nupkg')) return 'application/octet-stream';
  if (key.endsWith('.zip'))   return 'application/zip';
  return 'application/octet-stream';
}
