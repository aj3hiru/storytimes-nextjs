"use client";

/**
 * Real bug fixed here — this exact crash was in production logs:
 * "Error: Event handlers cannot be passed to Client Component props."
 * The author-filter <select onChange={...}> lived directly inside
 * AnalyticsPage, an async Server Component — Server Components render
 * to static markup only (no client JS runtime ships for their output
 * at all), so NO element they render can carry an event handler, not
 * even a plain native <select>. Extracted into this small Client
 * Component so the onChange (auto-submit the filter form on change) is
 * actually attachable.
 */
export function AuthorFilterSelect({
  selectedRange,
  filterAuthorUserId,
  authors,
}: {
  selectedRange: string;
  filterAuthorUserId: number | null;
  authors: { userId: number; name: string; user: { username: string } }[];
}) {
  return (
    <form method="GET" className="an-author-select">
      <input type="hidden" name="range" value={selectedRange} />
      <label htmlFor="author_id">Author</label>
      <select
        name="author_id"
        id="author_id"
        defaultValue={filterAuthorUserId ?? 0}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value={0}>All Authors</option>
        {authors.map((a) => (
          <option key={a.userId} value={a.userId}>
            {a.name || a.user.username}
          </option>
        ))}
      </select>
    </form>
  );
}
