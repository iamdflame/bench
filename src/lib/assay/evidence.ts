/**
 * Classification that the chain gets a vote in, and a reason for every
 * agent that does not make it.
 *
 * `categories: []` across the whole ERC-8004 registry means every consumer of
 * it must classify for themselves, so classification quality is a real
 * differentiator rather than plumbing. Everyone else classifies from the text
 * an agent wrote about itself — which is the same self-report this project
 * spends the rest of its time refusing to take at face value.
 *
 * So the chain gets a vote, and it outweighs the text. An agent describing
 * itself as a grid trader whose wallet has never touched a router is telling
 * us about its ambitions. An agent whose wallet calls the position manager
 * every day is telling us what it does.
 *
 * Every signal that moved a decision is kept and shown. A classification a
 * reader cannot audit is a label, and a label is exactly what the registry
 * already offers.
 */

import { CATEGORIES, CATEGORY_EVIDENCE, PROTOCOL_LABEL, type Category } from "@/lib/config";
import { classify, type Classification } from "./classify";

export interface Signal {
  kind: "text" | "chain";
  category: Category;
  detail: string;
  weight: number;
}

export interface EvidencedClassification extends Classification {
  signals: Signal[];
  /** True when the chain agrees with the text, or decided it alone. */
  chainBacked: boolean;
  /**
   * The text claims one category and the chain shows another.
   *
   * Not an accusation. It is usually an agent that grew into a different job
   * than the one it registered for, and it is worth surfacing either way.
   */
  contradicted: boolean;
  /** Where the winning category came from. */
  decidedBy: "chain" | "text" | "neither";
}

/**
 * Chain evidence is worth more than any phrase.
 *
 * The weights are deliberately far apart. A single observed interaction with a
 * category's own contracts should beat a description that names every keyword
 * in the dictionary, because one of them cost gas.
 */
const CHAIN_WEIGHT = 12;

export function classifyWithEvidence(
  input: { name?: string | null; description?: string | null; skills?: string[] | null; tags?: string[] | null },
  touches: { protocol: string; txHash: string }[] = [],
): EvidencedClassification {
  const text = classify(input);
  const signals: Signal[] = [];

  for (const phrase of text.matched) {
    if (text.category) {
      signals.push({ kind: "text", category: text.category, detail: `describes itself as "${phrase}"`, weight: 1 });
    }
  }

  // Which categories does the chain vouch for?
  const seen = new Set(touches.map((t) => t.protocol.toLowerCase()));
  const chainScores = {} as Record<Category, number>;
  for (const category of CATEGORIES) {
    let score = 0;
    for (const protocol of CATEGORY_EVIDENCE[category]) {
      if (seen.has(protocol.toLowerCase())) {
        score += CHAIN_WEIGHT;
        const example = touches.find((t) => t.protocol.toLowerCase() === protocol.toLowerCase());
        signals.push({
          kind: "chain",
          category,
          detail: `its wallet has used ${PROTOCOL_LABEL[protocol.toLowerCase()] ?? protocol}`,
          weight: CHAIN_WEIGHT,
        });
        void example;
      }
    }
    chainScores[category] = score;
  }

  const chainRanked = CATEGORIES.map((c) => [c, chainScores[c]] as const).sort((a, b) => b[1] - a[1]);
  const [chainTop, chainTopScore] = chainRanked[0]!;

  if (chainTopScore === 0) {
    return {
      ...text,
      signals,
      chainBacked: false,
      contradicted: false,
      decidedBy: text.category ? "text" : "neither",
    };
  }

  const contradicted = Boolean(text.category) && text.category !== chainTop;
  // Confidence rises when both agree and falls when only one speaks.
  const agree = text.category === chainTop;
  const confidence = Number(
    Math.min(1, agree ? 0.7 + text.confidence * 0.3 : 0.55 + text.confidence * 0.1).toFixed(3),
  );

  return {
    category: chainTop,
    confidence,
    matched: text.matched,
    scores: text.scores,
    signals,
    chainBacked: true,
    contradicted,
    decidedBy: "chain",
  };
}

// ---------------------------------------------------------------------------
// Exclusion reasons
// ---------------------------------------------------------------------------

export type ExclusionCode =
  | "no-card"
  | "no-endpoint"
  | "endpoint-template"
  | "custody-not-separated"
  | "never-transacted"
  | "unclassified"
  | "never-assayed"
  | "never-bonded";

export interface Exclusion {
  code: ExclusionCode;
  /** One line, in the second person, saying exactly what is missing. */
  reason: string;
  /** What would resolve it, when anything would. */
  remedy: string | null;
  /** The rung this blocks. */
  blocks: number;
}

export interface ExclusionInput {
  name?: string | null;
  description?: string | null;
  owner?: string | null;
  agentWallet?: string | null;
  endpoint?: string | null;
  endpointVerified?: boolean;
  category?: Category | null;
  nonce?: number | null;
  assayed?: boolean;
  bonded?: boolean;
}

/**
 * Why this agent is where it is, in full.
 *
 * MandateX renders an exclusion reason for every candidate that falls out of
 * its pipeline, and it is the right instinct: a directory that silently drops
 * what it cannot verify is indistinguishable from one that never looked.
 * Everything here is a statement about evidence, never about the operator.
 */
export function exclusionsFor(a: ExclusionInput): Exclusion[] {
  const out: Exclusion[] = [];

  if (!a.name && !a.description) {
    out.push({
      code: "no-card",
      reason: "No agent card resolves — the registration carries no name and no description.",
      remedy: "Publish a card at the URI in your ERC-8004 registration.",
      blocks: 1,
    });
  }

  // MandateX reported that some registrations carry an endpoint which is still
  // a literal template — never substituted, so it points at nothing for every
  // agent sharing it. The check is implemented here because it is cheap and
  // the failure is real if present.
  //
  // It is NOT confirmed on live data. A sweep needs the detail endpoint, one
  // call per agent against a 25/min anonymous limit, and it was refusing most
  // requests when this was written: 11 agents came back out of 100 attempted.
  //
  // Of those 11, zero carried a template — and all 11 carried no endpoint at
  // all, which is the more striking number and matches the ladder's 5 verified
  // endpoints in 303,391 registrations. Eleven is far too small to confirm or
  // refute anything, so this stays their finding, implemented and untested,
  // rather than being repeated as though we had checked it.
  if (a.endpoint && /\{agent[_-]?id\}|\{tokenId\}|%7BagentId%7D/i.test(a.endpoint)) {
    out.push({
      code: "endpoint-template",
      reason: "The registered endpoint is an unsubstituted template — it still contains a literal {agentId} placeholder.",
      remedy: "Register the resolved URL rather than the template it was generated from.",
      blocks: 2,
    });
  } else if (!a.endpointVerified) {
    out.push({
      code: "no-endpoint",
      reason: "No endpoint of ours has ever reached it.",
      remedy: "Point the registry at an endpoint that answers; we call it, and the result is not self-reported.",
      blocks: 2,
    });
  }

  if (a.owner && a.agentWallet && a.owner.toLowerCase() === a.agentWallet.toLowerCase()) {
    out.push({
      code: "custody-not-separated",
      reason: "The agent wallet is the owner's wallet, byte for byte — there is no separation of custody.",
      remedy: "Register a distinct wallet for the agent to transact from.",
      blocks: 3,
    });
  }

  if (a.nonce === 0) {
    out.push({
      code: "never-transacted",
      reason: "Its wallet has never sent a transaction, so no capability claim it makes can be supported.",
      remedy: "Transact. There is no way to shortcut this, and that is deliberate.",
      blocks: 3,
    });
  }

  if (!a.category) {
    out.push({
      code: "unclassified",
      reason: "Nothing in its description or its on-chain activity matches any of the four market functions.",
      remedy: "Describe what it does, or use the protocols the job implies — either is enough.",
      blocks: 3,
    });
  }

  if (!a.assayed) {
    out.push({
      code: "never-assayed",
      reason: "No fineness has been published for it on chain.",
      remedy: "Request an assay; the result is published by the adjudicator and is revocable.",
      blocks: 4,
    });
  }

  if (!a.bonded) {
    out.push({
      code: "never-bonded",
      reason: "It has never put its own capital at risk against a mandate.",
      remedy: "Bid on an open mandate, or have an underwriter back it.",
      blocks: 5,
    });
  }

  return out;
}
