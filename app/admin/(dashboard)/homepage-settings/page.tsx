import { getAppConfig, POSTS_PER_PAGE } from "@/lib/config";
import { saveHomepageSettings } from "@/lib/homepageSettingsAdmin";
import { GsSection } from "@/components/admin/GsSection";

/** Re-verified against the live admin/homepage-settings.php's rendered
 *  HTML — reuses the gs-wrap/gs-savebar/gs-section pattern from General
 *  Settings. NOT ported: the live mini-preview boxes (JS mockups of the
 *  story bar / post grid) — the settings themselves are all here. */
export default async function HomepageSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const { success } = await searchParams;
  const appConfig = await getAppConfig();

  return (
    <div className="gs-wrap">
      <form action={saveHomepageSettings}>
        <div className="gs-savebar">
          <h2>
            <i className="fas fa-house" style={{ color: "var(--primary)", marginRight: 7 }} /> Homepage Settings
          </h2>
          <button type="submit" className="gs-save-btn">
            <i className="fas fa-save" /> Save Changes
          </button>
        </div>

        {success && (
          <div className="alert alert-success" style={{ marginBottom: "1rem" }}>
            <i className="fas fa-check-circle" /> Homepage settings saved!
          </div>
        )}

        <p className="hps-note">
          <i className="fas fa-circle-info" /> These settings only affect the homepage.
        </p>

        <GsSection icon="fa-heading" iconBg="#ede9fe" iconColor="#6366f1" title='"Story" Bar' defaultOpen>
          <div className="gs-f">
            <div className="gs-f-row">
              <label style={{ margin: 0 }}>
                <i className="fas fa-eye" style={{ marginRight: 5, color: "#6366f1" }} /> Show Story Bar
              </label>
              <label className="gs-sw">
                <input type="checkbox" name="breadcrumbEnabled" defaultChecked={(appConfig.hp_breadcrumb_enabled ?? "1") === "1"} />
                <span className="gs-sl" />
              </label>
            </div>
            <p className="hint">When off, this entire bar (title + search box) is hidden from the homepage.</p>
          </div>
          <div className="gs-f">
            <label>↳ Bar text</label>
            <input type="text" className="gs-inp" name="breadcrumbText" maxLength={40} defaultValue={appConfig.hp_breadcrumb_text ?? "Story"} placeholder="Story" />
            <p className="hint">Shown as the heading on the left of the bar. Max 40 characters.</p>
          </div>
        </GsSection>

        <GsSection icon="fa-table-cells" iconBg="#d1fae5" iconColor="#059669" title="Posts Per Page" defaultOpen>
          <div className="gs-f">
            <label>Posts per page</label>
            <input type="number" className="gs-inp" name="postsPerPage" min={1} max={30} defaultValue={appConfig.hp_posts_per_page ?? String(POSTS_PER_PAGE)} style={{ maxWidth: 140 }} />
            <p className="hint">1–30 posts. Once a page has this many posts, older posts move to page 2, 3, etc.</p>
          </div>
        </GsSection>
      </form>
    </div>
  );
}
