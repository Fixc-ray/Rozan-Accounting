const fallbackUrl = "http://localhost:3000";

export function getSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  try {
    return new URL(configuredUrl || fallbackUrl).origin;
  } catch {
    return fallbackUrl;
  }
}
