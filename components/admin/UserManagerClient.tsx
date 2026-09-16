"use client";

import { useState } from "react";
import { PasswordField } from "./PasswordField";
import { createUser, updateUser } from "@/lib/userAdmin";
import { DeleteUserButton } from "./DeleteUserButton";
import { RoleSelect } from "./RoleSelect";
import { Portal } from "./Portal";
import { PermissionsPanel } from "./PermissionsPanel";
import { type Permissions, getDefaultPermissionsForRole, parsePermissions } from "@/lib/permissions";

type Role = "admin" | "editor" | "author";

export interface UserRow {
  id: number;
  username: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  fullName: string;
  displayName: string;
  bio: string;
  facebook: string;
  twitter: string;
  instagram: string;
  linkedin: string;
  threads: string;
  /** Raw stored permissions JSON — parsed into the Advance Access panel
   *  when Edit is opened, so custom per-user permissions aren't lost. */
  permissions: string | null;
  /** Which editor/admin owns this account for scoping. */
  managedById: number | null;
  // Extended author-profile fields — every one already existed as a real
  // column on the Author model but was never wired into this form, so it
  // could only be set by editing the database directly.
  mobileNumber: string;
  address: string;
  designation: string;
  experience: string;
  languagesKnown: string;
  qualifications: string;
  certifications: string;
  isFeatured: boolean;
  authorStatus: string;
}

/** Only the roles the acting user may actually assign are rendered —
 *  an editor sees "Author" alone, so there's no control offering
 *  something the server would reject. */
const ROLE_OPTIONS = [
  { value: "author", label: "Author — writes and manages only their own posts" },
  { value: "editor", label: "Editor — manages all posts, media and pages" },
  { value: "admin", label: "Admin — full access to everything" },
];

const ROLE_SUMMARY = (
  <div className="role-summary">
    <div className="rs-head">
      <i className="fas fa-info-circle" style={{ color: "#4f46e5", marginRight: 6 }} />
      Permissions are set automatically by role — open &quot;Advance Access&quot; below to customize
    </div>
    <div>
      <strong>Admin</strong> — full control of everything (posts, users, settings, analytics).
    </div>
    <div>
      <strong>Editor</strong> — can create/edit/delete <em>all</em> posts, manage comments/categories/tags, and view analytics for every author.
    </div>
    <div>
      <strong>Author</strong> — can create posts and can only edit/delete/view analytics for their <em>own</em> posts.
    </div>
  </div>
);

function ProfileFields({
  user,
  isAdmin,
  managerOptions,
}: {
  user?: UserRow;
  isAdmin: boolean;
  managerOptions: { id: number; username: string; role: string }[];
}) {
  return (
    <>
      <div className="form-section-title" style={{ marginTop: "1rem" }}>
        <i className="fas fa-id-card" /> Profile (optional)
      </div>
      <div className="form-grid form-grid-2">
        <div className="form-group">
          <label>Full Name</label>
          <input type="text" name="fullName" className="form-control" placeholder="Defaults to username" defaultValue={user?.fullName} />
        </div>
        <div className="form-group">
          <label>Display Name</label>
          <input type="text" name="displayName" className="form-control" placeholder="Defaults to username" defaultValue={user?.displayName} />
        </div>
      </div>
      <div className="form-group">
        <label>Bio</label>
        <textarea name="bio" className="form-control" rows={3} placeholder="Short author bio, shown on their posts" defaultValue={user?.bio} />
      </div>
      <div className="form-section-title" style={{ marginTop: "1rem" }}>
        <i className="fas fa-share-nodes" /> Social Profiles <span style={{ fontSize: "0.72rem", fontWeight: 400, color: "var(--gray-500)" }}>(optional)</span>
      </div>
      <div className="form-grid social-profile-grid">
        <div className="form-group">
          <label>
            <i className="fa-brands fa-facebook" style={{ color: "#1877f2", marginRight: "0.35rem" }} /> Facebook
          </label>
          <input type="url" name="facebook" className="form-control" placeholder="https://facebook.com/username" defaultValue={user?.facebook} />
        </div>
        <div className="form-group">
          <label>
            <i className="fa-brands fa-x-twitter" style={{ marginRight: "0.35rem" }} /> X / Twitter
          </label>
          <input type="url" name="twitter" className="form-control" placeholder="https://x.com/username" defaultValue={user?.twitter} />
        </div>
        <div className="form-group">
          <label>
            <i className="fa-brands fa-instagram" style={{ color: "#e1306c", marginRight: "0.35rem" }} /> Instagram
          </label>
          <input type="url" name="instagram" className="form-control" placeholder="https://instagram.com/username" defaultValue={user?.instagram} />
        </div>
        <div className="form-group">
          <label>
            <i className="fa-brands fa-linkedin" style={{ color: "#0a66c2", marginRight: "0.35rem" }} /> LinkedIn
          </label>
          <input type="url" name="linkedin" className="form-control" placeholder="https://linkedin.com/in/username" defaultValue={user?.linkedin} />
        </div>
        <div className="form-group">
          <label>
            <i className="fa-brands fa-threads" style={{ marginRight: "0.35rem" }} /> Threads
          </label>
          <input type="url" name="threads" className="form-control" placeholder="https://threads.net/@username" defaultValue={user?.threads} />
        </div>
      </div>

      {/* Extended author-profile fields, matching the reference's own
          Add/Edit User modal. Every one of these already existed as a
          real column on this project's Author model — they were simply
          never wired into this form, so until now they could only be set
          by editing the database directly. */}
      <div className="form-section-title" style={{ marginTop: "1rem" }}>
        <i className="fas fa-id-card" /> Profile Details
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Mobile</label>
          <input type="text" name="mobileNumber" className="form-control" placeholder="+91 XXXXXXXXXX" defaultValue={user?.mobileNumber} />
        </div>
        <div className="form-group">
          <label>Designation</label>
          <input type="text" name="designation" className="form-control" placeholder="e.g. Senior Writer" defaultValue={user?.designation} />
        </div>
      </div>
      <div className="form-group">
        <label>Address</label>
        <textarea name="address" className="form-control" rows={2} placeholder="City, State, Country..." defaultValue={user?.address} />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Experience</label>
          <input type="text" name="experience" className="form-control" placeholder="e.g. 5 years" defaultValue={user?.experience} />
        </div>
        <div className="form-group">
          <label>Languages Known</label>
          <input type="text" name="languagesKnown" className="form-control" placeholder="Hindi, English, ..." defaultValue={user?.languagesKnown} />
        </div>
      </div>
      <div className="form-group">
        <label>Qualifications</label>
        <input type="text" name="qualifications" className="form-control" placeholder="B.Sc, M.A., ..." defaultValue={user?.qualifications} />
      </div>
      <div className="form-group">
        <label>Certifications</label>
        <textarea name="certifications" className="form-control" rows={2} placeholder="Any notable certifications..." defaultValue={user?.certifications} />
      </div>
      <div className="form-row">
        <div className="form-group">
          <label>Author Status</label>
          <select name="authorStatus" className="form-control" defaultValue={user?.authorStatus ?? "active"}>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <div className="form-group" style={{ display: "flex", alignItems: "flex-end" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
            <input type="checkbox" name="isFeatured" defaultChecked={user?.isFeatured} />
            <span><i className="fas fa-star" style={{ color: "#f59e0b", marginRight: 4 }} />Featured Author</span>
          </label>
        </div>
      </div>

      {/* Admin-only. An editor must not be able to reassign their own
          authors to someone else, or claim another editor's — that would
          defeat the scoping entirely. When an editor creates a user it's
          set to them automatically server-side, which is the only way
          they can ever influence this. */}
      {isAdmin && (
        <div className="form-group">
          <label>
            Managed by <span className="form-hint">— which editor owns this account&apos;s users and traffic</span>
          </label>
          <select name="managedById" className="form-control" defaultValue={user?.managedById != null ? String(user.managedById) : ""}>
            <option value="">Not assigned (admins only)</option>
            {managerOptions
              .filter((m) => m.id !== user?.id)
              .map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.username} ({m.role})
                </option>
              ))}
          </select>
        </div>
      )}

      <div className="form-section-title" style={{ marginTop: "1rem" }}>
        <i className="fas fa-shield-alt" /> Permissions
      </div>
      {ROLE_SUMMARY}
    </>
  );
}

/** Ports the modal-based Add/Edit User flow from admin/user-manager.php:
 *  Profile + Social Profiles sections, a role-summary info box, and a
 *  collapsible "Advance Access" panel for per-user granular permission
 *  overrides on top of the role defaults (see PermissionsPanel). */
export function UserManagerClient({
  users,
  otherUsersByRole,
  assignableRoles,
  visiblePermissions,
  isAdmin,
  managerOptions,
}: {
  users: UserRow[];
  otherUsersByRole: { id: number; username: string }[];
  /** Roles this actor may assign — an editor gets ["author"] only. */
  assignableRoles: string[];
  /** Dotted permission keys this actor may even see. Showing a checkbox
   *  that would be stripped on save reads as a bug rather than a
   *  boundary, so the panel hides what can't be granted. */
  visiblePermissions: string[];
  isAdmin: boolean;
  /** Editors/admins who can own other accounts. Admin-only control. */
  managerOptions: { id: number; username: string; role: string }[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  // Advance Access state — role + granular permissions for the Create modal.
  // Changing the Role <select> resets these to that role's defaults (same
  // as applyRoleDefaults() in the reference: role changes always overwrite
  // the panel rather than trying to merge with prior custom picks).
  const [createRole, setCreateRole] = useState<Role>("author");
  const [createPerms, setCreatePerms] = useState<Permissions>(() => getDefaultPermissionsForRole("author"));

  function openCreateModal() {
    setCreateRole("author");
    setCreatePerms(getDefaultPermissionsForRole("author"));
    setCreateOpen(true);
  }

  function handleCreateRoleChange(role: Role) {
    setCreateRole(role);
    setCreatePerms(getDefaultPermissionsForRole(role));
  }

  // Same pair, but for the Edit modal — seeded from the user being edited.
  const [editRole, setEditRole] = useState<Role>("author");
  const [editPerms, setEditPerms] = useState<Permissions>(() => getDefaultPermissionsForRole("author"));

  function openEditModal(user: UserRow) {
    const role = user.role as Role;
    setEditing(user);
    setEditRole(role);
    setEditPerms(parsePermissions(user.permissions) ?? getDefaultPermissionsForRole(role));
  }

  function handleEditRoleChange(role: Role) {
    setEditRole(role);
    setEditPerms(getDefaultPermissionsForRole(role));
  }

  return (
    <>
      <div className="toolbar">
        <div>
          <div className="toolbar-title">All Users</div>
          <div className="toolbar-sub">{users.length} users found</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={openCreateModal}>
          <i className="fas fa-user-plus" /> Add User
        </button>
      </div>

      <div className="table-wrap">
        <div className="table-responsive">
          <table>
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th className="hide-mobile">Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="u-identity">
                      <div className="u-avatar">{u.username.charAt(0).toUpperCase()}</div>
                      <div>
                        <div className="u-name">{u.username}</div>
                        <div className="u-email">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <RoleSelect userId={u.id} currentRole={u.role as "admin" | "editor" | "author"} />
                  </td>
                  <td className="hide-mobile" style={{ color: "var(--gray-500)", fontSize: "0.8125rem" }}>
                    {u.createdAt}
                  </td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="btn-action btn-edit" onClick={() => openEditModal(u)}>
                        <i className="fas fa-edit" /> <span>Edit</span>
                      </button>
                      <DeleteUserButton userId={u.id} username={u.username} otherUsers={otherUsersByRole} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create modal — rendered via Portal into document.body so it sits
          outside .main-content, matching newbase's DOM structure. Without
          this, .main-content's `will-change: transform` creates a new
          containing block for position:fixed children, trapping the
          overlay inside the content area instead of covering the viewport
          (this is why clicking "Add User" appeared to do nothing). */}
      <Portal>
      <div className={`modal-overlay${createOpen ? " open" : ""}`} onClick={() => setCreateOpen(false)}>
        <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">
            <div className="modal-title">
              <i className="fas fa-user-plus" style={{ color: "var(--primary)", marginRight: "0.5rem" }} /> Add New User
            </div>
            <button type="button" className="modal-close" onClick={() => setCreateOpen(false)}>
              <i className="fas fa-times" />
            </button>
          </div>
          <form
            action={async (formData) => {
              await createUser(formData);
              setCreateOpen(false);
            }}
          >
            <div className="modal-body">
              <div className="form-grid form-grid-2">
                <div className="form-group">
                  <label>
                    Username <span className="req">*</span>
                  </label>
                  <input type="text" name="username" className="form-control" required autoComplete="off" />
                </div>
                <div className="form-group">
                  <label>
                    Email <span className="req">*</span>
                  </label>
                  <input type="email" name="email" className="form-control" required autoComplete="off" />
                </div>
                <div className="form-group">
                  <label>
                    Password <span className="req">*</span>
                  </label>
                  <PasswordField name="password" required autoComplete="new-password" />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <select
                    name="role"
                    className="form-control"
                    value={createRole}
                    onChange={(e) => handleCreateRoleChange(e.target.value as Role)}
                  >
                    {ROLE_OPTIONS.filter((r) => assignableRoles.includes(r.value)).map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <ProfileFields isAdmin={isAdmin} managerOptions={managerOptions} />
              <PermissionsPanel permissions={createPerms} onChange={setCreatePerms} visibleKeys={visiblePermissions} />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                <i className="fas fa-save" /> Create User
              </button>
            </div>
          </form>
        </div>
      </div>
      </Portal>

      {/* Edit modal — also portaled, same reason as the create modal above. */}
      <Portal>
      <div className={`modal-overlay${editing ? " open" : ""}`} onClick={() => setEditing(null)}>
        {editing && (
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <i className="fas fa-user-edit" style={{ color: "var(--primary)", marginRight: "0.5rem" }} /> Edit User
              </div>
              <button type="button" className="modal-close" onClick={() => setEditing(null)}>
                <i className="fas fa-times" />
              </button>
            </div>
            <form
              action={async (formData) => {
                await updateUser(editing.id, formData);
                setEditing(null);
              }}
            >
              <div className="modal-body">
                <div className="form-grid form-grid-2">
                  <div className="form-group">
                    <label>
                      Username <span className="req">*</span>
                    </label>
                    <input type="text" name="username" className="form-control" required defaultValue={editing.username} />
                  </div>
                  <div className="form-group">
                    <label>
                      Email <span className="req">*</span>
                    </label>
                    <input type="email" name="email" className="form-control" required defaultValue={editing.email} />
                  </div>
                  <div className="form-group">
                    <label>New Password</label>
                    <PasswordField name="password" autoComplete="new-password" placeholder="Leave blank to keep current" />
                  </div>
                  <div className="form-group">
                    <label>Role</label>
                    <select
                      name="role"
                      className="form-control"
                      value={editRole}
                      onChange={(e) => handleEditRoleChange(e.target.value as Role)}
                    >
                      {ROLE_OPTIONS.filter((r) => assignableRoles.includes(r.value)).map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Status</label>
                    <select name="status" className="form-control" defaultValue={editing.status}>
                      <option value="active">Active</option>
                      <option value="suspended">Suspended</option>
                    </select>
                  </div>
                </div>
                <ProfileFields user={editing} isAdmin={isAdmin} managerOptions={managerOptions} />
                <PermissionsPanel permissions={editPerms} onChange={setEditPerms} visibleKeys={visiblePermissions} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <i className="fas fa-save" /> Save Changes
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
      </Portal>
    </>
  );
}
