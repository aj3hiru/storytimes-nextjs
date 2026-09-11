import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { verifyCsrfToken } from "@/lib/csrf";
import { parseChaptersFromContent } from "@/lib/chapters";
import { checkRateLimit } from "@/lib/rateLimit";
import { classifyTrafficSource, getVisitorCountry } from "@/lib/analyticsTracking";

const VISITOR_COOKIE = "cms_visitor_id";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; chapterNum: string }> }
) {
  const { slug, chapterNum } = await params;
  const chapter = parseInt(chapterNum.replace(/^chapter-/, ""), 10);

  // Basic abuse guard — mirrors the rest of the site's session-based rate
  // limiting pattern (the original relies on the 6h localStorage cooldown
  // client-side, but that's trivially bypassable, so this adds a real
  // server-side backstop: max 30 tracking hits per visitor per minute).
  const rl = await checkRateLimit("track_view_hits", 60, 30);
  if (!rl.allowed) {
    return NextResponse.json({ success: false, message: "Rate limited" }, { status: 429 });
  }

  let submittedToken: string | null = null;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = await request.json();
      submittedToken = body?.cTkn ?? null;
    } else {
      const body = await request.formData();
      submittedToken = (body.get("cTkn") as string | null) ?? null;
    }
  } catch {
    // fall through with submittedToken = null → rejected below
  }

  const validCsrf = await verifyCsrfToken(submittedToken);
  if (!validCsrf) {
    return NextResponse.json(
      { success: false, message: "Forbidden: Invalid CSRF token" },
      { status: 403 }
    );
  }

  if (!Number.isFinite(chapter) || chapter <= 0) {
    return NextResponse.json(
      { success: false, message: "Invalid chapter tracking request" },
      { status: 400 }
    );
  }

  const post = await prisma.post.findFirst({
    where: { slug, status: "published" },
    select: { id: true, content: true },
  });
  if (!post) {
    return NextResponse.json({ success: false, message: "Post not found" }, { status: 404 });
  }

  const parsed = parseChaptersFromContent(post.content);
  if (!parsed.hasChapters || chapter > parsed.total) {
    return NextResponse.json(
      { success: false, message: "Invalid chapter tracking request" },
      { status: 400 }
    );
  }

  let visitorId = request.cookies.get(VISITOR_COOKIE)?.value;
  const response = NextResponse.json({ success: true, message: "Chapter view tracked" });
  if (!visitorId) {
    visitorId = randomBytes(16).toString("hex");
    response.cookies.set(VISITOR_COOKIE, visitorId, {
      maxAge: ONE_YEAR_SECONDS,
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
  }

  try {
    // Ports: INSERT INTO post_views (views, post_id, chapter_number)
    //        VALUES (1, ?, ?) ON DUPLICATE KEY UPDATE views = views + 1
    await prisma.postView.upsert({
      where: { postId_chapterNumber: { postId: post.id, chapterNumber: chapter } },
      create: { postId: post.id, chapterNumber: chapter, views: 1 },
      update: { views: { increment: 1 } },
    });

    // Ports: INSERT IGNORE INTO chapter_visitor_log (...)
    await prisma.chapterVisitorLog.upsert({
      where: {
        visitDate_visitorId_postId_chapterNumber: {
          visitDate: new Date(new Date().toISOString().slice(0, 10)),
          visitorId,
          postId: post.id,
          chapterNumber: chapter,
        },
      },
      create: {
        visitDate: new Date(new Date().toISOString().slice(0, 10)),
        visitorId,
        postId: post.id,
        chapterNumber: chapter,
      },
      update: {}, // INSERT IGNORE semantics — do nothing if it already exists
    });

    // Ports the post_stats_daily write in api/0f9e8d7c6n.php — this is what
    // actually feeds the Analytics dashboard (daily views chart, traffic
    // sources, top posts, country breakdown). Previously missing entirely
    // in this port, which meant Analytics always showed zero data.
    const referrer = request.headers.get("referer") ?? "";
    const ownHost = request.headers.get("host") ?? "";
    const source = classifyTrafficSource(referrer, ownHost);
    const country = getVisitorCountry(request);
    const today = new Date(new Date().toISOString().slice(0, 10));

    await prisma.postStatsDaily.upsert({
      where: { uniq_post_date_source_country: { postId: post.id, statDate: today, source, country } },
      create: { postId: post.id, statDate: today, source, country, views: 1 },
      update: { views: { increment: 1 } },
    });
  } catch (err) {
    console.error("track-view failed:", err);
    return NextResponse.json({ success: false, message: "Database error" }, { status: 500 });
  }

  return response;
}
