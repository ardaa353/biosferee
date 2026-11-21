import { useEffect, useState } from "react";
import { catalogSearch, exactMatch } from "@/lib/catalog";
import { confident, identifyPhotos, type Guess } from "@/lib/identification";
import { emptyTaxonomy, type Taxonomy } from "@contracts/taxonomy";
import { trpc } from "@/providers/trpc";
type Candidate = Guess & { taxonomy: Taxonomy; catalogued: boolean };
type Props = { files: File[]; location: { lat: number; lng: number } | null; onAutomatic: (tax: Taxonomy) => void; onChoose: (tax: Taxonomy) => void };

export function SpeciesAssistant({ files, location, onAutomatic, onChoose }: Props) {
  const [choices, setChoices] = useState<Candidate[]>([]);
  const [status, setStatus] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const nearby = trpc.biosfere.nearbySpecies.useQuery(
    { species: choices.map(c => c.taxonomy.species), lat: location?.lat ?? 0, lng: location?.lng ?? 0 },
    { enabled: !!location && choices.length > 0, staleTime: 300_000, retry: false }
  );
  useEffect(() => {
    if (!files.length) { setChoices([]); setStatus(""); setFailed(false); return; }
    const controller = new AbortController();
    const { signal } = controller;
    setChoices([]); setFailed(false); setStatus("Fotoğraflar inceleniyor…");
    const run = async () => {
      try {
        const predictions = await identifyPhotos(files, signal, s => { if (!signal.aborted) setStatus(s); });
        if (signal.aborted) return;
        const candidates = await Promise.all(predictions.slice(0, 4).map(async p => {
          const kingdom = p.group === "plant" ? "Plantae" : p.group === "fungus" ? "Fungi" : "Animalia";
          const name = p.name.split(" ").slice(0, 2).join(" ");
          const rows = await catalogSearch(name, "species", signal).catch(() => null);
          const hit = rows && exactMatch(rows.results, name, kingdom);
          const taxonomy = hit?.taxonomy ?? { ...emptyTaxonomy, kingdom, className: p.group === "bird" ? "Aves" : p.group === "insect" ? "Insecta" : "", genus: name.split(" ")[0], species: name };
          return { ...p, taxonomy, catalogued: !!hit };
        }));
        if (signal.aborted) return;
        setChoices(candidates);
        if (candidates[0]?.catalogued && confident(predictions)) {
          onAutomatic(candidates[0].taxonomy);
          setStatus("Güçlü görsel eşleşme bulundu. Türü ve sınıflandırmayı kontrol edebilirsin.");
        } else setStatus(candidates.length ? "Olası türler aşağıda. Fotoğrafınla karşılaştırıp uygun adayı seçebilirsin." : "Güvenilir bir tür önerisi bulunamadı.");
      } catch {
        if (!signal.aborted) { setFailed(true); setStatus("Bu cihazda fotoğraf analizi tamamlanamadı. Katalogdan seçim yapabilir veya elle yazabilirsin."); }
      }
    };
    void run();
    return () => controller.abort();
  }, [files, attempt, onAutomatic]);
  if (!files.length) return null;
  return <div className="mb-4 rounded-xl border border-[#007f24]/20 bg-[#f4f8f2] p-4 text-sm">
    <p className="font-semibold">Fotoğraftan tür tahmini</p>
    <p role="status" aria-live="polite" className="mt-1 text-[#40574c]">{status}</p>
    <p className="mt-1 text-xs text-[#5f7169]">Bitki, kuş, böcek, memeli, sürüngen, iki yaşamlı, örümceğimsiler ve mantar fotoğrafları için öneri aranır.</p>
    {failed && <button className="mt-2 font-semibold underline" type="button" onClick={() => setAttempt(v => v + 1)}>Analizi yeniden dene</button>}
    {choices.length > 0 && <ul className="mt-3 flex flex-wrap gap-2">{choices.map(c =>
      <li key={c.name}><button type="button" className="rounded-lg border border-[#007f24]/25 bg-white px-3 py-2 text-left hover:border-[#007f24]"
        onClick={() => onChoose(c.taxonomy)}><i>{c.taxonomy.species}</i>
        {nearby.data?.includes(c.taxonomy.species) && <span className="block text-xs">Yaklaşık 100 km içinde BioSfere kaydı var</span>}
      </button></li>)}</ul>}
  </div>;
}
