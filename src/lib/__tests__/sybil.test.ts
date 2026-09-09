import { describe, expect, it } from "vitest";
import { detectCoordination, profileReviewers, SYBIL_DEFAULTS } from "@/lib/sybil/detect";
import type { ScanFeedback } from "@/lib/sources/scan";

/**
 * Timestamps are spaced deliberately.
 *
 * The burst rule flags a median gap under a minute as machine cadence, and it
 * is right to: a first draft of this fixture stamped forty reviews with one
 * instant and was correctly flagged. A test whose data could not occur is not
 * a test of anything.
 */
const HOUR = 3_600_000;
const fb = (user: string, agent: string, i: number): ScanFeedback =>
  ({
    id: `${user}-${agent}-${i}`,
    feedback_id: `${i}`,
    chain_id: 56,
    user_address: user,
    transaction_hash: `0x${i}`,
    block_number: 1,
    score: null,
    value: 90,
    comment: "",
    feedback_uri: null,
    tag1: null,
    tag2: null,
    is_revoked: false,
    submitted_at: new Date(1_700_000_000_000 + i * HOUR).toISOString(),
    agent: { token_id: agent, chain_id: 56 },
  }) as unknown as ScanFeedback;

describe("reviewer profiling", () => {
  it("counts each wallet once however many reviews it left", () => {
    const corpus = [fb("0xa", "1", 1), fb("0xa", "2", 2), fb("0xb", "1", 3)];
    const profiles = profileReviewers(corpus);
    expect(profiles.size).toBe(2);
    expect(profiles.get("0xa")!.feedbackCount).toBe(2);
    expect(profiles.get("0xa")!.agents.size).toBe(2);
  });
});

describe("coordination detection", () => {
  /**
   * A cohort is wallets reviewing near-identical sets at near-identical
   * volume. One wallet reviewing a lot is a busy wallet, not a ring, and
   * flagging it would be the kind of false positive that makes the whole
   * finding dismissible.
   */
  it("does not flag a single prolific reviewer", () => {
    const corpus = Array.from({ length: 40 }, (_, i) => fb("0xbusy", String(i), i));
    const flags = detectCoordination(profileReviewers(corpus));
    expect(Object.keys(flags)).toHaveLength(0);
  });

  it("flags wallets that review the same set at the same volume", () => {
    const corpus: ScanFeedback[] = [];
    for (const who of ["0x1", "0x2", "0x3", "0x4"]) {
      for (let i = 0; i < 30; i++) corpus.push(fb(who, String(i), i));
    }
    const flags = detectCoordination(profileReviewers(corpus));
    expect(Object.keys(flags).length).toBeGreaterThanOrEqual(3);
  });

  it("exposes its thresholds so a finding can be pressure-tested", () => {
    // A result that only survives one setting of a constant is a property of
    // the constant.
    expect(SYBIL_DEFAULTS.jaccard).toBeGreaterThan(0);
    expect(SYBIL_DEFAULTS.cohortMin).toBeGreaterThanOrEqual(3);

    const corpus: ScanFeedback[] = [];
    for (const who of ["0x1", "0x2", "0x3", "0x4"]) {
      for (let i = 0; i < 30; i++) corpus.push(fb(who, String(i), i));
    }
    const profiles = profileReviewers(corpus);
    const strict = detectCoordination(profiles, { jaccard: 0.95 });
    const loose = detectCoordination(profiles, { jaccard: 0.2 });
    expect(Object.keys(loose).length).toBeGreaterThanOrEqual(Object.keys(strict).length);
  });
});
