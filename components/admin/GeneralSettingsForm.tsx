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

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="wps-primary" disabled={pending}>
      {pending ? "Saving…" : "Save Changes"}
    </button>
  );
}

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="wps-section">
      <h2>{title}</h2>
      {desc && <p className="wps-section-desc">{desc}</p>}
      <div className="wps-table">{children}</div>
    </section>
  );
}

function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="wps-row">
      <div className="wps-th">{htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}</div>
      <div className="wps-td">{children}</div>
    </div>
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
      <div className="wps-media-actions">
        {value && (
          <button type="button" className="wps-link-danger" onClick={() => onChange("")} disabled={busy}>
            Remove
          </button>
        )}
        <button type="button" className="wps-secondary" onClick={() => setLibraryOpen(true)} disabled={busy}>
          Media Library
        </button>
        <button type="button" className="wps-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? "Uploading…" : value ? `Change ${label}` : `Select ${label}`}
        </button>
      </div>
      <input ref={fileRef} type="file" accept={accept} onChange={onFile} hidden />
      {error && <p className="wps-error">{error}</p>}
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
    <form action={saveGeneralSettings} className="wps-wrap" onChange={() => setDirty(true)}>
      {saved && !dirty && (
        <div className="wps-notice success">
          <p>
            <strong>Settings saved.</strong> The whole site now uses the new values.
          </p>
        </div>
      )}

      <Section title="Site Identity" desc="How the site is named and recognised — in the header, browser tabs and search results.">
        <Row label="Site Title" htmlFor="wps-title">
          <input id="wps-title" className="wps-input" name="siteTitle" value={title} onChange={(e) => setTitle(e.target.value)} required />
        </Row>
        <Row label="Tagline" htmlFor="wps-tag">
          <input id="wps-tag" className="wps-input" name="siteTagline" value={tagline} onChange={(e) => setTagline(e.target.value)} />
          <p className="wps-desc">In a few words, explain what this site is about. Example: &ldquo;Discover new stories every day.&rdquo;</p>
        </Row>
        <Row label="Site Logo">
          <div className={`wps-media${logoSrc ? "" : " empty"}`}>
            {logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoSrc} alt="Site logo" style={{ maxWidth: Math.min(logoW * 2, 400), maxHeight: Math.min(logoH * 2, 160) }} />
            ) : (
              <span>No logo selected</span>
            )}
          </div>
          <ImagePicker value={logo} onChange={touch(setLogo)} accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" label="Logo" />
          <input type="hidden" name="siteLogo" value={logo} />
          <p className="wps-desc">Best: a transparent PNG or SVG, at least 300px wide. Without a logo the site title is shown.</p>
        </Row>
        <Row label="Logo Size">
          <div className="wps-inline">
            <label className="wps-mini">
              Width
              <input type="number" className="wps-input small" name="logoWidth" min={40} max={300} value={logoW} onChange={(e) => setLogoW(parseInt(e.target.value, 10) || 0)} />
              px
            </label>
            <label className="wps-mini">
              Height
              <input type="number" className="wps-input small" name="logoHeight" min={20} max={100} value={logoH} onChange={(e) => setLogoH(parseInt(e.target.value, 10) || 0)} />
              px
            </label>
          </div>
          <p className="wps-desc">Largest size of the logo in the site header (width 40–300px, height 20–100px).</p>
        </Row>
        <Row label="Header">
          <label className="wps-check">
            <input type="checkbox" name="headerShowsLogo" checked={showLogo && Boolean(logo)} disabled={!logo} onChange={(e) => setShowLogo(e.target.checked)} />
            Show the logo in the header instead of the site title
          </label>
          {!logo && <p className="wps-desc">Select a logo first.</p>}
        </Row>
        <Row label="Site Icon">
          <div className="wps-icon-row">
            <div className={`wps-icon${iconSrc ? "" : " empty"}`}>
              {iconSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={iconSrc} alt="Site icon" />
              ) : (
                <i className="fas fa-image" />
              )}
            </div>
          </div>
          <ImagePicker value={favicon} onChange={touch(setFavicon)} accept="image/png,image/x-icon,image/vnd.microsoft.icon,.ico,image/svg+xml,image/webp" label="Icon" />
          <input type="hidden" name="siteFavicon" value={favicon} />
          <p className="wps-desc">The icon in browser tabs and bookmarks. Square PNG, ICO or SVG, at least 512 × 512 pixels.</p>
        </Row>
      </Section>

      <Section title="Site Address">
        <Row label="Site Address (URL)" htmlFor="wps-url">
          <input id="wps-url" type="url" className="wps-input code" name="siteUrl" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com" />
          <p className="wps-desc">The full address of the site, with https://. Used in links, sitemaps and sharing.</p>
        </Row>
        <Row label="Administration Email" htmlFor="wps-mail">
          <input id="wps-mail" type="email" className="wps-input" name="adminEmail" defaultValue={values.adminEmail} />
          <p className="wps-desc">This address is used for admin purposes, like notifications.</p>
        </Row>
      </Section>

      <Section title="Search Engines" desc="What Google and other search engines show for the home page.">
        <Row label="Meta Description" htmlFor="wps-desc">
          <textarea id="wps-desc" className="wps-input large" rows={3} name="metaDescription" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <p className="wps-desc">
            <span className={`wps-count ${descState}`}>{descLen} characters</span> — 120 to 160 works best.
          </p>
          <div className="wps-serp" aria-label="Search result preview">
            <span className="wps-serp-url">{host}</span>
            <span className="wps-serp-title">
              {title || "Site title"}
              {tagline ? ` – ${tagline}` : ""}
            </span>
            <span className="wps-serp-text">{desc || "Your meta description will appear here."}</span>
          </div>
        </Row>
        <Row label="Meta Keywords" htmlFor="wps-kw">
          <input id="wps-kw" className="wps-input" name="metaKeywords" defaultValue={values.metaKeywords} />
          <p className="wps-desc">Comma separated. Optional — most search engines ignore it.</p>
        </Row>
      </Section>

      <Section title="Homepage">
        <Row label="Sidebar">
          <label className="wps-check">
            <input type="checkbox" name="homepageSidebarEnabled" defaultChecked={values.homepageSidebarEnabled} />
            Show the &ldquo;Top Stories&rdquo; sidebar on the homepage
          </label>
          <p className="wps-desc">When off, posts use the full width.</p>
        </Row>
      </Section>

      <Section title="Language &amp; Time">
        <Row label="Site Language" htmlFor="wps-lang">
          <select id="wps-lang" className="wps-input auto" name="siteLanguage" defaultValue={values.siteLanguage}>
            {LANGUAGES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Row>
        <Row label="Timezone" htmlFor="wps-tz">
          <select id="wps-tz" className="wps-input auto" name="timezone" defaultValue={values.timezone}>
            {TIMEZONES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <p className="wps-desc">Choose a city in the same time zone as you.</p>
        </Row>
        <Row label="Date Format">
          <fieldset className="wps-radios">
            {DATE_FORMATS.map(([v, l]) => (
              <label key={v}>
                <input type="radio" name="dateFormat" value={v} defaultChecked={values.dateFormat === v} />
                <span className="wps-radio-label">{l}</span>
                <code>{v}</code>
              </label>
            ))}
          </fieldset>
        </Row>
        <Row label="Time Format">
          <fieldset className="wps-radios">
            {TIME_FORMATS.map(([v, l]) => (
              <label key={v}>
                <input type="radio" name="timeFormat" value={v} defaultChecked={values.timeFormat === v} />
                <span className="wps-radio-label">{l}</span>
                <code>{v}</code>
              </label>
            ))}
          </fieldset>
        </Row>
        <Row label="Week Starts On" htmlFor="wps-week">
          <select id="wps-week" className="wps-input auto" name="weekStarts" defaultValue={values.weekStarts}>
            <option value="monday">Monday</option>
            <option value="sunday">Sunday</option>
          </select>
        </Row>
      </Section>

      <div className="wps-submit">
        <SaveButton />
        {dirty && <span className="wps-unsaved">You have unsaved changes.</span>}
      </div>
    </form>
  );
}
