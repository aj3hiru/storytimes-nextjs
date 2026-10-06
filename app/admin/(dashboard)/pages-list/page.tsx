import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { guardPage } from "@/lib/pageGuard";
import { prisma } from "@/lib/db";
import { staticPagePath } from "@/lib/urls";
import { DeletePageButton } from "@/components/admin/DeletePageButton";
import { AdminPagination } from "@/components/admin/AdminPagination";

const PER_PAGE = 20;

export default async function PagesListPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; status?: string; search?: string; page?: string }>;
}) {
  const denied = await guardPage((p) => p.pages.create || p.pages.edit || p.pages.delete, "You do not have permission to manage pages.");
  if (denied) return denied;

  const { success, status: statusRaw, search = "", page: pageRaw } = await searchParams;
  const status = statusRaw === "published" || statusRaw === "draft" ? statusRaw : undefined;
  const q = search.trim();

  const where: Prisma.PageWhereInput = {
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ title: { contains: q } }, { slug: { contains: q } }] } : {}),
  };
  const searchWhere: Prisma.PageWhereInput = q ? { OR: [{ title: { contains: q } }, { slug: { contains: q } }] } : {};

  const [total, all, published, drafts] = await Promise.all([
    prisma.page.count({ where }),
    prisma.page.count({ where: searchWhere }),
    prisma.page.count({ where: { ...searchWhere, status: "published" } }),
    prisma.page.count({ where: { ...searchWhere, status: "draft" } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  const page = Math.min(totalPages, Math.max(1, parseInt(pageRaw ?? "1", 10) || 1));
  const pages = await prisma.page.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    skip: (page - 1) * PER_PAGE,
    take: PER_PAGE,
    select: { id: true, title: true, slug: true, status: true, updatedAt: true, createdAt: true },
  });

  const qs = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = { status, search: q || undefined, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `?${s}` : "";
  };
  const tabs = [
    { key: "all", label: "All", count: all },
    { key: "published", label: "Published", count: published },
    { key: "draft", label: "Drafts", count: drafts },
  ];
  const fmt = (d: Date | null) => (d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—");
  const base = qs({ page: undefined });

  return (
    <div>
      <div className="allposts-header">
        <h2>Pages</h2>
        <div className="allposts-header-actions">
          <Link href="/admin/page-editor/new" className="btn-add-post">
            <span className="add-post-icon">
              <i className="fas fa-plus" />
            </span>{" "}
            Add New Page
          </Link>
        </div>
      </div>

      {success && (
        <div className="alert alert-success">
          <i className="fas fa-check-circle" /> Page {success} successfully!
        </div>
      )}

      <div className="post-status-tabs">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/pages-list${qs({ status: tab.key === "all" ? undefined : tab.key, page: undefined })}`}
            className={`pst-link${(status ?? "all") === tab.key ? " active" : ""}`}
          >
            {tab.label} <span className="pst-count">{tab.count}</span>
          </Link>
        ))}
      </div>

      <div className="posts-toolbar-card">
        <form method="GET" className="pl-search">
          {status && <input type="hidden" name="status" value={status} />}
          <div className="pt-search-wrap">
            <input type="text" name="search" className="pt-input" placeholder="Search pages…" defaultValue={q} />
            <button type="submit" className="btn btn-primary btn-sm">
              <i className="fas fa-search" /> Search
            </button>
            {q && (
              <Link href={`/admin/pages-list${qs({ search: undefined, page: undefined })}`} className="btn btn-secondary btn-sm">
                Clear
              </Link>
            )}
          </div>
        </form>
      </div>

      {pages.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <i className="fas fa-file-lines" />
          </div>
          <h3>{q || status ? "No pages found" : "No pages yet"}</h3>
          <p>{q || status ? "Try a different search or tab." : "Create your first static page (About Us, Privacy Policy, etc.)."}</p>
        </div>
      ) : (
        <div className="table-card">
          <div className="table-responsive">
            <table className="data-table pl-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Last updated</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => {
                  const url = staticPagePath(p.slug);
                  return (
                    <tr key={p.id}>
                      <td className="dt-title-td">
                        <div className="dt-title-row">
                          <div className="post-thumb-placeholder pl-icon">
                            <i className="fas fa-file-lines" />
                          </div>
                          <div className="dt-title-info">
                            <Link href={`/admin/page-editor/${p.id}`} className="pt-title">
                              {p.title}
                            </Link>
                            <div className="pt-author pl-url">{url}</div>
                            <div className="row-actions">
                              <Link href={`/admin/page-editor/${p.id}`} className="ra-link ra-edit">
                                <i className="fas fa-pen" /> Edit
                              </Link>
                              <Link href={url} target="_blank" className="ra-link ra-view">
                                <i className="fas fa-eye" /> View
                              </Link>
                              <DeletePageButton pageId={p.id} title={p.title} />
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`badge badge-${p.status}`}>{p.status === "draft" ? "Draft" : "Published"}</span>
                      </td>
                      <td className="text-muted" style={{ whiteSpace: "nowrap" }}>
                        <i className="fas fa-calendar-check" style={{ fontSize: "0.7rem", marginRight: 3 }} />
                        {fmt(p.updatedAt ?? p.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <AdminPagination
            page={page}
            totalPages={totalPages}
            total={total}
            perPage={PER_PAGE}
            hrefBase={`/admin/pages-list${base || "?"}${base ? "&" : ""}`}
            noun={total === 1 ? "page" : "pages"}
          />
        </div>
      )}
    </div>
  );
}
