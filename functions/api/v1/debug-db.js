export async function onRequest({ env }) {
  if (!env.DB) {
    return new Response(JSON.stringify({ error: "no_db" }), { status: 500 });
  }
  try {
    const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    return new Response(JSON.stringify(tables.results), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
