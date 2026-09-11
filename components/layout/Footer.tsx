import { getFooterSettings, FOOTER_PALETTE } from "@/lib/footer";
import { resolveSiteConfig } from "@/lib/config";

function nl2br(text: string): React.ReactNode[] {
  return text.split("\n").flatMap((line, i, arr) => (i < arr.length - 1 ? [line, <br key={i} />] : [line]));
}

export async function Footer() {
  const [footer, siteConfig] = await Promise.all([getFooterSettings(), resolveSiteConfig("")]);
  const p = FOOTER_PALETTE;

  const logoUrl = footer.brand.logo_url || siteConfig.siteLogo;
  const hasNewsletter = footer.sections.newsletter && footer.newsletter.enabled;
  const hasBrand = footer.sections.brand && footer.brand.enabled;
  const activeGroups = footer.sections.groups
    ? footer.groups.filter((g) => g.enabled !== false && g.links.some((l) => l.enabled !== false))
    : [];
  const hasGroups = activeGroups.length > 0;
  const hasCopyright = footer.sections.copyright;
  const hasFooterBody = hasBrand || hasGroups || hasCopyright;

  const copy = (footer.copyright_text || `© {year} {site_name}. All rights reserved.`)
    .replace("{year}", String(new Date().getFullYear()))
    .replace("{site_name}", siteConfig.siteName);

  if (!hasNewsletter && !hasFooterBody) return null;

  return (
    <>
      {hasNewsletter && (
        <section
          className="cms-footer-newsletter"
          style={{
            background: p.newsletterBackground,
            color: p.text,
            borderBottom: hasFooterBody ? `1px solid ${p.line}` : undefined,
          }}
        >
          <div className="cms-footer-newsletter__inner">
            <div>
              <h2>{footer.newsletter.title}</h2>
              <p>{footer.newsletter.subtitle}</p>
            </div>
            <form
              className="cms-footer-newsletter__form"
              action={footer.newsletter.action_url || undefined}
              method="post"
            >
              <input type="email" name="email" required placeholder={footer.newsletter.placeholder} />
              <button type="submit">{footer.newsletter.button_text || "Subscribe"}</button>
            </form>
          </div>
        </section>
      )}

      {hasFooterBody && (
        <footer className="cms-footer" style={{ background: p.background, color: p.text }}>
          <div className="cms-footer__inner">
            <div className="cms-footer__grid">
              {hasBrand && (
                <section className="cms-footer__brand">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt={siteConfig.siteName} />
                  ) : (
                    <strong className="cms-footer__brand-name">{siteConfig.siteName}</strong>
                  )}
                  {footer.brand.about.trim() && (
                    <div className="cms-footer__about">{nl2br(footer.brand.about)}</div>
                  )}
                  <div className="cms-footer__contact">
                    {footer.brand.address && (
                      <p>
                        <b>⌖</b>
                        {nl2br(footer.brand.address)}
                      </p>
                    )}
                    {footer.brand.email && (
                      <p>
                        <b>✉</b>
                        <a href={`mailto:${footer.brand.email}`}>{footer.brand.email}</a>
                      </p>
                    )}
                    {footer.brand.phone && (
                      <p>
                        <b>☎</b>
                        <a href={`tel:${footer.brand.phone}`}>{footer.brand.phone}</a>
                      </p>
                    )}
                  </div>
                </section>
              )}

              {hasGroups && (
                <div className="cms-footer__groups">
                  {activeGroups.map((group, gi) => {
                    const links = group.links.filter((l) => l.enabled !== false);
                    if (links.length === 0) return null;
                    return (
                      <section className="cms-footer__group" key={gi}>
                        <h3>{group.title}</h3>
                        <div className="cms-footer__links">
                          {links.map((link, li) => (
                            <a href={link.url || "#"} key={li}>
                              {link.label}
                            </a>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
            {hasCopyright && <div className="cms-footer__bottom">{copy}</div>}
          </div>
        </footer>
      )}
    </>
  );
}
