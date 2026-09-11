export interface AdBlock {
  id: number;
  label: string;
  code: string;
  enabled: boolean;
  insertAfterParagraph: number;
}

export interface AdInserterConfig {
  blocks: AdBlock[];
  globalHeader: string;
  globalFooter: string;
  /** Renders at the top of the homepage's main content column, above the
   *  featured-post row — ports the `.ai-block` ad slot found in the live
   *  site's homepage (an MGID native-ad widget in the reference capture).
   *  Kept as a dedicated field rather than full page-type targeting on
   *  every block, since that's a bigger feature not otherwise built yet. */
  homepageTop: string;
}

export function defaultAdInserterConfig(): AdInserterConfig {
  return {
    blocks: Array.from({ length: 16 }, (_, i) => ({
      id: i + 1,
      label: `Block ${i + 1}`,
      code: "",
      enabled: false,
      insertAfterParagraph: 1,
    })),
    globalHeader: "",
    globalFooter: "",
    homepageTop: "",
  };
}
