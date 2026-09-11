import { createPage, updatePage } from "@/lib/pageAdmin";
import { RichTextEditor } from "./RichTextEditor";

export interface PageFormData {
  id: number;
  title: string;
  slug: string;
  content: string | null;
  status: string;
  metaTitle: string | null;
  metaDescription: string | null;
}

export function PageForm({ page }: { page?: PageFormData }) {
  const action = page ? updatePage.bind(null, page.id) : createPage;

  return (
    <form action={action} className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <div className="filter-row" style={{ gridTemplateColumns: "2fr 1fr" }}>
        <div className="form-group">
          <label htmlFor="title">Title</label>
          <input id="title" name="title" className="form-control" defaultValue={page?.title} required />
        </div>
        <div className="form-group">
          <label htmlFor="status">Status</label>
          <select id="status" name="status" className="form-control" defaultValue={page?.status ?? "draft"}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="slug">
          Slug <span className="form-hint">— leave blank to auto-generate</span>
        </label>
        <input id="slug" name="slug" className="form-control" defaultValue={page?.slug} />
      </div>

      <div className="form-group">
        <label htmlFor="content">Content</label>
        <RichTextEditor name="content" defaultValue={page?.content ?? ""} minHeight={300} />
      </div>

      <div className="form-group">
        <label htmlFor="metaTitle">Meta Title</label>
        <input id="metaTitle" name="metaTitle" className="form-control" defaultValue={page?.metaTitle ?? ""} />
      </div>
      <div className="form-group">
        <label htmlFor="metaDescription">Meta Description</label>
        <textarea id="metaDescription" name="metaDescription" className="form-control" rows={2} defaultValue={page?.metaDescription ?? ""} />
      </div>

      <div>
        <button type="submit" className="btn btn-primary btn-lg">
          {page ? "Save Changes" : "Create Page"}
        </button>
      </div>
    </form>
  );
}
