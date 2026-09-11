import { getAppConfig } from "@/lib/config";
import { saveSidebarSettings } from "@/lib/sidebarSettingsAdmin";
import { GsSection } from "@/components/admin/GsSection";

/** Re-verified against the live admin/sidebar-settings.php's rendered
 *  HTML — reuses the gs-wrap/gs-savebar/gs-section pattern. */
export default async function SidebarSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const { success } = await searchParams;
  const appConfig = await getAppConfig();

  let pt: Record<string, unknown> = {};
  try {
    pt = appConfig.post_template_settings ? JSON.parse(appConfig.post_template_settings) : {};
  } catch {
    pt = {};
  }

  return (
    <div className="gs-wrap">
      <form action={saveSidebarSettings}>
        <div className="gs-savebar">
          <h2>
            <i className="fas fa-layout-sidebar-right" style={{ color: "var(--primary)", marginRight: 7 }} /> Sidebar Settings
          </h2>
          <button type="submit" className="gs-save-btn">
            <i className="fas fa-save" /> Save Changes
          </button>
        </div>

        {success && (
          <div className="alert alert-success" style={{ marginBottom: "1rem" }}>
            <i className="fas fa-check-circle" /> Sidebar settings saved!
          </div>
        )}

        <p className="hps-note">
          <i className="fas fa-circle-info" /> Each sidebar only appears where you turn it on below. The Homepage
          sidebar and the Post Page sidebar are controlled independently.
        </p>

        <GsSection icon="fa-house" iconBg="#ede9fe" iconColor="#6366f1" title='Homepage Sidebar ("Top Stories")' defaultOpen>
          <div className="gs-f">
            <div className="gs-f-row">
              <label style={{ margin: 0 }}>Show on homepage</label>
              <label className="gs-sw">
                <input type="checkbox" name="homepageSidebarEnabled" defaultChecked={(appConfig.homepage_sidebar_enabled ?? "1") === "1"} />
                <span className="gs-sl" />
              </label>
            </div>
          </div>
          <div className="gs-grid">
            <div className="gs-f">
              <label>Post count (1-10)</label>
              <input type="number" className="gs-inp" name="homepageSidebarCount" min={1} max={10} defaultValue={appConfig.homepage_sidebar_count ?? "6"} />
            </div>
            <div className="gs-f">
              <label>Title font size (px)</label>
              <input type="number" className="gs-inp" name="homepageSidebarTitleFontSize" min={10} max={40} defaultValue={appConfig.homepage_sidebar_title_font_size ?? "18"} />
            </div>
          </div>
        </GsSection>

        <GsSection icon="fa-layout-sidebar-right" iconBg="#d1fae5" iconColor="#059669" title="Post Page Sidebar" defaultOpen>
          <div className="gs-f">
            <div className="gs-f-row">
              <label style={{ margin: 0 }}>Show sidebar on post/chapter pages</label>
              <label className="gs-sw">
                <input type="checkbox" name="postSidebarEnabled" defaultChecked={pt.sidebar !== false} />
                <span className="gs-sl" />
              </label>
            </div>
          </div>
          <div className="gs-grid">
            <div className="gs-f">
              <div className="gs-f-row">
                <label style={{ margin: 0 }}>Show &quot;Latest Posts&quot;</label>
                <label className="gs-sw">
                  <input type="checkbox" name="sidebarLatest" defaultChecked={pt.sidebar_latest !== false} />
                  <span className="gs-sl" />
                </label>
              </div>
              <input name="sidebarLatestCount" type="number" min={1} max={10} className="gs-inp" defaultValue={String(pt.sidebar_latest_count ?? 5)} style={{ marginTop: 8 }} />
            </div>
            <div className="gs-f">
              <div className="gs-f-row">
                <label style={{ margin: 0 }}>Show &quot;Trending&quot;</label>
                <label className="gs-sw">
                  <input type="checkbox" name="sidebarTrending" defaultChecked={pt.sidebar_trending !== false} />
                  <span className="gs-sl" />
                </label>
              </div>
              <input name="sidebarTrendingCount" type="number" min={1} max={10} className="gs-inp" defaultValue={String(pt.sidebar_trending_count ?? 5)} style={{ marginTop: 8 }} />
            </div>
          </div>
          <div className="gs-f">
            <label>Sidebar title font size (px)</label>
            <input type="number" className="gs-inp" name="postSidebarTitleFontSize" min={10} max={40} defaultValue={String(pt.sidebar_title_font_size ?? 18)} style={{ maxWidth: 140 }} />
          </div>
        </GsSection>
      </form>
    </div>
  );
}
