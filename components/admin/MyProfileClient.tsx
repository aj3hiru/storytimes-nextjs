"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { saveMyAccount, saveMyAuthorProfile } from "@/lib/profileAdmin";
import { uploadImageFast } from "@/lib/clientUpload";

interface Account {
  username: string;
  email: string;
  role: string;
  since: string | null;
}

interface AuthorData {
  exists: boolean;
  publicUrl: string | null;
  profileImage: string;
  fullName: string;
  name: string;
  bio: string;
  email: string;
  mobileNumber: string;
  address: string;
  designation: string;
  experience: string;
  qualifications: string;
  certifications: string;
  languagesKnown: string;
  instagram: string;
  twitter: string;
  linkedin: string;
  facebook: string;
  threads: string;
}

const ROLE_COLOR: Record<string, string> = { admin: "#7c3aed", editor: "#2563eb", author: "#059669" };

function Submit({ icon, children, disabled }: { icon: string; children: React.ReactNode; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="mp-btn" disabled={pending || disabled}>
      <i className={`fas ${pending ? "fa-spinner fa-spin" : icon}`} /> {children}
    </button>
  );
}

function Field({ label, hint, icon, children, wide }: { label: string; hint?: string; icon?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`mp-field${wide ? " wide" : ""}`}>
      <span className="mp-label">
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <span className={`mp-control${icon ? " has-icon" : ""}`}>
        {icon && <i className={`${icon} mp-ico`} aria-hidden />}
        {children}
      </span>
    </label>
  );
}

function Section({ icon, title, sub, children }: { icon: string; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="mp-card">
      <h2 className="mp-h">
        <i className={`fas ${icon}`} /> {title}
      </h2>
      {sub && <p className="mp-sub">{sub}</p>}
      {children}
    </section>
  );
}

export function MyProfileClient({ account, author, success }: { account: Account; author: AuthorData; success: "account" | "author" | null }) {
  const [photo, setPhoto] = useState(author.profileImage);
  const [photoChanged, setPhotoChanged] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const displayName = author.fullName || author.name || account.username;
  const color = ROLE_COLOR[account.role] ?? "#64748b";
  const since = account.since ? new Date(account.since).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "long", year: "numeric" }) : null;
  const pwMismatch = pw.next !== "" && pw.confirm !== "" && pw.next !== pw.confirm;

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setPhotoError(null);
    try {
      const r = await uploadImageFast(file, "author");
      setPhoto(r.url);
      setPhotoChanged(true);
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mp-wrap">
      <section className="mp-card mp-hero">
        <div className="mp-hero-band" />
        <div className="mp-hero-body">
          <div className="mp-avatar">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt={displayName} />
            ) : (
              <span>{displayName.charAt(0).toUpperCase()}</span>
            )}
            <button type="button" className="mp-avatar-btn" onClick={() => fileRef.current?.click()} disabled={uploading} aria-label="Change photo" title="Change photo">
              <i className={`fas ${uploading ? "fa-spinner fa-spin" : "fa-camera"}`} />
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPhoto} />
          </div>
          <p className="mp-name">{displayName}</p>
          <span className="mp-role" style={{ color, background: `color-mix(in srgb, ${color} 11%, white)` }}>
            {account.role.charAt(0).toUpperCase() + account.role.slice(1)}
          </span>
          <p className="mp-meta">
            @{account.username}
            {since && <> · Member since {since}</>}
          </p>
          {author.publicUrl && (
            <a href={author.publicUrl} target="_blank" rel="noopener noreferrer" className="mp-public">
              <i className="fas fa-arrow-up-right-from-square" /> View public author page
            </a>
          )}
          {photoChanged && <p className="mp-photo-note">New photo ready — press &ldquo;Save author profile&rdquo; below to keep it.</p>}
          {photoError && <p className="mp-error">{photoError}</p>}
        </div>
      </section>

      <Section icon="fa-user" title="Account details" sub="Your login name and email">
        {success === "account" && (
          <p className="mp-notice">
            <i className="fas fa-circle-check" /> Account details saved.
          </p>
        )}
        <form action={saveMyAccount}>
          <div className="mp-grid">
            <Field label="Username" icon="fas fa-at">
              <input name="username" defaultValue={account.username} required autoComplete="username" />
            </Field>
            <Field label="Email" icon="fas fa-envelope">
              <input name="email" type="email" defaultValue={account.email} required autoComplete="email" />
            </Field>
          </div>
          <Submit icon="fa-floppy-disk">Save details</Submit>
        </form>
      </Section>

      <Section icon="fa-key" title="Change password">
        <form action={saveMyAccount}>
          <input type="hidden" name="username" value={account.username} />
          <input type="hidden" name="email" value={account.email} />
          <div className="mp-grid">
            <Field label="New password" hint="Min 6 characters">
              <input name="password" type="password" minLength={6} autoComplete="new-password" value={pw.next} onChange={(e) => setPw((x) => ({ ...x, next: e.target.value }))} required />
            </Field>
            <Field label="Confirm new password">
              <input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw((x) => ({ ...x, confirm: e.target.value }))} required />
            </Field>
          </div>
          {pwMismatch && <p className="mp-error">The new passwords don&rsquo;t match.</p>}
          <Submit icon="fa-shield-halved" disabled={pw.next.length < 6 || pw.next !== pw.confirm}>
            Update password
          </Submit>
        </form>
      </Section>

      <form action={saveMyAuthorProfile} className="mp-author">
        <input type="hidden" name="profileImage" value={photo} />
        {success === "author" && (
          <p className="mp-notice">
            <i className="fas fa-circle-check" /> Author profile saved.
          </p>
        )}

        <Section icon="fa-id-badge" title="Author profile" sub="Shown on your public author page and under your stories">
          <div className="mp-grid">
            <Field label="Full name">
              <input name="fullName" defaultValue={author.fullName} required />
            </Field>
            <Field label="Display name" hint="Used in your author page address">
              <input name="name" defaultValue={author.name} required />
            </Field>
            <Field label="Bio" wide>
              <textarea name="bio" rows={4} defaultValue={author.bio} placeholder="A few lines about you" />
            </Field>
            <Field label="Designation" icon="fas fa-briefcase">
              <input name="designation" defaultValue={author.designation} />
            </Field>
            <Field label="Experience" icon="fas fa-chart-line">
              <input name="experience" defaultValue={author.experience} />
            </Field>
          </div>
        </Section>

        <Section icon="fa-address-book" title="Contact">
          <div className="mp-grid">
            <Field label="Public contact email" hint="Defaults to your account email" icon="fas fa-envelope">
              <input name="authorEmail" type="email" defaultValue={author.email} />
            </Field>
            <Field label="Mobile number" icon="fas fa-phone">
              <input name="mobileNumber" defaultValue={author.mobileNumber} inputMode="tel" />
            </Field>
            <Field label="Address" wide>
              <textarea name="address" rows={2} defaultValue={author.address} />
            </Field>
          </div>
        </Section>

        <Section icon="fa-graduation-cap" title="Background">
          <div className="mp-grid">
            <Field label="Qualifications">
              <textarea name="qualifications" rows={2} defaultValue={author.qualifications} />
            </Field>
            <Field label="Certifications">
              <textarea name="certifications" rows={2} defaultValue={author.certifications} />
            </Field>
            <Field label="Languages known" icon="fas fa-language" wide>
              <input name="languagesKnown" defaultValue={author.languagesKnown} placeholder="English, Hindi" />
            </Field>
          </div>
        </Section>

        <Section icon="fa-share-nodes" title="Social media" sub="Links shown on your author page">
          <div className="mp-grid">
            <Field label="Instagram" icon="fab fa-instagram">
              <input name="instagram" defaultValue={author.instagram} placeholder="https://instagram.com/…" />
            </Field>
            <Field label="X / Twitter" icon="fab fa-x-twitter">
              <input name="twitter" defaultValue={author.twitter} placeholder="https://x.com/…" />
            </Field>
            <Field label="LinkedIn" icon="fab fa-linkedin">
              <input name="linkedin" defaultValue={author.linkedin} placeholder="https://linkedin.com/in/…" />
            </Field>
            <Field label="Facebook" icon="fab fa-facebook">
              <input name="facebook" defaultValue={author.facebook} placeholder="https://facebook.com/…" />
            </Field>
            <Field label="Threads" icon="fab fa-threads">
              <input name="threads" defaultValue={author.threads} placeholder="https://threads.net/@…" />
            </Field>
          </div>
          <Submit icon="fa-floppy-disk">Save author profile</Submit>
        </Section>
      </form>
    </div>
  );
}
