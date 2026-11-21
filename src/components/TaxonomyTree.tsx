import {useEffect, useState} from "react";
import {Link} from "react-router";
import {ChevronDown, Network} from "lucide-react";
import {rankLabels} from "@contracts/taxonomy";
import {photoUrl} from "@/lib/photoUrls";
import type {TaxonomyNode} from "@/lib/taxonomyTree";
export function TaxonomyBranch({node, depth = 0, searching}: {node: TaxonomyNode; depth?: number; searching: boolean}) {
  const [open, setOpen] = useState(depth === 0 || searching);
  useEffect(() => setOpen(depth === 0 || searching), [searching, depth]);
  return <div className={depth === 0 ? "rounded-2xl border border-[#09352e]/10 bg-white p-3 sm:p-5" : "mt-1"}>
    <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} className="flex min-h-12 w-full items-center gap-2 rounded-lg px-2 text-left hover:bg-[#edf4ed]"><ChevronDown size={16} className={"shrink-0 transition " + (open ? "" : "-rotate-90")} /><span className="min-w-0 flex-1"><span className={"block break-words font-serif text-lg sm:text-xl " + (["genus", "species"].includes(node.rank) ? "italic" : "")}>{node.name}</span><span className="block text-xs text-[#53675f]">{rankLabels[node.rank]} · {node.count.toLocaleString("tr-TR")} gözlem</span></span>{depth === 0 && <Network size={22} className="mr-1 shrink-0 text-[#007f24]" />}</button>
    {open && <div className="ml-2 border-l border-[#c6d9cb] pl-2 sm:pl-4">{node.children.map(child => <TaxonomyBranch key={child.name} node={child} depth={depth + 1} searching={searching} />)}{node.posts.map(post => <Link key={post.id} to={`/gonderi/${post.id}`} className="my-2 flex min-w-0 items-center gap-2 rounded-lg border border-[#09352e]/10 p-2 hover:border-[#007f24]">{post.images[0] && <img src={photoUrl(post.images[0].url, 160)} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" loading="lazy" decoding="async" onError={event => {event.currentTarget.style.display = "none";}} />}<span className="min-w-0"><strong className="block break-words text-sm">{post.commonName || post.species}</strong><span className="block break-words text-xs text-[#53675f]">{post.city} · {post.author.isSystem ? "BioSfere" : "@" + post.author.username}</span></span></Link>)}</div>}
  </div>;
}
