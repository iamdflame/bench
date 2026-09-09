import { describe, expect, it } from "vitest";
import { CATEGORIES, CATEGORY_EVIDENCE, RUNG_NAMES } from "@/lib/config";
import { CATEGORY_CALLS } from "@/lib/chain/session";

/**
 * `granted ⊆ proven` is only satisfiable if every call a category grants sits
 * on a contract that category's evidence list actually searches. A target
 * absent from the evidence is unprovable *forever* — the agent can perform the
 * action all day and the scan will never look at the contract it used.
 *
 * That was true of Venus vBNB under yield-optimisation and nothing caught it,
 * so it is a test as well as a build step.
 */
describe("granted ⊆ proven is satisfiable", () => {
  for (const category of CATEGORIES) {
    it(`${category}: every granted call is reachable by its own evidence`, () => {
      const evidence = new Set(CATEGORY_EVIDENCE[category].map((a) => a.toLowerCase()));
      const targets = [...new Set(CATEGORY_CALLS[category].map((c) => c.to.toLowerCase()))];
      expect(targets.length).toBeGreaterThan(0);
      for (const t of targets) expect(evidence.has(t)).toBe(true);
    });
  }

  it("binds every permission to a selector, not just a contract", () => {
    // An agent allowed to swap through the V3 router must not thereby be
    // allowed to call sweepToken on it.
    for (const category of CATEGORIES) {
      for (const call of CATEGORY_CALLS[category]) {
        expect(call.signature).toMatch(/^[a-zA-Z0-9_]+\(/);
      }
    }
  });

  it("never grants the same selector on a contract twice", () => {
    for (const category of CATEGORIES) {
      const keys = CATEGORY_CALLS[category].map((c) => `${c.to.toLowerCase()}:${c.signature}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe("the ladder's vocabulary", () => {
  it("names all seven rungs", () => {
    expect(RUNG_NAMES).toHaveLength(7);
    expect(RUNG_NAMES[0]).toBe("Registered");
    expect(RUNG_NAMES[6]).toBe("Settled");
  });
});
