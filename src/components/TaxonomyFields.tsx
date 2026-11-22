import { getLocale } from "@/lib/i18n";
import { t as trText } from "@/lib/i18n";
import { useEffect, useRef, useState } from "react";
import { Field, inputClass } from "./BioUI";
import { catalogSearch } from "@/lib/catalog";
import {
  ranks,
  rankLabels,
  type Rank,
  type Taxonomy,
  type TaxonHit,
  type CatalogResponse,
} from "@contracts/taxonomy";
export function TaxonomyFields({
  value,
  edit,
  select,
}: {
  value: Taxonomy;
  edit: (key: keyof Taxonomy, text: string) => void;
  select: (hit: TaxonHit) => void;
}) {
  const [active, setActive] = useState<Rank | null>(null);
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [state, setState] = useState("");
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(blurTimer.current), []);
  function choose(key: Rank, hit: TaxonHit) {
    clearTimeout(blurTimer.current);
    select({
      ...hit,
      taxonomy: {
        ...hit.taxonomy,
        commonName: getLocale() === "en" ? "" : hit.taxonomy.commonName,
        [key]: hit.taxonomy[key] || hit.name,
      },
    });
    setActive(null);
    setData(null);
    setState("");
  }
  const term = active ? value[active].trim() : "";
  const searchable = term.length >= 2 || (active === "kingdom" && !term);
  useEffect(() => {
    if (!active || !searchable) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setData(null);
      setState(trText("Katalog aranıyor…"));
      try {
        const found = await catalogSearch(term, active, controller.signal);
        if (!controller.signal.aborted) {
          setData(found);
          setState(
            found.results.length
              ? ""
              : trText("Eşleşme bulunamadı. Yazdığın adı kullanabilirsin."),
          );
        }
      } catch {
        if (!controller.signal.aborted)
          setState(
            trText("Katalog şu anda açılamıyor. Elle giriş yapabilirsin."),
          );
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [active, term, searchable]);
  return (
    <div className="grid items-start gap-4 sm:grid-cols-2">
      {([...ranks, "commonName"] as const).map((key) => (
        <div
          key={key}
          onBlur={(e) => {
            const container = e.currentTarget;
            if (container.contains(e.relatedTarget)) return;
            clearTimeout(blurTimer.current);
            blurTimer.current = setTimeout(() => {
              if (!container.contains(document.activeElement))
                setActive((current) => (current === key ? null : current));
            }, 160);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setActive(null);
          }}
        >
          <Field
            label={trText(rankLabels[key]) + (key === "species" ? " *" : "")}
          >
            <input
              className={inputClass}
              value={value[key]}
              required={key === "species"}
              autoComplete="off"
              maxLength={
                key === "species" || key === "commonName"
                  ? 200
                  : key === "kingdom"
                    ? 100
                    : 150
              }
              onFocus={() => {
                clearTimeout(blurTimer.current);
                setData(null);
                setState("");
                setActive(key === "commonName" ? null : key);
              }}
              onChange={(e) => {
                setData(null);
                setState("");
                setActive(key === "commonName" ? null : key);
                edit(key, e.target.value);
              }}
            />
          </Field>
          {active === key && searchable && (
            <div className="mt-1 rounded-lg bg-[#f1f6f0] text-sm">
              {state && (
                <p role="status" className="px-3 py-2 text-xs">
                  {trText(state)}
                </p>
              )}
              {data && data.results.length > 0 && (
                <>
                  <p className="px-3 pt-2 text-xs text-[#50665d]">
                    {data.source}
                  </p>
                  <ul className="max-h-52 overflow-auto p-1">
                    {data.results.map((hit) => (
                      <li key={hit.id}>
                        <button
                          type="button"
                          className="w-full rounded-md px-2 py-2 text-left hover:bg-white focus:bg-white"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => choose(key as Rank, hit)}
                        >
                          <i>{hit.name}</i>
                          {getLocale() === "tr" && hit.taxonomy.commonName && (
                            <span> · {hit.taxonomy.commonName}</span>
                          )}{" "}
                          <small>
                            {[hit.taxonomy.kingdom, hit.taxonomy.family]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
