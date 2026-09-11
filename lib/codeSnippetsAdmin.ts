"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { requireUser } from "./auth";

export async function saveCodeSnippets(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");

  const snippets = {
    header: String(formData.get("header") ?? ""),
    body: String(formData.get("body") ?? ""),
    footer: String(formData.get("footer") ?? ""),
  };

  await prisma.appConfig.upsert({
    where: { configKey: "code_snippets" },
    create: { configKey: "code_snippets", configValue: JSON.stringify(snippets) },
    update: { configValue: JSON.stringify(snippets) },
  });

  revalidateTag("code-snippets", "max");
  revalidatePath("/", "layout");
  redirect("/admin/code-snippets?success=1");
}
