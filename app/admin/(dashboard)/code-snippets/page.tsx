import { getCodeSnippets } from "@/lib/codeSnippets";
import { saveCodeSnippets } from "@/lib/codeSnippetsAdmin";

export default async function CodeSnippetsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const { success } = await searchParams;
  const snippets = await getCodeSnippets();

  return (
    <div>
      <div className="toolbar">
        <h2 className="toolbar-title">Code Snippets</h2>
      </div>

      {success && (
        <div className="alert alert-success">
          <i className="fas fa-check-circle" /> Code snippets saved!
        </div>
      )}

      <form action={saveCodeSnippets} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div className="card" style={{ padding: "1.25rem" }}>
          <label htmlFor="header" style={{ fontWeight: 700, display: "block", marginBottom: "0.5rem" }}>
            Header (&lt;head&gt;) — analytics tags, meta verification, custom CSS &lt;style&gt;
          </label>
          <textarea
            id="header"
            name="header"
            className="form-control"
            rows={6}
            style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.85rem" }}
            defaultValue={snippets.header}
          />
        </div>
        <div className="card" style={{ padding: "1.25rem" }}>
          <label htmlFor="body" style={{ fontWeight: 700, display: "block", marginBottom: "0.5rem" }}>
            Body (right after header) — banners, consent widgets
          </label>
          <textarea
            id="body"
            name="body"
            className="form-control"
            rows={6}
            style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.85rem" }}
            defaultValue={snippets.body}
          />
        </div>
        <div className="card" style={{ padding: "1.25rem" }}>
          <label htmlFor="footer" style={{ fontWeight: 700, display: "block", marginBottom: "0.5rem" }}>
            Footer (end of page) — chat widgets, tracking pixels
          </label>
          <textarea
            id="footer"
            name="footer"
            className="form-control"
            rows={6}
            style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.85rem" }}
            defaultValue={snippets.footer}
          />
        </div>
        <div>
          <button type="submit" className="btn btn-primary">
            Save Snippets
          </button>
        </div>
      </form>
    </div>
  );
}
