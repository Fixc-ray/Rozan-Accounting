import { notFound } from "next/navigation";
import { PortalClient } from "../portal-client";

const sections = new Set(["documents", "requests", "appointments", "calls", "messages", "invoices", "settings"]);

export default async function PortalSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  return <PortalClient mode="client" initialSection={section}/>;
}
