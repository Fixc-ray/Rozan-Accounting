import { notFound, permanentRedirect } from "next/navigation";

const slugs = new Set(["services", "about", "industries", "insights", "contact"]);

export default async function LegacyMarketingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slugs.has(slug)) notFound();
  permanentRedirect(`/#${slug}`);
}
