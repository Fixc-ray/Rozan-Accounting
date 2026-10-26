import type { Metadata } from "next";
import { getSiteUrl } from "@/lib/site-url";
import "./globals.css";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Rozan Accounting & Advisory | Financial clarity for ambitious businesses",
  description: "Senior-led accounting, tax, payroll and business advisory services for growing businesses.",
  keywords: ["accountant", "accounting services", "tax services", "bookkeeping", "business advisory", "payroll services", "financial consulting"],
  openGraph: {
    title: "Rozan Accounting & Advisory",
    description: "Clarity for your numbers. Confidence for your business.",
    type: "website",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "AccountingService",
          name: "Rozan Accounting & Advisory",
          description: "Accounting, tax, payroll and business advisory for ambitious businesses.",
          url: siteUrl,
          areaServed: "Kenya",
          address: { "@type": "PostalAddress", addressLocality: "Nairobi", addressCountry: "KE" },
          serviceType: ["Accounting", "Bookkeeping", "Tax planning", "Payroll", "Audit", "Business advisory"],
        }).replace(/</g, "\\u003c") }} />
      </body>
    </html>
  );
}
