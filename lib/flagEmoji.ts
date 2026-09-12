import { ADJUSTMENT_COUNTRIES } from "./adjustmentCountries";

/**
 * Real bug fixed here: `flagEmoji()` used to live in lib/dashboardStats.ts
 * alongside functions that import Prisma — a Server Component
 * (dashboard/page.tsx) then passed it as a PROP to a Client Component
 * (DashboardWidgets.tsx). Next.js does not allow passing plain functions
 * from a Server Component to a Client Component (only Server Actions,
 * which are a specific marked kind of function, may cross that
 * boundary) — this threw a hard server error on every dashboard load
 * ("A server error occurred"). Moved into its own file with zero
 * server-only dependencies, so the Client Component can just import and
 * call it directly instead of receiving it as a prop.
 */
const FLAG_EMOJI: Record<string, string> = Object.fromEntries(
  Object.keys(ADJUSTMENT_COUNTRIES).map((code) => [
    code,
    String.fromCodePoint(...[...code.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))),
  ])
);

export function flagEmoji(countryCode: string): string {
  return FLAG_EMOJI[countryCode] ?? "🌐";
}
