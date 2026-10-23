import {
  mysqlTable, mysqlEnum, serial, varchar, text, timestamp, bigint,
  double, int, index, uniqueIndex,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: serial("id").primaryKey(),
  firstName: varchar("first_name", { length: 80 }).notNull(),
  lastName: varchar("last_name", { length: 80 }).notNull(),
  username: varchar("username", { length: 40 }).notNull().unique(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  phone: varchar("phone", { length: 30 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  bio: text("bio").notNull(),
  avatarKey: varchar("avatar_key", { length: 512 }),
  role: mysqlEnum("role", ["user", "moderator", "admin"]).notNull().default("user"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessions = mysqlTable("sessions", {
  id: serial("id").primaryKey(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ userIdx: index("session_user_idx").on(t.userId) }));

export const posts = mysqlTable("posts", {
  id: serial("id").primaryKey(),
  authorId: bigint("author_id", { mode: "number", unsigned: true }).notNull(),
  description: text("description").notNull(),
  status: mysqlEnum("status", ["unknown", "verified", "removed"]).notNull().default("verified"),
  kingdom: varchar("kingdom", { length: 100 }),
  phylum: varchar("phylum", { length: 150 }),
  className: varchar("class_name", { length: 150 }),
  orderName: varchar("order_name", { length: 150 }),
  family: varchar("family", { length: 150 }),
  genus: varchar("genus", { length: 150 }),
  species: varchar("species", { length: 200 }),
  commonName: varchar("common_name", { length: 200 }),
  city: varchar("city", { length: 100 }).notNull(),
  locality: varchar("locality", { length: 200 }).notNull(),
  lat: double("lat").notNull(),
  lng: double("lng").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
}, (t) => ({
  authorIdx: index("post_author_idx").on(t.authorId),
  cityIdx: index("post_city_idx").on(t.city),
  speciesIdx: index("post_species_idx").on(t.species),
}));

export const postImages = mysqlTable("post_images", {
  id: serial("id").primaryKey(),
  postId: bigint("post_id", { mode: "number", unsigned: true }).notNull(),
  fileKey: varchar("file_key", { length: 512 }).notNull(),
  sortOrder: int("sort_order").notNull().default(0),
}, (t) => ({ postIdx: index("image_post_idx").on(t.postId) }));

export const likes = mysqlTable("likes", {
  id: serial("id").primaryKey(),
  postId: bigint("post_id", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({ uniqueLike: uniqueIndex("unique_like").on(t.postId, t.userId) }));

export const collaborators = mysqlTable("collaborators", {
  id: serial("id").primaryKey(),
  postId: bigint("post_id", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
}, (t) => ({ uniqueCollab: uniqueIndex("unique_collab").on(t.postId, t.userId) }));

export const suggestions = mysqlTable("suggestions", {
  id: serial("id").primaryKey(),
  postId: bigint("post_id", { mode: "number", unsigned: true }).notNull(),
  userId: bigint("user_id", { mode: "number", unsigned: true }).notNull(),
  kingdom: varchar("kingdom", { length: 100 }).notNull(),
  phylum: varchar("phylum", { length: 150 }).notNull(),
  className: varchar("class_name", { length: 150 }).notNull(),
  orderName: varchar("order_name", { length: 150 }).notNull(),
  family: varchar("family", { length: 150 }).notNull(),
  genus: varchar("genus", { length: 150 }).notNull(),
  species: varchar("species", { length: 200 }).notNull(),
  commonName: varchar("common_name", { length: 200 }).notNull(),
  note: text("note"),
  status: mysqlEnum("status", ["pending", "accepted", "rejected"]).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reports = mysqlTable("reports", {
  id: serial("id").primaryKey(),
  postId: bigint("post_id", { mode: "number", unsigned: true }).notNull(),
  reporterId: bigint("reporter_id", { mode: "number", unsigned: true }).notNull(),
  reason: mysqlEnum("reason", ["misleading", "wrong_species", "inappropriate", "other"]).notNull(),
  details: text("details").notNull(),
  status: mysqlEnum("status", ["pending", "resolved", "dismissed"]).notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type Post = typeof posts.$inferSelect;
