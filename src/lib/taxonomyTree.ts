import {ranks, rankLabels, type Rank} from "@contracts/taxonomy";
import type {BioPost} from "./types";
export type TaxonomyNode = {name: string; rank: Rank; count: number; children: TaxonomyNode[]; posts: BioPost[]};
export function buildTaxonomyTree(posts: BioPost[], term = ""): TaxonomyNode[] {
  const search = term.trim().toLocaleLowerCase("tr-TR");
  const roots: TaxonomyNode[] = [], indexes = new WeakMap<TaxonomyNode[], Map<string, TaxonomyNode>>();
  for (const post of posts) {
    if (post.status !== "verified" || search && ![...ranks.map(rank => post[rank]), post.commonName].join(" ").toLocaleLowerCase("tr-TR").includes(search)) continue;
    let branch = roots;
    for (const rank of ranks) {
      const name = post[rank]?.trim() || rankLabels[rank] + " belirtilmedi";
      let index = indexes.get(branch);
      if (!index) {index = new Map(); indexes.set(branch, index);}
      let node = index.get(name);
      if (!node) {node = {name, rank, count: 0, children: [], posts: []}; branch.push(node); index.set(name, node);}
      node.count++;
      if (rank === "species") node.posts.push(post);
      branch = node.children;
    }
  }
  const sort = (nodes: TaxonomyNode[]) => {nodes.sort((a, b) => a.name.localeCompare(b.name, "tr")); nodes.forEach(node => sort(node.children));};
  sort(roots); return roots;
}
