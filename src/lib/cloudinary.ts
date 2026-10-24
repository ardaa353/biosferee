const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export async function uploadToCloudinary(file: File): Promise<string> {
  if (!cloudName || !uploadPreset) {
    throw new Error("Cloudinary ayarları bulunamadı. .env dosyasını kontrol et.");
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

  if (!allowedTypes.includes(file.type)) {
    throw new Error("JPEG, PNG, WebP veya GIF formatında fotoğraf seç.");
  }

  if (file.size > 12 * 1024 * 1024) {
    throw new Error("Fotoğraf boyutu en fazla 12 MB olabilir.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);
  formData.append("folder", "biosfere/posts");

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: "POST",
      body: formData,
    }
  );

  const result = await response.json();

  if (!response.ok || !result.secure_url) {
    throw new Error(
      result.error?.message ?? "Fotoğraf buluta yüklenemedi."
    );
  }

  return result.secure_url as string;
}
