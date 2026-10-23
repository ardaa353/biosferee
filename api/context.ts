import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "./queries/connection";
import { sessions, users, type User } from "../db/schema";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
};

export async function createContext(opts: FetchCreateContextFnOptions): Promise<TrpcContext> {
  const token = opts.req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { req: opts.req, resHeaders: opts.resHeaders };
  const [row] = await getDb().select({ user: users }).from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date()))).limit(1);
  return { req: opts.req, resHeaders: opts.resHeaders, user: row?.user };
}
