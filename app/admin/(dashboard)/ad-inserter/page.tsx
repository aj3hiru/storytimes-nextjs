import { getAppConfig } from "@/lib/config";
import { saveAdInserter } from "@/lib/adInserterAdmin";
import { defaultAdInserterConfig, type AdInserterConfig } from "@/lib/adInserterTypes";

export default async function AdInserterPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const { success } = await searchParams;
  const appConfig = await getAppConfig();

  let config: AdInserterConfig = defaultAdInserterConfig();
  try {
    if (appConfig.ad_inserter) {
      const saved = JSON.parse(appConfig.ad_inserter) as Partial<AdInserterConfig>;
      config = {
        blocks: saved.blocks?.length === 16 ? saved.blocks : config.blocks,
        globalHeader: saved.globalHeader ?? "",
        globalFooter: saved.globalFooter ?? "",
        homepageTop: saved.homepageTop ?? "",
      };
    }
  } catch {
    // fall back to defaults
  }

  return (
    <div>
      <div className="toolbar">
        <h2 className="toolbar-title">Ad Inserter</h2>
      </div>

      {success && (
        <div className="alert alert-success">
          <i className="fas fa-check-circle" /> Ad settings saved!
        </div>
      )}

      <form action={saveAdInserter} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div className="card" style={{ padding: "1.25rem" }}>
          <h3 style={{ marginBottom: "1rem" }}>Global Ad Code</h3>
          <div className="filter-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="form-group">
              <label htmlFor="globalHeader">Header (every page)</label>
              <textarea
                id="globalHeader"
                name="globalHeader"
                className="form-control"
                rows={4}
                style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.8rem" }}
                defaultValue={config.globalHeader}
              />
            </div>
            <div className="form-group">
              <label htmlFor="globalFooter">Footer (every page)</label>
              <textarea
                id="globalFooter"
                name="globalFooter"
                className="form-control"
                rows={4}
                style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.8rem" }}
                defaultValue={config.globalFooter}
              />
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: "1.25rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>Homepage Top Ad</h3>
          <p style={{ color: "var(--gray-500)", fontSize: "0.875rem", marginBottom: "1rem" }}>
            Renders at the very top of the homepage&apos;s content area, above the featured posts —
            this is where a native-ad-network widget (e.g. MGID) typically goes.
          </p>
          <div className="form-group">
            <label htmlFor="homepageTop">Ad code</label>
            <textarea
              id="homepageTop"
              name="homepageTop"
              className="form-control"
              rows={4}
              style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.8rem" }}
              defaultValue={config.homepageTop}
              placeholder="<script>...</script> or a widget snippet"
            />
          </div>
        </div>

        <div className="card" style={{ padding: "1.25rem" }}>
          <h3 style={{ marginBottom: "1rem" }}>In-Content Ad Blocks</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {config.blocks.map((block) => (
              <div key={block.id} style={{ border: "1px solid var(--gray-200)", borderRadius: "var(--radius)", padding: "1rem" }}>
                <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.5rem", alignItems: "center" }}>
                  <input type="hidden" name="blockLabel" value={block.label} />
                  <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontWeight: 700 }}>
                    <input type="checkbox" name="blockEnabled" value={block.id} defaultChecked={block.enabled} />
                    {block.label}
                  </label>
                  <span style={{ fontSize: "0.8rem", color: "var(--gray-500)" }}>Insert after paragraph</span>
                  <input
                    type="number"
                    name="blockParagraph"
                    min={1}
                    defaultValue={block.insertAfterParagraph}
                    className="form-control"
                    style={{ width: 70 }}
                  />
                </div>
                <textarea
                  name="blockCode"
                  className="form-control"
                  rows={2}
                  placeholder="Ad network code (AdSense, etc.)"
                  style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.8rem" }}
                  defaultValue={block.code}
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
