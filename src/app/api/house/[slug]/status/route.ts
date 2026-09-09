/**
 * A house agent answering for itself, out of the contract rather than a file.
 *
 * This is the endpoint its registration points at, so it is the endpoint the
 * assay calls to decide rung 2. It would be trivial to serve a stored summary
 * here and much faster; it reads the market instead, because an agent whose
 * self-report is not derived from the chain is the exact thing the register
 * downgrades everyone else for.
 *
 * The unflattering figures are first. An agent that reports its alpha and
 * omits its strikes has told you the half you would have guessed.
 */

import { houseBySlug } from "@/lib/house";
import { readBook } from "@/lib/chain/book";
import { CATEGORIES, CATEGORY_LABEL, CHAIN_ID } from "@/lib/config";
import { gate, ok, preflight } from "@/lib/api/respond";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = { capacity: 60, windowMs: 60_000 };

export function OPTIONS() {
  return preflight();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const g = gate(request, LIMIT, CHAIN_ID);
  if (!g.allowed) return g.response;

  const { slug } = await params;
  const agent = houseBySlug(slug);
  if (!agent) {
    return NextResponse.json({ error: "No house agent by that name." }, { status: 404 });
  }

  const book = await readBook();
  const mine = book.rows.filter(
    (r) => r.agent.toLowerCase() === agent.wallet.toLowerCase(),
  );

  const strikes = mine.reduce((t, r) => t + r.strikes, 0);
  const alphaBps = mine.reduce((t, r) => t + r.cumulativeAlphaBps, 0n);
  const settled = mine.reduce((t, r) => t + r.epochsSettled, 0);

  return ok(
    {
      agent: {
        name: agent.name,
        tokenId: agent.tokenId,
        wallet: agent.wallet,
        registered: Boolean(agent.tokenId),
      },
      // Strikes and alpha before the totals: the two figures an agent has a
      // reason to leave out.
      record: {
        strikes,
        cumulativeAlphaBps: Number(alphaBps),
        epochsSettled: settled,
        mandatesHeld: mine.length,
        bondAtRiskWei: mine.reduce((t, r) => t + r.bondWei, 0n).toString(),
        capitalUnderMandateWei: mine.reduce((t, r) => t + r.capitalWei, 0n).toString(),
      },
      mandates: mine.map((r) => ({
        deployment: r.deployment.label,
        id: r.id,
        office: CATEGORY_LABEL[CATEGORIES[r.category]!] ?? String(r.category),
        state: r.state,
        capitalWei: r.capitalWei.toString(),
        bondWei: r.bondWei.toString(),
        epochsSettled: r.epochsSettled,
        epochsTotal: r.epochsTotal,
        cumulativeAlphaBps: Number(r.cumulativeAlphaBps),
        strikes: r.strikes,
      })),
      // Named rather than folded into the totals: a partial read must never
      // be presented as a complete one.
      unread: book.unread,
    },
    { chainId: CHAIN_ID, blockNumber: book.blockNumber?.toString() ?? null, at: book.at },
    g.headers,
  );
}
