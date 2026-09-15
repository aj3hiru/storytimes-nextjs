import { getAppConfig, getSiteSettings } from "@/lib/config";
import { headers } from "next/headers";
import { resolveMediaUrl } from "@/lib/urls";
import { saveGeneralSettings } from "@/lib/generalSettingsAdmin";
import { ImageUploadField } from "@/components/admin/ImageUploadField";
import { isStorageConfigured } from "@/lib/storageConfig";
import { GeneralSettingsTabs } from "@/components/admin/GeneralSettingsTabs";

/** Re-verified against the live admin/general-settings.php's rendered
 *  HTML — an earlier pass used a single long stacked form; the real page
 *  is a sticky save-bar + colored rail-nav with 3 panels. */
export default async function GeneralSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const { success } = await searchParams;
  const [appConfig, siteSettings] = await Promise.all([getAppConfig(), getSiteSettings()]);

  // Real gap fixed here: this field showed a blank placeholder until an
  // admin manually typed the domain in, even though the actual current
  // domain is right there in the request — detect it as the default so
  // a fresh install shows the right value immediately instead of an
  // empty box that looks broken.
  const headerList = await headers();
  const currentDomain = `https://${headerList.get("host") ?? ""}`;
  const siteUrlDefault = appConfig.site_url?.trim() || currentDomain;

  return (
    <div className="gs-wrap">
      <form action={saveGeneralSettings}>
        <div className="gs-savebar">
          <h2>
            <i className="fas fa-sliders-h" /> General Settings
          </h2>
          <button type="submit" className="gs-save-btn">
            <i className="fas fa-save" /> Save Changes
          </button>
        </div>

        {success && (
          <div className="alert alert-success" style={{ margin: "0 20px 16px" }}>
            <i className="fas fa-check-circle" /> Settings saved successfully!
          </div>
        )}

        <GeneralSettingsTabs
          identityPanel={
            <>
              <div className="gs-grid">
                <div className="gs-f">
                  <label>
                    <i className="fas fa-heading" style={{ marginRight: 5, color: "#7c3aed" }} /> Site Title
                  </label>
                  <input type="text" className="gs-inp" name="siteTitle" defaultValue={appConfig.site_title ?? ""} required />
                  <p className="hint">Your site&apos;s name — shown in browser tabs, search results and header.</p>
                </div>
                <div className="gs-f">
                  <label>
                    <i className="fas fa-quote-right" style={{ marginRight: 5, color: "#7c3aed" }} /> Tagline
                  </label>
                  <input type="text" className="gs-inp" name="siteTagline" defaultValue={appConfig.site_tagline ?? ""} />
                  <p className="hint">A short description of your site shown below the title.</p>
                </div>
                <div className="gs-f">
                  <label>
                    <i className="fas fa-link" style={{ marginRight: 5, color: "#7c3aed" }} /> Site URL
                  </label>
                  <input type="text" className="gs-inp" name="siteUrl" defaultValue={siteUrlDefault} placeholder="https://example.com" />
                  <p className="hint">The full URL of your website including https://</p>
                </div>
                <div className="gs-f">
                  <label>
                    <i className="fas fa-envelope" style={{ marginRight: 5, color: "#7c3aed" }} /> Admin Email
                  </label>
                  <input type="email" className="gs-inp" name="adminEmail" defaultValue={appConfig.admin_email ?? ""} />
                  <p className="hint">Used for notifications and system emails.</p>
                </div>
              </div>
              <div className="gs-f" style={{ marginTop: 4 }}>
                <label>
                  <i className="fas fa-align-left" style={{ marginRight: 5, color: "#7c3aed" }} /> Meta Description
                </label>
                <textarea className="gs-ta" name="metaDescription" defaultValue={appConfig.meta_description ?? ""} placeholder="A brief description of your site for search engines (150–160 characters recommended)" />
                <p className="hint">Shown in Google search results. Keep it under 160 characters.</p>
              </div>
              <div className="gs-f">
                <label>
                  <i className="fas fa-tags" style={{ marginRight: 5, color: "#7c3aed" }} /> Meta Keywords
                </label>
                <input type="text" className="gs-inp" name="metaKeywords" defaultValue={appConfig.meta_keywords ?? ""} />
                <p className="hint">Comma-separated keywords (optional — most search engines ignore this).</p>
              </div>
              <div className="gs-f">
                <div className="gs-f-row">
                  <label style={{ margin: 0 }}>
                    <i className="fas fa-table-columns" style={{ marginRight: 5, color: "#7c3aed" }} /> Homepage Sidebar
                  </label>
                  <label className="gs-sw">
                    <input type="checkbox" name="homepageSidebarEnabled" defaultChecked={(appConfig.homepage_sidebar_enabled ?? "1") === "1"} />
                    <span className="gs-sl" />
                  </label>
                </div>
                <p className="hint">Show the &quot;Top Stories&quot; sidebar on the homepage. When off, posts use the full width.</p>
              </div>
            </>
          }
          logoPanel={
            <div className="gs-grid">
              <div className="gs-f">
                <label>
                  <i className="fas fa-image" style={{ marginRight: 5, color: "#059669" }} /> Site Logo
                </label>
                {isStorageConfigured() ? (
                  <ImageUploadField name="siteLogo" purpose="logo" label="" defaultValue={siteSettings.site_logo ? resolveMediaUrl(siteSettings.site_logo) : ""} />
                ) : (
                  <input className="gs-inp" name="siteLogo" defaultValue={siteSettings.site_logo ?? ""} placeholder="Logo URL" />
                )}
                <p className="hint">Recommended: transparent PNG or SVG, at least 200px wide.</p>
              </div>
              <div className="gs-f">
                <label>
                  <i className="fas fa-star" style={{ marginRight: 5, color: "#059669" }} /> Site Icon (Favicon)
                </label>
                {isStorageConfigured() ? (
                  <ImageUploadField name="siteFavicon" purpose="favicon" label="" defaultValue={appConfig.site_favicon ? resolveMediaUrl(appConfig.site_favicon) : ""} />
                ) : (
                  <input className="gs-inp" name="siteFavicon" defaultValue={appConfig.site_favicon ?? ""} placeholder="Favicon URL" />
                )}
                <p className="hint">PNG, ICO, or SVG.</p>
              </div>
              <div className="gs-f">
                <label>Logo Width (px)</label>
                <input type="number" className="gs-inp" name="logoWidth" defaultValue={siteSettings.logo_width ?? "150"} />
              </div>
              <div className="gs-f">
                <label>Logo Height (px)</label>
                <input type="number" className="gs-inp" name="logoHeight" defaultValue={siteSettings.logo_height ?? "48"} />
              </div>
            </div>
          }
          localePanel={
            <>
              <div className="gs-grid">
                <div className="gs-f">
                  <label>
                    <i className="fas fa-flag" style={{ marginRight: 5, color: "#d97706" }} /> Site Language
                  </label>
                  <select className="gs-sel" name="siteLanguage" defaultValue={appConfig.site_language ?? "en"}>
                    <option value="en">English</option>
                    <option value="hi">Hindi (हिन्दी)</option>
                    <option value="bn">Bengali (বাংলা)</option>
                    <option value="mr">Marathi (मराठी)</option>
                    <option value="te">Telugu (తెలుగు)</option>
                    <option value="ta">Tamil (தமிழ்)</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="pt">Portuguese</option>
                    <option value="ar">Arabic</option>
                  </select>
                </div>
                <div className="gs-f">
                  <label>
                    <i className="fas fa-clock" style={{ marginRight: 5, color: "#d97706" }} /> Timezone
                  </label>
                  <select className="gs-sel" name="timezone" defaultValue={appConfig.timezone ?? "UTC"}>
                    <option value="UTC">UTC+0</option>
                    <option value="Asia/Kolkata">UTC+5:30 — Asia/Kolkata (IST)</option>
                    <option value="Asia/Dhaka">UTC+6 — Asia/Dhaka</option>
                    <option value="Asia/Karachi">UTC+5 — Asia/Karachi</option>
                    <option value="Asia/Dubai">UTC+4 — Asia/Dubai</option>
                    <option value="Asia/Singapore">UTC+8 — Asia/Singapore</option>
                    <option value="Asia/Tokyo">UTC+9 — Asia/Tokyo</option>
                    <option value="Europe/London">UTC+0 — Europe/London</option>
                    <option value="America/New_York">UTC-5 — America/New_York</option>
                    <option value="America/Los_Angeles">UTC-8 — America/Los_Angeles</option>
                  </select>
                </div>
              </div>

              <div className="gs-f" style={{ marginTop: 8 }}>
                <label>
                  <i className="fas fa-calendar" style={{ marginRight: 5, color: "#d97706" }} /> Date Format
                </label>
                <div className="gs-radio-group">
                  {[
                    { v: "M j, Y", l: "Jan 5, 2026" },
                    { v: "Y-m-d", l: "2026-01-05" },
                    { v: "m/d/Y", l: "01/05/2026" },
                    { v: "d/m/Y", l: "05/01/2026" },
                  ].map((opt) => (
                    <label key={opt.v} className={`gs-radio-row${(appConfig.date_format ?? "M j, Y") === opt.v ? " selected" : ""}`}>
                      <input type="radio" name="dateFormat" value={opt.v} defaultChecked={(appConfig.date_format ?? "M j, Y") === opt.v} />
                      <span className="gs-radio-lbl">{opt.l}</span>
                      <span className="gs-radio-code">{opt.v}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="gs-f" style={{ marginTop: 8 }}>
                <label>
                  <i className="fas fa-clock" style={{ marginRight: 5, color: "#d97706" }} /> Time Format
                </label>
                <div className="gs-radio-group">
                  {[
                    { v: "g:i A", l: "1:30 PM" },
                    { v: "H:i", l: "13:30" },
                  ].map((opt) => (
                    <label key={opt.v} className={`gs-radio-row${(appConfig.time_format ?? "g:i A") === opt.v ? " selected" : ""}`}>
                      <input type="radio" name="timeFormat" value={opt.v} defaultChecked={(appConfig.time_format ?? "g:i A") === opt.v} />
                      <span className="gs-radio-lbl">{opt.l}</span>
                      <span className="gs-radio-code">{opt.v}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="gs-f" style={{ marginTop: 8 }}>
                <label>Week Starts On</label>
                <select className="gs-sel" name="weekStarts" defaultValue={appConfig.week_starts ?? "monday"}>
                  <option value="monday">Monday</option>
                  <option value="sunday">Sunday</option>
                </select>
              </div>
            </>
          }
        />
      </form>
    </div>
  );
}
