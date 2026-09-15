"use client";

import type { FooterSettings } from "@/lib/footer";

const BG = "#171a29";
const TXT = "#e8eaf2";
const DIV = "rgba(255,255,255,.18)";
const COPY = "rgba(232,234,242,.72)";
const ACCENT = "#ffb400";

/**
 * Mirrors updatePreview() in footer-customizer.php almost line-for-line —
 * same mock colors, same "only show a border-top on the copyright line if
 * something rendered above it" logic, same fallback message when every
 * section is off. This is a live mock preview (not an iframe of the real
 * site), matching what the reference actually does.
 */
export function FooterPreview({ footer, siteName }: { footer: FooterSettings; siteName: string }) {
  const blocks: React.ReactNode[] = [];

  if (footer.sections.newsletter && footer.newsletter.enabled !== false) {
    blocks.push(
      <div
        key="newsletter"
        style={{
          background: "#3c4055",
          color: "#fff",
          padding: "13px 16px",
          margin: "-20px -20px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 14,
        }}
      >
        <div>
          <strong>{footer.newsletter.title}</strong>
          <div style={{ fontSize: 11, marginTop: 3, opacity: 0.75 }}>{footer.newsletter.subtitle}</div>
        </div>
        <div style={{ background: "#fff", color: "#777", borderRadius: 4, padding: "8px 10px", minWidth: 180 }}>
          {footer.newsletter.placeholder}{" "}
          <b
            style={{
              float: "right",
              background: ACCENT,
              color: "#171a29",
              margin: "-8px -10px -8px 8px",
              padding: "8px 10px",
            }}
          >
            {footer.newsletter.button_text}
          </b>
        </div>
      </div>
    );
  }

  if (footer.sections.brand && footer.brand.enabled !== false) {
    blocks.push(
      <div key="brand" style={{ display: "flex", gap: 18, alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 16, color: "#fff" }}>{footer.brand.logo_url || siteName || "Brand"}</strong>
          <div style={{ fontSize: 12, color: TXT, marginTop: 8, whiteSpace: "pre-line" }}>{footer.brand.about || ""}</div>
          <div style={{ fontSize: 12, color: TXT, marginTop: 8, whiteSpace: "pre-line" }}>{footer.brand.address || ""}</div>
          <div style={{ fontSize: 12, color: TXT }}>
            {footer.brand.email || ""} {footer.brand.phone || ""}
          </div>
        </div>
      </div>
    );
  }

  if (footer.sections.groups && footer.groups.length) {
    const activeGroups = footer.groups.filter((g) => g.enabled !== false);
    if (activeGroups.length) {
      blocks.push(
        <div
          key="groups"
          style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 20, marginBottom: 16 }}
        >
          {activeGroups.map((g, gi) => (
            <div key={gi} style={{ minWidth: 130 }}>
              <strong style={{ color: "#fff" }}>{g.title || ""}</strong>
              {g.links.filter((l) => l.enabled !== false).map((l, li) => (
                <div key={li} style={{ fontSize: 12, marginTop: 6, color: TXT }}>
                  {l.label || ""}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    }
  }

  if (footer.sections.copyright) {
    blocks.push(
      <p
        key="copyright"
        className="fp-copy"
        style={{
          borderTop: blocks.length ? `1px solid ${DIV}` : undefined,
          paddingTop: blocks.length ? 10 : undefined,
          color: COPY,
        }}
      >
        {footer.copyright_text}
      </p>
    );
  }

  return (
    <div className="footer-preview" style={{ background: BG }}>
      {blocks.length ? (
        blocks
      ) : (
        <p style={{ fontSize: 12, textAlign: "center", color: "rgba(255,255,255,.4)", margin: 0 }}>
          All footer sections are turned off.
        </p>
      )}
    </div>
  );
}
