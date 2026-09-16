import { guardPage } from "@/lib/pageGuard";
import { PageForm } from "@/components/admin/PageForm";

export default async function NewPageRoute() {
  // Direct-URL access guard — see lib/pageGuard.tsx.
  const denied = await guardPage((p) => p.pages.create, "You do not have permission to create pages.");
  if (denied) return denied;

  return (
    <div>
      <div className="toolbar">
        <h2 className="toolbar-title">New Page</h2>
      </div>
      <PageForm />
    </div>
  );
}
