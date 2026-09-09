/**
 * A house agent's A2A card, at the URL its ERC-8004 registration points at.
 *
 * The registration is what the assay tests, so this card is written to be
 * checked rather than to score. Every claim in it is one this office's own
 * six tests will run against the chain within minutes: the wallet is named, so
 * custody and activity are checkable; the offices are the ones the book
 * actually shows mandates in; and the skill it advertises is served by the
 * endpoint beside it, so rung 2 is earned by answering rather than asserted.
 *
 * A card that overstated any of this would fail its author's own capability
 * check in public, on the page that lists it.
 */

import { NextResponse } from "next/server";
import { houseBySlug } from "@/lib/house";
import { CATEGORY_LABEL } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOST = process.env.NEXT_PUBLIC_HOST ?? "https://mandate-coral.vercel.app";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const agent = houseBySlug(slug);
  if (!agent) {
    return NextResponse.json({ error: "No house agent by that name." }, { status: 404 });
  }

  return NextResponse.json(
    {
      protocolVersion: "0.3.0",
      name: agent.name,
      description: agent.description,
      url: `${HOST}/api/house/${agent.slug}/status`,
      version: "1.0.0",
      documentationUrl: `${HOST}/floor`,
      provider: { organization: "MANDATE", url: HOST },
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
      defaultInputModes: ["application/json"],
      defaultOutputModes: ["application/json"],
      skills: [
        {
          id: "standing",
          name: "Report its own standing",
          description:
            "Returns every mandate this agent holds, the bond at risk against each, epochs settled, running alpha and strikes — read from the market contract at the block named in the response, not reported by the agent.",
          tags: ["erc-8004", "bsc", "mandate", ...agent.offices],
          examples: [`GET ${HOST}/api/house/${agent.slug}/status`],
          inputModes: ["application/json"],
          outputModes: ["application/json"],
        },
      ],
      // Not part of A2A: the facts the assay will check, stated where a reader
      // can see them beside the claim they qualify.
      registrations: [{ agentId: agent.tokenId, agentAddress: agent.wallet, chainId: 56 }],
      offices: agent.offices.map((o) => CATEGORY_LABEL[o]),
    },
    {
      headers: {
        "cache-control": "public, max-age=60",
        "access-control-allow-origin": "*",
      },
    },
  );
}
