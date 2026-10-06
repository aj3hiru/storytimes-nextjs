import Link from "next/link";

/** Page numbers to show: first, last, and a window around the current page, with gaps as null. */
function pageWindow(page: number, totalPages: number): (number | null)[] {
  const set = new Set([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((p) => set.add(p));
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((p) => set.add(p));
  const pages = [...set].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push(null);
    out.push(p);
  });
  return out;
}

/**
 * Admin list pagination: "Showing 21–40 of 686 posts", Prev/Next, first/last
 * and nearby page numbers with gaps, and a jump-to-page box.
 * `hrefBase` is the list URL with its other query params, ending in "?" or "&".
 */
export function AdminPagination({
  page,
  totalPages,
  total,
  perPage,
  hrefBase,
  noun = "items",
}: {
  page: number;
  totalPages: number;
  total: number;
  perPage: number;
  hrefBase: string;
  noun?: string;
}) {
  if (totalPages <= 1) return null;
  const href = (p: number) => `${hrefBase}page=${p}`;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  const [path, query = ""] = hrefBase.split("?");
  const hidden = [...new URLSearchParams(query.replace(/&$/, "")).entries()].filter(([k]) => k !== "page");

  return (
    <nav className="ap-pagination" aria-label="Pagination">
      <span className="ap-info">
        Showing <strong>{from.toLocaleString("en-IN")}</strong>–<strong>{to.toLocaleString("en-IN")}</strong> of <strong>{total.toLocaleString("en-IN")}</strong> {noun}
      </span>
      <div className="ap-pages">
        {page > 1 ? (
          <Link href={href(page - 1)} className="ap-btn" rel="prev" aria-label="Previous page">
            <i className="fas fa-chevron-left" /> <span className="ap-txt">Prev</span>
          </Link>
        ) : (
          <span className="ap-btn disabled">
            <i className="fas fa-chevron-left" /> <span className="ap-txt">Prev</span>
          </span>
        )}
        {pageWindow(page, totalPages).map((p, i) =>
          p === null ? (
            <span key={`gap${i}`} className="ap-gap">
              …
            </span>
          ) : (
            <Link key={p} href={href(p)} className={`ap-num${p === page ? " active" : ""}`} aria-current={p === page ? "page" : undefined}>
              {p}
            </Link>
          )
        )}
        {page < totalPages ? (
          <Link href={href(page + 1)} className="ap-btn" rel="next" aria-label="Next page">
            <span className="ap-txt">Next</span> <i className="fas fa-chevron-right" />
          </Link>
        ) : (
          <span className="ap-btn disabled">
            <span className="ap-txt">Next</span> <i className="fas fa-chevron-right" />
          </span>
        )}
      </div>
      {totalPages > 7 && (
        <form action={path} method="get" className="ap-jump">
          {hidden.map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <label>
            Go to
            <input type="number" name="page" min={1} max={totalPages} defaultValue={page} aria-label="Page number" />
          </label>
        </form>
      )}
    </nav>
  );
}
