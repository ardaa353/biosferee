import { z } from "zod";

export const DATASET_FORMAT = "biosfere-dataset";
export const DATASET_VERSION = 1;
const text = (limit: number) => z.string().trim().max(limit).default("");
export const portablePostSchema = z.object({
  id: z.union([z.string().min(1).max(128), z.number().int().nonnegative()]).transform(String),
  description: text(5000),
  status: z.enum(["unknown", "verified", "removed"]).default("verified"),
  kingdom: text(100), phylum: text(150), className: text(150), orderName: text(150),
  family: text(150), genus: text(150), species: text(200), commonName: text(200),
  city: text(100), locality: text(200),
  lat: z.number().finite().min(-90).max(90), lng: z.number().finite().min(-180).max(180),
  createdAt: z.string().refine(value => Number.isFinite(Date.parse(value)), "Geçersiz kayıt tarihi").optional(),
  updatedAt: z.string().refine(value => Number.isFinite(Date.parse(value)), "Geçersiz değişiklik tarihi").optional(),
  images: z.array(z.string().min(1).max(512)),
  author: z.object({ username: text(80), firstName: text(100), lastName: text(100), system: z.boolean().default(false) }).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).superRefine((post, ctx) => {
  if (post.status !== "removed" && !post.images.length) ctx.addIssue({code: "custom", path: ["images"], message: "Gönderinin fotoğrafı eksik."});
  for (const path of post.images) {
    if (!/^\.\/photos\/[^/\\]+$/.test(path) || path.includes("..")) ctx.addIssue({code: "custom", path: ["images"], message: "Fotoğraf yolu ./photos/dosya.jpg biçiminde olmalı."});
  }
});
export const datasetSchema = z.object({
  format: z.literal(DATASET_FORMAT), version: z.literal(DATASET_VERSION),
  archiveId: z.string().min(1).max(128), exportedAt: z.string().optional(),
  posts: z.array(portablePostSchema),
  users: z.array(z.object({ username: text(80), firstName: text(100), lastName: text(100), bio: text(1000), role: text(20) })).optional(),
});
export type PortablePost = z.infer<typeof portablePostSchema>;
export type Dataset = z.infer<typeof datasetSchema>;
