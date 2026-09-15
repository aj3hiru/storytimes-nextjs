"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { prisma } from "./db";
import { requireUser } from "./auth";
import { defaultAdInserterConfig, type AdBlock, type AdInserterConfig } from "./adInserterTypes";

function normalizeBlockInput(raw: unknown, id: number): AdBlock {
  const b = (raw ?? {}) as Partial<AdBlock>;
  return {
    id,
    label: `Block ${id}`,
    code: typeof b.code === "string" ? b.code : "",
    enabled: !!b.enabled,
    pages: Array.isArray(b.pages) && b.pages.length > 0 ? (b.pages as AdBlock["pages"]) : ["post"],
    insertion: (b.insertion as AdBlock["insertion"]) ?? "disabled",
    alignment: (b.alignment as AdBlock["alignment"]) ?? "default",
    paragraph: Number.isFinite(b.paragraph) ? Math.max(1, Number(b.paragraph)) : 1,
  };
}

/**
 * Real gap fixed here: the previous version submitted 16 blocks' worth
 * of fields as parallel same-named FormData arrays (blockLabel[],
 * blockCode[], ...) — workable for a flat "code + paragraph number"
 * shape, but couldn't reasonably carry each block's own `pages`
 * (multi-select checkboxes), `insertion`, and `alignment` choices the
 * same way without a lot of fragile positional-index bookkeeping.
 * Submits the whole config as one JSON payload instead — the client
 * component builds it directly from its own state (which already
 * mirrors AdInserterConfig exactly), so there's no format translation
 * to get wrong in either direction.
 */
export async function saveAdInserterBlocks(formData: FormData): Promise<{ success: boolean; message: string }> {
  const user = await requireUser();
  if (!user || user.role !== "admin") return { success: false, message: "Admin access required." };

  let parsed: Partial<AdInserterConfig>;
  try {
    parsed = JSON.parse(String(formData.get("configJson") ?? "{}"));
  } catch {
    return { success: false, message: "Invalid payload." };
  }

  const defaults = defaultAdInserterConfig();
  const blocksInput = Array.isArray(parsed.blocks) ? parsed.blocks : [];
  const config: AdInserterConfig = {
    blocks: defaults.blocks.map((d, i) => normalizeBlockInput(blocksInput[i], d.id)),
    globalHeader: typeof parsed.globalHeader === "string" ? parsed.globalHeader : "",
    globalFooter: typeof parsed.globalFooter === "string" ? parsed.globalFooter : "",
    adsTxtEnabled: !!parsed.adsTxtEnabled,
  };

  try {
    await prisma.appConfig.upsert({
      where: { configKey: "ad_inserter" },
      create: { configKey: "ad_inserter", configValue: JSON.stringify(config) },
      update: { configValue: JSON.stringify(config) },
    });
    revalidateTag("ad-inserter", "max");
    revalidatePath("/admin/ad-inserter");
    return { success: true, message: "Settings saved successfully!" };
  } catch {
    return { success: false, message: "Save failed — please try again." };
  }
}

export async function saveAdsTxt(formData: FormData): Promise<{ success: boolean; message: string }> {
  const user = await requireUser();
  if (!user || user.role !== "admin") return { success: false, message: "Admin access required." };

  const content = String(formData.get("adstxtContent") ?? "");
  const enabled = formData.get("adstxtEnabled") === "1";

  try {
    const current = await prisma.appConfig.findUnique({ where: { configKey: "ad_inserter" } });
    const config: AdInserterConfig = current?.configValue
      ? { ...defaultAdInserterConfig(), ...JSON.parse(current.configValue), adsTxtEnabled: enabled }
      : { ...defaultAdInserterConfig(), adsTxtEnabled: enabled };

    await prisma.$transaction([
      prisma.appConfig.upsert({
        where: { configKey: "ad_inserter" },
        create: { configKey: "ad_inserter", configValue: JSON.stringify(config) },
        update: { configValue: JSON.stringify(config) },
      }),
      prisma.appConfig.upsert({
        where: { configKey: "ads_txt_content" },
        create: { configKey: "ads_txt_content", configValue: content },
        update: { configValue: content },
      }),
    ]);
    revalidateTag("ad-inserter", "max");
    revalidatePath("/admin/ad-inserter");
    revalidatePath("/ads.txt");
    return { success: true, message: "Ads.txt saved!" };
  } catch {
    return { success: false, message: "Ads.txt save failed — please try again." };
  }
}
