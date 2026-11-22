import { getLocale } from "@/lib/i18n";
import { t as trText } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import {
  Download,
  Images,
  Plus,
  Save,
  Sparkles,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import { trpc } from "@/providers/trpc";
import { buttonClass, Field, inputClass, secondaryButton } from "./BioUI";
import { TaxonomyFields } from "./TaxonomyFields";
import { LocationPicker } from "./BioMap";
import PhotoGallery from "./PhotoGallery";
import {
  encodePhoto,
  photoAccept,
  preparePhoto,
  withPhoto,
} from "@/lib/photos";
import {
  analyzeObservation,
  type IdentificationMode,
} from "@/lib/onlineIdentification";
import {
  applyTaxonomy,
  buildWorkshopArchive,
  loadWorkshopDraft,
  movePhotos,
  newWorkshopGroup,
  saveWorkshopDraft,
  type WorkshopFields,
  type WorkshopGroup,
  type WorkshopPhoto,
} from "@/lib/workshop";
import { runDatasetImport, type ImportSession } from "@/lib/datasetImport";
import type { DatasetArchive } from "@/lib/datasetArchive";
import { errorMessage } from "@/lib/utils";
const groupColor = (index: number) => {
  const hue = (146 + index * 137.508) % 360;
  return {
    backgroundColor: `hsl(${hue} 65% 96%)`,
    borderColor: `hsl(${hue} 55% 56%)`,
  };
};
const localDate = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : "";
};
const coordinate = (value: string, fallback: number, maximum: number) => {
  const parsed = Number(value.replace(",", "."));
  return value.trim() && Number.isFinite(parsed) && Math.abs(parsed) <= maximum
    ? parsed
    : fallback;
};
export default function ObservationWorkshop() {
  const [photos, setPhotos] = useState<WorkshopPhoto[]>([]),
    [groups, setGroups] = useState<WorkshopGroup[]>([]);
  const [selected, setSelected] = useState<string[]>([]),
    [current, setCurrent] = useState("");
  const [mode, setMode] = useState<IdentificationMode>("online"),
    [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState("");
  const [needsRetry, setNeedsRetry] = useState(false),
    [saved, setSaved] = useState(false);
  const [gallery, setGallery] = useState<
    {
      url: string;
    }[]
  >([]);
  const urls = useRef(new Set<string>()),
    abort = useRef<AbortController | null>(null),
    lastClick = useRef<string | null>(null);
  const session = useRef<ImportSession>({ jobId: null, uploads: new Map() }),
    snapshot = useRef<DatasetArchive | null>(null);
  const geocodedAt = useRef(0);
  const users = trpc.biosfere.users.list.useQuery();
  const begin = trpc.dataset.begin.useMutation(),
    prepare = trpc.dataset.prepareEntry.useMutation();
  const commit = trpc.dataset.commitEntry.useMutation(),
    finish = trpc.dataset.finish.useMutation();
  const utils = trpc.useUtils();
  const group = groups.find((item) => item.id === current),
    locked = busy || needsRetry || saved;
  const photoMap = new Map(photos.map((photo) => [photo.id, photo]));
  const assignments = new Map(
    groups.flatMap((group, index) =>
      group.photoIds.map((id) => [id, index] as const),
    ),
  );
  const ungrouped = photos.filter((photo) => !assignments.has(photo.id)).length;
  const activePhotoIds = group?.photoIds;
  useEffect(() => {
    const images = (activePhotoIds || []).flatMap((id) => {
      const photo = photos.find((item) => item.id === id);
      return photo ? [{ url: URL.createObjectURL(photo.file) }] : [];
    });
    setGallery(images);
    return () => {
      for (const image of images) URL.revokeObjectURL(image.url);
    };
  }, [activePhotoIds, photos]);
  useEffect(
    () => () => {
      abort.current?.abort();
      for (const url of urls.current) URL.revokeObjectURL(url);
    },
    [],
  );
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    if (photos.length && !saved) window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [photos.length, saved]);
  async function task(action: (signal: AbortSignal) => Promise<void>) {
    if (busy) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    try {
      await action(controller.signal);
    } catch (error) {
      setError(
        controller.signal.aborted
          ? trText("İşlem durduruldu. Tamamlanan sonuçlar korundu.")
          : errorMessage(error),
      );
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }
  function edit(key: keyof WorkshopFields, value: string) {
    if (locked || !group) return;
    setGroups((items) =>
      items.map((item) =>
        item.id === group.id
          ? { ...item, fields: { ...item.fields, [key]: value } }
          : item,
      ),
    );
  }
  async function preview(file: File) {
    const thumbnail = await withPhoto(file, (image) =>
      encodePhoto(image, image.naturalWidth, image.naturalHeight, 320, 0.8),
    );
    const url = URL.createObjectURL(thumbnail);
    urls.current.add(url);
    return url;
  }
  async function readPhoto(file: File): Promise<WorkshopPhoto> {
    const exifr = await import("exifr");
    const position = await exifr.gps(file).catch(() => undefined);
    const prepared = await preparePhoto(file);
    return {
      id: crypto.randomUUID(),
      file: prepared,
      name: file.name,
      preview: await preview(prepared),
      ...(position &&
      Number.isFinite(position.latitude) &&
      Number.isFinite(position.longitude) &&
      Math.abs(position.latitude) <= 90 &&
      Math.abs(position.longitude) <= 180
        ? { gps: { lat: position.latitude, lng: position.longitude } }
        : {}),
    };
  }
  function addPhotos(files: File[]) {
    if (locked || !files.length) return;
    void task(async (signal) => {
      const added: WorkshopPhoto[] = [],
        failures: string[] = [];
      for (const [index, file] of files.entries()) {
        signal.throwIfAborted();
        setStatus(
          trText("Fotoğraf {0} / {1} hazırlanıyor…", [index + 1, files.length]),
        );
        try {
          const photo = await readPhoto(file);
          added.push(photo);
          setPhotos((previous) => [...previous, photo]);
        } catch (error) {
          failures.push(file.name + ": " + errorMessage(error));
        }
      }
      setStatus(
        added.length +
          trText(
            " fotoğraf eklendi. Aynı gönderiye ait kareleri seçip yeni gönderi oluşturun.",
          ),
      );
      if (failures.length) setError(failures.join("\n"));
    });
  }
  function choosePhoto(id: string, shift: boolean) {
    if (locked) return;
    const from = photos.findIndex((photo) => photo.id === lastClick.current),
      to = photos.findIndex((photo) => photo.id === id);
    if (shift && from >= 0)
      setSelected((previous) => [
        ...new Set([
          ...previous,
          ...photos
            .slice(Math.min(from, to), Math.max(from, to) + 1)
            .map((photo) => photo.id),
        ]),
      ]);
    else
      setSelected((previous) =>
        previous.includes(id)
          ? previous.filter((value) => value !== id)
          : [...previous, id],
      );
    lastClick.current = id;
  }
  function assign(fresh: boolean) {
    if (locked || !selected.length || (!fresh && !group)) return;
    const target = fresh
      ? newWorkshopGroup(selected)
      : { ...group!, fields: { ...group!.fields } };
    const gps = selected.map((id) => photoMap.get(id)?.gps).find(Boolean);
    if (!target.fields.lat && !target.fields.lng && gps)
      target.fields = {
        ...target.fields,
        lat: String(gps.lat),
        lng: String(gps.lng),
      };
    setGroups((items) => movePhotos(items, selected, target));
    setCurrent(target.id);
    setSelected([]);
  }
  function analyze(all: boolean) {
    if (locked) return;
    const targets = all
      ? groups.filter((item) => !item.analysis && item.photoIds.length)
      : group?.photoIds.length
        ? [group]
        : [];
    if (!targets.length) {
      setStatus(
        trText(
          "Analiz edilecek gönderi yok. Yeniden analiz için bir gönderi seçin.",
        ),
      );
      return;
    }
    void task(async (signal) => {
      let completed = 0;
      for (const target of targets) {
        signal.throwIfAborted();
        setCurrent(target.id);
        try {
          const result = await analyzeObservation(
            target.photoIds.map((id) => photoMap.get(id)!.file),
            mode,
            signal,
            (message) =>
              setStatus(
                trText("Gönderi {0} / {1} · {2}", [
                  completed + 1,
                  targets.length,
                  message,
                ]),
              ),
          );
          signal.throwIfAborted();
          const best = result.candidates[0]?.taxonomy;
          if (!best)
            throw new Error(
              trText(
                "Tür önerisi alınamadı. Alanları elle düzenleyebilirsiniz.",
              ),
            );
          setGroups((items) =>
            items.map((item) =>
              item.id !== target.id
                ? item
                : applyTaxonomy(
                    { ...item, analysis: result, error: undefined },
                    best,
                  ),
            ),
          );
          completed++;
        } catch (error) {
          setGroups((items) =>
            items.map((item) =>
              item.id === target.id
                ? { ...item, error: errorMessage(error) }
                : item,
            ),
          );
          throw error;
        }
      }
      setStatus(
        trText(
          "{0} gönderi analiz edildi. Önerileri ve konumları kontrol edip ZIP indirin veya siteye kaydedin.",
          [completed],
        ),
      );
    });
  }
  function openArchive(file?: File) {
    if (locked || !file) return;
    void task(async (signal) => {
      setStatus(trText("Arşiv okunuyor…"));
      const { openDatasetArchive } = await import("@/lib/datasetArchive");
      const archive = await openDatasetArchive(file);
      try {
        const addedPhotos: WorkshopPhoto[] = [],
          addedGroups: WorkshopGroup[] = [];
        for (const [index, record] of archive.dataset.posts.entries()) {
          signal.throwIfAborted();
          setStatus(
            trText("Arşiv gönderisi {0} / {1} hazırlanıyor…", [
              index + 1,
              archive.dataset.posts.length,
            ]),
          );
          const item = newWorkshopGroup([]);
          item.fields = {
            ...item.fields,
            ...record,
            lat: String(record.lat),
            lng: String(record.lng),
            username: record.author?.username || "",
            createdAt: record.createdAt || item.fields.createdAt,
          };
          item.metadata = {
            ...record.metadata,
            importedArchiveId: archive.dataset.archiveId,
            importedRecordId: record.id,
            originalAuthor: record.author || null,
          };
          for (const path of record.images) {
            signal.throwIfAborted();
            const photo = await readPhoto(await archive.readPhoto(path));
            addedPhotos.push(photo);
            item.photoIds.push(photo.id);
          }
          addedGroups.push(item);
        }
        setPhotos((previous) => [...previous, ...addedPhotos]);
        setGroups((previous) => [...previous, ...addedGroups]);
        setCurrent(addedGroups[0]?.id || current);
        setStatus(
          trText("{0} gönderi düzenlenmek üzere projeye eklendi.", [
            addedGroups.length,
          ]),
        );
      } finally {
        await archive.close();
      }
    });
  }
  function download() {
    if (busy) return;
    void task(async (signal) => {
      const archive = buildWorkshopArchive(groups, photos);
      const { downloadPreparedArchive } = await import("@/lib/datasetArchive");
      await downloadPreparedArchive(archive, setStatus, signal);
      setStatus(
        trText("Gönderiler ve eşleşen fotoğraflar ZIP olarak indirildi."),
      );
    });
  }
  function saveToSite() {
    if (busy || saved || !author) return;
    void task(async (signal) => {
      try {
        if (!snapshot.current)
          snapshot.current = buildWorkshopArchive(groups, photos);
        await runDatasetImport(
          snapshot.current,
          author === "system" ? null : Number(author),
          {
            begin: (input) => begin.mutateAsync(input),
            prepare: (input) => prepare.mutateAsync(input),
            commit: (input) => commit.mutateAsync(input),
            finish: (input) => finish.mutateAsync(input),
          },
          session.current,
          signal,
          setStatus,
        );
        setSaved(true);
        setNeedsRetry(false);
        await Promise.all([
          utils.biosfere.posts.invalidate(),
          utils.biosfere.users.list.invalidate(),
        ]);
        setStatus(
          trText("{0} gönderi {1} adına siteye eklendi.", [
            groups.length,
            author === "system"
              ? "BioSfere"
              : "@" +
                users.data?.find((user) => String(user.id) === author)
                  ?.username,
          ]),
        );
      } catch (error) {
        setNeedsRetry(Boolean(session.current.jobId));
        if (!session.current.jobId) snapshot.current = null;
        throw error;
      }
    });
  }
  async function stopImport() {
    if (busy) {
      abort.current?.abort();
      return;
    }
    if (session.current.jobId) {
      await task(async () => {
        await finish.mutateAsync({ id: session.current.jobId!, cancel: true });
        session.current = { jobId: null, uploads: new Map() };
        snapshot.current = null;
        setNeedsRetry(false);
        setStatus(
          trText(
            "Aktarım kapatıldı. Siteye kaydedilmiş gönderiler korunur. Yeni kayıtta tekrar eklememek için tamamlanan grupları projeden kaldırın.",
          ),
        );
      });
    }
  }
  function clearProject() {
    if (
      busy ||
      needsRetry ||
      (photos.length &&
        !saved &&
        !window.confirm(
          trText(
            "Bu tarayıcıdaki çalışma temizlenecek. Kaydetmediğiniz düzenlemeleri kaybedebilirsiniz. Devam edilsin mi?",
          ),
        ))
    )
      return;
    for (const url of urls.current) URL.revokeObjectURL(url);
    urls.current.clear();
    setPhotos([]);
    setGroups([]);
    setSelected([]);
    setCurrent("");
    setSaved(false);
    setStatus("");
    setError("");
    snapshot.current = null;
  }
  function saveDraft() {
    void task(async () => {
      await saveWorkshopDraft(groups, photos);
      setStatus(
        trText(
          "Taslak bu tarayıcıya kaydedildi. Aynı tarayıcıdan tekrar açabilirsiniz.",
        ),
      );
    });
  }
  function restoreDraft() {
    if (
      locked ||
      (photos.length &&
        !window.confirm(
          trText(
            "Kaydedilmiş taslak açılsın mı? Ekrandaki kaydedilmemiş çalışma değişecek.",
          ),
        ))
    )
      return;
    void task(async (signal) => {
      const draft = await loadWorkshopDraft();
      if (!draft)
        throw new Error(trText("Bu tarayıcıda kaydedilmiş taslak bulunamadı."));
      const restored: WorkshopPhoto[] = [];
      for (const photo of draft.photos) {
        signal.throwIfAborted();
        const file = new File([photo.file], photo.file.name || photo.name, {
          type: photo.file.type,
        });
        restored.push({ ...photo, file, preview: await preview(file) });
      }
      for (const url of urls.current)
        if (!restored.some((photo) => photo.preview === url)) {
          URL.revokeObjectURL(url);
          urls.current.delete(url);
        }
      setPhotos(restored);
      setGroups(draft.groups);
      setCurrent(draft.groups[0]?.id || "");
      setSelected([]);
      snapshot.current = null;
      setStatus(
        trText("Kaydedilmiş fotoğraflar, gruplar ve düzenlemeler açıldı."),
      );
    });
  }
  function findAddress() {
    if (!group || locked) return;
    const latitude = Number(group.fields.lat),
      longitude = Number(group.fields.lng);
    if (
      !group.fields.lat ||
      !group.fields.lng ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      setError(trText("Önce gerçek gözlem konumunu seçin."));
      return;
    }
    if (Date.now() - geocodedAt.current < 1200) return;
    geocodedAt.current = Date.now();
    void task(async (signal) => {
      const response = await fetch(
        "https://nominatim.openstreetmap.org/reverse?" +
          new URLSearchParams({
            format: "jsonv2",
            lat: String(latitude),
            lon: String(longitude),
            "accept-language": getLocale(),
          }),
        { signal },
      );
      if (!response.ok)
        throw new Error(
          trText(
            "Adres hizmeti kullanılamıyor. Yer adını elle yazabilirsiniz.",
          ),
        );
      const data = await response.json();
      const address = data.address || {};
      setGroups((items) =>
        items.map((item) =>
          item.id !== group.id
            ? item
            : {
                ...item,
                fields: {
                  ...item.fields,
                  city:
                    address.province ||
                    address.state ||
                    address.city ||
                    item.fields.city,
                  locality:
                    address.village ||
                    address.town ||
                    address.suburb ||
                    address.county ||
                    item.fields.locality,
                },
              },
        ),
      );
      setStatus(
        trText("Koordinattaki yer adı dolduruldu; gözlem yerini kontrol edin."),
      );
    });
  }
  return (
    <section className="space-y-6">
      <div className="rounded-2xl border border-[#09352e]/15 bg-white p-5 sm:p-6">
        <p className="text-sm font-semibold text-[#007f24]">
          {trText("FOTOĞRAFTAN YAYINA")}
        </p>
        <h2 className="mt-1 font-serif text-3xl">
          {trText("Gözlem veri atölyesi")}
        </h2>
        <p className="mt-3 max-w-3xl text-base leading-7 text-[#50665d]">
          {trText(
            "Fotoğrafları gönderilere ayırın, birlikte analiz edin, bilgileri ve konumu düzenleyin. Sonucu ZIP indirin veya doğrudan BioSfere'ye ekleyin. Python kurulumu gerekmez.",
          )}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <label
            className={
              buttonClass + (locked ? " pointer-events-none opacity-50" : "")
            }
          >
            <Images size={17} />
            {trText("Fotoğraf ekle")}
            <input
              className="sr-only"
              type="file"
              multiple
              accept={photoAccept}
              disabled={locked}
              onChange={(event) => {
                addPhotos(Array.from(event.target.files || []));
                event.target.value = "";
              }}
            />
          </label>
          <label
            className={
              secondaryButton +
              (locked ? " pointer-events-none opacity-50" : "")
            }
          >
            <Upload size={17} />
            {trText("ZIP / RAR aç")}
            <input
              className="sr-only"
              type="file"
              accept=".zip,.rar"
              disabled={locked}
              onChange={(event) => {
                openArchive(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          <button
            className={secondaryButton}
            disabled={busy || !photos.length}
            onClick={saveDraft}
          >
            {trText("Taslağı sakla")}
          </button>
          <button
            className={secondaryButton}
            disabled={locked}
            onClick={restoreDraft}
          >
            {trText("Taslağı aç")}
          </button>
          <button
            className={secondaryButton}
            disabled={busy || needsRetry}
            onClick={clearProject}
          >
            {trText("Yeni proje")}
          </button>
        </div>
        <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <Field label={trText("Analiz yöntemi")}>
            <select
              className={inputClass}
              value={mode}
              disabled={locked}
              onChange={(event) =>
                setMode(event.target.value as IdentificationMode)
              }
            >
              <option value="online">
                {trText("Çevrim içi BioCLIP 2 · model indirmez")}
              </option>
              <option value="database">
                {trText(
                  "200M+ görsel veritabanında benzerlik ara · model indirmez",
                )}
              </option>
              <option value="browser">
                {trText("Tarayıcıda analiz · küçük model dosyaları kullanır")}
              </option>
            </select>
          </Field>
          <button
            className={buttonClass + " lg:mt-6"}
            disabled={locked || !groups.length}
            onClick={() => analyze(true)}
          >
            <Sparkles size={17} />
            {trText("Bekleyen gönderileri analiz et")}
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-[#50665d]">
          {mode === "browser"
            ? trText(
                "Fotoğraflar cihazınızda incelenir. İlk analizde gerekli küçük modeller otomatik alınır. Bu yöntemin tür kapsamı çevrim içi BioCLIP'ten daha dardır.",
              )
            : trText(
                "Analiz için fotoğrafların konum bilgisi içermeyen kopyaları Imageomics'in Hugging Face üzerindeki açık servisine gönderilir. Büyük model indirilmez; API anahtarı gerekmez. Ortak serviste sıra, kesinti veya sağlayıcı sınırı olabilir.",
              )}
          {trText(
            " Sonuçlar düzenlenebilir öneridir; puanlar kesinlik yüzdesi değildir.",
          )}
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold text-[#007f24]">
          <a
            href="https://huggingface.co/spaces/imageomics/bioclip-2-demo"
            target="_blank"
            rel="noreferrer"
          >
            {trText("BioCLIP kaynağı")}
          </a>
          <a
            href="https://huggingface.co/spaces/imageomics/bioclip-image-search-lite"
            target="_blank"
            rel="noreferrer"
          >
            {trText("Görsel veritabanı kaynağı")}
          </a>
        </div>
      </div>
      {status && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-xl bg-[#e8f2e5] p-4 text-sm leading-6"
        >
          {trText(status)}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="whitespace-pre-wrap rounded-xl bg-red-50 p-4 text-sm leading-6 text-[#8d302a]"
        >
          {error}
        </p>
      )}
      {busy && (
        <button
          className={secondaryButton}
          onClick={() => abort.current?.abort()}
        >
          <Square size={16} />
          {trText("İşlemi durdur")}
        </button>
      )}
      {saved && (
        <p className="rounded-xl border border-[#007f24]/25 p-4 text-sm">
          {trText(
            "Bu projenin gönderileri siteye kaydedildi. Yeni gözlemler eklemek için Yeni proje düğmesini kullanın. Mevcut gönderileri sitedeki düzenleme sayfasından değiştirebilirsiniz.",
          )}
        </p>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-[#09352e]/15 bg-white p-4 sm:p-5">
          <h3 className="font-serif text-2xl">{trText("Fotoğraf havuzu")}</h3>
          <p className="mt-2 text-sm leading-6 text-[#50665d]">
            {photos.length}
            {trText(" fotoğraf · ")}
            {ungrouped}
            {trText(" gruplandırılmamış · ")}
            {selected.length}
            {trText(
              " seçili. Tıklayarak seçin; bilgisayarda Shift ile aralık seçebilirsiniz. Aynı renkteki kareler aynı gönderiye aittir.",
            )}
          </p>
          <div className="my-4 flex flex-wrap gap-2">
            <button
              className={buttonClass}
              disabled={locked || !selected.length}
              onClick={() => assign(true)}
            >
              <Plus size={16} />
              {trText("Seçileni yeni gönderi yap")}
            </button>
            <button
              className={secondaryButton}
              disabled={locked || !selected.length || !group}
              onClick={() => assign(false)}
            >
              {trText("Açık gönderiye ekle")}
            </button>
            <button
              className={secondaryButton}
              disabled={locked || !photos.length}
              onClick={() =>
                setSelected(
                  selected.length === photos.length
                    ? []
                    : photos.map((photo) => photo.id),
                )
              }
            >
              {selected.length === photos.length
                ? trText("Seçimi temizle")
                : trText("Tümünü seç")}
            </button>
          </div>
          {!photos.length && (
            <p className="py-16 text-center text-base text-[#50665d]">
              {trText(
                "Örneğin 1, 2, 3'ü ilk gönderiye; 4, 5'i ikinci gönderiye ayırabilirsiniz.",
              )}
            </p>
          )}
          <div className="grid max-h-[70vh] grid-cols-2 gap-3 overflow-y-auto p-1 sm:grid-cols-3">
            {photos.map((photo, index) => {
              const assignment = assignments.get(photo.id),
                chosen = selected.includes(photo.id);
              return (
                <button
                  key={photo.id}
                  type="button"
                  aria-pressed={chosen}
                  disabled={locked}
                  onClick={(event) => choosePhoto(photo.id, event.shiftKey)}
                  style={
                    assignment === undefined
                      ? undefined
                      : groupColor(assignment)
                  }
                  className={`overflow-hidden rounded-xl border-2 p-2 text-left ${assignment === undefined ? "border-slate-200 bg-slate-50" : ""} ${chosen ? "ring-4 ring-[#007f24] ring-offset-2" : ""}`}
                >
                  <img
                    src={photo.preview}
                    alt={photo.name}
                    width={320}
                    height={220}
                    loading="lazy"
                    className="aspect-[4/3] w-full rounded-lg object-contain"
                  />
                  <span
                    className="mt-2 block truncate text-sm"
                    title={photo.name}
                  >
                    {index + 1}. {photo.name}
                  </span>
                  <span className="mt-1 block text-sm font-semibold">
                    {assignment === undefined
                      ? trText("Gruplanmamış")
                      : trText("Gönderi {0}", [assignment + 1])}
                    {photo.gps ? " · GPS" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-5">
          <div className="rounded-2xl border border-[#09352e]/15 bg-white p-4 sm:p-5">
            <h3 className="font-serif text-2xl">
              {trText("Gönderiler · ")}
              {groups.length}
            </h3>
            <div className="mt-3 flex max-h-64 flex-col gap-2 overflow-y-auto">
              {groups.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCurrent(item.id)}
                  style={groupColor(index)}
                  className={`rounded-xl border-2 p-3 text-left ${item.id === current ? "ring-2 ring-[#09352e] ring-offset-1" : ""}`}
                >
                  <span className="block text-sm font-semibold">
                    {trText("Gönderi ")}
                    {index + 1} ·{" "}
                    {item.fields.species || trText("Tür adı bekliyor")}
                  </span>
                  <span className="mt-1 block text-sm">
                    {item.photoIds.length}
                    {trText(" fotoğraf · ")}
                    {item.error
                      ? trText("Analiz tamamlanamadı")
                      : item.analysis
                        ? trText("Öneri hazır")
                        : trText("Düzenlenebilir")}
                  </span>
                </button>
              ))}
              {!groups.length && (
                <p className="py-6 text-sm text-[#50665d]">
                  {trText("Fotoğrafları seçip ilk gönderiyi oluşturun.")}
                </p>
              )}
            </div>
          </div>
          {group && (
            <div className="space-y-5 rounded-2xl border border-[#09352e]/15 bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-serif text-2xl">
                  {trText("Gönderiyi düzenle")}
                </h3>
                <button
                  className={secondaryButton}
                  disabled={locked}
                  onClick={() => {
                    setGroups((items) =>
                      items.filter((item) => item.id !== group.id),
                    );
                    setCurrent(
                      groups.find((item) => item.id !== group.id)?.id || "",
                    );
                  }}
                >
                  <Trash2 size={16} />
                  {trText("Grubu kaldır")}
                </button>
              </div>
              <PhotoGallery
                key={group.id}
                images={gallery}
                alt={group.fields.species || trText("Gönderi fotoğrafları")}
              />
              <div className="grid grid-cols-3 gap-2">
                {group.photoIds.map((id) => {
                  const photo = photoMap.get(id);
                  return (
                    photo && (
                      <div key={id} className="rounded-lg border p-2">
                        <img
                          src={photo.preview}
                          alt={photo.name}
                          className="aspect-square w-full object-contain"
                          loading="lazy"
                        />
                        <button
                          type="button"
                          disabled={locked}
                          className="mt-2 w-full text-sm font-semibold text-[#8d302a]"
                          onClick={() =>
                            setGroups((items) =>
                              items.map((item) =>
                                item.id === group.id
                                  ? {
                                      ...item,
                                      photoIds: item.photoIds.filter(
                                        (value) => value !== id,
                                      ),
                                      analysis: undefined,
                                    }
                                  : item,
                              ),
                            )
                          }
                        >
                          {trText("Gruptan çıkar")}
                        </button>
                      </div>
                    )
                  );
                })}
              </div>
              <button
                className={secondaryButton}
                disabled={locked || !group.photoIds.length}
                onClick={() => analyze(false)}
              >
                <Sparkles size={16} />
                {trText("Bu gönderiyi analiz et")}
              </button>
              {group.error && (
                <p className="text-sm text-[#8d302a]">{group.error}</p>
              )}
              {group.analysis && (
                <div className="space-y-2 rounded-xl bg-[#f1f6f0] p-3">
                  <p className="text-sm">
                    {group.analysis.source} · {group.analysis.photoCount}
                    {trText(" fotoğraf birlikte değerlendirildi")}
                  </p>
                  {group.analysis.candidates.map((candidate) => (
                    <button
                      key={candidate.taxonomy.species}
                      type="button"
                      disabled={locked}
                      onClick={() =>
                        setGroups((items) =>
                          items.map((item) =>
                            item.id === group.id
                              ? applyTaxonomy(item, candidate.taxonomy)
                              : item,
                          ),
                        )
                      }
                      className="block w-full rounded-lg border bg-white p-3 text-left text-sm"
                    >
                      <i>{candidate.taxonomy.species}</i>
                      <span className="ml-2 text-[#50665d]">
                        {trText("puan ")}
                        {candidate.score.toFixed(4)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <fieldset disabled={locked} className="space-y-5">
                <TaxonomyFields
                  value={group.fields}
                  edit={(key, value) => edit(key, value)}
                  select={(hit) =>
                    setGroups((items) =>
                      items.map((item) =>
                        item.id === group.id
                          ? applyTaxonomy(item, hit.taxonomy)
                          : item,
                      ),
                    )
                  }
                />
                <Field label={trText("Açıklama")}>
                  <textarea
                    className={inputClass + " min-h-36"}
                    maxLength={5000}
                    value={group.fields.description}
                    onChange={(event) =>
                      edit("description", event.target.value)
                    }
                  />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={trText("Kayıt tarihi")}>
                    <input
                      type="datetime-local"
                      className={inputClass}
                      value={localDate(group.fields.createdAt)}
                      onChange={(event) =>
                        edit(
                          "createdAt",
                          event.target.value
                            ? new Date(event.target.value).toISOString()
                            : "",
                        )
                      }
                    />
                  </Field>
                  <Field label={trText("Kaynak kullanıcı adı")}>
                    <input
                      className={inputClass}
                      maxLength={80}
                      value={group.fields.username}
                      onChange={(event) => edit("username", event.target.value)}
                    />
                  </Field>
                </div>
                <Field label={trText("Kayıt durumu")}>
                  <select
                    className={inputClass}
                    value={group.fields.status}
                    onChange={(event) => edit("status", event.target.value)}
                  >
                    <option value="verified">
                      {trText("Tür adı belirtilmiş")}
                    </option>
                    <option value="unknown">{trText("Türü bilinmiyor")}</option>
                    <option value="removed">
                      {trText("Kaldırılmış arşiv kaydı")}
                    </option>
                  </select>
                </Field>
                <h4 className="font-serif text-xl">
                  {trText("Gerçek gözlem konumu")}
                </h4>
                <p className="text-sm leading-6 text-[#50665d]">
                  {trText(
                    "Fotoğrafta GPS varsa otomatik alınır. Haritaya dokunarak veya enlem/boylam yazarak değiştirin.",
                  )}
                </p>
                <LocationPicker
                  key={group.id}
                  lat={coordinate(group.fields.lat, 39, 90)}
                  lng={coordinate(group.fields.lng, 35, 180)}
                  onChange={(lat, lng) => {
                    if (!locked)
                      setGroups((items) =>
                        items.map((item) =>
                          item.id === group.id
                            ? {
                                ...item,
                                fields: {
                                  ...item.fields,
                                  lat: String(lat),
                                  lng: String(lng),
                                },
                              }
                            : item,
                        ),
                      );
                  }}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  {(
                    [
                      ["lat", trText("Enlem")],
                      ["lng", trText("Boylam")],
                      ["city", trText("İl / bölge")],
                      ["locality", "Yer / habitat"],
                    ] as const
                  ).map(([key, label]) => (
                    <Field key={key} label={label}>
                      <input
                        className={inputClass}
                        inputMode={
                          key === "lat" || key === "lng" ? "decimal" : "text"
                        }
                        maxLength={key === "city" ? 100 : 200}
                        value={group.fields[key]}
                        onChange={(event) => edit(key, event.target.value)}
                      />
                    </Field>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap gap-2">
                <button
                  className={secondaryButton}
                  disabled={locked}
                  onClick={findAddress}
                >
                  {trText("Koordinattan yer adını doldur")}
                </button>
                <button
                  className={secondaryButton}
                  disabled={locked || !group.fields.lat || !group.fields.lng}
                  onClick={() =>
                    setGroups((items) =>
                      items.map((item) => ({
                        ...item,
                        fields: {
                          ...item.fields,
                          ...Object.fromEntries(
                            ["lat", "lng", "city", "locality"].map((key) => [
                              key,
                              group.fields[key as keyof WorkshopFields],
                            ]),
                          ),
                        },
                      })),
                    )
                  }
                >
                  {trText("Bu konumu tüm gönderilere uygula")}
                </button>
              </div>
              {!!group.analysis?.references.length && (
                <div>
                  <h4 className="font-serif text-xl">
                    {trText("Kaynak görsellerle karşılaştır")}
                  </h4>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {group.analysis.references.map((reference) => (
                      <a
                        key={reference.url}
                        href={reference.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border p-2 text-sm"
                      >
                        <img
                          src={reference.url}
                          alt={reference.species}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          className="aspect-square w-full object-contain"
                        />
                        <i className="mt-2 block">{reference.species}</i>
                        <span>{reference.source}</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="space-y-4 rounded-2xl border border-[#09352e]/15 bg-white p-5 sm:p-6">
        <h3 className="font-serif text-2xl">{trText("Hazır veriyi kullan")}</h3>
        <p className="text-base leading-7 text-[#50665d]">
          {groups.length}
          {trText(
            " gönderi hazırlanıyor. ZIP dosyasında data.json ve gönderilere bağlı photos klasörü bulunur.",
          )}
          {ungrouped > 0 &&
            ` Havuzdaki ${ungrouped} gruplandırılmamış fotoğraf için önce gönderi oluşturun.`}
        </p>
        <Field label={trText("Sitede kimin adına kaydedilsin?")}>
          <select
            className={inputClass + " sm:max-w-lg"}
            value={author}
            disabled={locked}
            onChange={(event) => setAuthor(event.target.value)}
          >
            <option value="">{trText("Gönderen seçin")}</option>
            <option value="system">{trText("BioSfere · anonim gözlem")}</option>
            {users.data?.map((user) => (
              <option key={user.id} value={user.id}>
                {user.firstName} {user.lastName} · @{user.username}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex flex-wrap gap-3">
          <button
            className={secondaryButton}
            disabled={busy || !groups.length}
            onClick={download}
          >
            <Download size={17} />
            {trText("Fotoğraflı ZIP indir")}
          </button>
          <button
            className={buttonClass}
            disabled={busy || saved || !groups.length || !author}
            onClick={saveToSite}
          >
            <Save size={17} />
            {needsRetry
              ? trText("Aktarıma kaldığı yerden devam et")
              : trText("Gönderileri siteye ekle")}
          </button>
          {needsRetry && (
            <button
              className={secondaryButton}
              disabled={busy}
              onClick={() => void stopImport()}
            >
              {trText("Aktarımı kapat")}
            </button>
          )}
        </div>
        <p className="text-sm leading-6 text-[#50665d]">
          {trText(
            "Kaynak kullanıcı adı arşiv bilgisi olarak saklanır; sitede seçtiğiniz gönderen kullanılır. BioSfere için profil ve itibar oluşturulmaz.",
          )}
        </p>
      </div>
    </section>
  );
}
