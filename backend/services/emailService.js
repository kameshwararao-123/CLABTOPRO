import nodemailer from "nodemailer";

const createTransporter = () => {
  const host = process.env.SMTP_HOST;
  const service = process.env.EMAIL_SERVICE;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

  if (!user || !pass || (!host && !service)) {
    return null;
  }

  if (service) {
    return nodemailer.createTransport({
      service,
      auth: { user, pass },
    });
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
};

/**
 * Send a password reset email containing the reset link.
 * Returns { sent: true } when delivered via configured SMTP/email service,
 * or { sent: false, reason: "SMTP_NOT_CONFIGURED" } when mail credentials are not set.
 */
export const sendPasswordResetEmail = async ({ to, username, resetUrl }) => {
  const transporter = createTransporter();
  if (!transporter) {
    return { sent: false, reason: "SMTP_NOT_CONFIGURED" };
  }

  const fromAddress =
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    process.env.EMAIL_USER ||
    "CLABTOPRO <no-reply@clabtopro.local>";

  const greetingName = username || "Student";

  await transporter.sendMail({
    from: `"CLABTOPRO" <${fromAddress}>`,
    to,
    subject: "Reset Your CLABTOPRO Password",
    text: [
      `Hi ${greetingName},`,
      "",
      "We received a request to reset your CLABTOPRO password.",
      `Click the link below to set a new password (valid for 15 minutes):`,
      resetUrl,
      "",
      "If you did not request this, you can safely ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;">
        <h2 style="color: #4f46e5; margin-bottom: 12px;">CLABTOPRO Password Reset</h2>
        <p>Hi ${greetingName},</p>
        <p>We received a request to reset your password. Click the button below to choose a new password. This link is valid for <strong>15 minutes</strong>.</p>
        <p style="margin: 24px 0;">
          <a href="${resetUrl}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;">
            Reset Password
          </a>
        </p>
        <p style="font-size: 13px; color: #64748b;">Or copy and paste this link into your browser:</p>
        <p style="font-size: 13px; word-break: break-all; color: #4f46e5;">${resetUrl}</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8;">If you did not request a password reset, you can safely ignore this email.</p>
      </div>
    `,
  });

  return { sent: true };
};
