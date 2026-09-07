import { describe, expect, it } from "vitest";
import { allShops, shopsForJob, shopByTokenId, shopCounts, operatorCount, CUSTODY_QUOTE } from "@/lib/shops";
import { allowlistFor, allowlistIndex, ALLOWLIST_VERSION } from "@/lib/chain/allowlist";
import { CATEGORY_CALLS } from "@/lib/chain/session";
import { CATEGORIES } from "@/lib/config";

/**
 * The two claims this rebuild is built on, asserted rather than described.
 *
 * One: the boards carry agents somebody else operates, with a working Hire and
 * a row that never borrows credit they have not earned here. Two: the leash a
 * hire signs is published in full, including the half that is withheld, and it
 * cannot drift from what the grant actually carries.
 *
 * Both are the kind of promise that decays quietly. A shop row picks up a
 * fineness during a refactor; a call is added to a category and the published
 * document keeps describing the old one. Neither would throw, and neither would
 * be visible in a screenshot. So they fail a build here instead.
 */

describe("the shops", () => {
  it("lists agents this office does not operate", () => {
    const shops = allShops();
    expect(shops.length).toBeGreaterThan(0);
    expect(operatorCount()).toBeGreaterThan(0);
  });

  it("never claims a bond, a fineness or an alpha for someone else's agent", () => {
    for (const s of allShops()) {
      // The type is the assertion: a ShopAgent has no field in which a score
      // could be carried. If one is ever added, this test is where the reviewer
      // is meant to notice that the row could start borrowing credit.
      expect(Object.keys(s)).not.toContain("fineness");
      expect(Object.keys(s)).not.toContain("bondWei");
      expect(Object.keys(s)).not.toContain("alpha");
    }
  });

  it("quotes a caveat only with something to check it against, or not at all", () => {
    for (const s of allShops()) {
      if (s.caveat && s.caveatSource) expect(s.caveatSource).toMatch(/^https?:\/\//);
    }
    expect(CUSTODY_QUOTE.source).toMatch(/^https?:\/\//);
    expect(CUSTODY_QUOTE.attribution.length).toBeGreaterThan(0);
  });

  it("puts the reachable ones above the silent ones on every board", () => {
    for (const c of CATEGORIES) {
      const rows = shopsForJob(c);
      const firstSilent = rows.findIndex((r) => r.silent);
      if (firstSilent >= 0) {
        expect(rows.slice(firstSilent).every((r) => r.silent)).toBe(true);
      }
    }
  });

  it("counts each shop into exactly one job, and the totals agree", () => {
    const counts = shopCounts();
    const classified = allShops().filter((s) => s.category !== null).length;
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(classified);
  });

  it("resolves the competing operator's rebalancer, which Artifact 1 hires", () => {
    const ranger = shopByTokenId("269706");
    expect(ranger).not.toBeNull();
    expect(ranger!.category).toBe("rebalancing");
    expect(ranger!.silent).toBe(false);
  });
});

describe("the published allowlist", () => {
  it("publishes one document per job, at one version", () => {
    const docs = allowlistIndex();
    expect(docs.map((d) => d.category).sort()).toEqual([...CATEGORIES].sort());
    for (const d of docs) expect(d.version).toBe(ALLOWLIST_VERSION);
  });

  it("describes exactly the calls the grant carries, never more", () => {
    for (const c of CATEGORIES) {
      const doc = allowlistFor(c);
      expect(doc.may.map((m) => m.signature).sort()).toEqual(
        CATEGORY_CALLS[c].map((k) => k.signature).sort(),
      );
    }
  });

  it("publishes the withheld half, with a reason for each", () => {
    for (const c of CATEGORIES) {
      const doc = allowlistFor(c);
      expect(doc.mayNot.length).toBeGreaterThan(0);
      for (const w of doc.mayNot) expect(w.because.length).toBeGreaterThan(10);
    }
  });

  it("never grants a call it also withholds", () => {
    for (const c of CATEGORIES) {
      const doc = allowlistFor(c);
      const granted = new Set(doc.may.map((m) => m.signature));
      for (const w of doc.mayNot) expect(granted.has(w.signature)).toBe(false);
    }
  });

  it("withholds the four ways value leaves a router to an address you did not choose", () => {
    for (const c of ["rebalancing", "grid-trading"] as const) {
      const withheld = allowlistFor(c).mayNot.map((w) => w.signature.split("(")[0]);
      expect(withheld).toContain("sweepToken");
      expect(withheld).toContain("refundETH");
      expect(withheld).toContain("unwrapWETH9");
      expect(withheld).toContain("multicall");
    }
  });

  it("says what binds the recipient on every call that carries one", () => {
    for (const c of CATEGORIES) {
      for (const call of allowlistFor(c).may) {
        if (call.recipient) {
          expect(call.recipient.boundTo).toBe("session owner");
          expect(["session-key", "wrapper", "market"]).toContain(call.recipient.by);
          expect(call.recipient.note.length).toBeGreaterThan(10);
        }
      }
    }
  });

  it("does not claim a wrapper binding while no wrapper is deployed", () => {
    /*
      The one dishonesty available here is claiming the recipient is bound by a
      contract whose address is unset. Without RECIPIENT_BOUND the document must
      report the weaker, true position, and it must not name an address.
    */
    const doc = allowlistFor("rebalancing");
    const wrapperBound = doc.may.some((m) => m.recipient?.by === "wrapper");
    if (!process.env.RECIPIENT_BOUND && !process.env.NEXT_PUBLIC_RECIPIENT_BOUND) {
      expect(wrapperBound).toBe(false);
      expect(doc.binding).toMatch(/until its address is set|target and selector bound/);
    }
  });

  it("states plainly where there is no recipient to bind, rather than inventing one", () => {
    const health = allowlistFor("health-factor");
    expect(health.may.every((m) => m.recipient === null)).toBe(true);
    expect(health.binding).toMatch(/no recipient to bind|no call in this grant takes a destination/i);
  });
});
