"use client";

import { useState } from "react";
import { createUser, updateUser } from "@/lib/userAdmin";
import { DeleteUserButton } from "./DeleteUserButton";
import { RoleSelect } from "./RoleSelect";
import { Portal } from "./Portal";

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
}

const ROLE_SUMMARY = (
  <div className="role-summary">
    <div className="rs-head">
      <i className="fas fa-info-circle" style={{ color: "#4f46e5", marginRight: 6 }} />
      Permissions are set automatically by role
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

function ProfileFields({ user }: { user?: UserRow }) {
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
      <div className="form-section-title" style={{ marginTop: "1rem" }}>
        <i className="fas fa-shield-alt" /> Permissions
      </div>
      {ROLE_SUMMARY}
    </>
  );
}

/** Ports the modal-based Add/Edit User flow from admin/user-manager.php
 *  (Profile + Social Profiles sections, role-summary info box instead of
 *  a granular permission checkbox editor — confirmed against the live
 *  page's actual rendered create/edit modals, which only show a role
 *  dropdown + explanatory text, not per-permission checkboxes). */
export function UserManagerClient({ users, otherUsersByRole }: { users: UserRow[]; otherUsersByRole: { id: number; username: string }[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);

  return (
    <>
      <div className="toolbar">
        <div>
          <div className="toolbar-title">All Users</div>
          <div className="toolbar-sub">{users.length} users found</div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}>
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
                      <button type="button" className="btn-action btn-edit" onClick={() => setEditing(u)}>
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

      {/* Real bug fixed here — the actual cause of "Add User pe click
          karne pe kuchh nahi aa raha hai": this modal was rendered
          directly inside UserManagerClient's own JSX tree, nested
          several levels of container divs deep (.table-wrap, page
          layout wrappers, etc.) instead of as a direct child of
          <body>. `position: fixed` is supposed to be viewport-relative
          regardless of DOM depth, but any ancestor with overflow,
          transform, or a stacking-context-creating property can clip
          or hide it in exactly this "technically open, but invisible"
          way — the same root cause already found and fixed for the
          post editor's own modals (see Portal.tsx's own comment). A
          React portal renders this modal's DOM node directly under
          <body>, removing any dependency on intermediate ancestors'
          CSS entirely. */}
      <Portal>
        {/* Create modal */}
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
                  <input type="password" name="password" className="form-control" required autoComplete="new-password" />
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <select name="role" className="form-control" defaultValue="author">
                    <option value="author">Author</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <ProfileFields />
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

      <Portal>
        {/* Edit modal */}
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
                    <input type="password" name="password" className="form-control" autoComplete="new-password" placeholder="Leave blank to keep current" />
                  </div>
                  <div className="form-group">
                    <label>Role</label>
                    <select name="role" className="form-control" defaultValue={editing.role}>
                      <option value="author">Author</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
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
                <ProfileFields user={editing} />
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
