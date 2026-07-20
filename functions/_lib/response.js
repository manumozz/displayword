/** Shared HTTP response helpers. */

export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...cors(), ...extraHeaders },
  });
}

export function preflight() {
  return new Response(null, { status: 204, headers: cors() });
}

export function cors() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'Content-Type',
  };
}
