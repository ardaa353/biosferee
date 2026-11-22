import { getLocale } from "@/lib/i18n";
import { t as trText } from "@/lib/i18n";
import type { BioPost } from "@/lib/types";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Crosshair, ImagePlus, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { emptyTaxonomy, type Taxonomy } from "@contracts/taxonomy";
import { errorMessage } from "@/lib/utils";
import { uploadPreparedPhoto, type UploadedPhoto } from "@/lib/cloudinary";
import {
  prepareMedia,
  mediaAccept,
  isVideoFile,
  uploadVideo,
} from "@/lib/media";
import { photoUrl } from "@/lib/photoUrls";
import { SpeciesAssistant } from "@/components/SpeciesAssistant";
import { TaxonomyFields } from "@/components/TaxonomyFields";
import { PhotoThumb } from "@/components/PhotoThumb";
import {
  Field,
  PageHeading,
  buttonClass,
  inputClass,
  secondaryButton,
} from "@/components/BioUI";
import { LocationPicker } from "@/components/BioMap";
export default function CreatePostPage() {
  return <ObservationForm />;
}
export function ObservationForm({ initial }: { initial?: BioPost }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [unknown, setUnknown] = useState(
    initial ? initial.status === "unknown" : params.get("bilinmiyor") === "1",
  );
  const [tax, setTax] = useState<Taxonomy>(() =>
    initial
      ? {
          kingdom: initial.kingdom || "",
          phylum: initial.phylum || "",
          className: initial.className || "",
          orderName: initial.orderName || "",
          family: initial.family || "",
          genus: initial.genus || "",
          species: initial.species || "",
          commonName: initial.commonName || "",
        }
      : { ...emptyTaxonomy },
  );
  const taxonomyOrigin = useRef<"empty" | "model" | "manual">(
    initial ? "manual" : "empty",
  );
  const applyAutomatic = useCallback((value: Taxonomy) => {
    if (taxonomyOrigin.current !== "manual") {
      taxonomyOrigin.current = "model";
      setTax(value);
    }
  }, []);
  function selectTaxonomy(value: Taxonomy) {
    taxonomyOrigin.current = "manual";
    setTax(value);
  }
  const fillCommonName = useCallback((species: string, commonName: string) => {
    setTax((current) =>
      current.species === species && !current.commonName
        ? { ...current, commonName }
        : current,
    );
  }, []);
  function resetAutomatic() {
    if (taxonomyOrigin.current === "model") {
      taxonomyOrigin.current = "empty";
      setTax(emptyTaxonomy);
    }
  }
  const [description, setDescription] = useState(initial?.description || "");
  const [city, setCity] = useState(initial?.city || "");
  const [locality, setLocality] = useState(initial?.locality || "");
  const [lat, setLat] = useState(initial?.lat ?? 39.0);
  const [lng, setLng] = useState(initial?.lng ?? 35.0);
  const [hasLocation, setHasLocation] = useState(Boolean(initial));
  const [preparing, setPreparing] = useState("");
  const [fileIssues, setFileIssues] = useState<string[]>([]);
  const preparingRef = useRef(false);
  const submitting = useRef(false);
  const addressRequest = useRef<AbortController | null>(null);
  useEffect(() => () => addressRequest.current?.abort(), []);
  const [files, setFiles] = useState<File[]>([]);
  const [keptImages, setKeptImages] = useState(initial?.images ?? []);
  const [collaboratorIds, setCollaboratorIds] = useState<number[]>(
    initial?.collaborators.map((person) => person.id) ?? [],
  );
  const [collaboratorSearch, setCollaboratorSearch] = useState(""); // YENİ: Arama çubuğu için state
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState("");
  const users = trpc.biosfere.users.list.useQuery();
  const videoSignature = trpc.biosfere.videoUpload.useMutation();
  const completedVideos = useRef(new WeakMap<File, UploadedPhoto>());
  const create = trpc.biosfere.posts.create.useMutation();
  const update = trpc.biosfere.posts.update.useMutation();
  const utils = trpc.useUtils();
  const busy =
    Boolean(uploadProgress || preparing) ||
    create.isPending ||
    update.isPending;
  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!selected.length || preparingRef.current || submitting.current) return;
    preparingRef.current = true;
    setError("");
    setFileIssues([]);
    const ready: File[] = [],
      issues: string[] = [];
    try {
      for (const [index, file] of selected.entries()) {
        setPreparing(
          trText("Medya hazırlanıyor… ") + (index + 1) + "/" + selected.length,
        );
        try {
          ready.push(await prepareMedia(file));
        } catch (cause) {
          issues.push(file.name + " — " + errorMessage(cause));
        }
      }
      if (ready.length) {
        resetAutomatic();
        setFiles((current) => [...current, ...ready]);
      }
      setFileIssues(issues);
    } finally {
      preparingRef.current = false;
      setPreparing("");
    }
  }
  function removeFile(index: number) {
    resetAutomatic();
    setFiles((current) => current.filter((_, i) => i !== index));
    setError("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preparingRef.current || submitting.current) return;
    setError("");
    if (files.length + keptImages.length === 0) {
      setError(trText("Lütfen en az bir fotoğraf veya video seç."));
      return;
    }
    if (description.trim().length < 10) {
      setError(trText("Gözlem notu en az 10 karakter olmalıdır."));
      return;
    }
    if (!city.trim() || !locality.trim()) {
      setError(trText("Şehir ve lokalite alanlarını doldurmalısın."));
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
      setError(trText("Geçerli bir enlem ve boylam gir."));
      return;
    }
    submitting.current = true;
    try {
      const images: UploadedPhoto[] = [];
      for (const [index, file] of files.entries()) {
        setUploadProgress(
          trText("Fotoğraflar yükleniyor… ") + (index + 1) + "/" + files.length,
        );
        if (isVideoFile(file)) {
          let uploaded = completedVideos.current.get(file);
          if (!uploaded) {
            uploaded = await uploadVideo(
              file,
              await videoSignature.mutateAsync(),
              setUploadProgress,
            );
            completedVideos.current.set(file, uploaded);
          }
          images.push(uploaded);
        } else images.push(await uploadPreparedPhoto(file));
      }
      setUploadProgress(trText("Gözlem kaydediliyor…"));
      const payload = {
        description: description.trim(),
        unknown,
        ...tax,
        city: city.trim(),
        locality: locality.trim(),
        lat,
        lng,
        images,
        collaboratorIds,
      };
      const result = initial
        ? await update.mutateAsync({
            ...payload,
            id: initial.id,
            keptImageIds: keptImages.map((image) => image.id),
          })
        : await create.mutateAsync(payload);
      await Promise.all([
        utils.biosfere.posts.invalidate(),
        utils.biosfere.posts.get.invalidate({ id: result.id }),
        utils.biosfere.users.list.invalidate(),
      ]);
      // 3. Oluşturulan gönderiye git.
      navigate(`/gonderi/${result.id}`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      submitting.current = false;
      setUploadProgress("");
    }
  }
  function gps() {
    if (!navigator.geolocation) {
      setError(trText("Tarayıcın konum özelliğini desteklemiyor."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setHasLocation(true);
        setLat(position.coords.latitude);
        setLng(position.coords.longitude);
        fetchAddress(position.coords.latitude, position.coords.longitude); // GPS ile de adresi çek
        setError("");
      },
      () => {
        setError(trText("Konum izni alınamadı. Haritadan nokta seçebilirsin."));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  }
  // YENİ: Enlem ve boylamdan adresi otomatik bulan fonksiyon
  async function fetchAddress(latitude: number, longitude: number) {
    addressRequest.current?.abort();
    const controller = new AbortController();
    addressRequest.current = controller;
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=${getLocale()}`,
        { signal: controller.signal },
      );
      const data = await response.json();
      if (!controller.signal.aborted && data?.address) {
        // Gelen veriye göre Şehir ve İlçe/Köy bilgilerini ayıkla
        const foundCity =
          data.address.city ||
          data.address.province ||
          data.address.state ||
          "";
        const foundLocality =
          data.address.town ||
          data.address.village ||
          data.address.suburb ||
          data.address.county ||
          "";
        if (foundCity) setCity(foundCity);
        if (foundLocality) setLocality(foundLocality);
      }
    } catch {
      /* Yer adları elle girilebilir. */
    }
  }
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeading
        eyebrow={
          initial ? trText("Gözlem düzenleme") : trText("Yeni saha kaydı")
        }
        title={initial ? trText("Gönderiyi düzenle") : trText("Gözlem paylaş")}
        description={
          initial
            ? trText(
                "Fotoğrafları, gözlem notunu ve sistematik bilgileri güncelleyin.",
              )
            : trText(
                "Fotoğrafları, konumu ve biyolojik notları ekleyin. Kayıt tarihi ve mevsimi sistem tarafından otomatik eklenir.",
              )
        }
      />

      <form onSubmit={submit}>
        <fieldset
          className="min-w-0 space-y-9"
          disabled={
            Boolean(uploadProgress) || create.isPending || update.isPending
          }
        >
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
                  {trText("Türü bilinmiyor etiketiyle paylaş")}
                </strong>

                <span className="mt-1 block text-sm leading-6 text-[#5f593f]">
                  {trText(
                    "Gönderi bilinmeyenler bölümüne eklenir; kullanıcılar Alem → Tür önerisi gönderebilir.",
                  )}
                </span>
              </span>
            </label>
          </section>

          <section>
            <h2 className="mb-3 font-serif text-2xl">
              {trText("Fotoğraf ve videolar")}
            </h2>
            <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[#007f24]/45 bg-[#85c093]/10 p-5 text-center focus-within:ring-2 focus-within:ring-[#007f24]">
              <ImagePlus className="text-[#007f24]" />
              <strong className="text-sm">
                {files.length + keptImages.length
                  ? trText("Başka medya ekle")
                  : trText("Fotoğraf veya video seç")}
              </strong>
              <span className="text-xs text-[#50665d]">
                {trText(
                  "Fotoğraf ve videoları birlikte ekleyebilirsin. Videoların farklı anlarından tür tahmini yapılır.",
                )}
              </span>
              <input
                type="file"
                accept={mediaAccept}
                multiple
                className="sr-only"
                onChange={handleFileChange}
                disabled={busy}
              />
            </label>
            {preparing && (
              <p className="mt-2 text-sm" role="status">
                {preparing}
              </p>
            )}
            {fileIssues.length > 0 && (
              <ul role="alert" className="mt-2 text-sm text-[#8d302a]">
                {fileIssues.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            )}
            {keptImages.length > 0 && (
              <fieldset
                disabled={busy}
                className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5"
              >
                {keptImages.map((image, index) => (
                  <div
                    key={image.id}
                    className="relative aspect-square overflow-hidden rounded-lg bg-[#eaf0e8]"
                  >
                    <img
                      src={photoUrl(image.url, 320)}
                      alt={trText("Mevcut fotoğraf ") + (index + 1)}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setKeptImages((current) =>
                          current.filter((item) => item.id !== image.id),
                        )
                      }
                      className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-full bg-white/90"
                      aria-label={
                        trText("Mevcut fotoğraf ") +
                        (index + 1) +
                        trText(" kaldır")
                      }
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </fieldset>
            )}
            {files.length > 0 && (
              <fieldset
                disabled={busy}
                className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5"
              >
                {files.map((file, i) => (
                  <PhotoThumb
                    key={file.name + "/" + file.lastModified + "/" + i}
                    file={file}
                    remove={() => removeFile(i)}
                  />
                ))}
              </fieldset>
            )}
          </section>

          <section>
            <h2 className="mb-3 font-serif text-2xl">
              {trText("Sistematik bilgiler")}
            </h2>
            <SpeciesAssistant
              files={files}
              location={hasLocation ? { lat, lng } : null}
              onAutomatic={applyAutomatic}
              onChoose={(value) => {
                setUnknown(false);
                selectTaxonomy(value);
              }}
              onCommonName={fillCommonName}
            />
            <p className="mb-3 text-sm text-[#50665d]">
              {trText(
                "Katalogda aramak için bilimsel adın en az iki harfini yaz. Bir takson seçtiğinde üst basamakları doldurulur.",
              )}
            </p>
            {!unknown && (
              <TaxonomyFields
                value={tax}
                select={(hit) => selectTaxonomy(hit.taxonomy)}
                edit={(key, value) => {
                  taxonomyOrigin.current = "manual";
                  setTax((current) => ({ ...current, [key]: value }));
                }}
              />
            )}
          </section>

          {/* Konum */}
          <section>
            <div className="mb-4 flex items-end justify-between">
              <h2 className="font-serif text-2xl">{trText("Konum")}</h2>

              <button
                type="button"
                onClick={gps}
                className="flex min-h-11 items-center gap-2 text-xs font-semibold text-[#007f24]"
              >
                <Crosshair size={16} />
                {trText("Mevcut konumum")}
              </button>
            </div>

            <div className="mb-4 grid gap-4 sm:grid-cols-2">
              <Field label={trText("Şehir *")}>
                <input
                  className={inputClass}
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  placeholder={trText("Örn. Giresun")}
                  required
                />
              </Field>

              <Field label={trText("Lokalite / habitat *")}>
                <input
                  className={inputClass}
                  value={locality}
                  onChange={(event) => setLocality(event.target.value)}
                  placeholder={trText("Örn. Bulancak Yaylası")}
                  required
                />
              </Field>
            </div>

            {/* YENİ: LocationPicker'da onChange tetiklendiğinde fetchAddress fonksiyonu da çalışacak */}
            <LocationPicker
              lat={lat}
              lng={lng}
              onChange={(latitude, longitude) => {
                setHasLocation(true);
                setLat(latitude);
                setLng(longitude);
                fetchAddress(latitude, longitude);
              }}
            />

            <div className="mt-3 grid grid-cols-2 gap-3">
              <Field label={trText("Enlem")}>
                <input
                  className={inputClass}
                  type="number"
                  step="any"
                  value={lat}
                  onChange={(event) => {
                    setHasLocation(true);
                    setLat(Number(event.target.value));
                  }}
                  required
                />
              </Field>

              <Field label={trText("Boylam")}>
                <input
                  className={inputClass}
                  type="number"
                  step="any"
                  value={lng}
                  onChange={(event) => {
                    setHasLocation(true);
                    setLng(Number(event.target.value));
                  }}
                  required
                />
              </Field>
            </div>
          </section>

          {/* Ortak çalışma */}
          <section>
            <h2 className="mb-4 font-serif text-2xl">
              {trText("Ortak çalışma")}
            </h2>

            <p className="mb-3 text-sm text-[#5f7169]">
              {trText(
                "Gözleme katkı veren kullanıcıları seçin. Bu kişiler gönderide ortak yazar olarak görünür.",
              )}
            </p>

            {/* YENİ: Arama Çubuğu Inputu */}
            <input
              type="text"
              className={`${inputClass} mb-3 w-full`}
              placeholder={trText("Ad, soyad veya kullanıcı adıyla ara")}
              value={collaboratorSearch}
              onChange={(e) => setCollaboratorSearch(e.target.value)}
            />

            <div className="grid max-h-52 gap-2 overflow-y-auto rounded-xl border border-[#09352e]/15 p-3 sm:grid-cols-2">
              {users.data
                ?.filter((person) => {
                  if (person.id === user?.id) return false;
                  // YENİ: Arama filtresi
                  const term = collaboratorSearch.toLowerCase();
                  const fullName =
                    `${person.firstName} ${person.lastName}`.toLowerCase();
                  const username = person.username.toLowerCase();
                  return fullName.includes(term) || username.includes(term);
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
                            : current.filter((id) => id !== person.id),
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
              {trText("Gözlem notları")}
            </h2>

            <Field label={trText("Tür ve gözlem hakkında bilgilendirme *")}>
              <textarea
                className={`${inputClass} min-h-36 resize-y`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                minLength={10}
                maxLength={5000}
                placeholder={trText(
                  "Morfolojik özellikler, habitat, büyütme oranı ve ekolojik notlar…",
                )}
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
              disabled={busy}
            >
              {trText("Vazgeç")}
            </button>

            <button type="submit" className={buttonClass} disabled={busy}>
              {uploadProgress || create.isPending || update.isPending
                ? trText("Kaydediliyor…")
                : initial
                  ? trText("Değişiklikleri kaydet")
                  : !unknown && taxonomyOrigin.current === "model"
                    ? trText("Türü onayla ve yayınla")
                    : trText("Gözlemi yayınla")}
            </button>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
