"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { requireUser } from "./auth";

export async function savePostTemplateSettings(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");

  const existingRaw = (await prisma.appConfig.findUnique({ where: { configKey: "post_template_settings" } }))
    ?.configValue;
  let existing: Record<string, unknown> = {};
  try {
    existing = existingRaw ? JSON.parse(existingRaw) : {};
  } catch {
    existing = {};
  }

  const merged = {
    ...existing,
    share_buttons: formData.get("shareButtons") === "on",
    author_box: formData.get("authorBox") === "on",
    related_posts: formData.get("relatedPosts") === "on",
    comments_section: formData.get("commentsSection") === "on",
    sidebar: formData.get("sidebar") === "on",
    sidebar_latest: formData.get("sidebarLatest") === "on",
    sidebar_latest_count: Math.max(1, Math.min(10, parseInt(String(formData.get("sidebarLatestCount") ?? "5"), 10) || 5)),
    sidebar_trending: formData.get("sidebarTrending") === "on",
    sidebar_trending_count: Math.max(1, Math.min(10, parseInt(String(formData.get("sidebarTrendingCount") ?? "5"), 10) || 5)),
    sidebar_title_font_size: Math.max(10, Math.min(40, parseInt(String(formData.get("sidebarTitleFontSize") ?? "18"), 10) || 18)),
    intro_thumbnail: formData.get("introThumbnail") === "on",
    post_meta: formData.get("postMeta") === "on",
    breadcrumb: formData.get("breadcrumb") === "on",
    chapters: formData.get("chapters") === "on",
    may_you_like: formData.get("mayYouLike") === "on",
    may_you_like_count: Math.max(1, Math.min(12, parseInt(String(formData.get("mayYouLikeCount") ?? "4"), 10) || 4)),
    may_you_like_after_paragraph: Math.max(
      1,
      Math.min(20, parseInt(String(formData.get("mayYouLikeAfterParagraph") ?? "3"), 10) || 3)
    ),
    read_from_start: formData.get("readFromStart") === "on",
    fb_comment_copy: formData.get("fbCommentCopy") === "on",
    fb_comment_copy_text: String(formData.get("fbCommentCopyText") ?? "").trim(),
    show_post_link: formData.get("showPostLink") === "on",
    show_chapter1_link: formData.get("showChapter1Link") === "on",
    show_facebook_link: formData.get("showFacebookLink") === "on",
    show_whatsapp_link: formData.get("showWhatsappLink") === "on",
    redirect_404_enabled: formData.get("redirect404Enabled") === "on",
    // Validated, not just trimmed — an invalid value here would throw
    // on the NEXT redirect() call inside app/not-found.tsx, which runs
    // for every genuine 404 across the whole site. Accepts either a real
    // absolute URL or a site-relative path starting with "/"; anything
    // else falls back to empty, and the redirect toggle above simply
    // won't fire (app/not-found.tsx also checks for a non-empty URL
    // before redirecting, as a second safety net).
    redirect_404_url: (() => {
      const raw = String(formData.get("redirect404Url") ?? "").trim();
      if (!raw) return "";
      if (raw.startsWith("/")) return raw;
      try {
        return new URL(raw).toString();
      } catch {
        return "";
      }
    })(),
    font_title: parseInt(String(formData.get("fontTitle") ?? "24"), 10) || 24,
    font_h2: parseInt(String(formData.get("fontH2") ?? "18"), 10) || 18,
    font_h3: parseInt(String(formData.get("fontH3") ?? "16"), 10) || 16,
    font_h4: parseInt(String(formData.get("fontH4") ?? "15"), 10) || 15,
    font_h5: parseInt(String(formData.get("fontH5") ?? "14"), 10) || 14,
    font_h6: parseInt(String(formData.get("fontH6") ?? "13"), 10) || 13,
    font_p: parseInt(String(formData.get("fontP") ?? "15"), 10) || 15,
    breadcrumb_font_size: Math.max(10, Math.min(30, parseInt(String(formData.get("breadcrumbFontSize") ?? "15"), 10) || 15)),
  };

  await prisma.appConfig.upsert({
    where: { configKey: "post_template_settings" },
    create: { configKey: "post_template_settings", configValue: JSON.stringify(merged) },
    update: { configValue: JSON.stringify(merged) },
  });

  revalidateTag("post-template", "max");
  revalidatePath("/admin/post-template");
  // Real bug fixed here — the cause of "Post Template se kuch hide kar
  // rahe hain (You May Like, Post Meta) to hide nahi ho raha".
  // revalidateTag() correctly invalidated the SETTINGS cache, but every
  // public post page is ISR-rendered (SSG with `revalidate = 60`), and
  // its already-generated HTML was built with the OLD settings. Nothing
  // here invalidated that HTML, so the toggle looked completely ignored
  // on the live site even though it had saved correctly — reading the
  // settings again only helps if something actually re-renders the page.
  // revalidatePath("/", "layout") invalidates every route under the root
  // layout, which is what these settings actually affect.
  revalidatePath("/", "layout");
  redirect("/admin/post-template?success=1");
}
