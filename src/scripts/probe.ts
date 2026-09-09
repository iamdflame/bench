/**
 * Calls every endpoint the field advertises and records what happened.
 *
 *   npm run probe            probe once and write the result
 *   npm run probe -- --loop  every thirty minutes
 *
 * Rung 2 said "its endpoint answered a call we made" over a number that came
 * from 8004scan's own verification flag. This is the call.
 *
 * The output is committed alongside the field index rather than kept in a
 * database, for the same reason the field is: it is evidence, it is small, and
 * a reader should be able to see the exact reading the site is rendering.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getField } from "@/lib/data/field";
import { probeAll, type ProbeResult } from "@/lib/probe";
import { beat } from "@/lib/heartbeat";

const LOOP = process.argv.includes("--loop");
const INTERVAL_MS = Number(process.env.PROBE_INTERVAL_MS ?? 30 * 60_000);
const HOST = process.env.NEXT_PUBLIC_HOST ?? "https://mandate-coral.vercel.app";

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

interface ProbeIndex {
  at: string;
  /** Endpoints called, whether or not they answered. */
  probed: number;
  /** Endpoints that returned any response at all. */
  answered: number;
  results: ProbeResult[];
}

async function once(cycle: number) {
  const field = getField();

  /*
    Every endpoint the field advertises, plus our own house agents.

    Ours are in the list on purpose. An office that exempted its own endpoints
    from the census it runs on everyone else would be a trade association, and
    if one of ours stops answering the number has to fall.
  */
  const targets = [
    ...field.agents.map((a) => ({
      tokenId: a.tokenId,
      endpoint: a.x402Endpoint ?? a.services[0]?.endpoint ?? null,
    })),
    { tokenId: "house:keeper-a", endpoint: `${HOST}/api/house/keeper-a/status` },
    { tokenId: "house:keeper-b", endpoint: `${HOST}/api/house/keeper-b/status` },
  ];

  log(`probing ${targets.length} endpoints`);
  const results = await probeAll(targets);
  const answered = results.filter((r) => r.answered).length;

  const index: ProbeIndex = {
    at: new Date().toISOString(),
    probed: results.length,
    answered,
    results: results.sort((a, b) => a.tokenId.localeCompare(b.tokenId)),
  };

  writeFileSync(
    join(process.cwd(), "src/data/probe.json"),
    JSON.stringify(index, null, 2) + "\n",
  );

  // The failures, named. A census that only reports its successes is an
  // advertisement.
  for (const r of results.filter((x) => !x.answered)) {
    log(`  ${r.tokenId.padEnd(14)} ${r.error}`);
  }

  log(`${answered} of ${results.length} answered`);
  await beat("probe", cycle, { probed: results.length, answered });
}

async function main() {
  let cycle = 0;
  await once(++cycle);
  if (!LOOP) return;
  log(`looping every ${INTERVAL_MS / 60_000} minutes`);
  for (;;) {
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
    await once(++cycle);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
