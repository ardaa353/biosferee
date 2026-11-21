import { describe, expect, it } from "vitest";
import { rankFeed, type RankablePost } from "./feedRanking";
const now = Date.UTC(2026, 10, 21);
const post = (
  id: number,
  authorId = id,
  kingdom = "Animalia",
): RankablePost => ({
  id,
  authorId,
  kingdom,
  family: kingdom + "-family",
  genus: kingdom + "-genus",
  species: kingdom + "-species",
  createdAt: new Date(now),
});
describe("Personalized observation feed", () => {
  it("learns taxonomic interests and keeps page ordering stable within a session", () => {
    const candidates = [post(1), post(2, 2, "Plantae"), post(3)];
    const liked = Array.from({ length: 20 }, (_, index) =>
      post(index + 50, 50, "Plantae"),
    );
    const ordered = rankFeed(
      candidates,
      liked,
      new Map(),
      new Set(),
      "session",
      99,
      now,
    );
    expect(ordered[0]).toBe(2);
    expect(
      rankFeed(candidates, liked, new Map(), new Set(), "session", 99, now),
    ).toEqual(ordered);
    expect(new Set(ordered).size).toBe(candidates.length);
  });
  it("mixes authors and reduces recently viewed repetitions", () => {
    const rows = [post(1, 1), post(2, 1), post(3, 1), post(4, 2), post(5, 3)];
    const order = rankFeed(
      rows,
      [],
      new Map([[1, 1000]]),
      new Set(),
      "session",
      99,
      now,
    );
    expect(
      new Set(
        order
          .slice(0, 3)
          .map((id) => rows.find((row) => row.id === id)!.authorId),
      ).size,
    ).toBe(3);
    expect(
      rankFeed(
        [post(1), post(2)],
        [],
        new Map(),
        new Set([1]),
        "session",
        99,
        now,
      )[0],
    ).toBe(2);
  });
  it("bounds reputation influence and explores a different ordering across sessions", () => {
    const rows = Array.from({ length: 30 }, (_, index) => post(index + 1));
    const first = rankFeed(
      rows,
      [],
      new Map([[1, 1000000]]),
      new Set(),
      "first",
      99,
      now,
    );
    const next = rankFeed(
      rows,
      [],
      new Map([[1, 1000000]]),
      new Set(first.slice(0, 8)),
      "next",
      99,
      now,
    );
    expect(next.slice(0, 5)).not.toContain(first[0]);
    expect(next).toHaveLength(30);
  });
});
