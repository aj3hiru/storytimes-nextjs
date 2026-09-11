import { getHeaderSettings, getNavItems } from "@/lib/navigation";
import { saveHeaderSettings, saveNavMenuItems } from "@/lib/headerCustomizerAdmin";
import { AccordionSection } from "@/components/admin/Accordion";
import { MenuItemsEditor } from "@/components/admin/MenuItemsEditor";
import { DesignPicker } from "@/components/admin/DesignPicker";

/**
 * Re-verified against the live admin/header-customizer.php's rendered
 * HTML — an earlier pass used plain stacked cards; the real page is a
 * sticky save-bar with collapsible accordion sections and visual
 * design-picker cards. NOT ported: the live browser-mockup preview panel
 * (JS-driven, updates as you type) — the settings themselves are all
 * here and functional, just without that side-by-side visual preview.
 */
export default async function HeaderCustomizerPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const { success } = await searchParams;
  const [settings, navItems] = await Promise.all([getHeaderSettings(), getNavItems()]);

  return (
    <div className="hc-wrap">
      {success && (
        <div className="alert alert-success" style={{ marginBottom: "1rem" }}>
          <i className="fas fa-check-circle" /> {success === "nav" ? "Navigation menu saved!" : "Header settings saved!"}
        </div>
      )}

      <form action={saveHeaderSettings} className="hc-panel" style={{ marginBottom: "1.5rem" }}>
        <div className="hc-savebar">
          <h2>
            <i className="fas fa-paint-brush" style={{ color: "var(--primary)", marginRight: 6 }} /> Header Settings
          </h2>
          <button type="submit" className="hc-save-btn">
            <i className="fas fa-save" /> Save
          </button>
        </div>

        <AccordionSection id="s-design" icon="fa-layer-group" iconBg="#dbeafe" iconColor="#2563eb" title="Header Design" defaultOpen>
          <p className="hint" style={{ margin: "-4px 0 10px" }}>
            Choose which header layout is active on the live site.
          </p>
          <DesignPicker initial={settings.headerDesign} />
        </AccordionSection>

        <AccordionSection id="s-brand" icon="fa-image" iconBg="#fef3c7" iconColor="#d97706" title="Brand Display">
          <div className="form-group">
            <label htmlFor="displayMode">Show logo or site title text next to it</label>
            <select id="displayMode" name="displayMode" className="form-control" defaultValue={settings.displayMode}>
              <option value="logo">Logo image</option>
              <option value="text">Site title text</option>
            </select>
          </div>
        </AccordionSection>

        <AccordionSection id="s-elems" icon="fa-toggle-on" iconBg="#fee2e2" iconColor="#ef4444" title="Header Elements">
          <div className="tog-row">
            <span className="tog-label">
              <i className="fas fa-search" style={{ marginRight: 6, color: "var(--gray-400)" }} /> Search Button
            </span>
            <label className="hc-sw">
              <input type="checkbox" name="showSearchBtn" defaultChecked={settings.showSearchBtn} />
              <span className="hc-sl" />
            </label>
          </div>
          <div className="tog-row">
            <span className="tog-label">
              <i className="fas fa-moon" style={{ marginRight: 6, color: "var(--gray-400)" }} /> Dark Mode Toggle
            </span>
            <label className="hc-sw">
              <input type="checkbox" name="showDarkmode" defaultChecked={settings.showDarkmode} />
              <span className="hc-sl" />
            </label>
          </div>
          <div className="tog-row">
            <span className="tog-label">
              <i className="fas fa-quote-right" style={{ marginRight: 6, color: "var(--gray-400)" }} /> Tagline next to logo
            </span>
            <label className="hc-sw">
              <input type="checkbox" name="showTagline" defaultChecked={settings.showTagline} />
              <span className="hc-sl" />
            </label>
          </div>
        </AccordionSection>
      </form>

      <form action={saveNavMenuItems} className="hc-panel">
        <div className="hc-savebar">
          <h2>
            <i className="fas fa-bars" style={{ color: "var(--primary)", marginRight: 6 }} /> Navigation Menu
          </h2>
          <button type="submit" className="hc-save-btn">
            <i className="fas fa-save" /> Save Menu
          </button>
        </div>
        <div style={{ padding: "18px" }}>
          <p className="hint" style={{ marginBottom: "0.75rem" }}>
            Leave a row blank to remove it.
          </p>
          <MenuItemsEditor initial={navItems} />
        </div>
      </form>
    </div>
  );
}
