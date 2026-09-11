import type { Metadata } from "next";
import { PageReader, buildPageMetadata } from "@/components/PageReader";

export async function generateMetadata(): Promise<Metadata> {
  return buildPageMetadata("contact-us");
}

export default function ContactUsPage() {
  return <PageReader slug="contact-us" />;
}
