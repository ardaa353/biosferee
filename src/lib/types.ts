import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../api/router";

type Outputs = inferRouterOutputs<AppRouter>;
export type BioPost = Outputs["biosfere"]["posts"]["list"][number];
export type BioUser = Outputs["biosfere"]["users"]["list"][number];
export type CurrentUser = NonNullable<Outputs["biosfere"]["auth"]["me"]>;
export type Suggestion = Outputs["biosfere"]["identification"]["forPost"][number];
export const emptyTaxonomy = { kingdom: "Animalia", phylum: "", className: "", orderName: "", family: "", genus: "", species: "", commonName: "" };
export type Taxonomy = typeof emptyTaxonomy;
