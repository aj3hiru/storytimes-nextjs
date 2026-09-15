import { getAppConfig } from "@/lib/config";
import { savePostTemplateSettings } from "@/lib/postTemplateAdmin";
import { POST_TEMPLATE_DEFAULTS } from "@/lib/postTemplateTypes";

export default async function PostTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
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
      <div className="toolbar">
        <h2 className="toolbar-title">Post Template</h2>
      </div>

      {success && (
        <div className="alert alert-success">
          <i className="fas fa-check-circle" /> Post template settings saved!
        </div>
      )}

      <form action={savePostTemplateSettings} className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div>
          <h3 style={{ marginBottom: "0.75rem" }}>Chapters</h3>
          <Toggle
            name="chapters"
            label="Enable chapter splitting (parse <h1> tags as chapter boundaries)"
            defaultChecked={pt.chapters}
          />
        </div>

        <div>
          <h3 style={{ marginBottom: "0.75rem" }}>Sections</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <Toggle name="breadcrumb" label="Breadcrumb" defaultChecked={pt.breadcrumb} />
            <Toggle name="postMeta" label="Post meta (date, reading time)" defaultChecked={pt.post_meta} />
            <Toggle name="shareButtons" label="Share buttons" defaultChecked={pt.share_buttons} />
            <Toggle name="authorBox" label="Author box" defaultChecked={pt.author_box} />
            <Toggle name="relatedPosts" label="Related posts" defaultChecked={pt.related_posts} />
            <Toggle name="commentsSection" label="Comments section" defaultChecked={pt.comments_section} />
            <Toggle name="readFromStart" label="'Start Reading' nav on intro page" defaultChecked={pt.read_from_start} />
            <Toggle name="introThumbnail" label="Show banner image on intro page" defaultChecked={pt.intro_thumbnail} />
          </div>
        </div>

        <div>
          <h3 style={{ marginBottom: "0.75rem" }}>Post-Page Sidebar</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            <Toggle name="sidebar" label="Show sidebar" defaultChecked={pt.sidebar} />
            <Toggle name="sidebarLatest" label='"Latest Posts" block' defaultChecked={pt.sidebar_latest} />
            <Toggle name="sidebarTrending" label='"Trending" block' defaultChecked={pt.sidebar_trending} />
          </div>
          <div className="filter-row" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginTop: "0.75rem" }}>
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
        </div>

        <div>
          <h3 style={{ marginBottom: "0.75rem" }}>&quot;You may also like&quot; inline block</h3>
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
        </div>

        <div>
          <h3 style={{ marginBottom: "0.75rem" }}>Facebook Comment-Box Copy Prompt</h3>
          <Toggle name="fbCommentCopy" label="Show a pre-filled comment suggestion above the Facebook comments widget" defaultChecked={pt.fb_comment_copy} />
          <div className="form-group" style={{ marginTop: "0.75rem" }}>
            <label htmlFor="fbCommentCopyText">Suggested comment text</label>
            <input id="fbCommentCopyText" name="fbCommentCopyText" className="form-control" defaultValue={pt.fb_comment_copy_text} />
          </div>
        </div>

        <div>
          <h3 style={{ marginBottom: "0.75rem" }}>Typography</h3>
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
          </div>
        </div>

        <div>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}

function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}
