import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Crosshair, ImagePlus, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { emptyTaxonomy } from "@/lib/types";
import { errorMessage } from "@/lib/utils";
import { uploadToCloudinary } from "@/lib/cloudinary";
import {
  Field,
  PageHeading,
  buttonClass,
  inputClass,
  secondaryButton,
} from "@/components/BioUI";
import { LocationPicker } from "@/components/BioMap";

const MAX_IMAGES = 8;
const MAX_FILE_SIZE = 12 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const taxLabels: [keyof typeof emptyTaxonomy, string][] = [
  ["kingdom", "Alem"],
  ["phylum", "Şube"],
  ["className", "Sınıf"],
  ["orderName", "Takım"],
  ["family", "Familya"],
  ["genus", "Cins"],
  ["species", "Bilimsel tür adı"],
  ["commonName", "Türkçe yaygın ad"],
];

export default function CreatePostPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const [unknown, setUnknown] = useState(
    params.get("bilinmiyor") === "1"
  );

  const [tax, setTax] = useState(emptyTaxonomy);
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [locality, setLocality] = useState("");
  const [lat, setLat] = useState(39.0);
  const [lng, setLng] = useState(35.0);
  const [files, setFiles] = useState<File[]>([]);
  const [collaboratorIds, setCollaboratorIds] = useState<number[]>([]);
  const [collaboratorSearch, setCollaboratorSearch] = useState(""); // YENİ: Arama çubuğu için state
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState("");

  const users = trpc.biosfere.users.list.useQuery();
  const create = trpc.biosfere.posts.create.useMutation();

  // Önizleme adresleri yalnızca tarayıcıda kullanılır.
  // Bu adresler dosyaları sunucuya veya yerel klasöre kaydetmez.
  const previews = useMemo(
    () =>
      files.map((file) => ({
        name: file.name,
        url: URL.createObjectURL(file),
      })),
    [files]
  );

  // Önizleme adreslerini bileşen güncellendiğinde temizle.
  useEffect(() => {
    return () => {
      previews.forEach((preview) => {
        URL.revokeObjectURL(preview.url);
      });
    };
  }, [previews]);

  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    setError("");

    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = "";

    if (selectedFiles.length === 0) return;

    const remainingSlots = MAX_IMAGES - files.length;

    if (remainingSlots <= 0) {
      setError(`En fazla ${MAX_IMAGES} fotoğraf ekleyebilirsin.`);
      return;
    }

    const validFiles: File[] = [];

    for (const file of selectedFiles) {
      if (files.length + validFiles.length >= MAX_IMAGES) {
        setError(`En fazla ${MAX_IMAGES} fotoğraf ekleyebilirsin.`);
        break;
      }

      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        setError(
          `${file.name}: Yalnızca JPEG, PNG, WebP veya GIF yükleyebilirsin.`
        );
        continue;
      }

      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name}: Fotoğraf en fazla 12 MB olabilir.`);
        continue;
      }

      validFiles.push(file);
    }

    if (validFiles.length > 0) {
      setFiles((current) =>
        [...current, ...validFiles].slice(0, MAX_IMAGES)
      );
    }
  }

  function removeFile(indexToRemove: number) {
    setFiles((current) =>
      current.filter((_, index) => index !== indexToRemove)
    );
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setUploadProgress("");

    if (files.length === 0) {
      setError("Lütfen en az bir fotoğraf seç.");
      return;
    }

    if (description.trim().length < 10) {
      setError("Gözlem notu en az 10 karakter olmalıdır.");
      return;
    }

    if (!city.trim() || !locality.trim()) {
      setError("Şehir ve lokalite alanlarını doldurmalısın.");
      return;
    }

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      setError("Geçerli bir enlem ve boylam gir.");
      return;
    }

    try {
      // 1. Fotoğrafları doğrudan Cloudinary'ye yükle.
      setUploadProgress("Fotoğraflar buluta yükleniyor…");

      const images = await Promise.all(
        files.map(async (file) => {
          const cloudinaryUrl = await uploadToCloudinary(file);

          return {
            name: file.name,
            contentType: file.type,
            contentBase64: cloudinaryUrl,
          };
        })
      );

      // 2. Veritabanına fotoğraf dosyalarını değil, Cloudinary adreslerini gönder.
      setUploadProgress("Gözlem kaydı oluşturuluyor…");

      const result = await create.mutateAsync({
        description: description.trim(),
        unknown,
        ...tax,
        city: city.trim(),
        locality: locality.trim(),
        lat,
        lng,
        images,
        collaboratorIds,
      });

      // 3. Oluşturulan gönderiye git.
      navigate(`/gonderi/${result.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploadProgress("");
    }
  }

  function gps() {
    if (!navigator.geolocation) {
      setError("Tarayıcın konum özelliğini desteklemiyor.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
        fetchAddress(position.coords.latitude, position.coords.longitude); // GPS ile de adresi çek
        setError("");
      },
      () => {
        setError(
          "Konum izni alınamadı. Haritadan nokta seçebilirsin."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      }
    );
  }

  // YENİ: Enlem ve boylamdan adresi otomatik bulan fonksiyon
  async function fetchAddress(latitude: number, longitude: number) {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
      );
      const data = await response.json();

      if (data && data.address) {
        // Gelen veriye göre Şehir ve İlçe/Köy bilgilerini ayıkla
        const foundCity = data.address.city || data.address.province || data.address.state || "";
        const foundLocality = data.address.town || data.address.village || data.address.suburb || data.address.county || "";

        if (foundCity) setCity(foundCity);
        if (foundLocality) setLocality(foundLocality);
      }
    } catch (error) {
      console.error("Konum bilgisi otomatik alınamadı:", error);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeading
        eyebrow="Yeni saha kaydı"
        title="Gözlem paylaş"
        description="Fotoğrafları, konumu ve biyolojik notları ekleyin. Kayıt tarihi ve mevsimi sistem tarafından otomatik eklenir."
      />

      <form onSubmit={submit} className="space-y-9">
        {/* Tür bilgisi */}
        <section>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#a96d15]/30 bg-[#f2e5c9]/60 p-4">
            <input
              type="checkbox"
              checked={unknown}
              onChange={(event) => setUnknown(event.target.checked)}
              className="mt-1 h-5 w-5 accent-[#007f24]"
            />

            <span>
              <strong className="text-sm">
                Türü bilinmiyor etiketiyle paylaş
              </strong>

              <span className="mt-1 block text-sm leading-6 text-[#5f593f]">
                Gönderi bilinmeyenler bölümüne eklenir; kullanıcılar
                Alem → Tür önerisi gönderebilir.
              </span>
            </span>
          </label>
        </section>

        {/* Taksonomi */}
        {!unknown && (
          <section>
            <h2 className="mb-4 font-serif text-2xl">
              01 / Sistematik bilgiler
            </h2>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {taxLabels.map(([key, label]) => (
                <Field key={key} label={`${label} *`}>
                  {key === "kingdom" ? (
                    <select
                      className={inputClass}
                      value={tax[key]}
                      onChange={(event) =>
                        setTax({
                          ...tax,
                          [key]: event.target.value,
                        })
                      }
                    >
                      {[
                        "Animalia",
                        "Plantae",
                        "Fungi",
                        "Protista",
                        "Bacteria",
                        "Archaea",
                      ].map((kingdom) => (
                        <option key={kingdom} value={kingdom}>
                          {kingdom}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={inputClass}
                      value={tax[key]}
                      onChange={(event) =>
                        setTax({
                          ...tax,
                          [key]: event.target.value,
                        })
                      }
                      required
                    />
                  )}
                </Field>
              ))}
            </div>
          </section>
        )}

        {/* Fotoğraflar */}
        <section>
          <h2 className="mb-4 font-serif text-2xl">
            {unknown ? "01" : "02"} / Fotoğraflar
          </h2>

          <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#007f24]/45 bg-[#85c093]/10 p-6 text-center transition hover:bg-[#85c093]/20">
            <ImagePlus className="mb-2 text-[#007f24]" />

            <strong className="text-sm">Fotoğraf seç</strong>

            <span className="mt-1 text-xs text-[#5f7169]">
              En fazla 8 fotoğraf · her biri en fazla 12 MB
            </span>

            <span className="mt-1 text-xs text-[#5f7169]">
              Fotoğraflar doğrudan bulut depolamasına yüklenir.
            </span>

            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="sr-only"
              onChange={handleFileChange}
              disabled={create.isPending}
            />
          </label>

          {previews.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {previews.map((preview, index) => (
                <div
                  key={`${preview.name}-${index}`}
                  className="relative aspect-square overflow-hidden rounded-lg"
                >
                  <img
                    src={preview.url}
                    alt={preview.name}
                    className="h-full w-full object-cover"
                  />

                  <button
                    type="button"
                    onClick={() => removeFile(index)}
                    disabled={create.isPending}
                    className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-full bg-[#f7f7f7] disabled:opacity-50"
                    aria-label="Fotoğrafı kaldır"
                  >
                    <X size={15} />
                  </button>

                  <span className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-2 py-1 text-xs text-white">
                    {preview.name}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="mt-2 text-xs text-[#5f7169]">
            Seçim sırasında görünen önizlemeler geçicidir. Kalıcı
            fotoğraflar Cloudinary üzerinde tutulur.
          </p>
        </section>

        {/* Konum */}
        <section>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="font-serif text-2xl">
              {unknown ? "02" : "03"} / Konum
            </h2>

            <button
              type="button"
              onClick={gps}
              className="flex min-h-11 items-center gap-2 text-xs font-semibold text-[#007f24]"
            >
              <Crosshair size={16} />
              Mevcut konumum
            </button>
          </div>

          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <Field label="Şehir *">
              <input
                className={inputClass}
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Örn. Giresun"
                required
              />
            </Field>

            <Field label="Lokalite / habitat *">
              <input
                className={inputClass}
                value={locality}
                onChange={(event) => setLocality(event.target.value)}
                placeholder="Örn. Bulancak Yaylası"
                required
              />
            </Field>
          </div>

          {/* YENİ: LocationPicker'da onChange tetiklendiğinde fetchAddress fonksiyonu da çalışacak */}
          <LocationPicker
            lat={lat}
            lng={lng}
            onChange={(latitude, longitude) => {
              setLat(latitude);
              setLng(longitude);
              fetchAddress(latitude, longitude); 
            }}
          />

          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Enlem">
              <input
                className={inputClass}
                type="number"
                step="any"
                value={lat}
                onChange={(event) => setLat(Number(event.target.value))}
                required
              />
            </Field>

            <Field label="Boylam">
              <input
                className={inputClass}
                type="number"
                step="any"
                value={lng}
                onChange={(event) => setLng(Number(event.target.value))}
                required
              />
            </Field>
          </div>
        </section>

        {/* Ortak çalışma */}
        <section>
          <h2 className="mb-4 font-serif text-2xl">
            {unknown ? "03" : "04"} / Ortak çalışma
          </h2>

          <p className="mb-3 text-sm text-[#5f7169]">
            Gözleme katkı veren kullanıcıları seçin. Bu kişiler
            gönderide ortak yazar olarak görünür.
          </p>

          {/* YENİ: Arama Çubuğu Inputu */}
          <input
            type="text"
            className={`${inputClass} mb-3 w-full`}
            placeholder="İsim, soyisim, kullanıcı adı veya mail ile ara..."
            value={collaboratorSearch}
            onChange={(e) => setCollaboratorSearch(e.target.value)}
          />

          <div className="grid max-h-52 gap-2 overflow-y-auto rounded-xl border border-[#09352e]/15 p-3 sm:grid-cols-2">
            {users.data
              ?.filter((person) => {
                if (person.id === user?.id) return false;
                
                // YENİ: Arama filtresi
                const term = collaboratorSearch.toLowerCase();
                const fullName = `${person.firstName} ${person.lastName}`.toLowerCase();
                const username = person.username.toLowerCase();
                const email = (person as any).email?.toLowerCase() || "";
                
                return fullName.includes(term) || username.includes(term) || email.includes(term);
              })
              .map((person) => (
                <label
                  key={person.id}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-[#85c093]/15"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[#007f24]"
                    checked={collaboratorIds.includes(person.id)}
                    onChange={(event) =>
                      setCollaboratorIds((current) =>
                        event.target.checked
                          ? [...current, person.id]
                          : current.filter((id) => id !== person.id)
                      )
                    }
                  />

                  <span>
                    {person.firstName} {person.lastName}
                  </span>

                  <span className="font-mono text-[10px] text-[#71807e]">
                    @{person.username}
                  </span>
                </label>
              ))}
          </div>
        </section>

        {/* Gözlem notları */}
        <section>
          <h2 className="mb-4 font-serif text-2xl">
            {unknown ? "04" : "05"} / Gözlem notları
          </h2>

          <Field label="Tür ve gözlem hakkında bilgilendirme *">
            <textarea
              className={`${inputClass} min-h-36 resize-y`}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              minLength={10}
              maxLength={5000}
              placeholder="Morfolojik özellikler, habitat, büyütme oranı ve ekolojik notlar…"
              required
            />
          </Field>
        </section>

        {/* Hata ve yükleme durumu */}
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-[#a63f36]/30 bg-[#a63f36]/5 p-4 text-sm text-[#8d302a]"
          >
            {error}
          </p>
        )}

        {uploadProgress && (
          <p
            role="status"
            aria-live="polite"
            className="rounded-lg border border-[#007f24]/20 bg-[#85c093]/10 p-4 text-sm text-[#007f24]"
          >
            {uploadProgress}
          </p>
        )}

        {/* Form işlemleri */}
        <div className="flex justify-end gap-3 border-t border-[#09352e]/15 pt-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className={secondaryButton}
            disabled={create.isPending}
          >
            Vazgeç
          </button>

          <button
            type="submit"
            className={buttonClass}
            disabled={create.isPending}
          >
            {create.isPending
              ? "Fotoğraflar ve kayıt yükleniyor…"
              : "Gözlemi yayınla"}
          </button>
        </div>
      </form>
    </div>
  );
}
