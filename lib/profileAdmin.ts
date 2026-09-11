"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { requireUser } from "./auth";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function saveMyAccount(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user) redirect("/admin-login");

  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!username || !email) throw new Error("Username and email are required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email address.");

  const data: Record<string, unknown> = { username, email };
  if (password) data.passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.update({ where: { id: user.id }, data });
  await prisma.activityLog.create({
    data: { userId: user.id, actionType: "user_edit", description: "Edited own account (self-service)" },
  });

  revalidatePath("/admin/my-profile");
  redirect("/admin/my-profile?success=account");
}

export async function saveMyAuthorProfile(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user) redirect("/admin-login");

  const fullName = String(formData.get("fullName") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim() || null;
  const profileImageUrl = String(formData.get("profileImage") ?? "").trim();
  const authorEmail = String(formData.get("authorEmail") ?? "").trim() || null;
  const mobileNumber = String(formData.get("mobileNumber") ?? "").trim() || null;
  const address = String(formData.get("address") ?? "").trim() || null;
  const designation = String(formData.get("designation") ?? "").trim() || null;
  const experience = String(formData.get("experience") ?? "").trim() || null;
  const qualifications = String(formData.get("qualifications") ?? "").trim() || null;
  const certifications = String(formData.get("certifications") ?? "").trim() || null;
  const languagesKnown = String(formData.get("languagesKnown") ?? "").trim() || null;
  const socials = {
    instagram: String(formData.get("instagram") ?? "").trim() || null,
    threads: String(formData.get("threads") ?? "").trim() || null,
    linkedin: String(formData.get("linkedin") ?? "").trim() || null,
    facebook: String(formData.get("facebook") ?? "").trim() || null,
    twitter: String(formData.get("twitter") ?? "").trim() || null,
  };

  if (!fullName || !name) throw new Error("Full name and display name are required.");

  const existing = await prisma.author.findUnique({ where: { userId: user.id } });
  // Keep the existing image if the upload field was left untouched (empty).
  const profileImage = profileImageUrl || existing?.profileImage || null;
  const fieldData = {
    fullName,
    name,
    bio,
    profileImage,
    email: authorEmail ?? user.email,
    mobileNumber,
    address,
    designation,
    experience,
    qualifications,
    certifications,
    languagesKnown,
    ...socials,
  };

  if (existing) {
    let slug = slugify(name);
    const clash = await prisma.author.findFirst({ where: { slug, id: { not: existing.id } } });
    if (clash) slug = `${slug}-${existing.id}`;
    await prisma.author.update({ where: { id: existing.id }, data: { ...fieldData, slug } });
  } else {
    let slug = slugify(name);
    const clash = await prisma.author.findUnique({ where: { slug } });
    if (clash) slug = `${slug}-${user.id}`;
    await prisma.author.create({ data: { ...fieldData, slug, status: "active", userId: user.id } });
  }

  revalidatePath("/admin/my-profile");
  redirect("/admin/my-profile?success=author");
}
