import { describe, expect, it } from "vitest";
import { classifyWithEvidence, exclusionsFor } from "@/lib/assay/evidence";
import { PROTOCOLS } from "@/lib/config";

describe("exclusionsFor", () => {
  const bare = {
    name: null,
    description: null,
    owner: null,
    agentWallet: null,
    endpoint: null,
    endpointVerified: false,
    category: null,
    nonce: null,
    assayed: false,
    bonded: false,
  };

  it("gives a reason and a remedy for everything it withholds", () => {
    const out = exclusionsFor(bare);
    expect(out.length).toBeGreaterThan(0);
    // An exclusion with no remedy is a verdict, and this has no business
    // passing one.
    for (const e of out) {
      expect(e.reason.length).toBeGreaterThan(10);
      expect(e.remedy).toBeTruthy();
      expect(e.blocks).toBeGreaterThan(0);
    }
  });

  it("names the unsubstituted-template case specifically", () => {
    const out = exclusionsFor({ ...bare, name: "x", endpoint: "https://api.example.com/{agentId}/card" });
    expect(out.map((e) => e.code)).toContain("endpoint-template");
    // and does not also claim there is no endpoint, which would be two
    // different accusations for one fact
    expect(out.map((e) => e.code)).not.toContain("no-endpoint");
  });

  it("flags custody only when the two wallets are genuinely identical", () => {
    const same = "0xAbC0000000000000000000000000000000000001";
    const withSame = exclusionsFor({ ...bare, owner: same, agentWallet: same.toLowerCase() });
    expect(withSame.map((e) => e.code)).toContain("custody-not-separated");

    const withDifferent = exclusionsFor({
      ...bare,
      owner: same,
      agentWallet: "0xAbC0000000000000000000000000000000000002",
    });
    expect(withDifferent.map((e) => e.code)).not.toContain("custody-not-separated");
  });

  it("does not treat an unknown nonce as a zero one", () => {
    // A missing check must never become a stated failure.
    const unknown = exclusionsFor({ ...bare, nonce: null });
    expect(unknown.map((e) => e.code)).not.toContain("never-transacted");
    const zero = exclusionsFor({ ...bare, nonce: 0 });
    expect(zero.map((e) => e.code)).toContain("never-transacted");
  });

  it("says nothing is missing when nothing is", () => {
    const out = exclusionsFor({
      name: "Grid",
      description: "grid trading",
      owner: "0xAbC0000000000000000000000000000000000001",
      agentWallet: "0xAbC0000000000000000000000000000000000002",
      endpoint: "https://agent.example.com/card",
      endpointVerified: true,
      category: "grid-trading",
      nonce: 12,
      assayed: true,
      bonded: true,
    });
    expect(out).toHaveLength(0);
  });
});

describe("classifyWithEvidence", () => {
  const text = { name: "Yield Maximiser", description: "vault farming and apy optimiser" };

  it("classifies from text when the chain says nothing", () => {
    const c = classifyWithEvidence(text, []);
    expect(c.decidedBy).toBe("text");
    expect(c.chainBacked).toBe(false);
  });

  it("lets the chain override what an agent says about itself", () => {
    // Describes itself as a yield agent; its wallet only ever swaps.
    const c = classifyWithEvidence(text, [
      { protocol: PROTOCOLS.pancakeV3Router, txHash: "0xabc" },
    ]);
    expect(c.decidedBy).toBe("chain");
    expect(c.category).toBe("grid-trading");
    expect(c.contradicted).toBe(true);
  });

  it("keeps every signal that moved the decision", () => {
    const c = classifyWithEvidence(text, [
      { protocol: PROTOCOLS.venusComptroller, txHash: "0xabc" },
    ]);
    expect(c.signals.some((s) => s.kind === "chain")).toBe(true);
    // A classification a reader cannot audit is a label.
    for (const s of c.signals) expect(s.detail.length).toBeGreaterThan(5);
  });

  it("is more confident when text and chain agree", () => {
    const agreeing = classifyWithEvidence(text, [
      { protocol: PROTOCOLS.venusComptroller, txHash: "0xabc" },
    ]);
    const disagreeing = classifyWithEvidence(text, [
      { protocol: PROTOCOLS.pancakeV3Router, txHash: "0xabc" },
    ]);
    expect(agreeing.confidence).toBeGreaterThan(disagreeing.confidence);
  });
});
