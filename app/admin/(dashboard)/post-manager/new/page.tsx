import { guardPage } from "@/lib/pageGuard";
import { PostForm } from "@/components/admin/PostForm";

export default async function NewPostPage() {
  // Direct-URL access guard — see lib/pageGuard.tsx.
  const denied = await guardPage((p) => p.blogs.create, "You do not have permission to create posts.");
  if (denied) return denied;

  return <PostForm />;
}
