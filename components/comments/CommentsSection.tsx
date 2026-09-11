import { getCommentTree } from "@/lib/comments";
import { CommentsClient } from "./CommentsClient";

const COMMENTS_PAGE_SIZE = 5;

export async function CommentsSection({ postId }: { postId: number }) {
  const { tree, total } = await getCommentTree(postId, 0, COMMENTS_PAGE_SIZE);

  return <CommentsClient postId={postId} initialComments={tree} initialTotal={total} />;
}
