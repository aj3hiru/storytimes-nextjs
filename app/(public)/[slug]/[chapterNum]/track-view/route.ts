import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { verifyCsrfToken } from "@/lib/csrf";
import { parseChaptersFromContent } from "@/lib/chapters";
import { checkRateLimit } from "@/lib/rateLimit";
import { classifyTrafficSource, getVisitorCountry, getStableVisitorId } from "@/lib/analyticsTracking";
import { istCalendarDate, istHourStart } from "@/lib/istDate";

const VISITOR_COOKIE = "cms_visitor_id";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * Moved from `[slug]/chapter-[chapterNum]/track-view` to
 * `[slug]/[chapterNum]/track-view` — see the sibling page.tsx's own
 * comment for the full explanation: the literal "chapter-" prefix
 * baked into the old folder name was silently stripped from the actual
 * URL segment before Next.js populated the dynamic param, which broke
 * the sibling page route's parsing entirely (root cause of the
 * reported chapter-page 404s). This tracking route's own parsing
 * (`chapterNum.replace(/^chapter-/, "")`) was already lenient enough to
 * handle either shape correctly, so nothing below needed to change —
 * only where the file lived.
 */
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
  // Captured alongside the CSRF token, in the same parse, because the
  // request body can only be read once — extracting it separately later
  // (where it's actually used, near the traffic-source classification)
  // would throw on an already-consumed stream.
  let submittedReferrer: string | null = null;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = await request.json();
      submittedToken = body?.cTkn ?? null;
      submittedReferrer = typeof body?.ref === "string" ? body.ref : null;
    } else {
      const body = await request.formData();
      submittedToken = (body.get("cTkn") as string | null) ?? null;
      submittedReferrer = (body.get("ref") as string | null) ?? null;
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
  // Real bug fixed here: this used to reject tracking outright for any
  // post without detected H1-chapter structure (a very common case —
  // most short/simple posts have no chapters at all) — meaning those
  // posts' views were NEVER counted anywhere, silently. A single-page
  // (non-chaptered) post now tracks as "chapter 1" (the whole page
  // counts as one unit for stats purposes), matching PostReader.tsx's
  // corresponding fix to actually render the tracker for these posts.
  //
  // Second, separate bug fixed here (reported live: "intro pe visitor
  // aa raha hai to count nahi ho raha, jab tak chapter pe na jaaye"):
  // chapter 0 — the intro page of a chaptered post — was rejected as
  // invalid, so a visitor who landed on a story's intro and left
  // without opening a chapter was never counted at all. The intro is a
  // real, separately-URL'd page view like any other, and in the
  // reference PHP it WAS counted: post.php fires a post-level beacon on
  // every page load regardless of chapter (`api/0f9e8d7c6n.php`), quite
  // separate from its chapter-level tracker which does skip chapter 0.
  // This port only ever had the chapter-level half, so the intro fell
  // through the gap entirely. Chapter 0 is now accepted for chaptered
  // posts.
  const validChapter = parsed.hasChapters ? chapter >= 0 && chapter <= parsed.total : chapter === 1;
  if (!validChapter) {
    return NextResponse.json(
      { success: false, message: "Invalid chapter tracking request" },
      { status: 400 }
    );
  }

  let visitorId = request.cookies.get(VISITOR_COOKIE)?.value;
  const response = NextResponse.json({ success: true, message: "Chapter view tracked" });
  if (!visitorId) {
    // Real bug fixed here: this used to generate a brand-new random ID
    // (randomBytes(16)) every single time the cookie was missing —
    // private/incognito browsing, cookies blocked, or just this
    // visitor's very first request before the Set-Cookie below reaches
    // their browser — meaningfully inflating "Unique Visitors" for any
    // visitor who doesn't retain cookies. getStableVisitorId() derives
    // a stable, cookie-less ID from Cloudflare's real-IP header (every
    // domain here runs behind Cloudflare with the proxy on) + User-
    // Agent + the current date instead, so the SAME cookie-less visitor
    // revisiting the same day is correctly counted once. The cookie
    // remains the primary, preferred identity — this is purely the
    // fallback for when it's unavailable.
    visitorId = getStableVisitorId(request);
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
    // Real bug fixed here: Prisma's default composite-unique key name is
    // the auto-concatenated field list (visitDate_visitorId_postId_
    // chapterNumber), but this schema's @@unique gives it an EXPLICIT
    // name ("uniq_visit" — see prisma/schema.prisma's ChapterVisitorLog
    // model) specifically so it doesn't collide with anything else.
    // Once a unique constraint has an explicit name, THAT name — not the
    // auto-generated one — is what Prisma Client's WhereUniqueInput type
    // actually exposes. Using the wrong one type-checked fine against
    // this sandbox's stub Prisma client (which doesn't have accurate
    // generated types), but fails against the real generated client in
    // production.
    await prisma.chapterVisitorLog.upsert({
      where: {
        uniq_visit: {
          visitDate: istCalendarDate(new Date()),
          visitorId,
          postId: post.id,
          chapterNumber: chapter,
        },
      },
      create: {
        visitDate: istCalendarDate(new Date()),
        visitorId,
        postId: post.id,
        chapterNumber: chapter,
      },
      update: {}, // INSERT IGNORE semantics — do nothing if it already exists
    });

    // Ports: INSERT IGNORE INTO visitor_log (...) — real bug fixed here:
    // this table existed in the schema (and getUniqueVisitors() in
    // lib/analyticsData.ts already reads from it) but was never actually
    // WRITTEN anywhere in this port, so "Unique Visitors" on the
    // Analytics page always showed 0 regardless of date range.
    await prisma.visitorLog.upsert({
      where: {
        uniq_visit: {
          visitDate: istCalendarDate(new Date()),
          visitorId,
          postId: post.id,
        },
      },
      create: {
        visitDate: istCalendarDate(new Date()),
        visitorId,
        postId: post.id,
      },
      update: {}, // INSERT IGNORE semantics — do nothing if it already exists
    });

    // Ports the post_stats_daily write in api/0f9e8d7c6n.php — this is what
    // actually feeds the Analytics dashboard (daily views chart, traffic
    // sources, top posts, country breakdown). Previously missing entirely
    // in this port, which meant Analytics always showed zero data.
    //
    // Real bug fixed here: this used to read `request.headers.get("referer")`
    // directly. But this request fires from a client-side beacon/fetch,
    // well after the page itself already loaded — so its OWN Referer header
    // is this page's own URL, not wherever the visitor actually arrived
    // from. That always matched `ownHost` below and fell into "direct",
    // regardless of real traffic source. `submittedReferrer` — captured
    // client-side from `document.referrer` at the moment the page loaded,
    // before any of that could happen — is the real signal, with the
    // request's own header kept only as a fallback for any caller that
    // doesn't send it.
    const referrer = submittedReferrer || request.headers.get("referer") || "";
    const ownHost = request.headers.get("host") ?? "";
    const source = classifyTrafficSource(referrer, ownHost);
    const country = getVisitorCountry(request);
    const now = new Date();
    // Real bug fixed here — see lib/istDate.ts for the full explanation.
    // This used to compute the UTC calendar date while the Analytics/
    // Dashboard read side computed "today" in the server process's local
    // timezone, so a visit written here could land under a different
    // calendar date than what "today"/"yesterday" queries were looking
    // for — real traffic silently split across two date buckets.
    const today = istCalendarDate(now);

    await prisma.postStatsDaily.upsert({
      where: { uniq_post_date_source_country: { postId: post.id, statDate: today, source, country } },
      create: { postId: post.id, statDate: today, source, country, views: 1 },
      update: { views: { increment: 1 } },
    });

    // Real-time hourly counter — the reference gets this from a separate
    // JSON tracking-cache file this project has no equivalent of; a real
    // DB table gives the same "counts as it happens" behavior the user
    // asked for (Today/Yesterday show a genuine hour-by-hour curve on
    // the Analytics page) without needing a filesystem cache. Truncated
    // to the top of the hour so every view within the same hour
    // increments one row instead of creating a new one each time.
    // Real bug fixed here — see lib/istDate.ts's istHourStart() doc
    // comment for the full reasoning: IST is a HALF-HOUR UTC offset, so
    // naively truncating to the UTC hour and displaying it as an IST hour
    // splits each real IST hour's traffic across two chart buckets.
    const statHour = istHourStart(now);
    await prisma.postStatsHourly.upsert({
      where: { uniq_post_hour_source_country: { postId: post.id, statHour, source, country } },
      create: { postId: post.id, statHour, source, country, views: 1 },
      update: { views: { increment: 1 } },
    });
  } catch (err) {
    console.error("track-view failed:", err);
    return NextResponse.json({ success: false, message: "Database error" }, { status: 500 });
  }

  return response;
}
