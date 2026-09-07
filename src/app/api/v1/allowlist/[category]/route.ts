/**
 * The leash, as a document a machine can read.
 *
 * A hire is an allowlist, so the allowlist is published rather than described.
 * This is the same object the ticket renders into English, served at a stable
 * URL, so a counterparty can diff what we say on the page against what the
 * grant carries without taking a screenshot of either.
 *
 * It carries the withheld calls too. An allowlist that publishes only its
 * permissions is telling you half of what it does.
 */

import { NextResponse } from "next/server";
import { allowlistFor, allowlistIndex } from "@/lib/chain/allowlist";
import { CATEGORIES, type Category } from "@/lib/config";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ category: string }> },
) {
  const { category } = await params;
  if (category === "all") {
    return NextResponse.json({ allowlists: allowlistIndex() });
  }
  if (!CATEGORIES.includes(category as Category)) {
    return NextResponse.json(
      { error: `Unknown category. One of: ${CATEGORIES.join(", ")}, or "all".` },
      { status: 404 },
    );
  }
  return NextResponse.json(allowlistFor(category as Category));
}
