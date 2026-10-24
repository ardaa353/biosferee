
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import {
  createRouter,
  publicQuery,
  authedQuery,
  adminQuery,
} from "./middleware";
import { getDb } from "./queries/connection";
import {
  users,
  sessions,
  posts,
  postImages,
  likes,
  collaborators,
  suggestions,
  reports,
} from "../db/schema";

// ---------------------------------------------------------
// CLOUDINARY AYARLARI
// ---------------------------------------------------------

const CLOUDINARY_CLOUD_NAME =
  process.env.CLOUDINARY_CLOUD_NAME ||
  process.env.VITE_CLOUDINARY_CLOUD_NAME ||
  "whjqcubr";

// ---------------------------------------------------------
// TAKSONOMİ ŞEMALARI
// ---------------------------------------------------------

const taxonomyFields = {
  kingdom: z.string().trim().max(100).optional(),
  phylum: z.string().trim().max(150).optional(),
  className: z.string().trim().max(150).optional(),
  orderName: z.string().trim().max(150).optional(),
  family: z.string().trim().max(150).optional(),
  genus: z.string().trim().max(150).optional(),
  species: z.string().trim().max(200).optional(),
  commonName: z.string().trim().max(200).optional(),
};

const requiredTaxonomy = {
  kingdom: z.string().trim().min(2).max(100),
  phylum: z.string().trim().min(2).max(150),
  className: z.string().trim().min(2).max(150),
  orderName: z.string().trim().min(2).max(150),
  family: z.string().trim().min(2).max(150),
  genus: z.string().trim().min(2).max(150),
  species: z.string().trim().min(2).max(200),
  commonName: z.string().trim().min(2).max(200),
};

// Frontend, fotoğrafı önce Cloudinary'ye yükler.
// Router'a Base64 yerine Cloudinary URL'si gönderilir.
const imageInput = z.object({
  name: z.string().min(1).max(240),
  contentType: z
    .string()
    .regex(/^image\/(jpeg|png|webp|gif)$/),
  contentBase64: z.string().url().max(2048),
});

// ---------------------------------------------------------
// CLOUDINARY URL DOĞRULAMA
// ---------------------------------------------------------

function isCloudinaryImageUrl(value: string): boolean {
  try {
    const url = new URL(value);

    if (url.protocol !== "https:") return false;
    if (url.hostname !== "res.cloudinary.com") return false;
    if (url.username || url.password) return false;

    const expectedPrefix =
      `/${CLOUDINARY_CLOUD_NAME}/image/upload/`;

    return url.pathname.startsWith(expectedPrefix);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------
// ŞİFRE İŞLEMLERİ
// ---------------------------------------------------------

function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");

  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password: string, stored: string) {
  const [salt, key] = stored.split(":");

  if (!salt || !key) return false;

  const candidate = scryptSync(password, salt, 64);
  const actual = Buffer.from(key, "hex");

  return (
    candidate.length === actual.length &&
    timingSafeEqual(candidate, actual)
  );
}

// ---------------------------------------------------------
// CLOUDINARY FOTOĞRAF URL'LERİNİ HAZIRLAMA
// ---------------------------------------------------------

async function resolveImages(
  files: z.infer<typeof imageInput>[]
): Promise<{ key: string }[]> {
  return files.map((file) => {
    if (!isCloudinaryImageUrl(file.contentBase64)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Geçerli bir Cloudinary fotoğraf adresi gönderilmelidir.",
      });
    }

    return {
      key: file.contentBase64,
    };
  });
}

// ---------------------------------------------------------
// KULLANICI BİLGİLERİ
// ---------------------------------------------------------

function safeUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    bio: user.bio,
    role: user.role,
    avatarKey: user.avatarKey,
    createdAt: user.createdAt,
  };
}

async function createSession(userId: number) {
  const token = randomBytes(32).toString("hex");

  const expiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000
  );

  await getDb().insert(sessions).values({
    userId,
    token,
    expiresAt,
  });

  return token;
}

async function enrichUsers(rows: (typeof users.$inferSelect)[]) {
  const db = getDb();

  const allLikes = await db
    .select({ postId: likes.postId })
    .from(likes);

  const allPosts = await db
    .select({
      id: posts.id,
      authorId: posts.authorId,
    })
    .from(posts);

  return rows.map((user) => ({
    ...safeUser(user),

    // Avatar URL'leri doğrudan Cloudinary'den gelir.
    avatarUrl: user.avatarKey || undefined,

    reputation: allLikes.filter((like) =>
      allPosts.some(
        (post) =>
          post.id === like.postId &&
          post.authorId === user.id
      )
    ).length,
  }));
}

// ---------------------------------------------------------
// GÖNDERİLERİ LİSTELEME
// ---------------------------------------------------------

async function listPosts(viewerId?: number) {
  const db = getDb();

  const rows = await db
    .select({
      post: posts,
      author: users,
    })
    .from(posts)
    .innerJoin(users, eq(users.id, posts.authorId))
    .orderBy(desc(posts.createdAt));

  if (!rows.length) return [];

  const ids = rows.map((row) => row.post.id);

  const [imageRows, likeRows, collabRows] = await Promise.all([
    db
      .select()
      .from(postImages)
      .where(inArray(postImages.postId, ids)),

    db
      .select()
      .from(likes)
      .where(inArray(likes.postId, ids)),

    db
      .select({
        collab: collaborators,
        user: users,
      })
      .from(collaborators)
      .innerJoin(
        users,
        eq(users.id, collaborators.userId)
      )
      .where(inArray(collaborators.postId, ids)),
  ]);

  const authorRep = new Map<number, number>();

  for (const row of rows) {
    const postLikeCount = likeRows.filter(
      (like) => like.postId === row.post.id
    ).length;

    authorRep.set(
      row.author.id,
      (authorRep.get(row.author.id) ?? 0) + postLikeCount
    );
  }

  return rows.map(({ post, author }) => ({
    ...post,

    author: {
      ...safeUser(author),
      avatarUrl: author.avatarKey || undefined,
      reputation: authorRep.get(author.id) ?? 0,
    },

    images: imageRows
      .filter((image) => image.postId === post.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((image) => ({
        id: image.id,
        key: image.fileKey,
        url: image.fileKey,
      })),

    likeCount: likeRows.filter(
      (like) => like.postId === post.id
    ).length,

    liked: viewerId
      ? likeRows.some(
          (like) =>
            like.postId === post.id &&
            like.userId === viewerId
        )
      : false,

    collaborators: collabRows
      .filter((item) => item.collab.postId === post.id)
      .map((item) => safeUser(item.user)),
  }));
}

// ---------------------------------------------------------
// ANA ROUTER
// ---------------------------------------------------------

export const biosfereRouter = createRouter({
  // -------------------------------------------------------
  // KİMLİK DOĞRULAMA
  // -------------------------------------------------------

  auth: createRouter({
    me: publicQuery.query(({ ctx }) =>
      ctx.user ? safeUser(ctx.user) : null
    ),

    register: publicQuery
      .input(
        z.object({
          firstName: z.string().trim().min(2).max(80),
          lastName: z.string().trim().min(2).max(80),

          username: z
            .string()
            .trim()
            .toLowerCase()
            .regex(
              /^[a-z0-9_]{3,40}$/,
              "Kullanıcı adı 3–40 karakter; harf, sayı ve alt çizgi içerebilir."
            ),

          email: z
            .string()
            .trim()
            .toLowerCase()
            .email()
            .max(320),

          phone: z.string().trim().min(10).max(30),

          password: z
            .string()
            .min(8, "Şifre en az 8 karakter olmalı.")
            .max(100),

          bio: z.string().trim().min(3).max(1000),
        })
      )
      .mutation(async ({ input }) => {
        const db = getDb();

        const existing = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.username, input.username))
          .limit(1);

        const existingMail = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, input.email))
          .limit(1);

        if (existing.length || existingMail.length) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Bu kullanıcı adı veya e-posta zaten kullanılıyor.",
          });
        }

        const [firstUser] = await db
          .select({ id: users.id })
          .from(users)
          .limit(1);

        const role = firstUser ? "user" : "admin";

        const [{ id }] = await db
          .insert(users)
          .values({
            ...input,
            passwordHash: hashPassword(input.password),
            role,
          })
          .$returningId();

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, id));

        return {
          token: await createSession(id),
          user: safeUser(user),
        };
      }),

    login: publicQuery
      .input(
        z.object({
          identifier: z.string().trim().min(1),
          password: z.string().min(1),
        })
      )
      .mutation(async ({ input }) => {
        const db = getDb();
        const identifier = input.identifier.toLowerCase();

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.username, identifier))
          .limit(1);

        const [mailUser] = user
          ? []
          : await db
              .select()
              .from(users)
              .where(eq(users.email, identifier))
              .limit(1);

        const found = user ?? mailUser;

        if (
          !found ||
          !verifyPassword(input.password, found.passwordHash)
        ) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message:
              "Kullanıcı adı, e-posta veya şifre hatalı.",
          });
        }

        return {
          token: await createSession(found.id),
          user: safeUser(found),
        };
      }),

    logout: authedQuery.mutation(async ({ ctx }) => {
      const token = ctx.req.headers
        .get("authorization")
        ?.replace(/^Bearer\s+/i, "");

      if (token) {
        await getDb()
          .delete(sessions)
          .where(eq(sessions.token, token));
      }

      return { ok: true };
    }),
  }),

  // -------------------------------------------------------
  // KULLANICILAR
  // -------------------------------------------------------

  users: createRouter({
    list: authedQuery.query(async () =>
      enrichUsers(
        await getDb()
          .select()
          .from(users)
          .orderBy(users.username)
      )
    ),

    updateProfile: authedQuery
      .input(
        z.object({
          bio: z.string().trim().min(3).max(1000),
          avatar: imageInput.optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        let avatarKey = ctx.user.avatarKey;

        if (input.avatar) {
          const saved = await resolveImages([input.avatar]);
          avatarKey = saved[0].key;
        }

        await getDb()
          .update(users)
          .set({
            bio: input.bio,
            avatarKey,
          })
          .where(eq(users.id, ctx.user.id));

        return { ok: true };
      }),

    setRole: adminQuery
      .input(
        z.object({
          userId: z.number(),
          role: z.enum(["user", "moderator", "admin"]),
        })
      )
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message:
              "Rol değiştirme yalnızca admin içindir.",
          });
        }

        if (
          ctx.user.id === input.userId &&
          input.role !== "admin"
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Kendi admin yetkinizi kaldıramazsınız.",
          });
        }

        await getDb()
          .update(users)
          .set({ role: input.role })
          .where(eq(users.id, input.userId));

        return { ok: true };
      }),
  }),

  // -------------------------------------------------------
  // GÖNDERİLER
  // -------------------------------------------------------

  posts: createRouter({
    list: publicQuery.query(async ({ ctx }) => {
      const result = await listPosts(ctx.user?.id);

      return result.sort(
        (a, b) =>
          b.author.reputation - a.author.reputation ||
          b.createdAt.getTime() - a.createdAt.getTime()
      );
    }),

    get: publicQuery
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const result = await listPosts(ctx.user?.id);
        const post = result.find(
          (item) => item.id === input.id
        );

        if (!post) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        return post;
      }),

    create: authedQuery
      .input(
        z
          .object({
            description: z.string().trim().min(10).max(5000),
            unknown: z.boolean(),
            ...taxonomyFields,
            city: z.string().trim().min(2).max(100),
            locality: z.string().trim().min(2).max(200),
            lat: z.number().min(-90).max(90),
            lng: z.number().min(-180).max(180),
            images: z.array(imageInput).min(1).max(8),
            collaboratorIds: z.array(z.number()).max(30).default([]),
          })
          .superRefine((value, ctx) => {
            if (!value.unknown) {
              for (const [key, schema] of Object.entries(
                requiredTaxonomy
              )) {
                const parsed = schema.safeParse(
                  value[key as keyof typeof value]
                );

                if (!parsed.success) {
                  ctx.addIssue({
                    code: "custom",
                    path: [key],
                    message:
                      "Türü bilinen gönderilerde tüm taksonomi alanları zorunludur.",
                  });
                }
              }
            }
          })
      )
      .mutation(async ({ ctx, input }) => {
        const db = getDb();

        // Fotoğraflar önceden Cloudinary'ye yüklenmiştir.
        // Burada yalnızca URL'leri doğrulayıp kaydediyoruz.
        const savedImages = await resolveImages(input.images);

        const tax = input.unknown
          ? Object.fromEntries(
              Object.keys(taxonomyFields).map((key) => [
                key,
                null,
              ])
            )
          : Object.fromEntries(
              Object.keys(taxonomyFields).map((key) => [
                key,
                input[key as keyof typeof input],
              ])
            );

        const [{ id }] = await db
          .insert(posts)
          .values({
            authorId: ctx.user.id,
            description: input.description,
            status: input.unknown ? "unknown" : "verified",
            ...tax,
            city: input.city,
            locality: input.locality,
            lat: input.lat,
            lng: input.lng,
          })
          .$returningId();

        await db.insert(postImages).values(
          savedImages.map((image, index) => ({
            postId: id,
            fileKey: image.key,
            sortOrder: index,
          }))
        );

        const collaboratorIds = [
          ...new Set(input.collaboratorIds),
        ].filter((userId) => userId !== ctx.user.id);

        if (collaboratorIds.length) {
          await db.insert(collaborators).values(
            collaboratorIds.map((userId) => ({
              postId: id,
              userId,
            }))
          );
        }

        return { id };
      }),

    toggleLike: authedQuery
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();

        const [existing] = await db
          .select()
          .from(likes)
          .where(
            and(
              eq(likes.postId, input.postId),
              eq(likes.userId, ctx.user.id)
            )
          )
          .limit(1);

        if (existing) {
          await db
            .delete(likes)
            .where(eq(likes.id, existing.id));
        } else {
          await db.insert(likes).values({
            postId: input.postId,
            userId: ctx.user.id,
          });
        }

        return { liked: !existing };
      }),

    report: authedQuery
      .input(
        z.object({
          postId: z.number(),
          reason: z.enum([
            "misleading",
            "wrong_species",
            "inappropriate",
            "other",
          ]),
          details: z.string().trim().min(5).max(1500),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await getDb().insert(reports).values({
          ...input,
          reporterId: ctx.user.id,
        });

        return { ok: true };
      }),
  }),

  // -------------------------------------------------------
  // TÜR TESPİTİ VE ÖNERİLER
  // -------------------------------------------------------

  identification: createRouter({
    forPost: authedQuery
      .input(z.object({ postId: z.number() }))
      .query(async ({ input }) => {
        const db = getDb();

        const rows = await db
          .select({
            suggestion: suggestions,
            user: users,
          })
          .from(suggestions)
          .innerJoin(
            users,
            eq(users.id, suggestions.userId)
          )
          .where(eq(suggestions.postId, input.postId))
          .orderBy(desc(suggestions.createdAt));

        return rows.map((row) => ({
          ...row.suggestion,
          author: safeUser(row.user),
        }));
      }),

    suggest: authedQuery
      .input(
        z.object({
          postId: z.number(),
          ...requiredTaxonomy,
          note: z.string().trim().max(1000).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const [post] = await getDb()
          .select()
          .from(posts)
          .where(eq(posts.id, input.postId))
          .limit(1);

        if (!post || post.status !== "unknown") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Bu gönderi tür önerisine kapalı.",
          });
        }

        const { postId, ...tax } = input;

        await getDb().insert(suggestions).values({
          ...tax,
          postId,
          userId: ctx.user.id,
        });

        return { ok: true };
      }),

    accept: adminQuery
      .input(z.object({ suggestionId: z.number() }))
      .mutation(async ({ input }) => {
        const db = getDb();

        const [suggestion] = await db
          .select()
          .from(suggestions)
          .where(eq(suggestions.id, input.suggestionId))
          .limit(1);

        if (!suggestion) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        await db.transaction(async (tx) => {
          await tx
            .update(posts)
            .set({
              status: "verified",
              kingdom: suggestion.kingdom,
              phylum: suggestion.phylum,
              className: suggestion.className,
              orderName: suggestion.orderName,
              family: suggestion.family,
              genus: suggestion.genus,
              species: suggestion.species,
              commonName: suggestion.commonName,
            })
            .where(eq(posts.id, suggestion.postId));

          await tx
            .update(suggestions)
            .set({ status: "accepted" })
            .where(eq(suggestions.id, suggestion.id));

          await tx
            .update(suggestions)
            .set({ status: "rejected" })
            .where(
              and(
                eq(suggestions.postId, suggestion.postId),
                ne(suggestions.id, suggestion.id)
              )
            );
        });

        return { ok: true };
      }),
  }),

  // -------------------------------------------------------
  // MODERASYON
  // -------------------------------------------------------

  moderation: createRouter({
    overview: adminQuery.query(async () => {
      const db = getDb();

      const [reportRows, suggestionRows] = await Promise.all([
        db
          .select({
            report: reports,
            post: posts,
            reporter: users,
          })
          .from(reports)
          .innerJoin(posts, eq(posts.id, reports.postId))
          .innerJoin(
            users,
            eq(users.id, reports.reporterId)
          )
          .orderBy(desc(reports.createdAt)),

        db
          .select({
            suggestion: suggestions,
            post: posts,
            user: users,
          })
          .from(suggestions)
          .innerJoin(
            posts,
            eq(posts.id, suggestions.postId)
          )
          .innerJoin(
            users,
            eq(users.id, suggestions.userId)
          )
          .where(eq(suggestions.status, "pending"))
          .orderBy(desc(suggestions.createdAt)),
      ]);

      return {
        reports: reportRows.map((row) => ({
          ...row.report,
          post: {
            id: row.post.id,
            commonName: row.post.commonName,
            species: row.post.species,
          },
          reporter: safeUser(row.reporter),
        })),

        suggestions: suggestionRows.map((row) => ({
          ...row.suggestion,
          post: {
            id: row.post.id,
            description: row.post.description,
          },
          author: safeUser(row.user),
        })),
      };
    }),

    resolveReport: adminQuery
      .input(
        z.object({
          reportId: z.number(),
          action: z.enum(["resolve", "dismiss", "remove"]),
        })
      )
      .mutation(async ({ input }) => {
        const db = getDb();

        const [report] = await db
          .select()
          .from(reports)
          .where(eq(reports.id, input.reportId))
          .limit(1);

        if (!report) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }

        await db
          .update(reports)
          .set({
            status:
              input.action === "dismiss"
                ? "dismissed"
                : "resolved",
          })
          .where(eq(reports.id, input.reportId));

        if (input.action === "remove") {
          await db
            .update(posts)
            .set({ status: "removed" })
            .where(eq(posts.id, report.postId));
        }

        return { ok: true };
      }),
  }),
});
