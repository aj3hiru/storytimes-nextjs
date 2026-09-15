import { getCodeSnippets } from "@/lib/codeSnippets";
import { saveCodeSnippets } from "@/lib/codeSnippetsAdmin";
import { SnippetEditor } from "@/components/admin/SnippetEditor";

/** Ported 1:1 from admin/code-snippets.php: one merged info banner up top
 *  (instead of repeating the explanation on every field) and three compact
 *  snippet-cards — icon, one-word title, a single one-line hint — each
 *  with a line-numbered code editor. */
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
        <div className="cs-alert success">
          <i className="fas fa-check-circle" /> Code snippets saved successfully! The site cache has been cleared as well.
        </div>
      )}

      <div className="cs-info-banner">
        <i className="fas fa-info-circle" />
        <div>
          Code entered here is injected directly into every page on your website.{" "}
          <strong>Header</strong> — printed inside <code>&lt;head&gt;</code> (Google Analytics, Search Console verification, custom meta).{" "}
          <strong>Body</strong> — printed right after <code>&lt;body&gt;</code> opens (GTM noscript, chat widget init).{" "}
          <strong>Footer</strong> — printed right before <code>&lt;/body&gt;</code> closes (ad scripts, cookie banners, lazy-load JS).
        </div>
      </div>

      <form action={saveCodeSnippets}>
        <div className="snippets-wrap">
          <div className="snippet-card">
            <div className="sc-head">
              <div className="sc-icon hdr">
                <i className="fas fa-code" />
              </div>
              <div>
                <div className="sc-title">Header</div>
                <div className="sc-hint">
                  Printed in the <code>&lt;head&gt;</code> section.
                </div>
              </div>
            </div>
            <SnippetEditor
              id="ta-header"
              name="header"
              placeholder="<!-- e.g. Google Analytics, Search Console verification tag, custom CSS -->"
              defaultValue={snippets.header}
            />
          </div>

          <div className="snippet-card">
            <div className="sc-head">
              <div className="sc-icon bdy">
                <i className="fas fa-align-left" />
              </div>
              <div>
                <div className="sc-title">Body</div>
                <div className="sc-hint">
                  Printed just below the opening <code>&lt;body&gt;</code> tag.
                </div>
              </div>
            </div>
            <SnippetEditor
              id="ta-body"
              name="body"
              placeholder="<!-- e.g. GTM noscript tag, chat widget script -->"
              defaultValue={snippets.body}
            />
          </div>

          <div className="snippet-card">
            <div className="sc-head">
              <div className="sc-icon ftr">
                <i className="fas fa-window-minimize" />
              </div>
              <div>
                <div className="sc-title">Footer</div>
                <div className="sc-hint">
                  Printed above the closing <code>&lt;/body&gt;</code> tag.
                </div>
              </div>
            </div>
            <SnippetEditor
              id="ta-footer"
              name="footer"
              placeholder="<!-- e.g. Ads script, cookie banner, lazy-load JS -->"
              defaultValue={snippets.footer}
            />
          </div>
        </div>

        <div className="cs-save-row">
          <button type="submit" className="btn-cs-save">
            <i className="fas fa-save" /> Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}
