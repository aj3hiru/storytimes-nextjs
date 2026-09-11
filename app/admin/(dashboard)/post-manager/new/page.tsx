import { PostForm } from "@/components/admin/PostForm";

export default function NewPostPage() {
  return (
    <div>
      <div className="toolbar">
        <h2 className="toolbar-title">Add Post</h2>
      </div>
      <PostForm />
    </div>
  );
}
