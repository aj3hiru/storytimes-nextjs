import { guardPage } from "@/lib/pageGuard";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { DeletePageButton } from "@/components/admin/DeletePageButton";

export default async function PagesListPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  // Direct-URL access guard — see lib/pageGuard.tsx.
  const denied = await guardPage((p) => p.pages.create || p.pages.edit || p.pages.delete, "You do not have permission to manage pages.");
  if (denied) return denied;

  const { success } = await searchParams;
  const pages = await prisma.page.findMany({ orderBy: { updatedAt: "desc" } });

  return (
    <div>
      <div className="toolbar">
        <div />
        <div className="toolbar-actions">
          <Link href="/admin/page-editor/new" className="btn btn-primary">
            <i className="fas fa-plus" /> New Page
          </Link>
        </div>
      </div>

      {success && (
        <div className="alert alert-success">
          <i className="fas fa-check-circle" /> Page {success} successfully!
        </div>
      )}

      {pages.length === 0 ? (
        <div className="empty-state">
          <h3>No pages yet</h3>
          <p>Create your first static page (About Us, Privacy Policy, etc).</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id}>
                  <td>{p.title}</td>
                  <td>/{p.slug}</td>
                  <td>
                    <span className={`badge badge-${p.status}`}>{p.status}</span>
                  </td>
                  <td>{p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : "—"}</td>
                  <td>
                    <div className="row-actions">
                      <Link href={`/admin/page-editor/${p.id}`} className="btn-action btn-edit">
                        Edit
                      </Link>
                      {/* Real bug fixed here: this pointed at `/{slug}`, which is the
                          POST route — so every page's View button 404'd. Static
                          pages live under `/page/{slug}` (see app/(public)/page/[slug]). */}
                      <Link href={`/page/${p.slug}`} target="_blank" className="btn-action btn-view">
                        View
                      </Link>
                      <DeletePageButton pageId={p.id} title={p.title} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
