import Link from "next/link";

export function Pagination({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  const range = 2;
  const start = Math.max(1, page - range);
  const end = Math.min(totalPages, page + range);
  const nodes: React.ReactNode[] = [];

  if (page > 1) {
    nodes.push(
      <Link href={buildHref(1)} key="first">
        &laquo; First
      </Link>,
      <Link href={buildHref(page - 1)} key="prev">
        &lsaquo; Prev
      </Link>
    );
  } else {
    nodes.push(
      <span className="disabled" key="first">
        &laquo; First
      </span>,
      <span className="disabled" key="prev">
        &lsaquo; Prev
      </span>
    );
  }

  if (start > 1) {
    nodes.push(
      <Link href={buildHref(1)} key="p1">
        1
      </Link>
    );
    if (start > 2) nodes.push(<span key="dots-start">...</span>);
  }

  for (let i = start; i <= end; i++) {
    nodes.push(
      i === page ? (
        <span className="current" key={i}>
          {i}
        </span>
      ) : (
        <Link href={buildHref(i)} key={i}>
          {i}
        </Link>
      )
    );
  }

  if (end < totalPages) {
    if (end < totalPages - 1) nodes.push(<span key="dots-end">...</span>);
    nodes.push(
      <Link href={buildHref(totalPages)} key="plast">
        {totalPages}
      </Link>
    );
  }

  if (page < totalPages) {
    nodes.push(
      <Link href={buildHref(page + 1)} key="next">
        Next &rsaquo;
      </Link>,
      <Link href={buildHref(totalPages)} key="last">
        Last &raquo;
      </Link>
    );
  } else {
    nodes.push(
      <span className="disabled" key="next">
        Next &rsaquo;
      </span>,
      <span className="disabled" key="last">
        Last &raquo;
      </span>
    );
  }

  return <nav className="pagination">{nodes}</nav>;
}
