import "server-only";
// Server-only: never import from client components.
import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Pool defaults, applied only when DATABASE_URL does not set them.
 *  - Vercel/serverless: use the Supabase TRANSACTION pooler (port 6543) with `?pgbouncer=true&connection_limit=1`
 *    (one connection per lambda; the pooler fans out). See docs/shared-changes.md.
 *  - Local dev on the session pooler (port 5432): 8 connections keeps the parallel loaders fast without exhausting
 *    the shared pool.
 */
function datasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;
  const extra: string[] = [];
  if (!/[?&]connection_limit=/.test(url)) extra.push(`connection_limit=${process.env.VERCEL ? 1 : 8}`);
  if (!/[?&]pool_timeout=/.test(url)) extra.push("pool_timeout=30");
  if (!extra.length) return url;
  return url + (url.includes("?") ? "&" : "?") + extra.join("&");
}

/** Single server-side Prisma client (reused across hot reloads and across requests in one server instance). */
export const prisma = g.prisma ?? new PrismaClient({ datasourceUrl: datasourceUrl() });
g.prisma = prisma;
