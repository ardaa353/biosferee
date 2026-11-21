export type RankablePost = {
  id: number;
  authorId: number | null;
  kingdom: string | null;
  family: string | null;
  genus: string | null;
  species: string | null;
  createdAt: Date;
};
const interests = ["kingdom", "family", "genus", "species"] as const;
function randomFor(seed: string, id: number) {
  let hash = 2166136261;
  for (const character of seed + ":" + id)
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}
export function rankFeed(
  candidates: RankablePost[],
  liked: RankablePost[],
  reputation: ReadonlyMap<number | null, number>,
  seen: Set<number>,
  seed: string,
  viewerId: number,
  now = Date.now(),
) {
  const frequencies = new Map<string, number>();
  liked.forEach((post, index) => {
    const weight = Math.exp(-index / 60);
    for (const field of interests)
      if (post[field]) {
        const key = field + ":" + post[field];
        frequencies.set(key, (frequencies.get(key) || 0) + weight);
      }
  });
  const likedIds = new Set(liked.map((post) => post.id));
  const remaining = candidates.map((post) => {
    let affinity = 0;
    for (const field of interests)
      affinity +=
        Math.min(1, (frequencies.get(field + ":" + post[field]) || 0) / 4) *
        (field === "kingdom" ? 1 : 1.5);
    const age = Math.max(0, (now - post.createdAt.getTime()) / 86_400_000);
    const quality = Math.min(
      2.5,
      Math.log1p(reputation.get(post.authorId || 0) || 0) * 0.55,
    );
    const discovery = randomFor(seed, post.id);
    return {
      post,
      discovery,
      score:
        affinity +
        quality +
        2.5 * Math.exp(-age / 21) +
        discovery * 3 -
        (seen.has(post.id) ? 5 : 0) -
        (likedIds.has(post.id) ? 1.5 : 0) -
        (post.authorId === viewerId ? 0.8 : 0),
    };
  });
  const result: number[] = [],
    recentAuthors: (number | null)[] = [];
  const authorCounts = new Map<number | null, number>();
  while (remaining.length) {
    const diverse = remaining.filter(
      (item) => !recentAuthors.includes(item.post.authorId),
    );
    const choices = diverse.length ? diverse : remaining;
    const explore = result.length % 5 === 4;
    let selected = choices[0],
      best = -Infinity;
    for (const item of choices) {
      const score =
        (explore
          ? item.discovery * 5 - (seen.has(item.post.id) ? 5 : 0)
          : item.score) -
        (authorCounts.get(item.post.authorId) || 0) * 0.8;
      if (score > best) {
        best = score;
        selected = item;
      }
    }
    result.push(selected.post.id);
    authorCounts.set(
      selected.post.authorId,
      (authorCounts.get(selected.post.authorId) || 0) + 1,
    );
    recentAuthors.push(selected.post.authorId);
    if (recentAuthors.length > 2) recentAuthors.shift();
    remaining.splice(remaining.indexOf(selected), 1);
  }
  return result;
}
