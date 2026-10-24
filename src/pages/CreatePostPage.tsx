import { useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Crosshair, ImagePlus, X } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/lib/auth";
import { emptyTaxonomy } from "@/lib/types";
import { errorMessage, toImageInputs } from "@/lib/utils";
import { Field, PageHeading, buttonClass, inputClass, secondaryButton } from "@/components/BioUI";
import { LocationPicker } from "@/components/BioMap";

const taxLabels: [keyof typeof emptyTaxonomy, string][] = [
  ["kingdom", "Alem"],
  ["phylum", "Şube"],
  ["className", "Sınıf"],
  ["orderName", "Takım"],
  ["family", "Familya"],
  ["genus", "Cins"],
  ["species", "Bilimsel tür adı"],
  ["commonName", "Türkçe yaygın ad"]
];

export default function CreatePostPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  
  const [unknown, setUnknown] = useState(params.get("bilinmiyor") === "1");
  const [tax, setTax] = useState(emptyTaxonomy);
  const [description, setDescription] = useState("");
  const [city, setCity] = useState("");
  const [locality, setLocality] = useState("");
  const [lat, setLat] = useState(39.0);
  const [lng, setLng] = useState(35.0);
  const [files, setFiles] = useState<File[]>([]);
  const [collaboratorIds, setCollaboratorIds] = useState<number[]>([]);
  const [error, setError] = useState("");

  const users = trpc.biosfere.users.list.useQuery();
  const create = trpc.biosfere.posts.create.useMutation();

  const previews = useMemo(
    () => files.map((f) => ({ name: f.name, url: URL.createObjectURL(f) })),
    [files]
  );

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    
    try {
      const images = await toImageInputs(files);
      const result = await create.mutateAsync({
        description,
        unknown,
        ...tax,
        city,
        locality,
        lat,
        lng,
        images,
        collaboratorIds
      });
      navigate(`/gonderi/${result.id}`);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function gps() {
    if (!navigator.geolocation) {
      return setError("Tarayıcınız konum özelliğini desteklemiyor.");
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLat(p.coords.latitude);
        setLng(p.coords.longitude);
      },
      () => setError("Konum izni alınamadı. Haritadan nokta seçebilirsiniz.")
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeading 
        eyebrow="Yeni saha kaydı" 
        title="Gözlem paylaş" 
        description="Fotoğrafları, konumu ve biyolojik notları ekleyin. Kayıt tarihi ve mevsimi sistem tarafından otomatik eklenir." 
      />
      
      <form onSubmit={submit} className="space-y-9">
        <section>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#a96d15]/30 bg-[#f2e5c9]/60 p-4">
            <input 
              type="checkbox" 
              checked={unknown} 
              onChange={(e) => setUnknown(e.target.checked)} 
              className="mt-1 h-5 w-5 accent-[#007f24]" 
            />
            <span>
              <strong className="text-sm">Türü bilinmiyor etiketiyle paylaş</strong>
              <span className="mt-1 block text-sm leading-6 text-[#5f593f]">
                Gönderi bilinmeyenler bölümüne eklenir; kullanıcılar Alem → Tür önerisi gönderebilir.
              </span>
            </span>
          </label>
        </section>

        {!unknown && (
          <section>
            <h2 className="mb-4 font-serif text-2xl">01 / Sistematik bilgiler</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {taxLabels.map(([key, label]) => (
                <Field key={key} label={`${label} *`}>
                  {key === "kingdom" ? (
                    <select 
                      className={inputClass} 
                      value={tax[key]} 
                      onChange={(e) => setTax({ ...tax, [key]: e.target.value })}
                    >
                      {["Animalia", "Plantae", "Fungi", "Protista", "Bacteria", "Archaea"].map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  ) : (
                    <input 
                      className={inputClass} 
                      value={tax[key]} 
                      onChange={(e) => setTax({ ...tax, [key]: e.target.value })} 
                      required 
                    />
                  )}
                </Field>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-4 font-serif text-2xl">{unknown ? "01" : "02"} / Fotoğraflar</h2>
          <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[#007f24]/45 bg-[#85c093]/10 p-6 text-center transition hover:bg-[#85c093]/20">
            <ImagePlus className="mb-2 text-[#007f24]" />
            <strong className="text-sm">Fotoğraf seç</strong>
            <span className="mt-1 text-xs text-[#5f7169]">En fazla 8 fotoğraf · her biri en fazla 12 MB</span>
            <input 
              type="file" 
              accept="image/jpeg,image/png,image/webp,image/gif" 
              multiple 
              className="sr-only" 
              onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 8))} 
              required={files.length === 0} 
            />
          </label>
          
          {previews.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
              {previews.map((p, i) => (
                <div key={p.url} className="relative aspect-square overflow-hidden rounded-lg">
                  <img src={p.url} alt={p.name} className="h-full w-full object-cover" />
                  <button 
                    type="button" 
                    onClick={() => setFiles(files.filter((_, index) => index !== i))} 
                    className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-full bg-[#f7f7f7]" 
                    aria-label="Fotoğrafı kaldır"
                  >
                    <X size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between">
            <h2 className="font-serif text-2xl">{unknown ? "02" : "03"} / Konum</h2>
            <button 
              type="button" 
              onClick={gps} 
              className="flex min-h-11 items-center gap-2 text-xs font-semibold text-[#007f24]"
            >
              <Crosshair size={16} />Mevcut konumum
            </button>
          </div>
          
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <Field label="Şehir *">
              <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Örn. Giresun" required />
            </Field>
            <Field label="Lokalite / habitat *">
              <input className={inputClass} value={locality} onChange={(e) => setLocality(e.target.value)} placeholder="Örn. Bulancak Yaylası" required />
            </Field>
          </div>
          
          <LocationPicker lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln); }} />
          
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Enlem">
              <input className={inputClass} type="number" step="any" value={lat} onChange={(e) => setLat(Number(e.target.value))} required />
            </Field>
            <Field label="Boylam">
              <input className={inputClass} type="number" step="any" value={lng} onChange={(e) => setLng(Number(e.target.value))} required />
            </Field>
          </div>
        </section>

        <section>
          <h2 className="mb-4 font-serif text-2xl">{unknown ? "03" : "04"} / Ortak çalışma</h2>
          <p className="mb-3 text-sm text-[#5f7169]">Gözleme katkı veren kullanıcıları seçin. Bu kişiler gönderide ortak yazar olarak görünür.</p>
          <div className="grid max-h-52 gap-2 overflow-y-auto rounded-xl border border-[#09352e]/15 p-3 sm:grid-cols-2">
            {users.data?.filter((u) => u.id !== user?.id).map((u) => (
              <label key={u.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-[#85c093]/15">
                <input 
                  type="checkbox" 
                  className="h-4 w-4 accent-[#007f24]" 
                  checked={collaboratorIds.includes(u.id)} 
                  onChange={(e) => setCollaboratorIds(
                    e.target.checked 
                      ? [...collaboratorIds, u.id] 
                      : collaboratorIds.filter((id) => id !== u.id)
                  )} 
                />
                <span>{u.firstName} {u.lastName}</span>
                <span className="font-mono text-[10px] text-[#71807e]">@{u.username}</span>
              </label>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-4 font-serif text-2xl">{unknown ? "04" : "05"} / Gözlem notları</h2>
          <Field label="Tür ve gözlem hakkında bilgilendirme *">
            <textarea 
              className={`${inputClass} min-h-36 resize-y`} 
              value={description} 
              onChange={(e) => setDescription(e.target.value)} 
              minLength={10} 
              maxLength={5000} 
              placeholder="Morfolojik özellikler, habitat, büyütme oranı ve ekolojik notlar…" 
              required 
            />
          </Field>
        </section>

        {error && (
          <p role="alert" className="rounded-lg border border-[#a63f36]/30 bg-[#a63f36]/5 p-4 text-sm text-[#8d302a]">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-[#09352e]/15 pt-6">
          <button type="button" onClick={() => navigate(-1)} className={secondaryButton}>Vazgeç</button>
          <button className={buttonClass} disabled={create.isPending}>
            {create.isPending ? "Fotoğraflar ve kayıt yükleniyor…" : "Gözlemi yayınla"}
          </button>
        </div>
      </form>
    </div>
  );
}
