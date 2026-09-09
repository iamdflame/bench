/**
 * Search across the full index, server side.
 *
 * The index is ~2MB. Handing it to a client component would serialise all of
 * it into the RSC payload and ship it to every visitor to support a text box.
 * The page therefore receives only the classified agents it renders, and
 * search queries the rest here.
 */

import { searchAgents } from "@/lib/data/agents";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.trim().length < 2) return Response.json({ agents: [] });
  return Response.json(
    { agents: searchAgents(q, 48) },
    { headers: { "cache-control": "public, max-age=60" } },
  );
}
