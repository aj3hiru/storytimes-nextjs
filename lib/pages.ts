import { prisma } from "./db";

export async function getPublishedPageBySlug(slug: string, includeUnpublished = false) {
  return prisma.page.findFirst({ where: { slug, ...(includeUnpublished ? {} : { status: "published" }) } });
}
