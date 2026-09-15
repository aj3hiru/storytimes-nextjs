import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveMyAccount, saveMyAuthorProfile } from "@/lib/profileAdmin";
import { ImageUploadField } from "@/components/admin/ImageUploadField";
import { isStorageConfigured } from "@/lib/storageConfig";
import { resolveMediaUrl } from "@/lib/urls";

export default async function MyProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const { success } = await searchParams;
  const user = await requireUser();
  if (!user) return null;

  const author = await prisma.author.findUnique({ where: { userId: user.id } });

  return (
    <div>

      {success && (
        <div className="alert alert-success">
          <i className="fas fa-check-circle" /> {success === "account" ? "Account details updated." : "Author profile updated."}
        </div>
      )}

      <div className="card" style={{ padding: "1.25rem", marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem" }}>Account</h3>
        <p style={{ color: "var(--gray-500)", marginBottom: "1rem", fontSize: "0.875rem" }}>
          Username, email, and password
        </p>
        <form action={saveMyAccount} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div className="filter-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input id="username" name="username" className="form-control" defaultValue={user.username} required />
            </div>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" className="form-control" defaultValue={user.email} required />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="password">New Password</label>
            <input
              id="password"
              name="password"
              type="password"
              className="form-control"
              placeholder="Leave blank to keep current password"
              autoComplete="new-password"
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
            Save Account
          </button>
        </form>
      </div>

      <div className="card" style={{ padding: "1.25rem" }}>
        <h3 style={{ marginBottom: "1rem" }}>Author Profile</h3>
        <form action={saveMyAuthorProfile} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {isStorageConfigured() ? (
            <ImageUploadField
              name="profileImage"
              purpose="author"
              label="Profile Photo"
              defaultValue={author?.profileImage ? resolveMediaUrl(author.profileImage) : ""}
            />
          ) : (
            <div className="alert alert-info">
              <i className="fas fa-info-circle" /> Profile photo upload needs R2 credentials in
              <code> .env.local</code> to enable.
            </div>
          )}
          <div className="filter-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="form-group">
              <label htmlFor="fullName">Full Name</label>
              <input id="fullName" name="fullName" className="form-control" defaultValue={author?.fullName} required />
            </div>
            <div className="form-group">
              <label htmlFor="name">Display Name</label>
              <input id="name" name="name" className="form-control" defaultValue={author?.name} required />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="bio">Bio</label>
            <textarea id="bio" name="bio" className="form-control" rows={4} defaultValue={author?.bio ?? ""} />
          </div>
          <div className="filter-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="form-group">
              <label htmlFor="authorEmail">
                Public Contact Email <span className="form-hint">— shown on the author page, defaults to account email</span>
              </label>
              <input id="authorEmail" name="authorEmail" type="email" className="form-control" defaultValue={author?.email ?? ""} />
            </div>
            <div className="form-group">
              <label htmlFor="mobileNumber">Mobile Number</label>
              <input id="mobileNumber" name="mobileNumber" className="form-control" defaultValue={author?.mobileNumber ?? ""} />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="address">Address</label>
            <textarea id="address" name="address" className="form-control" rows={2} defaultValue={author?.address ?? ""} />
          </div>
          <div className="filter-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="form-group">
              <label htmlFor="designation">Designation</label>
              <input id="designation" name="designation" className="form-control" defaultValue={author?.designation ?? ""} />
            </div>
            <div className="form-group">
              <label htmlFor="experience">Experience</label>
              <input id="experience" name="experience" className="form-control" defaultValue={author?.experience ?? ""} />
            </div>
          </div>
          <div className="filter-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="form-group">
              <label htmlFor="qualifications">Qualifications</label>
              <textarea id="qualifications" name="qualifications" className="form-control" rows={2} defaultValue={author?.qualifications ?? ""} />
            </div>
            <div className="form-group">
              <label htmlFor="certifications">Certifications</label>
              <textarea id="certifications" name="certifications" className="form-control" rows={2} defaultValue={author?.certifications ?? ""} />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="languagesKnown">Languages Known</label>
            <input id="languagesKnown" name="languagesKnown" className="form-control" defaultValue={author?.languagesKnown ?? ""} />
          </div>
          <div className="filter-row" style={{ gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
            <div className="form-group">
              <label htmlFor="instagram">Instagram</label>
              <input id="instagram" name="instagram" className="form-control" defaultValue={author?.instagram ?? ""} />
            </div>
            <div className="form-group">
              <label htmlFor="twitter">X / Twitter</label>
              <input id="twitter" name="twitter" className="form-control" defaultValue={author?.twitter ?? ""} />
            </div>
            <div className="form-group">
              <label htmlFor="linkedin">LinkedIn</label>
              <input id="linkedin" name="linkedin" className="form-control" defaultValue={author?.linkedin ?? ""} />
            </div>
            <div className="form-group">
              <label htmlFor="facebook">Facebook</label>
              <input id="facebook" name="facebook" className="form-control" defaultValue={author?.facebook ?? ""} />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="threads">Threads</label>
            <input id="threads" name="threads" className="form-control" defaultValue={author?.threads ?? ""} />
          </div>
          <button type="submit" className="btn btn-primary" style={{ alignSelf: "flex-start" }}>
            Save Author Profile
          </button>
        </form>
      </div>
    </div>
  );
}
