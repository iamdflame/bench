/**
 * A reference agent's ERC-8004 registration file, at the URL its token points to.
 *
 * registration-v1, with `services` named the way our own assay reads them: an
 * `x402` service the census will call (and get a 402 with a price), an A2A
 * card, the MCP endpoint, and the page that shows its work. Every claim here is
 * one the six checks will test within minutes of the registration landing.
 */

import { NextResponse } from "next/server";
import { referenceBySlug, referenceRegistrations } from "@/lib/house";
import { IDENTITY_REGISTRY } from "@/lib/config";
import { RECIPIENT_BOUND, SWAP_BOUND } from "@/lib/chain/leash";
import { DEMO_ADDRESS } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOST = process.env.NEXT_PUBLIC_HOST ?? "https://mandate-coral.vercel.app";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const agent = referenceBySlug(slug);
  if (!agent) return NextResponse.json({ error: "No reference agent by that name." }, { status: 404 });
  const reg = referenceRegistrations()[slug];
  const leash =
    slug === "range-1"
      ? { contract: RECIPIENT_BOUND, what: "RecipientBound: mint and collect write the principal as recipient" }
      : slug === "grid-1"
        ? { contract: SWAP_BOUND, what: "SwapBound: fixed pair, proceeds only to the principal" }
        : { contract: null, what: "Venus markets whose calls act for the caller; no recipient argument" };

  return NextResponse.json(
    {
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      name: agent.name,
      description: agent.description,
      category: agent.category,
      services: [
        { name: "x402", endpoint: `${HOST}/api/x402/house/${slug}` },
        { name: "A2A", endpoint: `${HOST}/house/${slug}/agent-card.json`, version: "0.3.0" },
        { name: "MCP", endpoint: `${HOST}/api/mcp` },
        { name: "web", endpoint: `${HOST}/desk#${slug}` },
      ],
      x402Support: true,
      active: true,
      registrations: reg ? [{ agentId: Number(reg.tokenId), agentRegistry: `eip155:56:${IDENTITY_REGISTRY}` }] : [],
      supportedTrust: ["crypto-economic"],
      operates: { account: DEMO_ADDRESS, through: "Altana session keys the account's owner granted", leash },
      price: { amount: "0.05", asset: "USD1", scheme: "x402 exact, EIP-3009" },
    },
    { headers: { "cache-control": "public, max-age=60", "access-control-allow-origin": "*" } },
  );
}
