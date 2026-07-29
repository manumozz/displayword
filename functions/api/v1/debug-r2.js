export async function onRequest({ env }) {
  try {
    if (env.RELEASES_BUCKET) {
      const list = await env.RELEASES_BUCKET.list();
      return new Response(JSON.stringify({
        ok: true,
        objects: list.objects.map(o => ({ key: o.key, size: o.size }))
      }), { headers: { 'content-type': 'application/json' } });
    } else {
      return new Response(JSON.stringify({ error: 'RELEASES_BUCKET is not bound.' }), { status: 503 });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
