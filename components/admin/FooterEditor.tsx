"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveFooterSettingsAction } from "@/lib/footerCustomizerAdmin";
import type { FooterSettings, FooterGroup } from "@/lib/footer";
import { ImageUploadField } from "./ImageUploadField";
import { FooterPreview } from "./FooterPreview";

export function FooterEditor({ initial, siteName }: { initial: FooterSettings; siteName: string }) {
  const [footer, setFooter] = useState<FooterSettings>(initial);
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  function update<K extends keyof FooterSettings>(key: K, value: FooterSettings[K]) {
    setFooter((prev) => ({ ...prev, [key]: value }));
  }

  function updateSection(key: keyof FooterSettings["sections"], value: boolean) {
    setFooter((prev) => ({ ...prev, sections: { ...prev.sections, [key]: value } }));
  }

  function addGroup() {
    update("groups", [...footer.groups, { title: "New Group", enabled: true, links: [] }]);
  }
  function updateGroup(i: number, patch: Partial<FooterGroup>) {
    const groups = [...footer.groups];
    groups[i] = { ...groups[i], ...patch };
    update("groups", groups);
  }
  function removeGroup(i: number) {
    update(
      "groups",
      footer.groups.filter((_, gi) => gi !== i)
    );
  }
  function addLink(gi: number) {
    const groups = [...footer.groups];
    groups[gi] = { ...groups[gi], links: [...groups[gi].links, { label: "", url: "", enabled: true }] };
    update("groups", groups);
  }
  function updateLink(gi: number, li: number, patch: Partial<{ label: string; url: string; enabled: boolean }>) {
    const groups = [...footer.groups];
    const links = [...groups[gi].links];
    links[li] = { ...links[li], ...patch };
    groups[gi] = { ...groups[gi], links };
    update("groups", groups);
  }
  function removeLink(gi: number, li: number) {
    const groups = [...footer.groups];
    groups[gi] = { ...groups[gi], links: groups[gi].links.filter((_, x) => x !== li) };
    update("groups", groups);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const formData = new FormData();
    formData.set("footer_data", JSON.stringify(footer));
    try {
      await saveFooterSettingsAction(formData);
    } finally {
      setSaving(false);
      router.refresh();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="fc-wrap">
      <div className="fc-savebar">
        <span style={{ fontSize: 13, color: "var(--gray-500)" }}>Changes preview live below. Click Save to apply to site.</span>
        <button type="submit" className="fc-save-btn" disabled={saving}>
          <i className="fas fa-save" /> {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
      <div className="fc-card">
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <input
            type="checkbox"
            checked={footer.sections.newsletter}
            onChange={(e) => updateSection("newsletter", e.target.checked)}
          />
          <strong>Newsletter Bar</strong>
        </label>
        {footer.sections.newsletter && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input
                type="checkbox"
                checked={footer.newsletter.enabled}
                onChange={(e) => update("newsletter", { ...footer.newsletter, enabled: e.target.checked })}
              />
              Enabled
            </label>
            <div className="filter-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="form-group">
                <label>Title</label>
                <input
                  className="form-control"
                  value={footer.newsletter.title}
                  onChange={(e) => update("newsletter", { ...footer.newsletter, title: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Subtitle</label>
                <input
                  className="form-control"
                  value={footer.newsletter.subtitle}
                  onChange={(e) => update("newsletter", { ...footer.newsletter, subtitle: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Input placeholder</label>
                <input
                  className="form-control"
                  value={footer.newsletter.placeholder}
                  onChange={(e) => update("newsletter", { ...footer.newsletter, placeholder: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Button text</label>
                <input
                  className="form-control"
                  value={footer.newsletter.button_text}
                  onChange={(e) => update("newsletter", { ...footer.newsletter, button_text: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>
                  Form action URL <span className="form-hint">— your newsletter provider&apos;s submit endpoint</span>
                </label>
                <input
                  className="form-control"
                  value={footer.newsletter.action_url}
                  onChange={(e) => update("newsletter", { ...footer.newsletter, action_url: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="fc-card">
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <input type="checkbox" checked={footer.sections.brand} onChange={(e) => updateSection("brand", e.target.checked)} />
          <strong>Brand Column</strong>
        </label>
        {footer.sections.brand && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {/* Real production bug fix: this used to import isStorageConfigured
                from lib/storage.ts (marked `import "server-only"` because
                Node's `fs` module can't run in the browser) directly into
                THIS client component ("use client" above) — Next.js rejects
                that combination at build time. Since uploads always work
                (local-disk storage — see lib/localStorage.ts), the upload
                field is unconditional. */}
            <ImageUploadField name="footerLogoUrl" purpose="logo" label="Logo (blank = use site logo)" defaultValue={footer.brand.logo_url} />
            <div className="form-group">
              <label>About text</label>
              <textarea
                className="form-control"
                rows={3}
                value={footer.brand.about}
                onChange={(e) => update("brand", { ...footer.brand, about: e.target.value })}
              />
            </div>
            <div className="filter-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <div className="form-group">
                <label>Address</label>
                <input
                  className="form-control"
                  value={footer.brand.address}
                  onChange={(e) => update("brand", { ...footer.brand, address: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Email</label>
                <input
                  className="form-control"
                  value={footer.brand.email}
                  onChange={(e) => update("brand", { ...footer.brand, email: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input
                  className="form-control"
                  value={footer.brand.phone}
                  onChange={(e) => update("brand", { ...footer.brand, phone: e.target.value })}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="fc-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" checked={footer.sections.groups} onChange={(e) => updateSection("groups", e.target.checked)} />
            <strong>Link Groups</strong>
          </label>
          <button type="button" className="btn btn-secondary" onClick={addGroup}>
            + Add Group
          </button>
        </div>
        {footer.sections.groups &&
          footer.groups.map((group, gi) => (
            <div key={gi} className="footer-group-editor" style={{ border: "1px solid var(--gray-200)", borderRadius: 8, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                <input
                  className="form-control"
                  style={{ flex: 1 }}
                  value={group.title}
                  onChange={(e) => updateGroup(gi, { title: e.target.value })}
                  placeholder="Group title"
                />
                <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.8rem" }}>
                  <input type="checkbox" checked={group.enabled !== false} onChange={(e) => updateGroup(gi, { enabled: e.target.checked })} />
                  On
                </label>
                <button type="button" className="btn-action btn-delete" onClick={() => removeGroup(gi)}>
                  Remove
                </button>
              </div>
              {group.links.map((link, li) => (
                <div key={li} style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr auto auto", gap: 6, marginBottom: 6 }}>
                  <input
                    className="form-control"
                    placeholder="Label"
                    value={link.label}
                    onChange={(e) => updateLink(gi, li, { label: e.target.value })}
                  />
                  <input
                    className="form-control"
                    placeholder="/url"
                    value={link.url}
                    onChange={(e) => updateLink(gi, li, { url: e.target.value })}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.75rem" }}>
                    <input type="checkbox" checked={link.enabled !== false} onChange={(e) => updateLink(gi, li, { enabled: e.target.checked })} />
                    On
                  </label>
                  <button type="button" className="mini-btn" onClick={() => removeLink(gi, li)}>
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" className="btn-action btn-edit" onClick={() => addLink(gi)}>
                + Add Link
              </button>
            </div>
          ))}
      </div>

      <div className="fc-card">
        <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <input type="checkbox" checked={footer.sections.copyright} onChange={(e) => updateSection("copyright", e.target.checked)} />
          <strong>Copyright Line</strong>
        </label>
        {footer.sections.copyright && (
          <div className="form-group">
            <label>Text — use {"{year}"} and {"{site_name}"} placeholders</label>
            <input
              className="form-control"
              value={footer.copyright_text}
              onChange={(e) => update("copyright_text", e.target.value)}
              placeholder="© {year} {site_name}. All rights reserved."
            />
          </div>
        )}
      </div>

      {/* Real gap fixed here (item #14): this page had no preview at
          all — every other admin customizer in this project shows a
          live preview that updates as settings change; Footer
          Customizer just had the raw form with no way to see the
          result before saving. */}
      <div className="fc-card">
        <h3>
          <i className="fas fa-eye" /> Live Preview
        </h3>
        <FooterPreview footer={footer} siteName={siteName} />
      </div>
    </form>
  );
}
