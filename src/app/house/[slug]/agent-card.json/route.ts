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
import { houseBySlug, referenceBySlug, referenceRegistrations } from "@/lib/house";
import { HOUSE_SERVICES } from "@/lib/house/services";
import { CATEGORY_LABEL } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOST = process.env.NEXT_PUBLIC_HOST ?? "https://mandate-coral.vercel.app";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const ref = referenceBySlug(slug);
  if (ref) {
    const service = HOUSE_SERVICES[slug];
    const reg = referenceRegistrations()[slug];
    return NextResponse.json(
      {
        protocolVersion: "0.3.0",
        name: ref.name,
        description: ref.description,
        url: `${HOST}/api/x402/house/${slug}`,
        version: "1.0.0",
        documentationUrl: `${HOST}/desk#${slug}`,
        provider: { organization: "MANDATE", url: HOST },
        capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: false },
        defaultInputModes: ["application/json"],
        defaultOutputModes: ["application/json"],
        skills: [
          {
            id: slug,
            name: service?.name ?? ref.name,
            description: `${service?.description ?? ref.description} Paid over x402: 0.05 USD1, EIP-3009, answered with 402 then the work.`,
            tags: ["erc-8004", "bsc", "x402", ref.category],
            examples: [`GET ${HOST}/api/x402/house/${slug}${service?.inputs[0] ? `?${service.inputs[0].name}=...` : ""}`],
            inputModes: ["application/json"],
            outputModes: ["application/json"],
          },
        ],
        registrations: reg ? [{ agentId: reg.tokenId, agentAddress: reg.owner, chainId: 56 }] : [],
      },
      { headers: { "cache-control": "public, max-age=60", "access-control-allow-origin": "*" } },
    );
  }
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
            "Returns every mandate this agent holds, the bond at risk against each, epochs settled, running alpha and strikes, read from the market contract at the block named in the response, not reported by the agent.",
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
