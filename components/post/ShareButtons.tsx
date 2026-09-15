/**
 * Icon-only share row, per explicit request ("newbase jaisa chhota chhota
 * icon rakho lightweight, aur text nahi"). Previously rendered each
 * network's NAME as a text link. Each icon now carries its own brand
 * colour as a small circular button, with the name kept as an
 * aria-label/title so it stays accessible and hoverable without taking
 * up horizontal space.
 */
export function ShareButtons({ url, title }: { url: string; title: string }) {
  const encTitle = encodeURIComponent(title);
  const encUrl = encodeURIComponent(url);

  const links = [
    { label: "WhatsApp", icon: "fa-brands fa-whatsapp", color: "#25D366", href: `https://api.whatsapp.com/send?text=${encTitle}%20${encUrl}` },
    { label: "Telegram", icon: "fa-brands fa-telegram", color: "#229ED9", href: `https://t.me/share/url?url=${encUrl}&text=${encTitle}` },
    { label: "X", icon: "fa-brands fa-x-twitter", color: "#000000", href: `https://twitter.com/intent/tweet?url=${encUrl}&text=${encTitle}` },
    { label: "Facebook", icon: "fa-brands fa-facebook-f", color: "#1877F2", href: `https://www.facebook.com/sharer/sharer.php?u=${encUrl}&quote=${encTitle}` },
    { label: "Email", icon: "fa-solid fa-envelope", color: "#6b7280", href: `mailto:?subject=${encTitle}&body=${encUrl}` },
  ];

  return (
    <div className="pst-share">
      <span className="pst-share-label">Share</span>
      {links.map((l) => (
        <a
          key={l.label}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="pst-share-btn"
          style={{ backgroundColor: l.color }}
          aria-label={`Share on ${l.label}`}
          title={`Share on ${l.label}`}
        >
          <i className={l.icon} aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}
