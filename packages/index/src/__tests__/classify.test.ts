/**
 * The classifier, and the false positives that made it necessary.
 *
 * A bare substring test reads `dca` out of "podcast" and `apr` out of
 * "AuraPro816" — both observed on live registry entries, both filing an
 * unrelated agent under a category a buyer is deliberately filtering for. The
 * rule is a prefix test at a word boundary, and these are the cases that rule
 * exists for.
 */

import { describe, expect, it } from "vitest";
import { classify, extractSkills } from "../classify";
import { clusterOrigins, collapseByOrigin, hostOf } from "../origins";

describe("classify", () => {
  it("files an agent by its own words, and says which words", () => {
    const c = classify({
      name: "Range Warden",
      description: "Rebalancing bot that resets a concentrated liquidity position when it goes out of range.",
    });
    expect(c.job.known && c.job.value).toBe("rebalancing");
    expect(c.matched).toContain("rebalanc");
    expect(c.confidence).toBeGreaterThan(0);
  });

  it("does not read DCA out of the middle of another word", () => {
    const c = classify({ name: "Podcast Summariser", description: "A broadcaster of daily podcast digests." });
    expect(c.job.known).toBe(false);
  });

  it("does not read APR out of a name that merely begins with it", () => {
    const c = classify({ name: "AuraPro816", description: "AuraPro816 is an agent. April updates included." });
    expect(c.job.known).toBe(false);
  });

  it("still reads the plural of an acronym, because that is the same signal", () => {
    const c = classify({ name: "Vault router", description: "Finds the best APYs and auto-compounds them." });
    expect(c.job.known && c.job.value).toBe("yield");
  });

  it("refuses rather than guessing when nothing matches, and gives the reason", () => {
    const c = classify({ name: "Weather bot", description: "Tells you the weather." });
    expect(c.job.known).toBe(false);
    expect(c.job.known === false && c.job.reason).toMatch(/matches any of the four jobs/);
  });

  it("refuses when there is nothing at all to read", () => {
    const c = classify({});
    expect(c.job.known === false && c.job.reason).toMatch(/no name, description or skills/);
  });

  /*
    A tie is not a classification. Picking the first alphabetically would put
    the agent on a board a buyer is filtering deliberately, and a wrong row
    costs more than an unclassified one.
  */
  it("refuses a tie rather than picking one", () => {
    const c = classify({
      name: "Everything",
      description: "health factor liquidation collateral ratio and grid trading grid bot grid order",
    });
    if (c.job.known) {
      // Only acceptable if the scores genuinely separated.
      const scores = Object.values(c.scores).sort((a, b) => b - a);
      expect(scores[0]).toBeGreaterThan(scores[1]!);
    } else {
      expect(c.job.reason).toMatch(/equally|matches any/);
    }
  });

  it("reads skills out of a services blob whatever shape it takes", () => {
    expect(
      extractSkills({ a: { skills: ["grid trading"] }, b: { skills: [{ name: "yield farming" }] } }),
    ).toEqual(["grid trading", "yield farming"]);
    expect(extractSkills(null)).toEqual([]);
    expect(extractSkills("nonsense")).toEqual([]);
  });
});

describe("origin clustering", () => {
  it("counts endpoints per host, over the things that declare one", () => {
    const { cohorts, declaring } = clusterOrigins([
      "https://a.example/x",
      "https://a.example/y",
      "https://b.example/z",
      null,
      undefined,
      "not a url",
    ]);
    expect(declaring).toBe(3);
    expect(cohorts[0]!.host).toBe("a.example");
    expect(cohorts[0]!.count).toBe(2);
    // The share is of things with an endpoint, not of everything registered:
    // the other denominator understates concentration by an order of magnitude.
    expect(cohorts[0]!.share).toBeCloseTo(2 / 3);
  });

  it("stops one host dominating a board, and says how many it held back", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ host: "big.example", key: `k${i}` }));
    rows.push({ host: "small.example", key: "s1" });
    const { shown, hidden, hiddenByHost } = collapseByOrigin(rows, (r) => r.host, (r) => r.key, 5);
    expect(shown.filter((r) => r.host === "big.example")).toHaveLength(5);
    expect(shown.some((r) => r.host === "small.example")).toBe(true);
    expect(hidden).toBe(7);
    expect(hiddenByHost.get("big.example")).toBe(7);
  });

  it("treats the same service listed twice as duplication, not as depth", () => {
    const rows = [
      { host: "h.example", key: "same" },
      { host: "h.example", key: "same" },
      { host: "h.example", key: "other" },
    ];
    const { shown, hidden } = collapseByOrigin(rows, (r) => r.host, (r) => r.key, 5);
    expect(shown).toHaveLength(2);
    expect(hidden).toBe(1);
  });

  it("leaves a row with no host alone", () => {
    const rows = [{ host: null, key: "a" }, { host: null, key: "b" }];
    const { shown, hidden } = collapseByOrigin(rows, (r) => r.host, (r) => r.key, 1);
    expect(shown).toHaveLength(2);
    expect(hidden).toBe(0);
  });

  it("reads a host out of a URL, and nothing out of a non-URL", () => {
    expect(hostOf("https://API.Example.com/path")).toBe("api.example.com");
    expect(hostOf("garbage")).toBeNull();
    expect(hostOf(null)).toBeNull();
  });
});
