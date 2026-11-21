import { prepareImageCleanup, queueCloudImages, kickCloudImageCleanup } from "./lib/imageCleanup";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, between, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { isCloudinaryImageUrl } from "./lib/cloudImages";

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

const imageInput = z.object({
  name: z.string().min(1).max(240),
  contentType: z
    .string()
    .regex(/^image\/(jpeg|png|webp|gif)$/),
  contentBase64: z.string().url().max(512),
});

const observationInput = z.object({
  description: z.string().trim().min(10).max(5000),
  unknown: z.boolean(),
  ...taxonomyFields,
  city: z.string().trim().min(2).max(100),
  locality: z.string().trim().min(2).max(200),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  images: z.array(imageInput),
  collaboratorIds: z.array(z.number().int().positive()).max(30).default([]),
}).refine(value => value.unknown || Boolean(value.species?.trim()), {
  path: ["species"], message: "Bilimsel tür adı gir veya türü bilinmiyor seçeneğini kullan.",
});

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
  return candidate.length === actual.length && timingSafeEqual(candidate, actual);
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
        message: "Geçerli bir Cloudinary fotoğraf adresi gönderilmelidir.",
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
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await getDb().insert(sessions).values({ userId, token, expiresAt });
  return token;
}

async function reputations(ids: number[]) {
  if (!ids.length) return new Map<number, number>();
  const rows = await getDb().select({ id: posts.authorId, total: sql<number>`count(*)` })
    .from(likes).innerJoin(posts, eq(likes.postId, posts.id)).where(inArray(posts.authorId, ids)).groupBy(posts.authorId);
  return new Map(rows.map(row => [row.id, Number(row.total)]));
}

async function enrichUsers(rows: (typeof users.$inferSelect)[]) {
  const rep = await reputations(rows.map(user => user.id));
  return rows.map(user => ({ ...safeUser(user), avatarUrl: user.avatarKey || undefined, reputation: rep.get(user.id) ?? 0 }));
}

function byPost<T>(rows: T[], postId: (row: T) => number) {
  const grouped = new Map<number, T[]>();
  for (const row of rows) {
    const id = postId(row);
    const group = grouped.get(id);
    if (group) group.push(row);
    else grouped.set(id, [row]);
  }
  return grouped;
}

async function listPosts(viewerId?: number, postId?: number) {
  const db = getDb();
  const rows = await db.select({ post: posts, author: users }).from(posts).innerJoin(users, eq(users.id, posts.authorId))
    .where(postId === undefined ? undefined : eq(posts.id, postId)).orderBy(desc(posts.createdAt));
  if (!rows.length) return [];
  const ids = rows.map(row => row.post.id);
  const [images, reactions, partners, rep] = await Promise.all([
    db.select().from(postImages).where(inArray(postImages.postId, ids)).orderBy(postImages.sortOrder, postImages.id),
    db.select({ id: likes.postId, count: sql<number>`count(*)`, liked: sql<number>`max(case when ${likes.userId} = ${viewerId ?? -1} then 1 else 0 end)` })
      .from(likes).where(inArray(likes.postId, ids)).groupBy(likes.postId),
    db.select({ id: collaborators.postId, user: users }).from(collaborators).innerJoin(users, eq(users.id, collaborators.userId)).where(inArray(collaborators.postId, ids)),
    reputations([...new Set(rows.map(row => row.author.id))]),
  ]);
  const imagesByPost = byPost(images, item => item.postId);
  const partnersByPost = byPost(partners, item => item.id);
  const likesByPost = new Map(reactions.map(item => [item.id, item]));
  return rows.map(({ post, author }) => ({
    ...post,
    author: { ...safeUser(author), avatarUrl: author.avatarKey || undefined, reputation: rep.get(author.id) ?? 0 },
    images: (imagesByPost.get(post.id) || []).map(image => ({ id: image.id, key: image.fileKey, url: image.fileKey })),
    likeCount: Number(likesByPost.get(post.id)?.count ?? 0),
    liked: Number(likesByPost.get(post.id)?.liked ?? 0) === 1,
    collaborators: (partnersByPost.get(post.id) || []).map(item => safeUser(item.user))
  }));
}

// ---------------------------------------------------------
// ANA ROUTER
// ---------------------------------------------------------

export const biosfereRouter = createRouter({
  nearbySpecies: authedQuery.input(z.object({
    lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180),
    species: z.array(z.string().min(2).max(200)).min(1).max(4)
  })).query(async ({input}) => {
    const rows = await getDb().selectDistinct({ name: posts.species }).from(posts).where(and(
      eq(posts.status, "verified"), inArray(posts.species, input.species),
      between(posts.lat, input.lat - 0.91, input.lat + 0.91),
      sql`(sin(radians(${posts.lat} - ${input.lat}) / 2) * sin(radians(${posts.lat} - ${input.lat}) / 2)
          + cos(radians(${input.lat})) * cos(radians(${posts.lat}))
          * sin(radians(${posts.lng} - ${input.lng}) / 2) * sin(radians(${posts.lng} - ${input.lng}) / 2))
          <= ${Math.sin(100 / (2 * 6371)) ** 2}`
    ));
    return rows.flatMap(row => row.name ? [row.name] : []);
  }),
  // -------------------------------------------------------
  // KİMLİK DOĞRULAMA
  // -------------------------------------------------------
  auth: createRouter({
    me: publicQuery.query(({ ctx }) => (ctx.user ? safeUser(ctx.user) : null)),

    register: publicQuery
      .input(
        z.object({
          firstName: z.string().trim().min(2).max(80),
          lastName: z.string().trim().min(2).max(80),
          username: z
            .string()
            .trim()
            .toLowerCase()
            .regex(/^[a-z0-9_]{3,40}$/, "Kullanıcı adı 3–40 karakter; harf, sayı ve alt çizgi içerebilir."),
          email: z.string().trim().toLowerCase().email().max(320),
          phone: z.string().trim().min(10).max(30).optional(),
          password: z.string().min(8, "Şifre en az 8 karakter olmalı.").max(100),
          bio: z.string().trim().min(3).max(1000).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const db = getDb();
        const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, input.username)).limit(1);
        const existingMail = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);

        if (existing.length || existingMail.length) {
          throw new TRPCError({ code: "CONFLICT", message: "Bu kullanıcı adı veya e-posta zaten kullanılıyor." });
        }

        const [firstUser] = await db.select({ id: users.id }).from(users).limit(1);
        const role = firstUser ? "user" : "admin";

        const [{ id }] = await db
          .insert(users)
          .values({ firstName: input.firstName, lastName: input.lastName, username: input.username, email: input.email, phone: input.phone ?? "", passwordHash: hashPassword(input.password), role, bio: input.bio || "" })
          .$returningId();

        const [user] = await db.select().from(users).where(eq(users.id, id));

        return { token: await createSession(id), user: safeUser(user) };
      }),

    login: publicQuery
      .input(z.object({ identifier: z.string().trim().min(1), password: z.string().min(1) }))
      .mutation(async ({ input }) => {
        const db = getDb();
        const identifier = input.identifier.toLowerCase();

        const [user] = await db.select().from(users).where(eq(users.username, identifier)).limit(1);
        const [mailUser] = user ? [] : await db.select().from(users).where(eq(users.email, identifier)).limit(1);
        const found = user ?? mailUser;

        if (!found || !verifyPassword(input.password, found.passwordHash)) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Kullanıcı adı, e-posta veya şifre hatalı." });
        }

        return { token: await createSession(found.id), user: safeUser(found) };
      }),

    logout: authedQuery.mutation(async ({ ctx }) => {
      const token = ctx.req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      if (token) await getDb().delete(sessions).where(eq(sessions.token, token));
      return { ok: true };
    }),
  }),

  // -------------------------------------------------------
  // KULLANICILAR
  // -------------------------------------------------------
  users: createRouter({
    list: authedQuery.query(async () => enrichUsers(await getDb().select().from(users).orderBy(users.username))),

    updateProfile: authedQuery
      .input(z.object({ bio: z.string().trim().min(3).max(1000), avatar: imageInput.optional() }))
      .mutation(async ({ ctx, input }) => {
        await prepareImageCleanup();
        const saved = input.avatar ? await resolveImages([input.avatar]) : [];
        await getDb().transaction(async tx => {
          const [user] = await tx.select().from(users).where(eq(users.id, ctx.user.id)).limit(1).for("update");
          if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Kullanıcı bulunamadı." });
          const avatarKey = saved[0]?.key ?? user.avatarKey;
          await tx.update(users).set({ bio: input.bio, avatarKey }).where(eq(users.id, user.id));
          if (avatarKey !== user.avatarKey) await queueCloudImages(tx, [user.avatarKey]);
        });
        kickCloudImageCleanup();
        return { ok: true };
      }),

    // YENİ EKLENDİ: ŞİFRE, MAİL VE TELEFON GÜNCELLEME
    updateSettings: authedQuery
      .input(z.object({ 
        email: z.string().trim().toLowerCase().email().max(320).optional(),
        phone: z.string().trim().min(10).max(30).optional(),
        password: z.string().min(8).max(100).optional()
      }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        const updates: any = {};

        if (input.email && input.email !== ctx.user.email) {
          const existingMail = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
          if (existingMail.length) {
            throw new TRPCError({ code: "CONFLICT", message: "Bu e-posta adresi başka bir kullanıcı tarafından kullanılıyor." });
          }
          updates.email = input.email;
        }

        if (input.phone) updates.phone = input.phone;
        if (input.password) updates.passwordHash = hashPassword(input.password);

        if (Object.keys(updates).length > 0) {
          await db.update(users).set(updates).where(eq(users.id, ctx.user.id));
        }

        return { ok: true };
      }),

    setRole: adminQuery
      .input(z.object({ userId: z.number(), role: z.enum(["user", "moderator", "admin"]) }))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Rol değiştirme yalnızca admin içindir." });
        }
        if (ctx.user.id === input.userId && input.role !== "admin") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Kendi admin yetkinizi kaldıramazsınız." });
        }
        await getDb().update(users).set({ role: input.role }).where(eq(users.id, input.userId));
        return { ok: true };
      }),

    // YENİ EKLENDİ: HESAP SİLME (CLOUD & DB HARD DELETE)
    delete: authedQuery
      .input(z.object({ userId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();

        if (ctx.user.id !== input.userId && ctx.user.role !== "admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Bu hesabı silme yetkiniz yok." });
        }

        await prepareImageCleanup();
        await db.transaction(async tx => {
          const [targetUser] = await tx.select().from(users).where(eq(users.id, input.userId)).limit(1).for("update");
          if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "Kullanıcı bulunamadı." });
          const userPosts = await tx.select({ id: posts.id }).from(posts).where(eq(posts.authorId, targetUser.id)).for("update");
          const imagesToDelete = userPosts.length
            ? await tx.select().from(postImages).where(inArray(postImages.postId, userPosts.map(post => post.id))) : [];
          await queueCloudImages(tx, [targetUser.avatarKey, ...imagesToDelete.map(image => image.fileKey)]);
          await tx.delete(sessions).where(eq(sessions.userId, targetUser.id));
          await tx.delete(likes).where(eq(likes.userId, targetUser.id));
          await tx.delete(collaborators).where(eq(collaborators.userId, targetUser.id));
          await tx.delete(reports).where(eq(reports.reporterId, targetUser.id));
          await tx.delete(suggestions).where(eq(suggestions.userId, targetUser.id));
          
          if (userPosts.length > 0) {
            const postIds = userPosts.map(p => p.id);
            await tx.delete(postImages).where(inArray(postImages.postId, postIds));
            await tx.delete(likes).where(inArray(likes.postId, postIds));
            await tx.delete(reports).where(inArray(reports.postId, postIds));
            await tx.delete(suggestions).where(inArray(suggestions.postId, postIds));
            await tx.delete(collaborators).where(inArray(collaborators.postId, postIds));
            await tx.delete(posts).where(eq(posts.authorId, targetUser.id));
          }

          await tx.delete(users).where(eq(users.id, targetUser.id));
        });
        kickCloudImageCleanup();

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
        (a, b) => b.author.reputation - a.author.reputation || b.createdAt.getTime() - a.createdAt.getTime()
      );
    }),

    get: publicQuery
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const [post] = await listPosts(ctx.user?.id, input.id);
        if (!post) throw new TRPCError({ code: "NOT_FOUND" });
        return post;
      }),

    create: authedQuery
      .input(observationInput.safeExtend({ images: z.array(imageInput).min(1) }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        const savedImages = await resolveImages(input.images);

        const classification = {
          kingdom: input.kingdom, phylum: input.phylum, className: input.className, orderName: input.orderName,
          family: input.family, genus: input.genus, species: input.species, commonName: input.commonName,
        };
        const partnerIds = [...new Set(input.collaboratorIds)].filter(id => id !== ctx.user.id);
        return db.transaction(async tx => {
          const [author] = await tx.select({ id: users.id }).from(users).where(eq(users.id, ctx.user.id)).limit(1).for("update");
          if (!author) throw new TRPCError({ code: "UNAUTHORIZED", message: "Yeniden giriş yapmalısınız." });
          const [{ id }] = await tx.insert(posts).values({
            authorId: ctx.user.id, description: input.description,
            status: input.unknown ? "unknown" : "verified",
            ...(input.unknown ? {} : classification),
            city: input.city, locality: input.locality, lat: input.lat, lng: input.lng,
          }).$returningId();
          for (let start = 0; start < savedImages.length; start += 100) {
            await tx.insert(postImages).values(savedImages.slice(start, start + 100).map((image, index) =>
              ({ postId: id, fileKey: image.key, sortOrder: start + index })));
          }
          if (partnerIds.length) await tx.insert(collaborators).values(partnerIds.map(userId => ({ postId: id, userId })));
          return { id };
        });
      }),

    update: authedQuery
      .input(observationInput.safeExtend({
        id: z.number().int().positive(),
        keptImageIds: z.array(z.number().int().positive()).default([]),
      }).refine(value => value.images.length + value.keptImageIds.length > 0, {
        path: ["images"], message: "En az bir fotoğraf bırakmalısın.",
      }))
      .mutation(async ({ ctx, input }) => {
        const savedImages = await resolveImages(input.images);
        await prepareImageCleanup();
        const result = await getDb().transaction(async tx => {
          const [post] = await tx.select().from(posts).where(eq(posts.id, input.id)).limit(1).for("update");
          if (!post || post.status === "removed") throw new TRPCError({ code: "NOT_FOUND", message: "Gönderi bulunamadı." });
          if (post.authorId !== ctx.user.id && ctx.user.role !== "admin") {
            throw new TRPCError({ code: "FORBIDDEN", message: "Bu gönderiyi düzenleme yetkiniz yok." });
          }
          const currentImages = await tx.select().from(postImages).where(eq(postImages.postId, post.id));
          const keptIds = [...new Set(input.keptImageIds)];
          if (keptIds.some(id => !currentImages.some(image => image.id === id))) {
            throw new TRPCError({ code: "CONFLICT", message: "Fotoğraflar değişmiş. Sayfayı yenileyip tekrar dene." });
          }
          const classification = {
            kingdom: input.unknown ? null : input.kingdom ?? null,
            phylum: input.unknown ? null : input.phylum ?? null,
            className: input.unknown ? null : input.className ?? null,
            orderName: input.unknown ? null : input.orderName ?? null,
            family: input.unknown ? null : input.family ?? null,
            genus: input.unknown ? null : input.genus ?? null,
            species: input.unknown ? null : input.species ?? null,
            commonName: input.unknown ? null : input.commonName ?? null,
          };
          await tx.update(posts).set({
            description: input.description, ...classification,
            status: input.unknown ? "unknown" : "verified",
            city: input.city, locality: input.locality, lat: input.lat, lng: input.lng,
          }).where(eq(posts.id, post.id));
          const removed = currentImages.filter(image => !keptIds.includes(image.id));
          await queueCloudImages(tx, removed.map(image => image.fileKey));
          const removedIds = removed.map(image => image.id);
          if (removedIds.length) await tx.delete(postImages).where(and(eq(postImages.postId, post.id), inArray(postImages.id, removedIds)));
          for (const [sortOrder, id] of keptIds.entries()) {
            await tx.update(postImages).set({ sortOrder }).where(and(eq(postImages.id, id), eq(postImages.postId, post.id)));
          }
          for (let start = 0; start < savedImages.length; start += 100) {
            await tx.insert(postImages).values(savedImages.slice(start, start + 100).map((image, index) => ({
              postId: post.id, fileKey: image.key, sortOrder: keptIds.length + start + index,
            })));
          }
          const partnerIds = [...new Set(input.collaboratorIds)].filter(id => id !== post.authorId);
          await tx.delete(collaborators).where(eq(collaborators.postId, post.id));
          if (partnerIds.length) await tx.insert(collaborators).values(partnerIds.map(userId => ({postId: post.id, userId})));
          return { id: post.id };
        });
        kickCloudImageCleanup();
        return result;
      }),

    toggleLike: authedQuery
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();
        const [existing] = await db
          .select()
          .from(likes)
          .where(and(eq(likes.postId, input.postId), eq(likes.userId, ctx.user.id)))
          .limit(1);

        if (existing) {
          await db.delete(likes).where(eq(likes.id, existing.id));
        } else {
          await db.insert(likes).values({ postId: input.postId, userId: ctx.user.id });
        }
        return { liked: !existing };
      }),

    report: authedQuery
      .input(
        z.object({
          postId: z.number(),
          reason: z.enum(["misleading", "wrong_species", "inappropriate", "other"]),
          details: z.string().trim().min(5).max(1500),
        })
      )
      .mutation(async ({ ctx, input }) => {
        await getDb().insert(reports).values({ ...input, reporterId: ctx.user.id });
        return { ok: true };
      }),

    delete: authedQuery
      .input(z.object({ postId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = getDb();

        await prepareImageCleanup();
        await db.transaction(async tx => {
          const [post] = await tx.select().from(posts).where(eq(posts.id, input.postId)).limit(1).for("update");
          if (!post) throw new TRPCError({ code: "NOT_FOUND", message: "Gönderi bulunamadı." });
          if (post.authorId !== ctx.user.id && ctx.user.role !== "admin") {
            throw new TRPCError({ code: "FORBIDDEN", message: "Bu gönderiyi silme yetkiniz yok." });
          }
          const images = await tx.select().from(postImages).where(eq(postImages.postId, post.id));
          await queueCloudImages(tx, images.map(image => image.fileKey));
          await tx.delete(likes).where(eq(likes.postId, post.id));
          await tx.delete(reports).where(eq(reports.postId, post.id));
          await tx.delete(suggestions).where(eq(suggestions.postId, post.id));
          await tx.delete(collaborators).where(eq(collaborators.postId, post.id));
          await tx.delete(postImages).where(eq(postImages.postId, post.id));
          await tx.delete(posts).where(eq(posts.id, post.id));
        });
        kickCloudImageCleanup();

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
          .select({ suggestion: suggestions, user: users })
          .from(suggestions)
          .innerJoin(users, eq(users.id, suggestions.userId))
          .where(eq(suggestions.postId, input.postId))
          .orderBy(desc(suggestions.createdAt));

        return rows.map((row) => ({ ...row.suggestion, author: safeUser(row.user) }));
      }),

    suggest: authedQuery
      .input(z.object({ postId: z.number(), ...requiredTaxonomy, note: z.string().trim().max(1000).optional() }))
      .mutation(async ({ ctx, input }) => {
        const [post] = await getDb().select().from(posts).where(eq(posts.id, input.postId)).limit(1);
        if (!post || post.status !== "unknown") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Bu gönderi tür önerisine kapalı." });
        }
        const { postId, ...tax } = input;
        await getDb().insert(suggestions).values({ ...tax, postId, userId: ctx.user.id });
        return { ok: true };
      }),

    accept: adminQuery
      .input(z.object({ suggestionId: z.number() }))
      .mutation(async ({ input }) => {
        const db = getDb();
        const [suggestion] = await db.select().from(suggestions).where(eq(suggestions.id, input.suggestionId)).limit(1);
        if (!suggestion) throw new TRPCError({ code: "NOT_FOUND" });

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

          await tx.update(suggestions).set({ status: "accepted" }).where(eq(suggestions.id, suggestion.id));
          await tx
            .update(suggestions)
            .set({ status: "rejected" })
            .where(and(eq(suggestions.postId, suggestion.postId), ne(suggestions.id, suggestion.id)));
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
          .select({ report: reports, post: posts, reporter: users })
          .from(reports)
          .innerJoin(posts, eq(posts.id, reports.postId))
          .innerJoin(users, eq(users.id, reports.reporterId))
          .orderBy(desc(reports.createdAt)),
        db
          .select({ suggestion: suggestions, post: posts, user: users })
          .from(suggestions)
          .innerJoin(posts, eq(posts.id, suggestions.postId))
          .innerJoin(users, eq(users.id, suggestions.userId))
          .where(eq(suggestions.status, "pending"))
          .orderBy(desc(suggestions.createdAt)),
      ]);

      return {
        reports: reportRows.map((row) => ({
          ...row.report,
          post: { id: row.post.id, commonName: row.post.commonName, species: row.post.species },
          reporter: safeUser(row.reporter),
        })),
        suggestions: suggestionRows.map((row) => ({
          ...row.suggestion,
          post: { id: row.post.id, description: row.post.description },
          author: safeUser(row.user),
        })),
      };
    }),

    resolveReport: adminQuery
      .input(z.object({ reportId: z.number(), action: z.enum(["resolve", "dismiss", "remove"]) }))
      .mutation(async ({ input }) => {
        const db = getDb();
        const [report] = await db.select().from(reports).where(eq(reports.id, input.reportId)).limit(1);
        if (!report) throw new TRPCError({ code: "NOT_FOUND" });

        if (input.action === "remove") await prepareImageCleanup();
        await db.transaction(async tx => {
          if (input.action === "remove") {
            const [post] = await tx.select({ id: posts.id }).from(posts).where(eq(posts.id, report.postId)).limit(1).for("update");
            if (post) {
              const images = await tx.select().from(postImages).where(eq(postImages.postId, post.id));
              await queueCloudImages(tx, images.map(image => image.fileKey));
              await tx.delete(postImages).where(eq(postImages.postId, post.id));
              await tx.update(posts).set({ status: "removed" }).where(eq(posts.id, post.id));
            }
          }
          await tx.update(reports).set({ status: input.action === "dismiss" ? "dismissed" : "resolved" })
            .where(eq(reports.id, input.reportId));
        });
        if (input.action === "remove") kickCloudImageCleanup();
        return { ok: true };
      }),
  }),
});
