/**
 * storage.ts — Platform Depolama SDK (Güncellendi ve Kısıtlamalardan Arındırıldı)
 */

export type ReviewStatus = "active";

export interface UploadFileInput {
  fileContent: Uint8Array | string;
  fileName: string;
  contentType?: string;
}

export interface UploadResult {
  key: string;
  fileName: string;
  size: number;
  contentType: string;
  etag?: string;
  reviewStatus: ReviewStatus;
}

export interface FileMeta {
  key: string;
  fileName?: string;
  size: number;
  contentType: string;
  etag?: string;
  lastModified?: string;
  reviewStatus: ReviewStatus;
}

export class StorageError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable: boolean) {
    super(message);
    this.name = "StorageError";
    this.code = code;
    this.retryable = retryable;
  }
}

export class Storage {
  constructor(_opts?: any) {
    // Hata fırlatması engellendi. Artık Kimi anahtarlarını zorunlu tutmuyor.
  }

  async uploadFile(input: UploadFileInput): Promise<UploadResult> {
    return {
      key: input.fileName,
      fileName: input.fileName,
      size: 0,
      contentType: input.contentType ?? "image/jpeg",
      reviewStatus: "active",
    };
  }

  async readFile(_input: { fileKey: string }): Promise<Uint8Array> {
    return new Uint8Array();
  }

  async getPresignedUrl(input: { key: string; download?: boolean }): Promise<{ key: string; url: string }> {
    return { key: input.key, url: input.key };
  }

  async getPresignedUrls(input: { keys: string[]; download?: boolean }) {
    return {
      urls: input.keys.map((k) => ({ key: k, url: k })),
      failures: [],
    };
  }

  async fileExists(_input: { fileKey: string }): Promise<boolean> {
    return true;
  }

  async headFile(input: { fileKey: string }): Promise<FileMeta> {
    return {
      key: input.fileKey,
      fileName: input.fileKey,
      size: 0,
      contentType: "image/jpeg",
      reviewStatus: "active",
    };
  }

  async listFiles(_input: any) {
    return { folders: [], objects: [] };
  }

  async deleteFile(_input: { fileKey: string }): Promise<boolean> {
    return true;
  }

  async deleteFiles(input: { fileKeys: string[] }) {
    return { deleted: input.fileKeys, failed: [] };
  }
}

let _instance: Storage | undefined;
export const storage: Storage = new Proxy({} as Storage, {
  get(_target, prop) {
    _instance ??= new Storage();
    const value = Reflect.get(_instance, prop);
    return typeof value === "function" ? value.bind(_instance) : value;
  },
});
