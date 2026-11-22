import { trpc } from "@/providers/trpc";
import { useLocale } from "@/lib/i18n";
/** Keep scientific names intact; source English common names from the taxon, not machine translation. */
export default function CommonName({
  taxon,
}: {
  taxon: {
    species?: string | null;
    commonName?: string | null;
    kingdom?: string | null;
  };
}) {
  const language = useLocale();
  const species = taxon.species || "";
  const profile = trpc.biosfere.taxonProfiles.useQuery(
    { language, taxa: [{ species, kingdom: taxon.kingdom || "" }] },
    {
      enabled:
        language === "en" && species.length >= 2 && Boolean(taxon.commonName),
      staleTime: 6 * 60 * 60_000,
      retry: false,
    },
  );
  return (
    <span>
      {language === "en"
        ? profile.data?.[0]?.commonName || species
        : taxon.commonName || species}
    </span>
  );
}
