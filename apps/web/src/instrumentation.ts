/**
 * Next.js Instrumentation Hook
 * Runs once on server startup in Node.js runtime.
 *
 * Purpose: ensure PRISMA_QUERY_ENGINE_LIBRARY is set before any PrismaClient
 * is instantiated (belt-and-suspenders alongside .env.local — P0-001 fix).
 */

const PRISMA_ENGINE =
  "/paperclip/instances/default/companies/AgenticAcademy/projects/AgenticAcademy/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node";

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  if (!process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = PRISMA_ENGINE;
    console.log("[instrumentation] Set PRISMA_QUERY_ENGINE_LIBRARY");
  }
}
