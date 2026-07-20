/**
 * GET /api/v1/health
 * Smoke test — used by uptime monitoring.
 */
export async function onRequest() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
