import { guardPage } from "@/lib/pageGuard";
import { getAppConfig, POSTS_PER_PAGE } from "@/lib/config";
import { HomepageSettingsClient } from "@/components/admin/HomepageSettingsClient";

export default async function HomepageSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  // Direct-URL access guard — see lib/pageGuard.tsx.
  const denied = await guardPage((p) => p.settings.general, "Only users with Settings access can change homepage settings.");
  if (denied) return denied;

  const { success } = await searchParams;
  const appConfig = await getAppConfig();

  return (
    <HomepageSettingsClient
      initialBreadcrumbEnabled={(appConfig.hp_breadcrumb_enabled ?? "1") === "1"}
      initialBreadcrumbText={appConfig.hp_breadcrumb_text ?? "Story"}
      initialPostsPerPage={parseInt(appConfig.hp_posts_per_page ?? String(POSTS_PER_PAGE), 10) || POSTS_PER_PAGE}
      successMessage={success ? "Homepage settings saved!" : null}
    />
  );
}
