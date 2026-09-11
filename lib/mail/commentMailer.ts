import "server-only";
import nodemailer from "nodemailer";
import { createHmac } from "crypto";
import { resolveSiteConfig } from "../config";

function requireSecretKey(): string {
  const key = process.env.SECRET_KEY;
  if (!key || key.length < 32) {
    throw new Error("SECRET_KEY env var must be a random string of at least 32 characters.");
  }
  return key;
}

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "465", 10);
  const user = process.env.SMTP_USERNAME;
  const pass = process.env.SMTP_PASSWORD;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_USERNAME and SMTP_PASSWORD before sending comment emails."
    );
  }

  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

/** Ports generateSecureLink(): base64url-encodes the email, HMAC-signs it
 *  with SECRET_KEY, and points at the verify API route. */
export function generateVerifyLink(email: string, siteUrl: string): string {
  const secretKey = requireSecretKey();
  const encodedEmail = Buffer.from(email, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
  const hash = createHmac("sha256", secretKey).update(email).digest("hex");
  const params = new URLSearchParams({
    auth_token: Math.random().toString(16).slice(2, 18),
    d: encodedEmail,
    mode: "secure_verify",
    h: hash,
    ts: String(Math.floor(Date.now() / 1000)),
  });
  return `${siteUrl.replace(/\/+$/, "")}/api/comments/verify?${params.toString()}`;
}

function emailShell(siteName: string, logoUrl: string, bodyHtml: string, privacyUrl: string, termsUrl: string): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f7fa;font-family:Arial,sans-serif;color:#333;">
<div style="max-width:600px;margin:20px auto;background:#ffffff;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.05);overflow:hidden;">
  <div style="background:#ffffff;padding-bottom:5px;text-align:center;border-bottom:1px solid #e5e7eb;">
    <img src="${logoUrl}" alt="${siteName}" style="height:80px;width:auto;">
  </div>
  <div style="padding:30px 25px;">${bodyHtml}</div>
  <div style="background:#f9fafb;padding:15px;text-align:center;font-size:12px;color:#9ca3af;border-top:1px solid #e5e7eb;">
    <p style="margin:0 0 10px;">&copy; ${year} ${siteName}. All rights reserved.</p>
    <p style="margin:0;">
      <a href="${privacyUrl}" style="color:#6b7280;text-decoration:none;margin:0 5px;">Privacy</a> |
      <a href="${termsUrl}" style="color:#6b7280;text-decoration:none;margin:0 5px;">Terms</a>
    </p>
  </div>
</div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function sendReplyNotification(
  name: string,
  email: string,
  userComment: string,
  adminReply: string,
  postLink: string
): Promise<void> {
  try {
    const siteConfig = await resolveSiteConfig("");
    const privacyUrl = `${siteConfig.siteUrl.replace(/\/+$/, "")}/privacy-policy`;
    const termsUrl = `${siteConfig.siteUrl.replace(/\/+$/, "")}/terms-of-service`;

    const body = `
      <h2 style="color:#111827;font-size:20px;margin-top:0;">New Reply from ${escapeHtml(siteConfig.siteName)} Support</h2>
      <p style="font-size:15px;line-height:1.5;color:#4b5563;">
        Hi <strong>${escapeHtml(name)}</strong>,<br><br>
        Admin has replied to your comment on ${escapeHtml(siteConfig.siteName)}.
      </p>
      <p style="font-size:12px;color:#999;margin-bottom:5px;">You wrote:</p>
      <div style="background:#f9fafb;border-left:4px solid #ccc;padding:12px;margin-bottom:20px;font-style:italic;color:#666;font-size:14px;">
        "${escapeHtml(userComment)}"
      </div>
      <p style="font-size:12px;color:#1e40af;margin-bottom:5px;font-weight:bold;">Admin Replied:</p>
      <div style="background:#eff6ff;border-left:4px solid #1e40af;padding:15px;margin-bottom:25px;color:#333;font-size:14px;">
        "${escapeHtml(adminReply)}"
      </div>
      <div style="text-align:center;margin-top:30px;margin-bottom:20px;">
        <a href="${postLink}" style="background-color:#2563eb;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:15px;display:inline-block;">
          View Post &amp; Discussions
        </a>
      </div>`;

    const transport = getTransport();
    const fromEmail = process.env.SMTP_FROM_EMAIL || siteConfig.contactEmail;
    const replyEmail = process.env.SMTP_REPLY_EMAIL || siteConfig.contactEmail;

    await transport.sendMail({
      from: `"${siteConfig.siteName} Discussions" <${fromEmail}>`,
      replyTo: `"${siteConfig.siteName} Support" <${replyEmail}>`,
      to: email,
      subject: `Admin Replied to your Comment - ${siteConfig.siteName}`,
      html: emailShell(siteConfig.siteName, siteConfig.siteLogo, body, privacyUrl, termsUrl),
    });
  } catch (err) {
    console.error("Reply notification mail failed:", err);
  }
}

export async function sendUserReplyNotification(
  parentName: string,
  parentEmail: string,
  parentContent: string,
  replyName: string,
  replyContent: string,
  postTitle: string,
  postLink: string
): Promise<void> {
  try {
    const siteConfig = await resolveSiteConfig("");
    const privacyUrl = `${siteConfig.siteUrl.replace(/\/+$/, "")}/privacy-policy`;
    const termsUrl = `${siteConfig.siteUrl.replace(/\/+$/, "")}/terms-of-service`;

    const body = `
      <h2 style="color:#111827;font-size:18px;margin-top:0;">New Reply on <a href="${postLink}" style="color:#2563eb;text-decoration:none;">${escapeHtml(postTitle)}</a></h2>
      <p style="font-size:15px;line-height:1.5;color:#4b5563;">
        Hi <strong>${escapeHtml(parentName)}</strong>,<br>
        <strong>${escapeHtml(replyName)}</strong> just replied to your comment.
      </p>
      <div style="margin-top:25px;">
        <p style="font-size:12px;color:#6b7280;margin:0 0 4px;font-weight:600;">You wrote:</p>
        <div style="background:#f3f4f6;border-left:4px solid #9ca3af;padding:12px 15px;border-radius:4px;font-style:italic;color:#4b5563;font-size:14px;">
          "${escapeHtml(parentContent)}"
        </div>
        <div style="padding-left:20px;color:#9ca3af;font-size:18px;line-height:1;">&#8627;</div>
        <p style="font-size:12px;color:#2563eb;margin:5px 0 4px;font-weight:600;">${escapeHtml(replyName)} replied:</p>
        <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:12px 15px;border-radius:4px;color:#1e3a8a;font-size:14px;">
          "${escapeHtml(replyContent)}"
        </div>
      </div>
      <div style="text-align:center;margin-top:30px;margin-bottom:20px;">
        <a href="${postLink}" style="background-color:#2563eb;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:15px;display:inline-block;">
          Reply to Discussion
        </a>
      </div>`;

    const transport = getTransport();
    const fromEmail = process.env.SMTP_FROM_EMAIL || siteConfig.contactEmail;
    const replyToEmail = process.env.SMTP_REPLY_EMAIL || siteConfig.contactEmail;

    await transport.sendMail({
      from: `"${siteConfig.siteName} Discussions" <${fromEmail}>`,
      replyTo: `"${siteConfig.siteName} Support" <${replyToEmail}>`,
      to: parentEmail,
      subject: `Someone Replied your Comment on ${siteConfig.siteName}`,
      html: emailShell(siteConfig.siteName, siteConfig.siteLogo, body, privacyUrl, termsUrl),
    });
  } catch (err) {
    console.error("User reply notification mail failed:", err);
  }
}

export async function sendVerificationEmail(name: string, email: string, commentContent: string): Promise<void> {
  try {
    const siteConfig = await resolveSiteConfig("");
    const verifyLink = generateVerifyLink(email, siteConfig.siteUrl);
    const privacyUrl = `${siteConfig.siteUrl.replace(/\/+$/, "")}/privacy-policy`;
    const termsUrl = `${siteConfig.siteUrl.replace(/\/+$/, "")}/terms-of-service`;

    const body = `
      <h2 style="color:#111827;font-size:20px;margin-top:0;">Verify Your Email</h2>
      <p style="font-size:15px;line-height:1.5;color:#4b5563;">
        Hi <strong>${escapeHtml(name)}</strong>,<br><br>
        You recently posted a comment on ${escapeHtml(siteConfig.siteName)}. To verify your identity and
        enable future discussions, please confirm your email address.
      </p>
      <div style="background:#f9fafb;border-left:4px solid #2563eb;padding:15px;margin:20px 0;font-style:italic;color:#555;font-size:14px;">
        "${escapeHtml(commentContent)}"
      </div>
      <div style="text-align:center;margin-top:30px;margin-bottom:20px;">
        <a href="${verifyLink}" style="background-color:#2563eb;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:15px;display:inline-block;">
          Verify Email Address
        </a>
      </div>
      <p style="font-size:13px;color:#9ca3af;text-align:center;">
        If you didn't post this comment, you can safely ignore this email.
      </p>`;

    const transport = getTransport();
    const fromEmail = process.env.SMTP_FROM_EMAIL || siteConfig.contactEmail;
    const replyEmail = process.env.SMTP_REPLY_EMAIL || siteConfig.contactEmail;

    await transport.sendMail({
      from: `"${siteConfig.siteName} Discussions" <${fromEmail}>`,
      replyTo: `"${siteConfig.siteName} Support" <${replyEmail}>`,
      to: email,
      subject: `Comment Discussions - ${siteConfig.siteName}`,
      html: emailShell(siteConfig.siteName, siteConfig.siteLogo, body, privacyUrl, termsUrl),
    });
  } catch (err) {
    // Best-effort, same as the original — a failed verification email
    // should never block the comment from being saved.
    console.error("Comment verification mail failed:", err);
  }
}
