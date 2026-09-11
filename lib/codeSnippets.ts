import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "./db";

export interface CodeSnippets {
  header: string;
  body: string;
  footer: string;
}

const DEFAULTS: CodeSnippets = { header: "", body: "", footer: "" };

/**
 * The original stores these in includes/code_snippets.json on local disk.
 * Serverless deployments don't have persistent local disk, so this is
 * moved into the `app_config` table under the 'code_snippets' key
 * (JSON-encoded, same shape). Injected at: 'header' → <head> (via the
 * root layout), 'body' → right after the header markup, 'footer' → end
 * of body — matching the original's three injection points exactly.
 */
const getCodeSnippetsCached = unstable_cache(
  async (): Promise<CodeSnippets> => {
  try {
    const row = await prisma.appConfig.findUnique({ where: { configKey: "code_snippets" } });
    if (!row?.configValue) return DEFAULTS;
    const parsed = JSON.parse(row.configValue);
    return {
      header: typeof parsed.header === "string" ? parsed.header : "",
      body: typeof parsed.body === "string" ? parsed.body : "",
      footer: typeof parsed.footer === "string" ? parsed.footer : "",
    };
  } catch {
    return DEFAULTS;
  }
  },
  ["code-snippets"],
  { revalidate: 300, tags: ["code-snippets"] }
);
export const getCodeSnippets = cache(getCodeSnippetsCached);
