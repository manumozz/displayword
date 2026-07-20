/**
 * GET  /api/v1/applications  — list user's applications
 * POST /api/v1/applications  — submit new application
 */

import { getSession } from '../../../_lib/session.js';
import { json, preflight, cors } from '../../../_lib/response.js';
import { sendEmail, newApplicationEmail } from '../../../_lib/email.js';

export async function onRequest(ctx) {
  if (ctx.request.method === 'OPTIONS') return preflight();

  const session = await getSession(ctx.env.DB, ctx.request);
  if (!session) return json({ error: 'unauthorized' }, 401);

  if (ctx.request.method === 'GET')  return handleGet(ctx, session);
  if (ctx.request.method === 'POST') return handlePost(ctx, session);

  return json({ error: 'method_not_allowed' }, 405);
}

// ── GET ──────────────────────────────────────────────────────────────────────

async function handleGet({ env }, session) {
  const rows = await env.DB.prepare(
    `SELECT id, community_name, city_country, contact_info, edition, members_count,
            status, notes, created_at
     FROM applications
     WHERE user_id = ?
     ORDER BY created_at DESC`
  ).bind(session.userId).all();

  return json(rows.results ?? [], 200, cors());
}

// ── POST ─────────────────────────────────────────────────────────────────────

async function handlePost({ env, request }, session) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'invalid_json' }, 400); }

  const { community_name, city_country, contact_info, edition, members_count, message } = body;

  // Validate required fields
  if (!community_name?.trim())  return json({ error: 'community_name_required' }, 400);
  if (!city_country?.trim())    return json({ error: 'city_country_required' }, 400);
  if (!edition || !['church', 'server'].includes(edition))
                                return json({ error: 'invalid_edition' }, 400);

  // Prevent duplicate pending application
  const existing = await env.DB.prepare(
    `SELECT id FROM applications
     WHERE user_id = ? AND community_name = ? AND status = 'pending'`
  ).bind(session.userId, community_name.trim()).first();

  if (existing) return json({ error: 'duplicate_pending' }, 409);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO applications
       (id, user_id, community_name, city_country, contact_info, edition, members_count,
        message, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).bind(
    id,
    session.userId,
    community_name.trim(),
    city_country.trim(),
    contact_info?.trim() ?? null,
    edition,
    members_count ? parseInt(members_count, 10) : null,
    message?.trim() ?? null,
    now,
  ).run();

  // Notify admin
  try {
    const adminEmail = env.ADMIN_EMAIL ?? 'dava.willart@gmail.com';
    const adminUrl   = `https://displayword.com/admin/applications/${id}`;
    await sendEmail(env, newApplicationEmail(
      adminEmail,
      `${community_name.trim()} (${city_country.trim()}, ${edition}, ${session.email})`,
      session.email,
      adminUrl,
    ));
  } catch (e) {
    // Email failure is non-critical — application already saved
    console.error('Admin notification failed:', e.message);
  }

  const result = await env.DB.prepare(
    `SELECT id, community_name, city_country, contact_info, edition, members_count,
            status, notes, created_at
     FROM applications WHERE id = ?`
  ).bind(id).first();

  return json(result, 201, cors());
}
