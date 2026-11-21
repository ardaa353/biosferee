import { useEffect, useState } from "react";
import { Check, Leaf } from "lucide-react";
import { analyzeObservation, type IdentificationCandidate, type IdentificationMode } from "@/lib/onlineIdentification";
import type { SpeciesProfile, Taxonomy } from "@contracts/taxonomy";
import { trpc } from "@/providers/trpc";
import { inputClass } from "./BioUI";

type Props = {files: File[]; location: {lat: number; lng: number} | null; onAutomatic: (tax: Taxonomy) => void; onChoose: (tax: Taxonomy) => void; onCommonName?: (species: string, name: string) => void};
function displayTaxonomy(candidate: IdentificationCandidate, profile?: SpeciesProfile): Taxonomy {
  return {...candidate.taxonomy, commonName: profile?.commonNameLanguage === "tr" ? profile.commonName : candidate.taxonomy.commonName};
}
function CandidateCard({candidate, profile, selected, pending, nearby, choose}: {candidate: IdentificationCandidate; profile?: SpeciesProfile; selected: boolean; pending: boolean; nearby: boolean; choose: () => void}) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [profile?.photo?.url]);
  const common = displayTaxonomy(candidate, profile).commonName || profile?.commonName || candidate.modelCommonName;
  const photo = profile?.photo;
  return <li className={"min-w-0 overflow-hidden rounded-xl border bg-white " + (selected ? "border-[#007f24] ring-2 ring-[#007f24]/20" : "border-[#007f24]/20")}>
    <button type="button" aria-pressed={selected} className="block h-full w-full p-3 text-left transition hover:bg-[#e9f2e6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#007f24]" onClick={choose}>
      <span className="mb-3 flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-[#f1f5ef]">
        {photo && !imageFailed ? <img src={photo.url} alt={common || candidate.taxonomy.species} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="h-full w-full object-contain" onError={() => setImageFailed(true)} /> : <span className="px-3 text-center text-xs text-[#64766a]"><Leaf size={25} className="mx-auto mb-2" />{pending ? "Örnek fotoğraf yükleniyor…" : "Örnek fotoğraf bulunamadı"}</span>}
      </span>
      <span className="flex items-start justify-between gap-2"><strong className="break-words text-sm leading-5">{common || "Yaygın adı bulunamadı"}</strong>{selected && <Check size={17} className="shrink-0 text-[#007f24]" />}</span>
      <i className="mt-1 block break-words text-sm leading-5">{candidate.taxonomy.species}</i>
      {!displayTaxonomy(candidate, profile).commonName && common && <span className="mt-1 block text-xs text-[#64766a]">Yaygın ad · İngilizce</span>}
      <span className="mt-2 block text-sm font-semibold text-[#007f24]">{selected ? "Seçildi" : "Bu türü seç"}</span>
      {nearby && <span className="mt-1 block text-xs leading-5 text-[#50665d]">Yaklaşık 100 km içinde BioSfere kaydı var</span>}
    </button>
    {photo && <a href={photo.pageUrl} target="_blank" rel="noreferrer" className="block border-t border-[#09352e]/10 px-3 py-2 text-[11px] leading-4 text-[#64766a] hover:underline">Örnek fotoğraf: {photo.credit} · {photo.license}</a>}
  </li>;
}

export function SpeciesAssistant({files, location, onAutomatic, onChoose, onCommonName}: Props) {
  const [choices, setChoices] = useState<IdentificationCandidate[]>([]);
  const [status, setStatus] = useState(""), [mode, setMode] = useState<IdentificationMode>("online"), [usedMode, setUsedMode] = useState<IdentificationMode>("online");
  const [attempt, setAttempt] = useState(0), [failed, setFailed] = useState(false), [running, setRunning] = useState(false), [selected, setSelected] = useState("");
  const profiles = trpc.biosfere.taxonProfiles.useQuery({taxa: choices.map(choice => ({species: choice.taxonomy.species, kingdom: choice.taxonomy.kingdom}))}, {enabled: choices.length > 0, staleTime: 6 * 60 * 60 * 1000, retry: false});
  const nearby = trpc.biosfere.nearbySpecies.useQuery({species: choices.map(choice => choice.taxonomy.species), lat: location?.lat ?? 0, lng: location?.lng ?? 0}, {enabled: !!location && choices.length > 0, staleTime: 300_000, retry: false});
  useEffect(() => {
    if (!files.length) { setChoices([]); setStatus(""); setFailed(false); setRunning(false); return; }
    const controller = new AbortController(), {signal} = controller;
    setChoices([]); setSelected(""); setFailed(false); setRunning(true); setStatus("Fotoğraflar birlikte inceleniyor…");
    void (async () => {
      try {
        let actual = mode, result;
        try { result = await analyzeObservation(files, mode, signal, message => { if (!signal.aborted) setStatus(message); }); }
        catch (error) {
          signal.throwIfAborted();
          if (mode === "browser") throw error;
          actual = "browser";
          setStatus("Çevrim içi servis kullanılamadı. Ücretsiz cihaz modelleriyle öneri aranıyor…");
          result = await analyzeObservation(files, "browser", signal, message => { if (!signal.aborted) setStatus(message); });
        }
        signal.throwIfAborted();
        setUsedMode(actual); setChoices(result.candidates.slice(0, 5));
        setStatus(result.candidates.length ? `${files.length} fotoğraf değerlendirildi. ${actual === "browser" ? "Cihaz modellerinin" : actual === "database" ? "Görsel veritabanının" : "BioCLIP 2'nin"} önerilerini örnek fotoğraflarla karşılaştırıp seçebilirsin.` : "Tür önerisi alınamadı. Katalogdan seçim yapabilirsin.");
      } catch { if (!signal.aborted) { setFailed(true); setStatus("Fotoğraf analizi tamamlanamadı. Yeniden deneyebilir veya katalogdan seçim yapabilirsin."); } }
      finally { if (!signal.aborted) setRunning(false); }
    })();
    return () => controller.abort();
  }, [files, attempt, mode]);
  useEffect(() => {
    const leading = choices[0];
    if (selected || usedMode !== "online" || !leading || leading.score < .8 || leading.score - (choices[1]?.score || 0) < .18) return;
    const profile = profiles.data?.find(value => value.species === leading.taxonomy.species);
    onAutomatic(displayTaxonomy(leading, profile));
  }, [choices, profiles.data, selected, usedMode, onAutomatic]);
  useEffect(() => {
    const profile = profiles.data?.find(value => value.species === selected);
    if (profile?.commonNameLanguage === "tr" && profile.commonName) onCommonName?.(selected, profile.commonName);
  }, [profiles.data, selected, onCommonName]);
  if (!files.length) return null;
  return <div className="mb-4 rounded-xl border border-[#007f24]/20 bg-[#f4f8f2] p-4 text-sm">
    <p className="text-base font-semibold">Fotoğraftan tür tahmini</p>
    <label className="mt-3 block font-semibold">Ücretsiz tahmin yöntemi
      <select className={inputClass + " mt-2"} value={mode} onChange={event => setMode(event.target.value as IdentificationMode)}>
        <option value="online">Geniş kapsamlı çevrim içi BioCLIP 2</option>
        <option value="database">Büyük görsel veritabanındaki benzer kayıtlarla karşılaştır</option>
        <option value="browser">Cihazımda ücretsiz tahmin</option>
      </select>
    </label>
    <p role="status" aria-live="polite" className="mt-3 leading-6 text-[#40574c]">{status}</p>
    <p className="mt-2 text-xs leading-5 text-[#5f7169]">{mode === "browser" ? "Fotoğraflar cihazında incelenir; gerekli küçük modeller ilk kullanımda alınır." : "Çevrim içi analizde fotoğrafların konum bilgisi içermeyen kopyaları Imageomics/Hugging Face'e gönderilir. Ücretli API anahtarı gerekmez; ortak serviste sıra veya erişim sınırı olabilir."} Öneriler kesin teşhis değildir. Örnek görseller karşılaştırma içindir.</p>
    {profiles.isFetching && choices.length > 0 && <p className="mt-2 text-xs text-[#50665d]">Yaygın adlar ve örnek fotoğraflar getiriliyor…</p>}
    {!running && (failed || choices.length > 0) && <button className="mt-3 min-h-10 font-semibold underline" type="button" onClick={() => { if (choices.length) void profiles.refetch(); setAttempt(value => value + 1); }}>Tahmini yenile</button>}
    {choices.length > 0 && <ul className="mt-4 grid items-start gap-3 grid-cols-2 sm:grid-cols-3">{choices.map(candidate => {
      const profile = profiles.data?.find(value => value.species === candidate.taxonomy.species);
      return <CandidateCard key={candidate.taxonomy.species} candidate={candidate} profile={profile} pending={profiles.isFetching} selected={selected === candidate.taxonomy.species} nearby={nearby.data?.includes(candidate.taxonomy.species) || false} choose={() => { setSelected(candidate.taxonomy.species); onChoose(displayTaxonomy(candidate, profile)); }} />;
    })}</ul>}
  </div>;
}
