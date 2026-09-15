import { getAppConfig } from "@/lib/config";
import { savePerformanceSettings } from "@/lib/performanceSettingsAdmin";
import { PsSection } from "@/components/admin/PsSection";

/**
 * Re-verified against the live admin/performance-settings.php's rendered
 * HTML — restyled to the real .ps-section/.ps-toggle-row/.ps-sw pattern.
 * Content unchanged from an earlier, already-correct decision: most of
 * the original's ~15 toggles (lazy-image markup, critical-CSS inlining,
 * WebP conversion, deferred JS, CLS fixes) are things Next.js already
 * does automatically via built-in image optimization and code-splitting
 * — exposing fake toggles for them here would be actively misleading,
 * not a missing feature. Only the settings that still do something in
 * this stack are shown.
 */
export default async function PerformanceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const { success } = await searchParams;
  const appConfig = await getAppConfig();

  return (
    <div className="ps-wrap">
      <div className="ps-alert warning" style={{ marginBottom: "1.25rem" }}>
        <i className="fas fa-bolt" />
        <span>Image optimization, code splitting and lazy loading are always on. Fine-tune the rest below.</span>
      </div>

      {success && (
        <div className="ps-alert success" style={{ marginBottom: "1.25rem" }}>
          <i className="fas fa-check-circle" /> Performance settings saved!
        </div>
      )}

      <form action={savePerformanceSettings}>
        <PsSection icon="fa-font" iconBg="#ede9fe" iconColor="#6366f1" title="Fonts" desc="Font loading strategy" defaultOpen>
          <div className="ps-toggle-row">
            <div className="ps-toggle-info">
              <div className="ps-toggle-label">System Font</div>
              <div className="ps-toggle-hint">Use the OS&apos;s own font instead of Inter — skips a Google Fonts request entirely.</div>
            </div>
            <label className="ps-sw">
              <input type="checkbox" name="systemFont" defaultChecked={appConfig.perf_system_font === "1"} />
              <span className="ps-sl" />
            </label>
          </div>
        </PsSection>

        <PsSection icon="fa-server" iconBg="#d1fae5" iconColor="#059669" title="Server & Caching" desc="Cache-control headers on public pages" defaultOpen>
          <div className="ps-toggle-row">
            <div className="ps-toggle-info">
              <div className="ps-toggle-label">Send Cache Headers</div>
              <div className="ps-toggle-hint">Adds Cache-Control headers to public pages so CDNs/browsers can cache them.</div>
            </div>
            <label className="ps-sw">
              <input type="checkbox" name="cacheHeaders" defaultChecked={appConfig.perf_cache_headers === "1"} />
              <span className="ps-sl" />
            </label>
          </div>
          <div className="ps-dur-row">
            <span className="ps-dur-label">Cache duration:</span>
            <input type="number" name="cacheDuration" min={0} max={86400} className="ps-dur-select" defaultValue={appConfig.perf_cache_duration ?? "60"} style={{ width: 100 }} />
            <span className="ps-dur-label">seconds</span>
          </div>
        </PsSection>

        <div className="ps-savebar">
          <span className="ps-save-hint">Changes apply immediately after saving.</span>
          <button type="submit" className="ps-save-btn">
            <i className="fas fa-save" /> Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}
