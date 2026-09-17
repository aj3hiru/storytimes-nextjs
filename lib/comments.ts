import { prisma } from "./db";

export interface CommentNode {
  id: number;
  name: string;
  content: string;
  date: Date | null;
  parentId: number | null;
  parentName: string | null;
  children: CommentNode[];
}

/**
 * Ports getCommentTree() from includes/functions.php, with one deliberate
 * change: the original query has NO `status = 'approved'` filter, meaning
 * pending (unmoderated) comments would be publicly visible to every reader
 * — comments-manager.php's approve/reject workflow would then have no
 * actual gatekeeping effect on the front end. That looks like an oversight
 * rather than an intended feature (the whole point of a `status` column +
 * an admin moderation queue is to hide pending content), so this port adds
 * `status: 'approved'` to the WHERE clause. Flagging this clearly here
 * rather than silently matching the original's behavior.
 */
export async function getCommentTree(
  postId: number,
  offset: number,
  limit: number
): Promise<{ tree: CommentNode[]; total: number }> {
  // `hidden: false` added alongside `status: 'approved'` — see the Comment
  // model's own doc comment in schema.prisma: an independent manual
  // override (new feature, no PHP equivalent) for quietly hiding a
  // specific comment without touching its moderation status.
  const total = await prisma.comment.count({ where: { postId, status: "approved", hidden: false } });

  const rows = await prisma.comment.findMany({
    where: { postId, status: "approved", hidden: false },
    orderBy: { date: "asc" },
    skip: offset,
    take: limit,
    include: { parent: { select: { name: true } } },
  });

  const map = new Map<number, CommentNode>();
  const tree: CommentNode[] = [];

  for (const c of rows) {
    map.set(c.id, {
      id: c.id,
      name: c.name,
      content: c.content,
      date: c.date,
      parentId: c.parentId,
      parentName: c.parent?.name ?? null,
      children: [],
    });
  }
  for (const c of rows) {
    const node = map.get(c.id)!;
    if (c.parentId && map.has(c.parentId)) {
      map.get(c.parentId)!.children.push(node);
    } else {
      tree.push(node);
    }
  }

  return { tree, total };
}
