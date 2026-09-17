import { guardPage } from "@/lib/pageGuard";
import { getAppConfig } from "@/lib/config";
import { savePostTemplateSettings } from "@/lib/postTemplateAdmin";
import { POST_TEMPLATE_DEFAULTS } from "@/lib/postTemplateTypes";
import { PostTemplateTabs } from "@/components/admin/PostTemplateTabs";

export default async function PostTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  // Direct-URL access guard — see lib/pageGuard.tsx.
  const denied = await guardPage((p) => p.settings.general, "Only users with Settings access can change the post template.");
  if (denied) return denied;

  const { success } = await searchParams;
  const appConfig = await getAppConfig();

  let pt = POST_TEMPLATE_DEFAULTS;
  try {
    if (appConfig.post_template_settings) {
      pt = { ...POST_TEMPLATE_DEFAULTS, ...JSON.parse(appConfig.post_template_settings) };
    }
  } catch {
    // fall back to defaults
  }

  return (
    <div>
      {success && (
        <div className="alert alert-success">
          <i className="fas fa-check-circle" /> Post template settings saved!
        </div>
      )}

      {/* Reorganized into a WordPress Customizer-style vertical tab layout,
          per explicit request ("thoda bhadda dikh raha hai... jaise
          WordPress me customization ka rehta hai"). Every field below is
          unchanged from before — same name attributes, same
          defaultChecked/defaultValue bindings, nothing added or removed
          — only the visual grouping and navigation changed. See
          PostTemplateTabs.tsx for why every panel stays mounted at once
          rather than being conditionally rendered. */}
      <form action={savePostTemplateSettings}>
        <PostTemplateTabs
          content={
            <>
              <TabSection title="Chapters" icon="fa-align-left">
                <Toggle
                  name="chapters"
                  label="Enable chapter splitting (parse <h1> tags as chapter boundaries)"
                  defaultChecked={pt.chapters}
                />
              </TabSection>

              <TabSection title="Sections" icon="fa-table-cells-large">
                <div className="ptt-toggle-grid">
                  <Toggle name="breadcrumb" label="Breadcrumb" defaultChecked={pt.breadcrumb} />
                  <Toggle name="postMeta" label="Post meta (date, reading time)" defaultChecked={pt.post_meta} />
                  <Toggle name="shareButtons" label="Share buttons" defaultChecked={pt.share_buttons} />
                  <Toggle name="authorBox" label="Author box" defaultChecked={pt.author_box} />
                  <Toggle name="relatedPosts" label="Related posts" defaultChecked={pt.related_posts} />
                  <Toggle name="commentsSection" label="Comments section" defaultChecked={pt.comments_section} />
                  <Toggle name="readFromStart" label="'Start Reading' nav on intro page" defaultChecked={pt.read_from_start} />
                  <Toggle name="introThumbnail" label="Show banner image on intro page" defaultChecked={pt.intro_thumbnail} />
                </div>
              </TabSection>
            </>
          }
          sidebar={
            <TabSection title="Post-Page Sidebar" icon="fa-table-columns">
              <div className="ptt-toggle-grid">
                <Toggle name="sidebar" label="Show sidebar" defaultChecked={pt.sidebar} />
                <Toggle name="sidebarLatest" label='"Latest Posts" block' defaultChecked={pt.sidebar_latest} />
                <Toggle name="sidebarTrending" label='"Trending" block' defaultChecked={pt.sidebar_trending} />
              </div>
              <div className="filter-row" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginTop: "1rem" }}>
                <div className="form-group">
                  <label htmlFor="sidebarLatestCount">Latest count</label>
                  <input id="sidebarLatestCount" name="sidebarLatestCount" type="number" min={1} max={10} className="form-control" defaultValue={pt.sidebar_latest_count} />
                </div>
                <div className="form-group">
                  <label htmlFor="sidebarTrendingCount">Trending count</label>
                  <input id="sidebarTrendingCount" name="sidebarTrendingCount" type="number" min={1} max={10} className="form-control" defaultValue={pt.sidebar_trending_count} />
                </div>
                <div className="form-group">
                  <label htmlFor="sidebarTitleFontSize">Sidebar title font size (px)</label>
                  <input id="sidebarTitleFontSize" name="sidebarTitleFontSize" type="number" min={10} max={40} className="form-control" defaultValue={pt.sidebar_title_font_size} />
                </div>
              </div>
            </TabSection>
          }
          recommendations={
            <TabSection title={'"You may also like" inline block'} icon="fa-thumbs-up">
              <div className="filter-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <Toggle name="mayYouLike" label="Enabled" defaultChecked={pt.may_you_like} />
                <div className="form-group">
                  <label htmlFor="mayYouLikeCount">Post count</label>
                  <input
                    id="mayYouLikeCount"
                    name="mayYouLikeCount"
                    type="number"
                    min={1}
                    max={12}
                    className="form-control"
                    defaultValue={pt.may_you_like_count}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="mayYouLikeAfterParagraph">Insert after paragraph #</label>
                  <input
                    id="mayYouLikeAfterParagraph"
                    name="mayYouLikeAfterParagraph"
                    type="number"
                    min={1}
                    max={20}
                    className="form-control"
                    defaultValue={pt.may_you_like_after_paragraph}
                  />
                </div>
              </div>
            </TabSection>
          }
          social={
            <>
              <TabSection title="Facebook Comment-Box Copy Prompt" icon="fa-comment-dots">
                <Toggle name="fbCommentCopy" label="Show a pre-filled comment suggestion above the Facebook comments widget" defaultChecked={pt.fb_comment_copy} />
                <div className="form-group" style={{ marginTop: "0.75rem" }}>
                  <label htmlFor="fbCommentCopyText">Suggested comment text</label>
                  <input id="fbCommentCopyText" name="fbCommentCopyText" className="form-control" defaultValue={pt.fb_comment_copy_text} />
                </div>
              </TabSection>

              {/* New feature, no PHP equivalent — per explicit request: control
                  over which of the four "Copy FB Comment" link variants
                  (Post Manager, inside the modal CopyLinksPanel.tsx opens) an
                  admin actually wants available for copying. All four default
                  to on, matching current behavior. */}
              <TabSection title="Copy Links (Post Manager)" icon="fa-link">
                <p className="ptt-section-hint">
                  Which link variants show in the &quot;Copy FB Comment&quot; modal on Post Manager.
                </p>
                <div className="ptt-toggle-grid">
                  <Toggle name="showPostLink" label="Post Link" defaultChecked={pt.show_post_link} />
                  <Toggle name="showChapter1Link" label="Chapter 1 Link" defaultChecked={pt.show_chapter1_link} />
                  <Toggle name="showFacebookLink" label="Facebook Link" defaultChecked={pt.show_facebook_link} />
                  <Toggle name="showWhatsappLink" label="WhatsApp Link" defaultChecked={pt.show_whatsapp_link} />
                </div>
              </TabSection>
            </>
          }
          redirect={
            // New feature, no PHP equivalent — per explicit request: when a
            // page isn't found, redirect visitors to a chosen URL instead
            // of showing the default "page not found" screen. See
            // app/not-found.tsx, which reads these same settings.
            <TabSection title="404 Redirect" icon="fa-route">
              <p className="ptt-section-hint">
                When someone lands on a page that doesn&apos;t exist, send them somewhere instead of
                showing the default &quot;page not found&quot; screen.
              </p>
              <Toggle name="redirect404Enabled" label="Redirect visitors on a 404" defaultChecked={pt.redirect_404_enabled} />
              <div className="form-group" style={{ marginTop: "0.75rem" }}>
                <label htmlFor="redirect404Url">Redirect to</label>
                <input
                  id="redirect404Url"
                  name="redirect404Url"
                  className="form-control"
                  placeholder="https://example.com or /some-page"
                  defaultValue={pt.redirect_404_url}
                />
              </div>
            </TabSection>
          }
          typography={
            <TabSection title="Typography" icon="fa-font">
              <div className="filter-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <div className="form-group">
                  <label htmlFor="fontTitle">Title (px)</label>
                  <input id="fontTitle" name="fontTitle" type="number" className="form-control" defaultValue={pt.font_title} />
                </div>
                <div className="form-group">
                  <label htmlFor="fontH2">H2 (px)</label>
                  <input id="fontH2" name="fontH2" type="number" className="form-control" defaultValue={pt.font_h2} />
                </div>
                <div className="form-group">
                  <label htmlFor="fontH3">H3 (px)</label>
                  <input id="fontH3" name="fontH3" type="number" className="form-control" defaultValue={pt.font_h3} />
                </div>
                <div className="form-group">
                  <label htmlFor="fontH4">H4 (px)</label>
                  <input id="fontH4" name="fontH4" type="number" className="form-control" defaultValue={pt.font_h4} />
                </div>
                <div className="form-group">
                  <label htmlFor="fontH5">H5 (px)</label>
                  <input id="fontH5" name="fontH5" type="number" className="form-control" defaultValue={pt.font_h5} />
                </div>
                <div className="form-group">
                  <label htmlFor="fontH6">H6 (px)</label>
                  <input id="fontH6" name="fontH6" type="number" className="form-control" defaultValue={pt.font_h6} />
                </div>
                <div className="form-group">
                  <label htmlFor="fontP">Paragraph (px)</label>
                  <input id="fontP" name="fontP" type="number" className="form-control" defaultValue={pt.font_p} />
                </div>
                <div className="form-group">
                  <label htmlFor="breadcrumbFontSize">Breadcrumb (px)</label>
                  <input
                    id="breadcrumbFontSize"
                    name="breadcrumbFontSize"
                    type="number"
                    min={10}
                    max={30}
                    className="form-control"
                    defaultValue={pt.breadcrumb_font_size}
                  />
                  <p className="field-hint">
                    The &quot;Post Title · Chapter N of M&quot; / &quot;Date · N Chapters&quot; line above the title.
                  </p>
                </div>
              </div>
            </TabSection>
          }
        />

        <div className="ptt-save-bar">
          <button type="submit" className="btn btn-primary">
            <i className="fas fa-save" /> Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}

/** A titled card within a tab panel — a tab can hold more than one of
 *  these (e.g. "Social Sharing" holds both the FB Comment-Box prompt and
 *  Copy Links sections), matching how the original single-column layout
 *  sometimes grouped more than one related settings block together. */
function TabSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="ptt-section">
      <h3 className="ptt-section-title">
        <i className={`fas ${icon}`} /> {title}
      </h3>
      {children}
    </div>
  );
}

function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="ptt-toggle-row">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}
