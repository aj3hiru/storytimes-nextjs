import { getAppConfig, POSTS_PER_PAGE } from "@/lib/config";
import { HomepageSettingsClient } from "@/components/admin/HomepageSettingsClient";

export default async function HomepageSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
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
