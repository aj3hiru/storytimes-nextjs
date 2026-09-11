import { NextResponse, type NextRequest } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rateLimit";

function requireSecretKey(): string {
  const key = process.env.SECRET_KEY;
  if (!key || key.length < 32) {
    throw new Error("SECRET_KEY env var must be a random string of at least 32 characters.");
  }
  return key;
}

function htmlPage(title: string, color: string, message: string, email?: string): string {
  return `<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>a,a:link,a:visited,a:hover,a:active,a:focus{text-decoration:none;}</style>
  </head><body>
  <div style="font-family:sans-serif;text-align:center;margin-top:50px;">
    <h1 style="color:${color};">${message}</h1>
    ${email ? `<p>Email: <b>${email.replace(/</g, "&lt;")}</b></p>` : ""}
    <a href="/" style="background:#2563eb;color:white;padding:10px 20px;text-decoration:none;border-radius:5px;">Go to Home</a>
  </div></body></html>`;
}

export async function GET(request: NextRequest) {
  const rl = await checkRateLimit("verify_hits", 60, 5);
  if (!rl.allowed) {
    return new NextResponse("Too many requests. Please wait.", { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const data = searchParams.get("d");
  const hash = searchParams.get("h");
  if (!data || !hash) {
    return new NextResponse("Invalid Request.", { status: 400 });
  }

  let email: string;
  try {
    const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
    email = Buffer.from(base64, "base64").toString("utf8");
  } catch {
    return new NextResponse("Invalid token.", { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new NextResponse("Invalid token.", { status: 400 });
  }

  const expectedHash = createHmac("sha256", requireSecretKey()).update(email).digest("hex");
  const expectedBuf = Buffer.from(expectedHash);
  const givenBuf = Buffer.from(hash);
  const validHash = expectedBuf.length === givenBuf.length && timingSafeEqual(expectedBuf, givenBuf);
  if (!validHash) {
    return new NextResponse("Security Check Failed.", { status: 403 });
  }

  try {
    const existing = await prisma.comment.findFirst({ where: { email }, select: { evf: true } });
    const alreadyVerified = Boolean(existing?.evf);

    await prisma.comment.updateMany({ where: { email }, data: { evf: true } });

    const msg = alreadyVerified ? "Your email was already verified." : "Email Verified Successfully!";
    return new NextResponse(htmlPage("Email Verified", "green", msg, email), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("Email verify error:", err);
    return new NextResponse("Error verifying email.", { status: 500 });
  }
}
