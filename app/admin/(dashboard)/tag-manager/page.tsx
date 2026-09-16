import { guardPage } from "@/lib/pageGuard";
import { prisma } from "@/lib/db";
import { TagManagerClient } from "@/components/admin/TagManagerClient";

type SortKey = "newest" | "oldest" | "popular" | "views" | "name";

/** Re-verified against the live admin/tag-manager.php's rendered HTML —
 *  an earlier pass used an inline add-form instead of the real modal-based
 *  Add/Edit flow, and was missing the sort dropdown entirely. */
export default async function TagManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; sort?: string }>;
}) {
  // Direct-URL access guard — see lib/pageGuard.tsx.
  const denied = await guardPage((p) => p.blogs.manage_tags, "You do not have permission to manage tags.");
  if (denied) return denied;

  const { search, sort } = await searchParams;
  const sortKey = (sort as SortKey) ?? "newest";

  const orderBy =
    sortKey === "oldest"
      ? ({ createdAt: "asc" } as const)
      : sortKey === "views"
        ? ({ views: "desc" } as const)
        : sortKey === "name"
          ? ({ name: "asc" } as const)
          : ({ createdAt: "desc" } as const); // "newest" and "popular" (post-count sort needs the join below)

  const [tags, postCounts] = await Promise.all([
    prisma.tag.findMany({
      where: search ? { name: { contains: search } } : {},
      orderBy,
      take: 100,
    }),
    prisma.postTag.groupBy({ by: ["tagId"], _count: true }),
  ]);
  const countByTag = new Map(postCounts.map((pc) => [pc.tagId.toString(), pc._count]));

  let rows = tags.map((tag) => ({
    id: Number(tag.id),
    name: tag.name,
    slug: tag.slug,
    isActive: tag.isActive ?? true,
    postCount: countByTag.get(tag.id.toString()) ?? 0,
    views: tag.views ?? 0,
  }));

  if (sortKey === "popular") {
    rows = rows.sort((a, b) => b.postCount - a.postCount);
  }

  return (
    <div>
      <TagManagerClient tags={rows} search={search} sort={sortKey} />
    </div>
  );
}
