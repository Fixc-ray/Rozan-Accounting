import { notFound } from "next/navigation";
import { PortalClient } from "@/app/portal/portal-client";

const sections = new Set(["analytics", "inquiries", "availability", "calls", "documents", "clients", "invoices", "settings"]);

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  return <PortalClient mode="admin" initialSection={section}/>;
}
