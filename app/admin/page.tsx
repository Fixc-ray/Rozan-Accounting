import { PortalClient } from "@/app/portal/portal-client";

export default function AdminPage() {
  return <PortalClient mode="admin" initialSection="overview"/>;
}
