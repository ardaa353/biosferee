import { useEffect, useRef, useState } from "react";
import { Download, Upload, RefreshCw } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { preparePhoto } from "@/lib/photos";
import { errorMessage } from "@/lib/utils";
import { buttonClass, inputClass, secondaryButton } from "./BioUI";
import type { DatasetArchive } from "@/lib/datasetArchive";

export default function DataTransferPanel() {
  const users = trpc.biosfere.users.list.useQuery();
  const health = trpc.dataset.storageHealth.useQuery(undefined, {retry: false, staleTime: 15_000});
  const retry = trpc.dataset.retryStorage.useMutation({onSuccess: () => { void health.refetch(); }});
  const cleanup = trpc.dataset.cleanDeletedBackup.useMutation();
  const begin = trpc.dataset.begin.useMutation(), prepare = trpc.dataset.prepareEntry.useMutation();
  const commit = trpc.dataset.commitEntry.useMutation(), finish = trpc.dataset.finish.useMutation();
  const utils = trpc.useUtils();
  const [archive, setArchive] = useState<DatasetArchive | null>(null);
  const [name, setName] = useState("");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(""), [error, setError] = useState("");
  const [needsRetry, setNeedsRetry] = useState(false);
  const [backups, setBackups] = useState<string[]>([]), [selectedBackups, setSelectedBackups] = useState<string[]>([]);
  const [backupCursor, setBackupCursor] = useState<string | undefined>();
  const [backupsLoaded, setBackupsLoaded] = useState(false);
  const job = useRef<string | null>(null);
  const uploads = useRef(new Map<string, string>());
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => () => { void archive?.close(); }, [archive]);

  async function open(file?: File) {
    if (!file || busy) return;
    setBusy(true); setError(""); setStatus("Arşiv ve fotoğraf bağlantıları okunuyor…");
    try {
      if (job.current) await finish.mutateAsync({id: job.current, cancel: true});
      job.current = null; uploads.current.clear(); setNeedsRetry(false);
      const { openDatasetArchive } = await import("@/lib/datasetArchive");
      const value = await openDatasetArchive(file);
      setArchive(value); setName(file.name);
      setStatus(value.dataset.posts.length + " gönderi ve " + value.dataset.posts.reduce((sum, post) => sum + post.images.length, 0) + " fotoğraf hazır.");
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function download() {
    setBusy(true); setError(""); setStatus("Gözlem verileri getiriliyor…");
    const abort = new AbortController(); controller.current = abort;
    try {
      const snapshot = await utils.dataset.export.fetch();
      const {exportDatasetZip} = await import("@/lib/datasetArchive");
      await exportDatasetZip(snapshot, setStatus, abort.signal);
      setStatus("Fotoğraflarla birlikte ZIP indirildi.");
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); controller.current = null; }
  }
  async function ingest() {
    if (!archive || !author) { setError("Arşivi ve gönderilerin kimin adına kaydedileceğini seçin."); return; }
    setBusy(true); setError(""); setNeedsRetry(false);
    const abort = new AbortController(); controller.current = abort;
    let done = 0;
    try {
      if (!job.current) job.current = (await begin.mutateAsync({archiveId: archive.dataset.archiveId, total: archive.dataset.posts.length, authorId: author === "system" ? null : Number(author)})).id;
      for (const record of archive.dataset.posts) {
        abort.signal.throwIfAborted();
        setStatus("Gönderi işleniyor · " + (done + 1) + " / " + archive.dataset.posts.length);
        const entry = await prepare.mutateAsync({jobId: job.current, record});
        if (!entry.postId) {
          const images: string[] = [];
          for (const [index, path] of record.images.entries()) {
            abort.signal.throwIfAborted();
            const cacheKey = entry.id + ":" + index;
            const previous = uploads.current.get(cacheKey);
            if (previous) { images.push(previous); continue; }
            setStatus("Gönderi " + (done + 1) + " · fotoğraf " + (index + 1) + " / " + record.images.length);
            const photo = await preparePhoto(await archive.readPhoto(path));
            const signed = entry.uploads[index];
            const body = new FormData();
            for (const [key, value] of Object.entries(signed.fields)) body.append(key, value);
            body.append("file", photo);
            const response = await fetch(signed.url, {method: "POST", body, signal: abort.signal});
            const data = await response.json();
            if (!response.ok || typeof data.secure_url !== "string") throw new Error(data.error?.message || "Fotoğraf yüklenemedi.");
            uploads.current.set(cacheKey, data.secure_url); images.push(data.secure_url);
          }
          abort.signal.throwIfAborted();
          await commit.mutateAsync({jobId: job.current, entryId: entry.id, images});
        }
        done++;
      }
      await finish.mutateAsync({id: job.current});
      job.current = null; uploads.current.clear();
      await Promise.all([utils.biosfere.posts.list.invalidate(), utils.biosfere.users.list.invalidate()]);
      setStatus(done + " gönderi kaydedildi. Gönderen " + (author === "system" ? "BioSfere" : users.data?.find(user => String(user.id) === author)?.username || author) + ".");
    } catch (e) {
      setError(errorMessage(e));
      setStatus(done + " gönderi işlendi."); setNeedsRetry(Boolean(job.current));
    } finally { setBusy(false); controller.current = null; void health.refetch(); }
  }
  async function cancel() {
    controller.current?.abort();
    if (!job.current) return;
    try {
      await finish.mutateAsync({id: job.current, cancel: true});
      job.current = null; uploads.current.clear(); setNeedsRetry(false);
    } catch (e) { setError(errorMessage(e)); }
  }
  async function listBackups(more = false) {
    setBusy(true); setError("");
    try {
      const page = await utils.dataset.deletedBackups.fetch({cursor: more ? backupCursor : undefined});
      setBackups(current => more ? [...new Set([...current, ...page.urls])] : page.urls);
      setBackupCursor(page.cursor); setBackupsLoaded(true);
      if (!more) setSelectedBackups([]);
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function cleanBackups() {
    if (!selectedBackups.length || !window.confirm("Seçtiğiniz " + selectedBackups.length + " silinmiş fotoğrafın tüm yedekleri kalıcı olarak kaldırılacak. Bu işlem geri alınamaz. Devam edilsin mi?")) return;
    setBusy(true); setError("");
    let total = 0;
    try {
      for (const url of selectedBackups) {
        await cleanup.mutateAsync({url}); total++;
        setBackups(current => current.filter(item => item !== url));
        setSelectedBackups(current => current.filter(item => item !== url));
        setStatus(total + " silinmiş fotoğrafın yedekleri temizlendi.");
      }
      await health.refetch();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <section className="space-y-6">
    <div className="rounded-xl border border-[#09352e]/15 bg-white p-5">
      <h2 className="font-serif text-2xl">Tüm gözlem verisini indir</h2>
      <p className="my-3 text-sm leading-6 text-[#50665d]">ZIP dosyası data.json ve photos klasörünü içerir. Gönderi fotoğrafları gonderi1.1.jpg gibi adlarla kayda bağlanır. Profil fotoğrafları arşive alınmaz.</p>
      <button type="button" disabled={busy} className={buttonClass} onClick={() => void download()}><Download size={17} />Fotoğraflarla ZIP indir</button>
    </div>
    <div className="rounded-xl border border-[#09352e]/15 bg-white p-5">
      <h2 className="font-serif text-2xl">ZIP / RAR verisini içe aktar</h2>
      <a href="/downloads/biosfere-veri-atolyesi.zip" download className={secondaryButton + " mt-3"}><Download size={17} />Python veri hazırlama uygulamasını indir</a>
      <p className="my-3 text-sm leading-6 text-[#50665d]">Arşivin kökünde data.json ve photos klasörü bulunmalı. Kayıtlar mevcut gözlemlere eklenir. Arşivdeki gönderen adı kaynak bilgisi olarak saklanır. Sitede aşağıda seçtiğiniz ad kullanılır.</p>
      <input type="file" accept=".zip,.rar,application/zip,application/x-rar-compressed" disabled={busy} className="mb-4 block w-full text-sm" aria-label="Veri arşivi seç" onChange={e => { void open(e.target.files?.[0]); e.target.value = ""; }} />
      {name && <p className="mb-3 text-sm">{name}</p>}
      <label className="block text-sm font-semibold">Kimin adına kaydedilsin?
        <select className={inputClass + " mt-2 w-full sm:max-w-md"} value={author} disabled={busy || needsRetry} onChange={e => setAuthor(e.target.value)}>
          <option value="">Gönderen seçin</option>
          <option value="system">BioSfere · anonim gözlem</option>
          {users.data?.map(user => <option key={user.id} value={user.id}>{user.firstName} {user.lastName} · @{user.username}</option>)}
        </select>
      </label>
      <p className="mb-4 mt-2 text-xs text-[#50665d]">BioSfere gönderilerinde profil bağlantısı ve itibar puanı bulunmaz.</p>
      <button type="button" className={buttonClass} disabled={busy || !archive || !author} onClick={() => void ingest()}><Upload size={17} />{needsRetry ? "Kaldığı yerden devam et" : "Veriyi ekle"}</button>
      {(busy || needsRetry) && <button type="button" className={secondaryButton + " ml-2"} onClick={() => void cancel()}>Vazgeç</button>}
    </div>
    <div className="rounded-xl border border-[#09352e]/15 bg-white p-5">
      <h2 className="font-serif text-2xl">Cloudinary silme durumu</h2>
      <p className="mt-3 text-sm leading-6 text-[#50665d]">Fotoğraflar otomatik yedekleriyle birlikte silinir. Daha önce silinip bulutta yedeği kalmış fotoğrafları da temizleyebilirsiniz. Temizlenen yedekler geri alınamaz.</p>
      {health.data && <>
        <p className="mt-3 text-sm">Bulut {health.data.cloudName} · bekleyen {health.data.pending} · yeniden denenen {health.data.failed}</p>
        {health.data.error ? <p role="alert" className="my-3 whitespace-pre-wrap text-sm text-[#8d302a]">{health.data.error}</p> : <p className="my-3 text-sm text-[#007f24]">Cloudinary bağlantısı doğrulandı.</p>}
        {health.data.lastError && <p className="my-3 whitespace-pre-wrap text-sm text-[#8d632a]">Önceki silme denemesi: {health.data.lastError}{health.data.nextAttemptAt && " · Otomatik yeniden deneme: " + new Date(health.data.nextAttemptAt).toLocaleString("tr-TR")}</p>}
        {!health.data.configured && <p className="mb-3 text-sm">Render Environment bölümüne CLOUDINARY_API_KEY ile CLOUDINARY_API_SECRET veya CLOUDINARY_URL ekleyip yeniden dağıtın.</p>}
        {health.data.revision && <p className="mb-3 font-mono text-xs text-[#50665d]">Sürüm {health.data.revision}</p>}
      </>}
      {health.error && <p role="alert" className="my-3 text-sm text-[#8d302a]">{errorMessage(health.error)}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className={secondaryButton} disabled={health.isFetching} onClick={() => void health.refetch()}><RefreshCw size={15} />Durumu kontrol et</button>
        <button type="button" className={secondaryButton} disabled={retry.isPending || !health.data?.configured} onClick={() => retry.mutate()}>Bekleyen silmeleri yeniden dene</button>
        <button type="button" className={secondaryButton} disabled={busy || !health.data?.configured} onClick={() => void listBackups()}>Önceden silinmiş fotoğraf yedeklerini listele</button>
      </div>
      {backupsLoaded && <div className="mt-4 space-y-3 text-sm">
        <p>{backups.length} silinmiş fotoğrafın yedeği listelendi. Temizlenecek dosyaları seçin.</p>
        {backups.length > 0 && <>
          <label className="flex gap-2"><input type="checkbox" disabled={busy} checked={selectedBackups.length === backups.length} onChange={e => setSelectedBackups(e.target.checked ? backups : [])} />Listelenenleri seç</label>
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border p-3">
            {backups.map(url => <label key={url} className="flex items-start gap-2 break-all font-mono text-xs"><input type="checkbox" disabled={busy} checked={selectedBackups.includes(url)} onChange={e => setSelectedBackups(current => e.target.checked ? [...current, url] : current.filter(item => item !== url))} />{decodeURIComponent(new URL(url).pathname.split("/image/upload/")[1])}</label>)}
          </div>
          <button type="button" className={secondaryButton} disabled={busy || !selectedBackups.length} onClick={() => void cleanBackups()}>Seçilen {selectedBackups.length} fotoğrafın yedeklerini kalıcı temizle</button>
        </>}
        {backupCursor && <button type="button" className={secondaryButton} disabled={busy} onClick={() => void listBackups(true)}>Daha fazla yedek göster</button>}
      </div>}
      {retry.error && <p role="alert" className="mt-3 text-sm text-[#8d302a]">{errorMessage(retry.error)}</p>}
    </div>
    {status && <p role="status" aria-live="polite" className="text-sm text-[#007f24]">{status}</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-[#8d302a]">{error}</p>}
  </section>;
}
