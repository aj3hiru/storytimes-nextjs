import { guardPage } from "@/lib/pageGuard";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageForm } from "@/components/admin/PageForm";

export default async function EditPageRoute({ params }: { params: Promise<{ id: string }> }) {
  // Direct-URL access guard — see lib/pageGuard.tsx.
  const denied = await guardPage((p) => p.pages.edit, "You do not have permission to edit pages.");
  if (denied) return denied;

  const { id } = await params;
  const pageId = parseInt(id, 10);
  if (!Number.isFinite(pageId)) notFound();

  const page = await prisma.page.findUnique({ where: { id: pageId } });
  if (!page) notFound();

  return (
    <div>
      <div className="toolbar">
        <h2 className="toolbar-title">Edit Page</h2>
      </div>
      <PageForm page={page} />
    </div>
  );
}
