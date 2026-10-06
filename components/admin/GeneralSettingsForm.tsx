"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveGeneralSettings } from "@/lib/generalSettingsAdmin";
import { uploadImageFast } from "@/lib/clientUpload";
import { resolveMediaUrl } from "@/lib/urls";
import { MediaLibraryModal } from "./MediaLibraryModal";

export interface GeneralSettingsValues {
  siteTitle: string;
  siteTagline: string;
  siteUrl: string;
  adminEmail: string;
  metaDescription: string;
  metaKeywords: string;
  homepageSidebarEnabled: boolean;
  siteLogo: string;
  siteFavicon: string;
  logoWidth: number;
  logoHeight: number;
  headerShowsLogo: boolean;
  siteLanguage: string;
  timezone: string;
  dateFormat: string;
  timeFormat: string;
  weekStarts: string;
}

const LANGUAGES = [
  ["en", "English"],
  ["hi", "Hindi (हिन्दी)"],
  ["bn", "Bengali (বাংলা)"],
  ["mr", "Marathi (मराठी)"],
  ["te", "Telugu (తెలుగు)"],
  ["ta", "Tamil (தமிழ்)"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["pt", "Portuguese"],
  ["ar", "Arabic"],
];
const TIMEZONES = [
  ["UTC", "UTC+0 — UTC"],
  ["Asia/Kolkata", "UTC+5:30 — Asia/Kolkata (IST)"],
  ["Asia/Dhaka", "UTC+6 — Asia/Dhaka"],
  ["Asia/Karachi", "UTC+5 — Asia/Karachi"],
  ["Asia/Dubai", "UTC+4 — Asia/Dubai"],
  ["Asia/Singapore", "UTC+8 — Asia/Singapore"],
  ["Asia/Tokyo", "UTC+9 — Asia/Tokyo"],
  ["Europe/London", "UTC+0 — Europe/London"],
  ["America/New_York", "UTC-5 — America/New_York"],
  ["America/Los_Angeles", "UTC-8 — America/Los_Angeles"],
];
const DATE_FORMATS = [
  ["M j, Y", "Jan 5, 2026"],
  ["Y-m-d", "2026-01-05"],
  ["m/d/Y", "01/05/2026"],
  ["d/m/Y", "05/01/2026"],
];
const TIME_FORMATS = [
  ["g:i A", "1:30 PM"],
  ["H:i", "13:30"],
];

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="gx-save" disabled={pending}>
      <i className={`fas ${pending ? "fa-spinner fa-spin" : "fa-save"}`} /> {pending ? "Saving…" : dirty ? "Save Changes" : "Save"}
    </button>
  );
}

function Card({ icon, color, title, sub, children }: { icon: string; color: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="gx-card">
      <div className="gx-card-hd">
        <span className="gx-ico" style={{ background: `${color}1a`, color }}>
          <i className={`fas ${icon}`} />
        </span>
        <div>
          <h3>{title}</h3>
          <p>{sub}</p>
        </div>
      </div>
      <div className="gx-card-bd">{children}</div>
    </section>
  );
}

/** Upload / pick from library / remove for one stored image path. */
function ImagePicker({ value, onChange, accept, label }: { value: string; onChange: (path: string) => void; accept: string; label: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Some browsers send .ico files without a type.
    if (!file.type && /\.ico$/i.test(file.name)) file = new File([file], file.name, { type: "image/x-icon" });
    setBusy(true);
    setError(null);
    try {
      // Saved to the media library only; the setting itself changes on Save.
      const r = await uploadImageFast(file, "post");
      onChange(r.filePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="gx-pick-btns">
        <button type="button" className="gx-btn primary" onClick={() => fileRef.current?.click()} disabled={busy}>
          <i className={`fas ${busy ? "fa-spinner fa-spin" : "fa-upload"}`} /> {busy ? "Uploading…" : value ? `Change ${label}` : `Upload ${label}`}
        </button>
        <button type="button" className="gx-btn" onClick={() => setLibraryOpen(true)} disabled={busy}>
          <i className="fas fa-images" /> Library
        </button>
        {value && (
          <button type="button" className="gx-btn danger" onClick={() => onChange("")} disabled={busy} title={`Remove ${label}`}>
            <i className="fas fa-trash-can" /> Remove
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept={accept} onChange={onFile} hidden />
      {error && (
        <p className="gx-err">
          <i className="fas fa-circle-exclamation" /> {error}
        </p>
      )}
      <MediaLibraryModal open={libraryOpen} onClose={() => setLibraryOpen(false)} onSelect={(item) => onChange(item.path.replace(/^\/+/, ""))} />
    </>
  );
}

export function GeneralSettingsForm({ values, saved }: { values: GeneralSettingsValues; saved: boolean }) {
  const [dirty, setDirty] = useState(false);
  const [title, setTitle] = useState(values.siteTitle);
  const [tagline, setTagline] = useState(values.siteTagline);
  const [url, setUrl] = useState(values.siteUrl);
  const [desc, setDesc] = useState(values.metaDescription);
  const [logo, setLogo] = useState(values.siteLogo);
  const [favicon, setFavicon] = useState(values.siteFavicon);
  const [logoW, setLogoW] = useState(values.logoWidth);
  const [logoH, setLogoH] = useState(values.logoHeight);
  const [showLogo, setShowLogo] = useState(values.headerShowsLogo);

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setDirty(true);
  };
  const descLen = desc.length;
  const descState = descLen === 0 ? "" : descLen < 70 ? "short" : descLen <= 160 ? "good" : "long";
  const host = url.replace(/^https?:\/\//, "").replace(/\/+$/, "") || "example.com";
  const logoSrc = logo ? resolveMediaUrl(logo) : "";
  const iconSrc = favicon ? resolveMediaUrl(favicon) : "";

  return (
    <form action={saveGeneralSettings} className="gx-wrap" onChange={() => setDirty(true)}>
      <div className="gx-bar">
        <div className="gx-bar-txt">
          {saved && !dirty ? (
            <span className="gx-ok">
              <i className="fas fa-circle-check" /> Saved — the whole site is updated.
            </span>
          ) : dirty ? (
            <span className="gx-dirty">
              <i className="fas fa-circle" /> Unsaved changes
            </span>
          ) : (
            <span className="gx-muted">Site name, logo, icon, SEO and region</span>
          )}
        </div>
        <SaveButton dirty={dirty} />
      </div>

      <div className="gx-grid">
        <div className="gx-col">
          <Card icon="fa-globe" color="#7c3aed" title="Site Identity" sub="Name, tagline, address and contact">
            <div className="gx-2">
              <div className="gx-f">
                <label htmlFor="gx-title">Site Title</label>
                <input id="gx-title" className="gx-inp" name="siteTitle" value={title} onChange={(e) => setTitle(e.target.value)} required />
                <p className="gx-hint">Shown in browser tabs, search results and the header.</p>
              </div>
              <div className="gx-f">
                <label htmlFor="gx-tag">Tagline</label>
                <input id="gx-tag" className="gx-inp" name="siteTagline" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Discover new stories every day" />
                <p className="gx-hint">A short line about the site.</p>
              </div>
              <div className="gx-f">
                <label htmlFor="gx-url">Site URL</label>
                <input id="gx-url" className="gx-inp" name="siteUrl" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
                <p className="gx-hint">Full address with https://</p>
              </div>
              <div className="gx-f">
                <label htmlFor="gx-mail">Admin Email</label>
                <input id="gx-mail" type="email" className="gx-inp" name="adminEmail" defaultValue={values.adminEmail} placeholder="you@example.com" />
                <p className="gx-hint">For notifications and system emails.</p>
              </div>
            </div>
          </Card>

          <Card icon="fa-magnifying-glass" color="#2563eb" title="Search Engines" sub="How the site appears on Google">
            <div className="gx-f">
              <label htmlFor="gx-desc">
                Meta Description
                <span className={`gx-count ${descState}`}>{descLen}/160</span>
              </label>
              <textarea id="gx-desc" className="gx-inp gx-ta" name="metaDescription" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="A short description of the site for search results (120–160 characters works best)" />
            </div>
            <div className="gx-f">
              <label htmlFor="gx-kw">Meta Keywords</label>
              <input id="gx-kw" className="gx-inp" name="metaKeywords" defaultValue={values.metaKeywords} placeholder="stories, short stories, fiction" />
              <p className="gx-hint">Comma separated. Optional — most search engines ignore it.</p>
            </div>
            <div className="gx-serp" aria-label="Google preview">
              <div className="gx-serp-site">
                {iconSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={iconSrc} alt="" />
                ) : (
                  <span className="gx-serp-dot">{(title || "S").charAt(0).toUpperCase()}</span>
                )}
                <span>
                  <strong>{title || "Site title"}</strong>
                  <small>{host}</small>
                </span>
              </div>
              <div className="gx-serp-title">
                {title || "Site title"}
                {tagline ? ` – ${tagline}` : ""}
              </div>
              <div className="gx-serp-desc">{desc || "Your meta description will show here."}</div>
            </div>
          </Card>

          <Card icon="fa-language" color="#d97706" title="Language & Region" sub="Language, time zone, date and time">
            <div className="gx-2">
              <div className="gx-f">
                <label htmlFor="gx-lang">Site Language</label>
                <select id="gx-lang" className="gx-inp" name="siteLanguage" defaultValue={values.siteLanguage}>
                  {LANGUAGES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="gx-f">
                <label htmlFor="gx-tz">Time Zone</label>
                <select id="gx-tz" className="gx-inp" name="timezone" defaultValue={values.timezone}>
                  {TIMEZONES.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="gx-f">
              <label>Date Format</label>
              <div className="gx-chips">
                {DATE_FORMATS.map(([v, l]) => (
                  <label key={v} className="gx-chip">
                    <input type="radio" name="dateFormat" value={v} defaultChecked={values.dateFormat === v} />
                    <span>{l}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="gx-2">
              <div className="gx-f">
                <label>Time Format</label>
                <div className="gx-chips">
                  {TIME_FORMATS.map(([v, l]) => (
                    <label key={v} className="gx-chip">
                      <input type="radio" name="timeFormat" value={v} defaultChecked={values.timeFormat === v} />
                      <span>{l}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="gx-f">
                <label htmlFor="gx-week">Week Starts On</label>
                <select id="gx-week" className="gx-inp" name="weekStarts" defaultValue={values.weekStarts}>
                  <option value="monday">Monday</option>
                  <option value="sunday">Sunday</option>
                </select>
              </div>
            </div>
          </Card>

          <Card icon="fa-house" color="#0891b2" title="Homepage" sub="Layout of the front page">
            <label className="gx-toggle">
              <span>
                <strong>Homepage sidebar</strong>
                <small>Show the &quot;Top Stories&quot; sidebar. When off, posts use the full width.</small>
              </span>
              <span className="ps-sw">
                <input type="checkbox" name="homepageSidebarEnabled" defaultChecked={values.homepageSidebarEnabled} />
                <span className="ps-sl" />
              </span>
            </label>
          </Card>
        </div>

        <div className="gx-col gx-side">
          <Card icon="fa-image" color="#059669" title="Site Logo" sub="Shown in the header, footer and admin sidebar">
            <div className="gx-logo-stage">
              <div className="gx-logo-light">
                {logoSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoSrc} alt="Logo preview" style={{ maxWidth: logoW, maxHeight: logoH }} />
                ) : (
                  <span className="gx-logo-text">{title || "Site title"}</span>
                )}
              </div>
              <div className="gx-logo-dark">
                {logoSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoSrc} alt="" style={{ maxWidth: logoW, maxHeight: logoH }} />
                ) : (
                  <span className="gx-logo-text">{title || "Site title"}</span>
                )}
              </div>
            </div>
            <p className="gx-hint" style={{ marginTop: 0 }}>
              {logoSrc ? "Preview on light and dark backgrounds." : "No logo yet — the site title is shown instead."}
            </p>
            <ImagePicker value={logo} onChange={touch(setLogo)} accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" label="logo" />
            <input type="hidden" name="siteLogo" value={logo} />

            <div className="gx-2" style={{ marginTop: "1rem" }}>
              <div className="gx-f">
                <label htmlFor="gx-lw">
                  Max width <span className="gx-unit">{logoW}px</span>
                </label>
                <input id="gx-lw" type="range" min={40} max={300} name="logoWidth" value={logoW} onChange={(e) => setLogoW(parseInt(e.target.value, 10))} />
              </div>
              <div className="gx-f">
                <label htmlFor="gx-lh">
                  Max height <span className="gx-unit">{logoH}px</span>
                </label>
                <input id="gx-lh" type="range" min={20} max={100} name="logoHeight" value={logoH} onChange={(e) => setLogoH(parseInt(e.target.value, 10))} />
              </div>
            </div>
            <label className="gx-toggle" style={{ borderTop: "1px solid var(--gray-100)", paddingTop: ".85rem" }}>
              <span>
                <strong>Show logo in the header</strong>
                <small>{logo ? "Off shows the site title as text instead." : "Upload a logo to use this."}</small>
              </span>
              <span className="ps-sw">
                <input type="checkbox" name="headerShowsLogo" checked={showLogo && Boolean(logo)} disabled={!logo} onChange={(e) => setShowLogo(e.target.checked)} />
                <span className="ps-sl" />
              </span>
            </label>
            <p className="gx-hint">Best: transparent PNG or SVG, at least 300px wide.</p>
          </Card>

          <Card icon="fa-star" color="#db2777" title="Site Icon" sub="Favicon — browser tab, bookmarks, home screen">
            <div className="gx-tab-prev">
              <div className="gx-tab">
                {iconSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={iconSrc} alt="Icon preview" />
                ) : (
                  <span className="gx-tab-blank">
                    <i className="fas fa-globe" />
                  </span>
                )}
                <span className="gx-tab-title">{title || "Site title"}</span>
                <i className="fas fa-xmark" />
              </div>
              {iconSrc && (
                <div className="gx-icon-sizes">
                  {[48, 32, 16].map((s) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={s} src={iconSrc} alt="" width={s} height={s} />
                  ))}
                </div>
              )}
            </div>
            <ImagePicker value={favicon} onChange={touch(setFavicon)} accept="image/png,image/x-icon,image/vnd.microsoft.icon,.ico,image/svg+xml,image/webp" label="icon" />
            <input type="hidden" name="siteFavicon" value={favicon} />
            <p className="gx-hint">Square image — PNG, ICO or SVG, 512×512 works everywhere. Browsers can take a few minutes to show a new icon.</p>
          </Card>
        </div>
      </div>
    </form>
  );
}
