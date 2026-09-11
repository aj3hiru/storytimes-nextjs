"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./auth";

export async function clearHomepageCache(): Promise<void> {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");
  revalidatePath("/");
}

export async function clearAllSiteCache(): Promise<void> {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");
  // Next.js doesn't have a single "clear everything" primitive the way the
  // original's file-based cache did (unlink every file under /cache) — the
  // closest equivalent is revalidating the layout, which invalidates every
  // page under it.
  revalidatePath("/", "layout");
  revalidatePath("/admin", "layout");
}
