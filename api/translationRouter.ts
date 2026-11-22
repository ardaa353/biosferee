import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { posts, suggestions, users, reports } from "../db/schema";
import { getDb } from "./queries/connection";
import { publicQuery, createRouter } from "./middleware";
import { translateContent } from "./lib/translation";
export const translationRouter = createRouter({
  get: publicQuery
    .input(
      z.object({
        kind: z.enum(["post", "suggestion", "bio", "report"]),
        id: z.number().int().positive(),
        revision: z.string().max(32).optional(),
        target: z.enum(["tr", "en"]),
      }),
    )
    .query(async ({ input, ctx }) => {
      let text: string | undefined;
      if (input.kind === "post") {
        const [row] = await getDb()
          .select({ text: posts.description })
          .from(posts)
          .where(and(eq(posts.id, input.id), ne(posts.status, "removed")))
          .limit(1);
        text = row?.text;
      } else if (input.kind === "suggestion") {
        const [row] = await getDb()
          .select({ text: suggestions.note })
          .from(suggestions)
          .innerJoin(posts, eq(posts.id, suggestions.postId))
          .where(and(eq(suggestions.id, input.id), ne(posts.status, "removed")))
          .limit(1);
        text = row?.text ?? undefined;
      } else if (input.kind === "report") {
        if (!ctx.user || ctx.user.role === "user")
          throw new TRPCError({ code: "FORBIDDEN" });
        const [row] = await getDb()
          .select({ text: reports.details })
          .from(reports)
          .where(eq(reports.id, input.id))
          .limit(1);
        text = row?.text;
      } else {
        if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
        const [row] = await getDb()
          .select({ text: users.bio })
          .from(users)
          .where(eq(users.id, input.id))
          .limit(1);
        text = row?.text;
      }
      if (text === undefined) throw new TRPCError({ code: "NOT_FOUND" });
      // Only saved, visible records can be translated; this is not an arbitrary-text proxy.
      return {
        original: text,
        ...(await translateContent(text, input.target)),
      };
    }),
});
