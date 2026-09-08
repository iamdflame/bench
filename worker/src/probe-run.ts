/**
 * The probe cycle: call everything we intend to list, and record what happened.
 *
 * This is where a claim becomes a listing. A registry row with an endpoint is
 * a claim; a row whose endpoint answered a call we made, with a challenge we
 * could pay, is a listing. The difference is one HTTP request and it is the
 * difference between a directory and a marketplace.
 *
 * Ordering is deliberate. Rail 1 is probed for everything with an endpoint,
 * because it is cheap and it is where the real third-party supply is. Rail 2
 * is probed only where Rail 1 showed something alive, because asking a dead
 * host for a quote is a slow way to learn what a fast request already told
 * us. Rail 3 is a chain scan rather than a call, so it is run for the agents
 * a person might actually mandate — the ones with a job and a wallet — rather
 * than for three hundred thousand rows, since each scan is a hundred thousand
 * blocks of logs.
 *
 * Concurrency is bounded. Several hundred strangers' endpoints answered in
 * parallel is a denial of service on ourselves as surely as on them.
 */

import { probeEndpoint, parseChallenge, probeQuote, compareAdvertised } from "@bench/probe";
import { scopeFor, isRefused } from "@bench/rails";
import {
  jobBySlug,
  type Agent,
  type BazaarService,
  type RailState,
  type SupportedChain,
} from "@bench/shared";
import { known } from "@bench/measure";
import { classify } from "@bench/index";
import type { Address } from "viem";

/** How many endpoints we hold open at once. */
const CONCURRENCY = 12;

async function pooled<T, R>(items: T[], n: number, f: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await f(items[i]!);
      }
    }),
  );
  return out;
}

/**
 * Probe one registry agent's Call and Hire rails.
 *
 * The mandate rail is not touched here: it is a chain scan, it is expensive,
 * and it is run separately for the rows where it could matter.
 */
export async function probeAgent(chainId: SupportedChain, agent: Agent): Promise<Agent> {
  const probe = await probeEndpoint(agent.endpoint);
  const now = new Date().toISOString();

  let call: RailState = { available: false, reason: probe.refusal ?? "no-402-challenge" };
  let hire: RailState = { available: false, reason: "not-probed" };

  if (probe.status === 402 && probe.sample) {
    const challenge = parseChallenge(probe.sample, chainId);
    if (!challenge) {
      call = { available: false, reason: "no-402-challenge", detail: "It answered 402 with a body we could not read as a challenge." };
    } else if (!challenge.payable || !challenge.best) {
      call = { available: false, reason: "unpayable-challenge", detail: challenge.unpayableReason ?? undefined };
    } else {
      const r = challenge.best;
      call = {
        available: true,
        price: {
          amount: r.amount!,
          decimals: 18,
          symbol: r.assetSymbol ?? "token",
          asset: r.asset!,
          approxUsd: Number(r.amount!) / 1e18,
        },
        provenAt: now,
        block: 0n,
        evidence: `It answered a live 402 asking ${r.amount} units of ${r.assetSymbol ?? "an asset"} on chain ${r.chainId}.`,
      };
    }
  } else if (probe.refusal === null && probe.status !== null && probe.status < 400) {
    call = {
      available: false,
      reason: "no-402-challenge",
      detail: `It answered ${probe.status} rather than a payment challenge, so there is no priced call to sell.`,
    };
  }

  // Rail 2 only where something is alive at the other end.
  const alive = probe.refusal === null || probe.refusal === "endpoint-404";
  if (alive && agent.job.known) {
    const job = jobBySlug(agent.job.value);
    if (job) {
      const q = await probeQuote(agent.endpoint, job, { chainId });
      hire = q.accepted
        ? {
            available: true,
            price: {
              amount: q.price ?? 0n,
              decimals: 18,
              symbol: "$U",
              asset: (q.currency as Address) ?? ("0x0000000000000000000000000000000000000000" as Address),
              approxUsd: Number(q.price ?? 0n) / 1e18,
            },
            provenAt: q.at,
            block: 0n,
            evidence: q.providerSig
              ? "It returned a signed quote for this job, which is what the escrow's on-chain description anchors."
              : "It returned an accepted quote for this job, unsigned. The terms cannot be anchored on chain without a provider signature.",
          }
        : { available: false, reason: q.refusal ?? "quote-refused", detail: q.reason ?? undefined };
    }
  } else if (!agent.job.known) {
    hire = {
      available: false,
      reason: "no-8183-seller",
      detail: "It is not classified into one of the four jobs, so there is no job specification to request a quote against.",
    };
  }

  return {
    ...agent,
    probe: {
      at: probe.at,
      latencyMs: probe.latencyMs,
      status: probe.status,
      bodyHash: probe.bodyHash,
      identicalAcrossInputs: probe.identicalAcrossInputs,
      refusal: probe.refusal,
    },
    rails: { ...agent.rails, call, hire },
    sources: [...new Set([...agent.sources, "probe" as const])],
    updatedAt: now,
  };
}

/** Probe the mandate rail: a chain scan, not a call. */
export async function probeMandate(chainId: SupportedChain, agent: Agent): Promise<Agent> {
  if (!agent.job.known) {
    return {
      ...agent,
      rails: {
        ...agent.rails,
        mandate: {
          available: false,
          reason: "no-onchain-capability",
          detail: "It is not classified into one of the four jobs, so there is no venue to look for.",
        },
      },
    };
  }
  const wallet = agent.agentWallet ?? agent.owner;
  if (!wallet) {
    return { ...agent, rails: { ...agent.rails, mandate: { available: false, reason: "no-wallet" } } };
  }

  const scope = await scopeFor(chainId, wallet, agent.job.value);
  const mandate: RailState = isRefused(scope)
    ? {
        available: false,
        reason: scope.scan && !scope.scan.complete ? "capability-scan-incomplete" : "no-onchain-capability",
        detail: `${scope.reason.charAt(0).toUpperCase()}${scope.reason.slice(1)}.`,
      }
    : {
        available: true,
        price: {
          amount: 0n,
          decimals: 18,
          symbol: "fee on performance",
          asset: "0x0000000000000000000000000000000000000000" as Address,
          approxUsd: null,
        },
        provenAt: new Date().toISOString(),
        block: scope.scan.toBlock,
        evidence: scope.rationale,
      };

  return { ...agent, rails: { ...agent.rails, mandate }, updatedAt: new Date().toISOString() };
}

/**
 * Probe a B402 service.
 *
 * The listing said something; this records what the endpoint says. Where the
 * two disagree, the disagreement is stored on the row and rendered — it is one
 * of the more useful things this marketplace knows and nobody else is checking
 * it.
 */
export async function probeService(chainId: SupportedChain, service: BazaarService): Promise<BazaarService> {
  const probe = await probeEndpoint(service.resource, { identityCheck: false });
  const now = new Date().toISOString();

  let call: RailState = { available: false, reason: probe.refusal ?? "no-402-challenge" };
  let mismatch: string | null = null;

  if (probe.status === 402 && probe.sample) {
    const challenge = parseChallenge(probe.sample, chainId);
    if (!challenge) {
      call = { available: false, reason: "no-402-challenge", detail: "It answered 402 with a body we could not read as a challenge." };
    } else {
      mismatch = compareAdvertised(service.advertised, challenge);
      if (!challenge.payable || !challenge.best) {
        call = { available: false, reason: "unpayable-challenge", detail: challenge.unpayableReason ?? undefined };
      } else {
        const r = challenge.best;
        call = {
          available: true,
          price: {
            amount: r.amount!,
            decimals: 18,
            symbol: r.assetSymbol ?? "token",
            asset: r.asset!,
            approxUsd: Number(r.amount!) / 1e18,
          },
          provenAt: now,
          block: 0n,
          evidence: `It answered a live 402 asking ${r.amount} units of ${r.assetSymbol ?? "an asset"} on chain ${r.chainId}.`,
        };
      }
    }
  } else if (probe.status !== null && probe.status < 400) {
    call = {
      available: false,
      reason: "no-402-challenge",
      detail: `It answered ${probe.status} without a payment challenge, so there is no priced call here.`,
    };
  }

  const c = classify({ name: service.resource, description: service.description });

  return {
    ...service,
    probe: {
      at: probe.at,
      latencyMs: probe.latencyMs,
      status: probe.status,
      bodyHash: probe.bodyHash,
      identicalAcrossInputs: probe.identicalAcrossInputs,
      refusal: probe.refusal,
    },
    call,
    advertisedMismatch: mismatch,
    job: c.job.known ? known(c.job.value) : service.job,
    updatedAt: now,
  };
}

export async function probeAgents(chainId: SupportedChain, agents: Agent[]): Promise<Agent[]> {
  return pooled(agents, CONCURRENCY, (a) => probeAgent(chainId, a));
}

export async function probeServices(chainId: SupportedChain, services: BazaarService[]): Promise<BazaarService[]> {
  return pooled(services, CONCURRENCY, (s) => probeService(chainId, s));
}

/**
 * Mandate scans, run for a small set.
 *
 * Each one reads hundreds of thousands of blocks of logs, so this is
 * deliberately not run across the register. It is run for the rows a person
 * could plausibly mandate, and everything else keeps `not-probed` — which
 * renders as "we have not checked", not as "it cannot".
 */
export async function probeMandates(chainId: SupportedChain, agents: Agent[], limit = 24): Promise<Agent[]> {
  const eligible = agents.filter((a) => a.job.known && (a.agentWallet ?? a.owner)).slice(0, limit);
  const done = await pooled(eligible, 4, (a) => probeMandate(chainId, a));
  const byId = new Map(done.map((a) => [a.tokenId, a]));
  return agents.map((a) => byId.get(a.tokenId) ?? a);
}
