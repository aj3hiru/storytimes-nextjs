export function ShareButtons({ url, title }: { url: string; title: string }) {
  const encTitle = encodeURIComponent(title);
  const encUrl = encodeURIComponent(url);

  const links = [
    { label: "WhatsApp", href: `https://api.whatsapp.com/send?text=${encTitle}%20${encUrl}` },
    { label: "Telegram", href: `https://t.me/share/url?url=${encUrl}&text=${encTitle}` },
    { label: "X", href: `https://twitter.com/intent/tweet?url=${encUrl}&text=${encTitle}` },
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encUrl}&quote=${encTitle}` },
    { label: "Email", href: `mailto:?subject=${encTitle}&body=${encUrl}` },
  ];

  return (
    <div className="pst-share">
      {links.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer">
          {l.label}
        </a>
      ))}
    </div>
  );
}
