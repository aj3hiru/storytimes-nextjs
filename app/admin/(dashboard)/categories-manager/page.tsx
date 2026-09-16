import { guardPage } from "@/lib/pageGuard";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { saveCategory } from "@/lib/categoryAdmin";
import { DeleteCategoryButton } from "@/components/admin/DeleteCategoryButton";
import { categoryUrl } from "@/lib/urls";

/**
 * Re-verified against the live admin/categories-manager.php's rendered
 * HTML — an earlier pass used a generic stacked card+table instead of the
 * real two-column layout (sticky form card + list card) with the summary
 * stat bar and SEO-completeness badges.
 */
export default async function CategoriesManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; success?: string; search?: string }>;
}) {
  // Direct-URL access guard — see lib/pageGuard.tsx.
  const denied = await guardPage((p) => p.blogs.manage_categories, "You do not have permission to manage categories.");
  if (denied) return denied;

  const { edit, success, search } = await searchParams;
  const editId = edit ? parseInt(edit, 10) : 0;

  const [categories, editing, postCounts] = await Promise.all([
    prisma.category.findMany({
      where: search ? { OR: [{ name: { contains: search } }, { slug: { contains: search } }] } : {},
      orderBy: { name: "asc" },
    }),
    editId ? prisma.category.findUnique({ where: { id: editId } }) : Promise.resolve(null),
    prisma.post.groupBy({ by: ["categoryId"], _count: true }),
  ]);
  const postCountByCategory = new Map(postCounts.map((pc) => [pc.categoryId, pc._count]));

  const seoCompleteCount = categories.filter((c) => c.metaTitle && c.metaDescription).length;
  const totalViews = categories.reduce((sum, c) => sum + (c.views ?? 0), 0);
  const formatViews = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

  return (
    <div>
      {success && (
        <div className="alert alert-success" style={{ marginBottom: "1rem" }}>
          <i className="fas fa-check-circle" /> Category {success} successfully!
        </div>
      )}

      <div className="summary-bar">
        <div className="summary-item">
          <span className="summary-label">Total Categories</span>
          <span className="summary-value">{categories.length}</span>
        </div>
        <div className="summary-divider" />
        <div className="summary-item">
          <span className="summary-label">SEO Complete</span>
          <span className="summary-value" style={{ color: "var(--success)" }}>
            {seoCompleteCount}
          </span>
        </div>
        <div className="summary-divider" />
        <div className="summary-item">
          <span className="summary-label">Missing SEO</span>
          <span className="summary-value" style={{ color: "var(--warning)" }}>
            {categories.length - seoCompleteCount}
          </span>
        </div>
        <div className="summary-divider" />
        <div className="summary-item">
          <span className="summary-label">Total Views</span>
          <span className="summary-value" style={{ color: "var(--info)" }}>
            {formatViews(totalViews)}
          </span>
        </div>
      </div>

      <div className="layout-grid">
        <div>
          <div className="form-card">
            {editing && (
              <div className="edit-mode-bar">
                <i className="fas fa-edit" /> Editing: {editing.name}
              </div>
            )}
            <div className="form-card-header">
              <div className="header-icon">
                <i className={`fas ${editing ? "fa-edit" : "fa-plus"}`} />
              </div>
              <h2>{editing ? "Edit Category" : "New Category"}</h2>
            </div>
            <div className="form-card-body">
              <form action={saveCategory}>
                <input type="hidden" name="editId" value={editing?.id ?? 0} />
                <div className="form-group">
                  <label htmlFor="name">
                    Name <span>*required</span>
                  </label>
                  <input id="name" name="name" className="form-control" placeholder="e.g. Love Stories" defaultValue={editing?.name} required />
                </div>
                <div className="form-group">
                  <label htmlFor="slug">
                    Slug <span>auto-generated</span>
                  </label>
                  <input id="slug" name="slug" className="form-control" placeholder="e.g. love-stories" defaultValue={editing?.slug} />
                </div>
                <div className="form-group">
                  <label htmlFor="metaTitle">
                    Meta Title <span>SEO</span>
                  </label>
                  <input
                    id="metaTitle"
                    name="metaTitle"
                    className="form-control"
                    placeholder="Page title for search engines"
                    maxLength={255}
                    defaultValue={editing?.metaTitle ?? ""}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="metaDescription">
                    Meta Description <span>SEO</span>
                  </label>
                  <textarea
                    id="metaDescription"
                    name="metaDescription"
                    className="form-control"
                    placeholder="Brief description for search results..."
                    defaultValue={editing?.metaDescription ?? ""}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="metaKeywords">
                    Meta Keywords <span>SEO</span>
                  </label>
                  <input
                    id="metaKeywords"
                    name="metaKeywords"
                    className="form-control"
                    placeholder="keyword1, keyword2, keyword3"
                    defaultValue={editing?.metaKeywords ?? ""}
                  />
                </div>
                <div className="form-actions">
                  <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                    {editing ? "Save Changes" : "Create Category"}
                  </button>
                  {editing && (
                    <Link href="/admin/categories-manager" className="btn btn-secondary">
                      Cancel
                    </Link>
                  )}
                </div>
              </form>
            </div>
          </div>
        </div>

        <div>
          <div className="filter-section" style={{ marginBottom: "1rem" }}>
            <form method="GET" style={{ margin: 0 }}>
              <div className="filter-row">
                <div className="filter-group">
                  <label>Search Categories</label>
                  <input type="text" name="search" className="filter-control" placeholder="Search by name or slug..." defaultValue={search} />
                </div>
                <div className="filter-actions">
                  <button type="submit" className="btn btn-primary">
                    <i className="fas fa-search" /> Search
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div className="list-card">
            <div className="list-card-header">
              <h2>
                All Categories <span style={{ fontWeight: 400, color: "var(--gray-500)", fontSize: "0.875rem" }}>({categories.length})</span>
              </h2>
            </div>
            <div className="table-wrap">
              <table className="cat-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name / Slug</th>
                    <th>SEO</th>
                    <th>Views</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat, i) => {
                    const isDefault = cat.slug === "default";
                    const seoComplete = Boolean(cat.metaTitle && cat.metaDescription);
                    return (
                      <tr key={cat.id} style={isDefault ? { background: "var(--primary-lighter)" } : undefined}>
                        <td style={{ color: "var(--gray-400)", fontSize: "0.875rem" }}>{i + 1}</td>
                        <td>
                          <div className="cat-name">
                            {cat.name}
                            {isDefault && (
                              <span className="cat-default-badge">
                                <i className="fas fa-shield-alt" /> DEFAULT
                              </span>
                            )}
                          </div>
                          <div style={{ marginTop: "0.3rem" }}>
                            <span className="cat-slug">{cat.slug}</span>
                          </div>
                        </td>
                        <td>
                          {seoComplete ? (
                            <span className="cat-seo-badge seo-ok">
                              <i className="fas fa-check" /> Complete
                            </span>
                          ) : (
                            <span className="cat-seo-badge seo-missing">
                              <i className="fas fa-minus" /> Missing
                            </span>
                          )}
                        </td>
                        <td className="cat-views">{formatViews(cat.views ?? 0)}</td>
                        <td>
                          <div className="row-actions">
                            <Link href={categoryUrl(cat.slug)} target="_blank" rel="noopener noreferrer" className="btn-action btn-view" title="View category page">
                              <i className="fas fa-eye" /> View
                            </Link>
                            <Link href={`/admin/categories-manager?edit=${cat.id}`} className="btn-action btn-edit">
                              <i className="fas fa-edit" /> Edit
                            </Link>
                            {isDefault ? (
                              <span title="The Default category can't be deleted" style={{ color: "var(--gray-300)" }}>
                                <i className="fas fa-lock" /> Delete
                              </span>
                            ) : (
                              <DeleteCategoryButton categoryId={cat.id} name={cat.name} />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <p style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--gray-400)" }}>
            {categories.reduce((sum, c) => sum + (postCountByCategory.get(c.id) ?? 0), 0)} total posts across all categories
          </p>
        </div>
      </div>
    </div>
  );
}
