import { DATASET_FORMAT, DATASET_VERSION, datasetSchema, type PortablePost } from "@contracts/dataset";
import { emptyTaxonomy, type Taxonomy } from "@contracts/taxonomy";
import { descriptionDraft, type AnalysisResult } from "./onlineIdentification";
import type { DatasetArchive } from "./datasetArchive";

export type WorkshopPhoto = { id: string; file: File; name: string; preview: string; gps?: {lat: number; lng: number} };
export type WorkshopFields = Taxonomy & {description: string; city: string; locality: string; lat: string; lng: string; createdAt: string; username: string; status: PortablePost["status"]};
export type WorkshopGroup = { id: string; photoIds: string[]; fields: WorkshopFields; metadata?: Record<string, unknown>; analysis?: AnalysisResult; error?: string };
export function applyTaxonomy(group: WorkshopGroup, taxonomy: Taxonomy): WorkshopGroup {
  const previous = group.fields.description;
  const generated = Boolean(group.analysis) && (!previous || previous === group.metadata?.generatedDescription);
  const description = generated ? descriptionDraft(taxonomy, group.photoIds.length) : previous;
  return {...group, fields: {...group.fields, ...taxonomy, commonName: taxonomy.commonName || group.fields.commonName, description,
    status: group.fields.status === "removed" ? "removed" : taxonomy.species ? "verified" : "unknown"},
    ...(generated ? {metadata: {...group.metadata, generatedDescription: description}} : {})};
}
export function newWorkshopGroup(photoIds: string[]): WorkshopGroup {
  return {id: crypto.randomUUID(), photoIds, fields: {...emptyTaxonomy, description: "", city: "", locality: "", lat: "", lng: "", createdAt: new Date().toISOString(), username: "", status: "unknown"}};
}
export function movePhotos(groups: WorkshopGroup[], selected: string[], target: WorkshopGroup): WorkshopGroup[] {
  const chosen = new Set(selected);
  return [...groups.filter(group => group.id !== target.id), target].map(group => {
    const photoIds = group.id === target.id ? [...new Set([...group.photoIds, ...selected])] : group.photoIds.filter(id => !chosen.has(id));
    return photoIds.join("\0") === group.photoIds.join("\0") ? group : {...group, photoIds, analysis: undefined, error: undefined};
  }).filter(group => group.photoIds.length || group.fields.status === "removed")
    .sort((a, b) => {
      const order = [...groups.map(group => group.id), target.id];
      return order.indexOf(a.id) - order.indexOf(b.id);
    });
}
export function photoExtension(file: File) {
  return ({"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif"} as Record<string, string>)[file.type] || file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() || "webp";
}
export function buildWorkshopArchive(groups: WorkshopGroup[], photos: WorkshopPhoto[]): DatasetArchive {
  if (!groups.length) throw new Error("Önce fotoğrafları gönderilere gruplandırın.");
  const photoMap = new Map(photos.map(photo => [photo.id, photo]));
  const files = new Map<string, File>();
  const posts = groups.map((group, index) => {
    const lat = Number(group.fields.lat.replace(",", ".")), lng = Number(group.fields.lng.replace(",", "."));
    if (!group.fields.lat.trim() || !group.fields.lng.trim() || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error(`Gönderi ${index + 1}: geçerli enlem/boylam girin veya haritadan konum seçin.`);
    const images = group.photoIds.map((id, i) => {
      const photo = photoMap.get(id);
      if (!photo) throw new Error(`Gönderi ${index + 1} fotoğrafı eksik.`);
      const path = `./photos/gonderi${index + 1}.${i + 1}.${photoExtension(photo.file)}`;
      files.set(path, photo.file);
      return path;
    });
    const {username, ...fields} = group.fields;
    return {...fields, id: String(index + 1), lat, lng, images,
      city: fields.city || "Belirtilmedi", locality: fields.locality || "Belirtilmedi",
      description: fields.description || "Fotoğraflarıyla kaydedilmiş canlı gözlemi.",
      ...(fields.createdAt ? {createdAt: new Date(fields.createdAt).toISOString()} : {createdAt: undefined}),
      author: {username, firstName: "", lastName: "", system: false},
      metadata: {...group.metadata, ...(group.analysis ? {analysis: group.analysis} : {}), originalFileNames: group.photoIds.map(id => photoMap.get(id)?.name || "")},
    };
  });
  const parsed = datasetSchema.safeParse({format: DATASET_FORMAT, version: DATASET_VERSION, archiveId: crypto.randomUUID(), exportedAt: new Date().toISOString(), posts});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error("Gönderi verisini kontrol edin (" + issue.path.join(".") + "): " + issue.message);
  }
  return {dataset: parsed.data, close: async () => {}, readPhoto: async path => {
    const file = files.get(path);
    if (!file) throw new Error("Fotoğraf bulunamadı: " + path);
    return file;
  }};
}
type SavedDraft = {version: 1; groups: WorkshopGroup[]; photos: Omit<WorkshopPhoto, "preview">[]};
async function draftStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("biosfere-workshop", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Tarayıcı taslak deposu açılamadı."));
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = database.transaction("drafts", mode);
      const request = action(tx.objectStore("drafts"));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(new Error("Taslak kaydedilemedi. Tarayıcı depolama iznini ve boş alanını kontrol edin."));
    });
  } finally { database.close(); }
}
export async function saveWorkshopDraft(groups: WorkshopGroup[], photos: WorkshopPhoto[]) {
  const draft: SavedDraft = {version: 1, groups, photos: photos.map(({preview: _preview, ...photo}) => photo)};
  await draftStore("readwrite", store => store.put(draft, "current"));
}
export async function loadWorkshopDraft(): Promise<SavedDraft | undefined> { return draftStore("readonly", store => store.get("current")); }
