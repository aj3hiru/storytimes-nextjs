import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 });
  }

  const posts = await prisma.post.findMany({
    where: user.role === "admin" || user.role === "editor" ? {} : { author: { userId: user.id } },
    include: { author: true, category: true },
    orderBy: { date: "desc" },
  });

  const header = ["id", "title", "slug", "status", "author", "category", "date"];
  const rows = posts.map((p) =>
    [
      String(p.id),
      csvEscape(p.title),
      p.slug,
      p.status,
      csvEscape(p.author.name),
      csvEscape(p.category.name),
      p.date?.toISOString() ?? "",
    ].join(",")
  );

  const csv = [header.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="posts-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
