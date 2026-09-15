import { getCodeSnippets } from "@/lib/codeSnippets";
import { saveCodeSnippets } from "@/lib/codeSnippetsAdmin";
import { SnippetEditor } from "@/components/admin/SnippetEditor";

/**
 * Restored to the earlier, simpler card layout per explicit request
 * ("UI pehle jaisa wala rakho, but text yahi rakhna jo abhi hai"), so
 * this deliberately keeps three things from the later rebuild rather
 * than reverting wholesale:
 *  - the short one-line hints (the point of Phase 84 was removing the
 *    repeated verbose explanation, and that stays removed),
 *  - SnippetEditor's line-number gutter and Tab-to-indent behaviour,
 *  - no local <h2> title, since TopNav already renders the page title
 *    (restoring one would reintroduce the Phase 90 duplicate-heading bug).
 */
export default async function CodeSnippetsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const { success } = await searchParams;
  const snippets = await getCodeSnippets();

  const fields = [
    {
      id: "header",
      label: "Header (<head>)",
      hint: "Analytics tags, meta verification, custom <style>.",
      value: snippets.header,
      placeholder: "<!-- e.g. Google Analytics, meta verification -->",
    },
    {
      id: "body",
      label: "Body (right after header)",
      hint: "Banners, consent widgets.",
      value: snippets.body,
      placeholder: "<!-- e.g. consent banner -->",
    },
    {
      id: "footer",
      label: "Footer (end of page)",
      hint: "Chat widgets, deferred scripts.",
      value: snippets.footer,
      placeholder: "<!-- e.g. chat widget -->",
    },
  ];

  return (
    <div>
      {success && (
        <div className="cs-alert success" style={{ marginBottom: "1.25rem" }}>
          <i className="fas fa-check-circle" /> Code snippets saved!
        </div>
      )}

      <form action={saveCodeSnippets} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {fields.map((f) => (
          <div className="card" style={{ padding: "1.25rem" }} key={f.id}>
            <label htmlFor={f.id} style={{ fontWeight: 700, display: "block", marginBottom: "0.25rem" }}>
              {f.label}
            </label>
            <p style={{ fontSize: "0.8125rem", color: "var(--gray-500)", margin: "0 0 0.75rem" }}>{f.hint}</p>
            <SnippetEditor id={f.id} name={f.id} defaultValue={f.value} placeholder={f.placeholder} />
          </div>
        ))}

        <div>
          <button type="submit" className="btn btn-primary">
            <i className="fas fa-save" /> Save Snippets
          </button>
        </div>
      </form>
    </div>
  );
}
