/**
 * Types extracted out of their original "use server" modules. Next.js
 * requires that a "use server" file export ONLY async functions — every
 * export in such a module is turned into a server-action reference, so a
 * non-function export resolves to something that isn't callable and the
 * first client call into that module throws "<minified name> is not a
 * function" at runtime. This was a real, shipped bug affecting
 * Import/Export, Country Redirection, AI Features and User Manager.
 */

export interface CloudflareDetectionInfo {
  isBehindCloudflare: boolean;
  cfIpCountry: string | null;
  cfRay: string | null;
  cfConnectingIp: string | null;
}

export interface OrphanedMedia {
  id: number;
  filePath: string;
  uploadedAt: Date | null;
  uploadedByUsername: string | null;
}

export interface FailRateRow {
  username: string;
  provider: string;
  success: number;
  fail: number;
  failRatePercent: number;
}

export interface ContentCounts {
  posts: number;
  media: number;
  logs: number;
  aiLogs: number;
}


export interface ViewCountDrift {
  postId: number;
  title: string;
  lifetimeTotal: number;
  dailySum: number;
  /** lifetimeTotal − dailySum. Positive: daily stats are missing views
   *  (the usual case — write 1 succeeded, write 2 failed). Negative is
   *  unusual and worth investigating rather than auto-fixing. */
  drift: number;
}

export interface ViewCountAuditResult {
  postsChecked: number;
  driftedPosts: ViewCountDrift[];
  totalLifetime: number;
  totalDaily: number;
}
