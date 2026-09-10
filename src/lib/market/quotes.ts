/**
 * The free previews agents publish, read from the committed census.
 *
 * Kept out of `listing.ts` because a preview is a whole document rather than a
 * signal, and only the agent page ever wants one.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Preview } from "@/lib/x402/quote";

let cached: Record<string, Preview> | null = null;

export function previewFor(tokenId: string): Preview | null {
  if (!cached) {
    try {
      const raw = JSON.parse(
        readFileSync(join(process.cwd(), "src/data/probe.json"), "utf8"),
      ) as { previews?: Record<string, Preview> };
      cached = raw.previews ?? {};
    } catch {
      cached = {};
    }
  }
  return cached[tokenId] ?? null;
}
