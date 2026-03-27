import { PrismaClient } from "@prisma/client";

// Fix Prisma engine path for pnpm monorepo layout.
// In Next.js dev mode the webpack runtime loses pnpm's symlink resolution for
// the .prisma/client engine binary. Set the env var explicitly before any
// PrismaClient is instantiated.
const PRISMA_ENGINE =
  "/paperclip/instances/default/companies/AgenticAcademy/projects/AgenticAcademy/node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node";

const g = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  __prismaEngineSet?: boolean;
};

// On first load after a HMR cycle: set engine path and bust the stale cache.
if (!g.__prismaEngineSet) {
  if (!process.env.PRISMA_QUERY_ENGINE_LIBRARY) {
    process.env.PRISMA_QUERY_ENGINE_LIBRARY = PRISMA_ENGINE;
  }
  g.__prismaEngineSet = true;
  g.prisma = undefined; // force fresh PrismaClient with correct engine
}

export const db =
  g.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") g.prisma = db;

export { PrismaClient };
export * from "@prisma/client";
