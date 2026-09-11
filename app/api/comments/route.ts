import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCsrfToken } from "@/lib/csrf";
import { checkRateLimit } from "@/lib/rateLimit";
import { sendVerificationEmail, sendUserReplyNotification } from "@/lib/mail/commentMailer";
import { resolveSiteConfig } from "@/lib/config";
import { postUrl } from "@/lib/urls";

// Same regexes as the original: reject anything that looks like a URL or
// bare domain (comments are text-only, no links, to cut spam).
const LINK_PATTERNS = [/https?:\/\/\S+/i, /www\.\S+/i, /[a-z0-9.-]+\.[a-z]{2,}/i];

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "0.0.0.0"
  );
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const postId = parseInt(searchParams.get("id") ?? "0", 10);

  const form = await request.formData();
  const cTkn = form.get("cTkn") as string | null;

  const validCsrf = await verifyCsrfToken(cTkn);
  if (!validCsrf) {
    return NextResponse.json({ success: false, message: "Bad token" }, { status: 403 });
  }

  // Honeypot — a hidden "website" field real users never fill; bots often do.
  if ((form.get("website") as string | null)?.trim()) {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  // Session-based sliding-window limit: 3 comments per 2 minutes.
  const rl = await checkRateLimit("comment_times", 120, 3);
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, message: "Too many comments. Please slow down." },
      { status: 429 }
    );
  }

  const clientIp = getClientIp(request);
  const userAgent = (request.headers.get("user-agent") ?? "unknown").slice(0, 255);

  // IP-based limits backed by the DB, matching the original exactly:
  // 5 per 10 minutes, 15 per hour.
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [count10min, count1hr] = await Promise.all([
    prisma.comment.count({ where: { ipAddress: clientIp, date: { gte: tenMinAgo } } }),
    prisma.comment.count({ where: { ipAddress: clientIp, date: { gte: oneHourAgo } } }),
  ]);
  if (count10min >= 5) {
    return NextResponse.json(
      { success: false, message: "Too many comments. Please slow down." },
      { status: 429 }
    );
  }
  if (count1hr >= 15) {
    return NextResponse.json(
      { success: false, message: "Hourly comment limit reached. Try again later." },
      { status: 429 }
    );
  }

  if (!postId) {
    return NextResponse.json({ success: false, message: "Post ID required" }, { status: 400 });
  }

  const rawName = ((form.get("name") as string) ?? "").trim();
  const email = ((form.get("email") as string) ?? "").trim();
  const rawContent = ((form.get("content") as string) ?? "").trim();
  const parentIdRaw = form.get("parent_id") as string | null;
  const parentId = parentIdRaw ? parseInt(parentIdRaw, 10) : null;

  if (!rawName || !email || !rawContent) {
    return NextResponse.json({ success: false, message: "All fields are required" });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ success: false, message: "Invalid email address" });
  }
  if (rawContent.length > 1000) {
    return NextResponse.json({ success: false, message: "Comment too long" });
  }
  if (LINK_PATTERNS.some((re) => re.test(rawContent))) {
    return NextResponse.json({ success: false, message: "Links are not allowed in comments" });
  }
  if (rawName.length > 60) {
    return NextResponse.json({ success: false, message: "Name too long" });
  }

  const post = await prisma.post.findFirst({ where: { id: postId, status: "published" } });
  if (!post) {
    return NextResponse.json({ success: false, message: "Post not found" });
  }

  const alreadyVerified = await prisma.comment.findFirst({
    where: { email, evf: true },
    select: { id: true },
  });
  const isVerified = Boolean(alreadyVerified);

  try {
    const newComment = await prisma.comment.create({
      data: {
        name: rawName,
        email,
        content: rawContent,
        postId,
        parentId,
        date: new Date(),
        evf: isVerified,
        ipAddress: clientIp,
        status: isVerified ? "approved" : "pending",
        userAgent,
      },
    });

    let parentName: string | null = null;
    if (parentId) {
      const parent = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { name: true, email: true, content: true },
      });
      parentName = parent?.name ?? null;

      // Notify the parent commenter someone replied — skip if they're the
      // site's own support address (that's the admin replying to their
      // own notification chain, not a real "someone replied to you").
      const siteConfig = await resolveSiteConfig("");
      if (parent?.email && parent.email.toLowerCase() !== siteConfig.contactEmail.toLowerCase()) {
        const postLink = `${siteConfig.siteUrl.replace(/\/+$/, "")}${postUrl(post.slug)}`;
        sendUserReplyNotification(parent.name, parent.email, parent.content, rawName, rawContent, post.title, postLink).catch(
          (err) => console.error("User reply notification dispatch failed:", err)
        );
      }
    }

    // Fire the verification email without blocking the response on SMTP
    // round-trip time — same "best effort, never blocks the comment"
    // behavior as the original (sendVerificationEmail catches its own
    // errors and just logs them).
    let verificationSent = false;
    if (!isVerified) {
      sendVerificationEmail(rawName, email, rawContent).catch((err) => {
        console.error("Verification email dispatch failed:", err);
      });
      verificationSent = true;
    }

    return NextResponse.json({
      success: true,
      message: "Comment posted successfully",
      comment: {
        id: newComment.id,
        name: newComment.name,
        content: newComment.content,
        date: newComment.date,
        status: newComment.status,
      },
      parentName,
      verificationSent,
    });
  } catch (err) {
    console.error("Comment submission failed:", err);
    return NextResponse.json({ success: false, message: "Failed to post comment" }, { status: 500 });
  }
}
