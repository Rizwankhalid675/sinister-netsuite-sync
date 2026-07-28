// Transactional email integration (SendGrid).
// Credentials come ONLY from environment secrets — never hardcode keys here.
// Set these in the Gadget environment (Settings -> Environment Variables) or
// via `ggt env set` for this environment:
//   SENDGRID_API_KEY   - SendGrid API key
//   MAIL_FROM_ADDRESS  - verified sender, e.g. no-reply@enshield.app
//   MAIL_FROM_NAME     - display name, e.g. "Enshield"
//   APP_BASE_URL       - public base URL used to build confirm/reset links

const SENDGRID_ENDPOINT = "https://api.sendgrid.com/v3/mail/send";

function getConfig() {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromAddress = process.env.MAIL_FROM_ADDRESS;
  const fromName = process.env.MAIL_FROM_NAME || "Enshield";
  const baseUrl = process.env.APP_BASE_URL;
  return { apiKey, fromAddress, fromName, baseUrl };
}

/** Low-level send. Throws on failure. No-ops with a warning if not configured (dev safety net). */
async function sendMail({ to, subject, html, text }) {
  const { apiKey, fromAddress, fromName } = getConfig();

  if (!apiKey || !fromAddress) {
    // eslint-disable-next-line no-console
    console.warn(
      `[mailer] SENDGRID_API_KEY/MAIL_FROM_ADDRESS not configured — skipping send to ${to}: "${subject}"`
    );
    return { skipped: true };
  }

  const res = await fetch(SENDGRID_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromAddress, name: fromName },
      subject,
      content: [
        { type: "text/plain", value: text || html.replace(/<[^>]+>/g, "") },
        { type: "text/html", value: html },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const error = new Error(
      `SendGrid send failed (${res.status}): ${body.slice(0, 500)}`
    );
    error.statusCode = 502;
    throw error;
  }

  return { skipped: false };
}

function buildUrl(path) {
  const { baseUrl } = getConfig();
  const base = (baseUrl || "").replace(/\/+$/, "");
  return `${base}${path}`;
}

/** Sent when a new appUser is created — contains temp password + email confirmation link. */
export async function sendWelcomeEmail({ to, name, tempPassword, confirmToken }) {
  const confirmUrl = buildUrl(
    `/confirm-email?token=${encodeURIComponent(confirmToken)}&email=${encodeURIComponent(to)}`
  );
  const subject = "Welcome to Enshield — confirm your email";
  const html = `
    <p>Hi ${escapeHtml(name || "")},</p>
    <p>An account has been created for you on the Enshield dashboard.</p>
    <p><strong>Temporary password:</strong> <code>${escapeHtml(tempPassword)}</code></p>
    <p>Please confirm your email address to activate your account:</p>
    <p><a href="${confirmUrl}">${confirmUrl}</a></p>
    <p>After confirming, you'll be asked to sign in with the temporary password above and
       immediately choose a new password before continuing.</p>
    <p>If you weren't expecting this, you can ignore this email.</p>
  `;
  return sendMail({ to, subject, html });
}

/** Sent for a self-service or admin-triggered password reset. */
export async function sendPasswordResetEmail({ to, name, resetToken }) {
  const resetUrl = buildUrl(
    `/reset-password?token=${encodeURIComponent(resetToken)}&email=${encodeURIComponent(to)}`
  );
  const subject = "Enshield password reset";
  const html = `
    <p>Hi ${escapeHtml(name || "")},</p>
    <p>We received a request to reset your Enshield dashboard password.</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>This link expires in 2 hours. If you didn't request this, you can ignore this email.</p>
  `;
  return sendMail({ to, subject, html });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
