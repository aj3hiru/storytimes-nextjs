import Link from "next/link";
import { prisma } from "@/lib/db";
import { UserManagerClient } from "@/components/admin/UserManagerClient";

/**
 * Re-verified against the live admin/user-manager.php's rendered HTML —
 * an earlier pass used a plain inline add-form and a single flat list;
 * the real page has a summary line, Users/Authors view tabs, a role
 * filter, and modal-based Create/Edit (not inline forms).
 */
export default async function UserManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; search?: string; role?: string }>;
}) {
  const { view, search, role } = await searchParams;
  const activeView = view === "authors" ? "authors" : "users";

  const [users, authorCount, activeCount, pendingCount, adminCount] = await Promise.all([
    prisma.user.findMany({
      where: {
        ...(search ? { OR: [{ username: { contains: search } }, { email: { contains: search } }] } : {}),
        ...(role && role !== "all" ? { role: role as "admin" | "editor" | "author" } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { author: true },
    }),
    prisma.author.count(),
    prisma.user.count({ where: { status: "active" } }),
    prisma.user.count({ where: { status: "pending" } }),
    prisma.user.count({ where: { role: "admin" } }),
  ]);
  const totalUsers = await prisma.user.count();

  const rows = users.map((u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }) : "—",
    fullName: u.author?.fullName ?? "",
    displayName: u.author?.name ?? "",
    bio: u.author?.bio ?? "",
    facebook: u.author?.facebook ?? "",
    twitter: u.author?.twitter ?? "",
    instagram: u.author?.instagram ?? "",
    linkedin: u.author?.linkedin ?? "",
    threads: u.author?.threads ?? "",
    permissions: u.permissions,
    mobileNumber: u.author?.mobileNumber ?? "",
    address: u.author?.address ?? "",
    designation: u.author?.designation ?? "",
    experience: u.author?.experience ?? "",
    languagesKnown: u.author?.languagesKnown ?? "",
    qualifications: u.author?.qualifications ?? "",
    certifications: u.author?.certifications ?? "",
    isFeatured: Boolean(u.author?.isFeatured),
    authorStatus: u.author?.status ?? "active",
  }));

  const otherUsersByRole = users.map((u) => ({ id: u.id, username: u.username }));

  return (
    <div>
      <div className="summary-line">
        <span>
          <b>{totalUsers}</b> Users
        </span>
        <span className="summary-sep">·</span>
        <span>
          <b>{adminCount}</b> Admins
        </span>
        <span className="summary-sep">·</span>
        <span>
          <b>{authorCount}</b> Author Profiles
        </span>
        <span className="summary-sep">·</span>
        <span>
          <b>{activeCount}</b> Active
        </span>
        <span className="summary-sep">·</span>
        <span>
          <b>{pendingCount}</b> Pending
        </span>
      </div>

      <div className="view-tabs">
        <Link href="/admin/user-manager?view=users" className={`view-tab${activeView === "users" ? " active" : ""}`}>
          Users <span className="view-tab-count">({totalUsers})</span>
        </Link>
        <Link href="/admin/user-manager?view=authors" className={`view-tab${activeView === "authors" ? " active" : ""}`}>
          Authors <span className="view-tab-count">({authorCount})</span>
        </Link>
      </div>

      {activeView === "users" ? (
        <>
          <div className="filter-section">
            <form method="GET">
              <input type="hidden" name="view" value="users" />
              <div className="filter-row">
                <div className="filter-group">
                  <label>Search</label>
                  <input type="text" name="search" className="filter-control" placeholder="Username or email..." defaultValue={search} />
                </div>
                <div className="filter-group">
                  <label>Role</label>
                  <select name="role" className="filter-control" defaultValue={role ?? "all"}>
                    <option value="all">All Roles</option>
                    <option value="admin">Admin</option>
                    <option value="editor">Editor</option>
                    <option value="author">Author</option>
                  </select>
                </div>
                <div className="filter-group" style={{ justifyContent: "flex-end" }}>
                  <label>&nbsp;</label>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button type="submit" className="btn btn-primary">
                      <i className="fas fa-search" /> Filter
                    </button>
                    <Link href="/admin/user-manager?view=users" className="btn btn-secondary">
                      <i className="fas fa-times" />
                    </Link>
                  </div>
                </div>
              </div>
            </form>
          </div>

          <UserManagerClient users={rows} otherUsersByRole={otherUsersByRole} />
        </>
      ) : (
        <div className="table-wrap">
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Author</th>
                  <th>Slug</th>
                  <th className="hide-mobile">Status</th>
                </tr>
              </thead>
              <tbody>
                {users
                  .filter((u) => u.author)
                  .map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="u-identity">
                          <div className="u-avatar">{(u.author?.name ?? u.username).charAt(0).toUpperCase()}</div>
                          <div>
                            <div className="u-name">{u.author?.name ?? u.username}</div>
                            <div className="u-email">{u.author?.email ?? u.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="text-muted">{u.author?.slug}</td>
                      <td className="hide-mobile">
                        <span className={`badge ${u.author?.status === "active" ? "badge-active" : "badge-inactive"}`}>{u.author?.status}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
