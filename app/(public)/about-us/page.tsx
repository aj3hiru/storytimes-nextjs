import type { Metadata } from "next";
import { PageReader, buildPageMetadata } from "@/components/PageReader";

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata("about-us");
}

export default function AboutUsPage() {
  return <PageReader slug="about-us" />;
}
