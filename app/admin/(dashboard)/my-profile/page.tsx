import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveMediaUrl, authorUrl } from "@/lib/urls";
import { MyProfileClient } from "@/components/admin/MyProfileClient";

export default async function MyProfilePage({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  const { success } = await searchParams;
  const user = await requireUser();
  if (!user) return null;

  const [account, author] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { username: true, email: true, role: true, createdAt: true } }),
    prisma.author.findUnique({ where: { userId: user.id } }),
  ]);
  if (!account) return null;

  return (
    <MyProfileClient
      key={success ?? "initial"}
      success={success === "account" || success === "author" ? success : null}
      account={{ username: account.username, email: account.email, role: account.role, since: account.createdAt?.toISOString() ?? null }}
      author={{
        exists: Boolean(author),
        publicUrl: author?.slug ? authorUrl(author.slug) : null,
        profileImage: author?.profileImage ? resolveMediaUrl(author.profileImage) : "",
        fullName: author?.fullName ?? "",
        name: author?.name ?? "",
        bio: author?.bio ?? "",
        email: author?.email ?? "",
        mobileNumber: author?.mobileNumber ?? "",
        address: author?.address ?? "",
        designation: author?.designation ?? "",
        experience: author?.experience ?? "",
        qualifications: author?.qualifications ?? "",
        certifications: author?.certifications ?? "",
        languagesKnown: author?.languagesKnown ?? "",
        instagram: author?.instagram ?? "",
        twitter: author?.twitter ?? "",
        linkedin: author?.linkedin ?? "",
        facebook: author?.facebook ?? "",
        threads: author?.threads ?? "",
      }}
    />
  );
}
