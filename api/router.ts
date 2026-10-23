import { createRouter, publicQuery } from "./middleware";
import { biosfereRouter } from "./biosfereRouter";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  biosfere: biosfereRouter,
});

export type AppRouter = typeof appRouter;
