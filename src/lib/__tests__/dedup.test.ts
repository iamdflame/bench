import { describe, expect, it } from "vitest";
import { collapse, collapseRows, productKey } from "@/lib/dedup";
import type { IndexedAgent } from "@/lib/data/agents";

/**
 * The fixture mirrors the shape the real index has, because the shape is the
 * finding: one product minted once per user wallet, so every copy carries a
 * different owner and a different token id and nothing else differs.
 */
const agent = (over: Partial<IndexedAgent> & { tokenId: string }): IndexedAgent => ({
  name: null,
  description: null,
  owner: null,
  imageUrl: null,
  protocols: [],
  x402: false,
  registryScore: null,
  feedbacks: 0,
  avgScore: null,
  createdAt: null,
  category: null,
  confidence: 0,
  matched: [],
  ...over,
});

/** Four registrations of one product, four owners — the q402 pattern. */
const minted = (ids: string[], name: string, description: string): IndexedAgent[] =>
  ids.map((tokenId, i) =>
    agent({ tokenId, name, description, owner: `0x${(i + 1).toString().repeat(4)}` }),
  );

describe("productKey", () => {
  it("ignores the owner, so one product minted per wallet is one product", () => {
    const a = agent({ tokenId: "1", name: "Q402", description: "Gasless", owner: "0xaaaa" });
    const b = agent({ tokenId: "2", name: "Q402", description: "Gasless", owner: "0xbbbb" });
    expect(productKey(a)).toBe(productKey(b));
  });

  it("normalises case and runs of whitespace, and nothing further", () => {
    expect(productKey({ name: "  Q402   Agent ", description: "A\n\nB" })).toBe(
      productKey({ name: "q402 agent", description: "a b" }),
    );
    // Punctuation is left alone: a looser key would invent duplicates.
    expect(productKey({ name: "Ave.ai", description: "x" })).not.toBe(
      productKey({ name: "Aveai", description: "x" }),
    );
  });

  it("keeps name and description in separate positions", () => {
    // Without a separator "ab" + "" and "a" + "b" would collide.
    expect(productKey({ name: "ab", description: null })).not.toBe(
      productKey({ name: "a", description: "b" }),
    );
  });

  it("returns null when the row carries neither name nor description", () => {
    expect(productKey({ name: null, description: null })).toBeNull();
    expect(productKey({ name: "   ", description: "" })).toBeNull();
  });
});

describe("collapse", () => {
  it("counts one product across many owners as one product", () => {
    const d = collapse(minted(["1", "2", "3", "4"], "Q402", "Gasless payments"));
    expect(d.counted).toBe(4);
    expect(d.distinct).toBe(1);
    expect(d.duplicateRows).toBe(3);
    expect(d.collapse).toBe(4);
    expect(d.duplicateShare).toBeCloseTo(0.75);
    expect(d.clusters).toHaveLength(1);
    expect(d.clusters[0].owners).toBe(4);
    expect(d.clusters[0].tokenIds).toEqual(["1", "2", "3", "4"]);
  });

  it("reports a clean register as clean rather than inventing duplicates", () => {
    const d = collapse([
      agent({ tokenId: "1", name: "One", description: "a" }),
      agent({ tokenId: "2", name: "Two", description: "b" }),
    ]);
    expect(d.distinct).toBe(2);
    expect(d.duplicateRows).toBe(0);
    expect(d.collapse).toBe(1);
    expect(d.clusters).toEqual([]);
  });

  it("counts unnamed rows out rather than collapsing them together", () => {
    const d = collapse([
      agent({ tokenId: "1" }),
      agent({ tokenId: "2" }),
      agent({ tokenId: "3", name: "Real", description: "x" }),
    ]);
    // Two rows that say nothing are not thereby the same thing.
    expect(d.unnamed).toBe(2);
    expect(d.counted).toBe(1);
    expect(d.distinct).toBe(1);
    expect(d.duplicateRows).toBe(0);
  });

  it("orders clusters largest first", () => {
    const d = collapse([
      ...minted(["10", "11"], "Small", "s"),
      ...minted(["1", "2", "3"], "Big", "b"),
    ]);
    expect(d.clusters.map((c) => c.count)).toEqual([3, 2]);
    expect(d.clusters[0].name).toBe("Big");
  });

  it("is deterministic under reordering, because the figure is published", () => {
    const rows = [...minted(["3", "1", "2"], "A", "a"), ...minted(["5", "4"], "B", "b")];
    const forward = collapse(rows);
    const backward = collapse([...rows].reverse());
    expect(backward).toEqual(forward);
  });

  it("sorts token ids numerically, so 9 comes before 10", () => {
    const d = collapse(minted(["10", "9", "100"], "A", "a"));
    expect(d.clusters[0].tokenIds).toEqual(["9", "10", "100"]);
  });

  it("handles an empty index without dividing by zero", () => {
    const d = collapse([]);
    expect(d.collapse).toBe(1);
    expect(d.duplicateShare).toBe(0);
  });
});

describe("collapseRows", () => {
  it("keeps the verified endpoint over an earlier token id", () => {
    const rows = collapseRows([
      agent({ tokenId: "1", name: "A", description: "a" }),
      agent({ tokenId: "2", name: "A", description: "a", endpointVerified: true }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].agent.tokenId).toBe("2");
    expect(rows[0].duplicates).toEqual(["1"]);
  });

  it("prefers feedback when neither endpoint is verified", () => {
    const rows = collapseRows([
      agent({ tokenId: "1", name: "A", description: "a" }),
      agent({ tokenId: "2", name: "A", description: "a", feedbacks: 7 }),
    ]);
    expect(rows[0].agent.tokenId).toBe("2");
  });

  it("falls back to the earliest token id, which the copies came after", () => {
    const rows = collapseRows(minted(["30", "4", "12"], "A", "a"));
    expect(rows[0].agent.tokenId).toBe("4");
    expect(rows[0].duplicates).toEqual(["12", "30"]);
  });

  it("discards nothing: every input id is still reachable", () => {
    const input = [...minted(["1", "2", "3"], "A", "a"), agent({ tokenId: "9" })];
    const rows = collapseRows(input);
    const seen = rows.flatMap((r) => [r.agent.tokenId, ...r.duplicates]).sort();
    expect(seen).toEqual(["1", "2", "3", "9"]);
  });

  it("never collapses unnamed rows into each other", () => {
    const rows = collapseRows([agent({ tokenId: "1" }), agent({ tokenId: "2" })]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.duplicates.length === 0)).toBe(true);
  });
});
