import { env } from "cloudflare:workers";

export function getD1(): D1Database {
  if (!env.DB) throw new Error("Database binding unavailable");
  return env.DB;
}

export function getFiles(): R2Bucket {
  if (!env.FILES) throw new Error("File storage binding unavailable");
  return env.FILES;
}
