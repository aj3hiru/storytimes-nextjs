import type { Metadata } from "next";
import { PageReader, buildPageMetadata } from "@/components/PageReader";

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata("privacy-policy");
}

export default function PrivacyPolicyPage() {
  return <PageReader slug="privacy-policy" />;
}
