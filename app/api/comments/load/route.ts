import { NextResponse, type NextRequest } from "next/server";
import { getCommentTree } from "@/lib/comments";
import { checkRateLimit } from "@/lib/rateLimit";

export async function GET(request: NextRequest) {
  const rl = await checkRateLimit("comments_load_hits", 60, 30);
  if (!rl.allowed) {
    return NextResponse.json({ comments: [], total: 0, error: "Too many requests" }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const postId = parseInt(searchParams.get("pId") ?? "0", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);
  const limit = 5;

  if (!postId || postId <= 0) {
    return NextResponse.json({ comments: [], total: 0, error: "Invalid post" }, { status: 400 });
  }
  if (offset < 0 || offset > 10000) {
    return NextResponse.json({ comments: [], total: 0, error: "Invalid offset" }, { status: 400 });
  }

  try {
    const { tree, total } = await getCommentTree(postId, offset, limit);
    return NextResponse.json({ comments: tree, total });
  } catch (err) {
    console.error("Load comments error:", err);
    return NextResponse.json({ comments: [], total: 0, error: "Server error" }, { status: 500 });
  }
}
