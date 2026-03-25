import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@/auth";

export async function createTRPCContext(opts: { req: Request }) {
  const session = await auth();
  return {
    session,
    req: opts.req,
  };
}

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const authedSession = ctx.session as typeof ctx.session & {
    user: NonNullable<typeof ctx.session.user>;
  };
  return next({ ctx: { ...ctx, session: authedSession } });
});
