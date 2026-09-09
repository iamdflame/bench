/**
 * The eight agents we field, evaluated live.
 *
 * Runs every roster strategy in dry mode against the chain on request and
 * returns what each observed, alongside its deployment status and any session
 * authority it currently holds. Nothing is sent: this is the read side.
 *
 * Showing the observation rather than a status badge is deliberate. "Healthy"
 * tells a visitor nothing; "Venus pays 0.06% APR and moving 0.000195 BNB would
 * earn less than the gas to move it" tells them the agent is reasoning. An agent
 * with no wallet still dry-runs against a reference wallet, labelled as such,
 * so its reasoning is visible before it is ever funded.
 */

import type { Address } from "viem";
import { CATEGORY_LABEL } from "@/lib/config";
import { ROSTER } from "@/agents/roster";
import { buildContext } from "@/agents/registry";
import { loadMeta } from "@/lib/chain/session";
import { readOpenAttestation } from "@/lib/settlement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REFERENCE_WALLET = (process.env.AGENT_A_ADDR ??
  "0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90") as Address;

/** Which mandate each deployed primary is currently attached to, if any. */
const MANDATE_FOR: Record<string, number> = {
  "range-keeper-i": 0,
  "health-shield-i": 1,
  "grid-runner-i": 2,
};

export async function GET() {
  const now = Math.floor(Date.now() / 1000);

  const agents = await Promise.all(
    ROSTER.map(async (r) => {
      const mandateId = MANDATE_FOR[r.slug] ?? 0;
      const session = r.wallet && mandateId ? loadMeta(mandateId) : null;
      const deployed = Boolean(r.wallet);
      const wallet = (session?.walletAddress ?? r.wallet ?? REFERENCE_WALLET) as Address;
      const capWei = session ? BigInt(session.capWei) : 500_000_000_000_000n;

      const base = {
        slug: r.slug,
        name: r.name,
        category: r.category,
        label: CATEGORY_LABEL[r.category],
        tier: r.tier,
        describes: r.strategy.describe(),
        proof: r.proof,
        deployed,
        walletMode: deployed ? "own wallet" : "reference wallet (ready, not yet funded)",
        wallet,
        mandateId: deployed ? mandateId : null,
        session: session
          ? {
              key: session.sessionKey,
              allowlist: session.allowlist,
              capBnb: Number(session.capWei) / 1e18,
              expiresIn: Math.max(0, session.expiry - now),
              registered: session.registered,
              revoked: Boolean((session as { revokedAt?: string }).revokedAt),
            }
          : null,
        benchmark: deployed
          ? await readOpenAttestation(mandateId)
              .then((a) => (a ? { openBnb: Number(a.valuationWei) / 1e18, block: String(a.blockNumber) } : null))
              .catch(() => null)
          : null,
      };

      try {
        const ctx = await buildContext({ category: r.category, wallet, capWei, mandateId });
        const decision = await r.strategy.evaluate(ctx);
        return {
          ...base,
          managingBnb: ctx.valuation.bnb,
          priceUsd: ctx.price.token0PerToken1,
          observed: decision.observed,
          actions: decision.actions.map((a) => ({ kind: a.kind, reason: a.reason, expect: a.expect, to: a.call.address, call: a.call.functionName })),
        };
      } catch (error) {
        return { ...base, managingBnb: null, priceUsd: null, observed: `could not evaluate: ${String(error).slice(0, 140)}`, actions: [] };
      }
    }),
  );

  return Response.json(
    { at: new Date().toISOString(), count: agents.length, agents },
    { headers: { "cache-control": "no-store" } },
  );
}
