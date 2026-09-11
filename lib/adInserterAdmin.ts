"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { requireUser } from "./auth";
import type { AdBlock, AdInserterConfig } from "./adInserterTypes";

export async function saveAdInserter(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");

  const labels = formData.getAll("blockLabel") as string[];
  const codes = formData.getAll("blockCode") as string[];
  const paragraphs = formData.getAll("blockParagraph") as string[];
  const enabledIds = new Set((formData.getAll("blockEnabled") as string[]).map(Number));

  const blocks: AdBlock[] = labels.map((label, i) => ({
    id: i + 1,
    label: label || `Block ${i + 1}`,
    code: codes[i] ?? "",
    enabled: enabledIds.has(i + 1),
    insertAfterParagraph: Math.max(1, parseInt(paragraphs[i] ?? "1", 10) || 1),
  }));

  const config: AdInserterConfig = {
    blocks,
    globalHeader: String(formData.get("globalHeader") ?? ""),
    globalFooter: String(formData.get("globalFooter") ?? ""),
    homepageTop: String(formData.get("homepageTop") ?? ""),
  };

  await prisma.appConfig.upsert({
    where: { configKey: "ad_inserter" },
    create: { configKey: "ad_inserter", configValue: JSON.stringify(config) },
    update: { configValue: JSON.stringify(config) },
  });

  revalidateTag("ad-inserter", "max");
  revalidatePath("/admin/ad-inserter");
  redirect("/admin/ad-inserter?success=1");
}
