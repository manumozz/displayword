/**
 * Email sending via Brevo API (transactional).
 * Requires BREVO_API_KEY secret in Workers environment.
 */

const SENDER = { name: 'DisplayWord', email: 'noreply@displayword.com' };

/**
 * Send a transactional email via Brevo.
 * Logs and skips if BREVO_API_KEY is not configured.
 */
export async function sendEmail(env, { to, subject, html }) {
  if (!env.BREVO_API_KEY) {
    console.warn('[email] BREVO_API_KEY not set — skipping email to', to);
    return;
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Brevo ${res.status}: ${text}`);
  }
}

// ── templates ─────────────────────────────────────────────────────────────────

export function verificationEmail(to, verifyUrl) {
  return {
    to,
    subject: 'Подтвердите email — DisplayWord',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
        <h2 style="color:#4a90e2">DisplayWord</h2>
        <p>Здравствуйте,</p>
        <p>Подтвердите ваш адрес электронной почты, перейдя по ссылке:</p>
        <p style="margin:24px 0">
          <a href="${verifyUrl}"
             style="background:#4a90e2;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
            Подтвердить email
          </a>
        </p>
        <p style="color:#666;font-size:0.88rem">Ссылка действительна 24 часа.<br>
        Если вы не регистрировались на displayword.com — просто проигнорируйте это письмо.</p>
      </div>
    `,
  };
}

export function approvedEmail(to, communityName, keyString, downloadUrl) {
  return {
    to,
    subject: 'Ваш ключ DisplayWord готов',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
        <h2 style="color:#4a90e2">DisplayWord</h2>
        <p>Здравствуйте,</p>
        <p>Заявка для общины <strong>${communityName}</strong> одобрена.</p>
        <p>Ваш лицензионный ключ:</p>
        <pre style="background:#f4f7fc;padding:16px;border-radius:8px;font-size:0.85rem;word-break:break-all">${keyString}</pre>
        <p style="margin:24px 0">
          <a href="${downloadUrl}"
             style="background:#4a90e2;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
            Скачать DisplayWord
          </a>
        </p>
        <p style="color:#666;font-size:0.88rem">Ключ также доступен в вашем кабинете на displayword.com/account</p>
      </div>
    `,
  };
}

export function rejectedEmail(to, communityName, reason) {
  return {
    to,
    subject: 'Заявка DisplayWord — статус обновлён',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
        <h2 style="color:#4a90e2">DisplayWord</h2>
        <p>Здравствуйте,</p>
        <p>Заявка для общины <strong>${communityName}</strong> отклонена.</p>
        ${reason ? `<p>Причина: ${reason}</p>` : ''}
        <p>Если у вас есть вопросы — напишите нам через сайт displayword.com.</p>
      </div>
    `,
  };
}

export function newApplicationEmail(to, communityName, contactPerson, adminUrl) {
  return {
    to,
    subject: `Новая заявка: ${communityName}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
        <h2 style="color:#4a90e2">DisplayWord — новая заявка</h2>
        <p>Община: <strong>${communityName}</strong></p>
        <p>Контактное лицо: ${contactPerson}</p>
        <p style="margin:24px 0">
          <a href="${adminUrl}"
             style="background:#f0a500;color:#0f1b2d;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600">
            Открыть в админке
          </a>
        </p>
      </div>
    `,
  };
}
