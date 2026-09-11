"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { requireUser } from "./auth";
import type { FooterSettings } from "./footer";

async function persistFooterSettings(footerData: FooterSettings): Promise<void> {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");

  await prisma.appConfig.upsert({
    where: { configKey: "footer_settings" },
    create: { configKey: "footer_settings", configValue: JSON.stringify(footerData) },
    update: { configValue: JSON.stringify(footerData) },
  });

  revalidateTag("footer-settings", "max");
  revalidatePath("/", "layout");
  revalidatePath("/admin/footer-customizer");
}

/** Form action — receives the whole footer config as one JSON blob in a
 *  hidden field (matches $_POST['footer_data'] in admin/footer-customizer.php),
 *  built client-side by the visual editor. */
export async function saveFooterSettingsAction(formData: FormData): Promise<void> {
  const raw = String(formData.get("footer_data") ?? "{}");
  let parsed: FooterSettings;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid footer data.");
  }
  await persistFooterSettings(parsed);
  redirect("/admin/footer-customizer?success=1");
}
