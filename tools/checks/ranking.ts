/**
 * The gate that matters most.
 *
 * **A first-party agent never outranks a better-measured third party.**
 *
 * The whole failure mode of this product category is a marketplace that
 * quietly favours its own supply, and a rule stated in a README is not a
 * defence — it is a sentence somebody will contradict in six months with a
 * one-line sort tweak nobody reviews carefully.
 *
 * So the rule is executable. This constructs a third-party row that measures
 * better than one of ours on every axis the ranking function reads, sorts
 * them, and fails the build if ours comes first. It also checks the inverse —
 * that a *worse* third party does not somehow beat us — so the test cannot be
 * passed by a sort that ignores quality entirely.
 */

import { rank, type Row } from "../../apps/web/lib/board";

function row(over: Partial<Row>): Row {
  return {
    key: "k",
    kind: "agent",
    name: "Agent",
    description: "",
    tokenId: "1",
    address: null,
    href: "/a/56/1",
    job: "rebalancing",
    jobReason: null,
    rails: {
      call: { open: false, reason: "not-probed", detail: null, price: null },
      hire: { open: false, reason: "not-probed", detail: null, price: null },
      mandate: { open: false, reason: "not-probed", detail: null, price: null },
    },
    track: null,
    trackMissing: null,
    probedAt: new Date().toISOString(),
    latencyMs: 10,
    freshness: "fresh",
    originHost: null,
    originCohortSize: 1,
    isOurs: false,
    mismatch: null,
    ...over,
  };
}

const open = (price: string) => ({ open: true as const, reason: null, detail: null, price });
const track = { label: "Time in range", value: "94.2%", basis: "27 of 29", provenance: "block 1 · 30d" };

let failed = 0;
const fail = (msg: string) => {
  console.error(`  FAIL  ${msg}`);
  failed++;
};
const pass = (msg: string) => console.log(`  ok    ${msg}`);

console.log("\nranking: our own agents never outrank a better third party\n");

/* -------------------------------------------------- 1. more rails open wins */
{
  const ours = row({ key: "ours", name: "Ours", isOurs: true, rails: { call: open("0.01"), hire: { open: false, reason: "quote-refused", detail: null, price: null }, mandate: { open: false, reason: "not-probed", detail: null, price: null } } });
  const theirs = row({ key: "theirs", name: "Theirs", isOurs: false, rails: { call: open("0.01"), hire: open("0.50"), mandate: open("fee") } });
  const sorted = rank([ours, theirs], "hireable");
  if (sorted[0]?.key !== "theirs") fail("a third party with three open rails ranks below ours with one");
  else pass("more open rails wins, whoever operates it");
}

/* ------------------------------------------------- 2. a track record wins */
{
  const ours = row({ key: "ours", name: "Ours", isOurs: true, rails: { call: open("0.01"), hire: { open: false, reason: "x", detail: null, price: null }, mandate: { open: false, reason: "x", detail: null, price: null } }, track: null });
  const theirs = row({ key: "theirs", name: "Theirs", isOurs: false, rails: { call: open("0.01"), hire: { open: false, reason: "x", detail: null, price: null }, mandate: { open: false, reason: "x", detail: null, price: null } }, track });
  const sorted = rank([ours, theirs], "track");
  if (sorted[0]?.key !== "theirs") fail("a third party with a measured track record ranks below ours with none");
  else pass("a measured track record wins, whoever operates it");
}

/* ---------------------------------------------------- 3. fresher wins */
{
  const stale = new Date(Date.now() - 3 * 3600_000).toISOString();
  const ours = row({ key: "ours", isOurs: true, freshness: "stale", probedAt: stale, rails: { call: open("0.01"), hire: { open: false, reason: "x", detail: null, price: null }, mandate: { open: false, reason: "x", detail: null, price: null } } });
  const theirs = row({ key: "theirs", isOurs: false, freshness: "fresh", rails: { call: open("0.01"), hire: { open: false, reason: "x", detail: null, price: null }, mandate: { open: false, reason: "x", detail: null, price: null } } });
  const sorted = rank([ours, theirs], "fresh");
  if (sorted[0]?.key !== "theirs") fail("a freshly checked third party ranks below our stale one");
  else pass("a fresher reading wins, whoever operates it");
}

/* --------------------------------------------- 4. cheaper wins on price */
{
  const ours = row({ key: "ours", isOurs: true, rails: { call: open("0.50"), hire: { open: false, reason: "x", detail: null, price: null }, mandate: { open: false, reason: "x", detail: null, price: null } } });
  const theirs = row({ key: "theirs", isOurs: false, rails: { call: open("0.01"), hire: { open: false, reason: "x", detail: null, price: null }, mandate: { open: false, reason: "x", detail: null, price: null } } });
  const sorted = rank([ours, theirs], "price");
  if (sorted[0]?.key !== "theirs") fail("a cheaper third party ranks below our dearer one");
  else pass("the cheaper open rail wins, whoever operates it");
}

/*
  5. The inverse.

  Without this the whole file could be satisfied by a sort that always puts
  third parties first, which would be a different lie in the other direction.
*/
{
  const ours = row({ key: "ours", isOurs: true, rails: { call: open("0.01"), hire: open("0.50"), mandate: open("fee") }, track });
  const theirs = row({ key: "theirs", isOurs: false, rails: { call: open("0.01"), hire: { open: false, reason: "x", detail: null, price: null }, mandate: { open: false, reason: "x", detail: null, price: null } } });
  const sorted = rank([theirs, ours], "hireable");
  if (sorted[0]?.key !== "ours") fail("a better-measured first-party agent is being penalised for being ours");
  else pass("ours does win when ours is genuinely better — the rule is quality, not ownership");
}

/*
  6. The source, read rather than trusted.

  The four cases above test behaviour; this tests that there is no ownership
  term to behave differently in the first place. A future sort that added
  `isOurs` as a tiebreak could pass every case above by accident on the data
  they happen to use, and would be caught here.
*/
{
  const src = await import("node:fs").then((fs) =>
    fs.readFileSync(new URL("../../apps/web/lib/board.ts", import.meta.url), "utf8"),
  );
  const start = src.indexOf("export function rank(");
  const end = src.indexOf("\n}", start);
  const body = src.slice(start, end);
  if (/isOurs/.test(body)) fail("the ranking function mentions isOurs, so ownership can influence order");
  else pass("the ranking function contains no ownership term at all");
}

console.log(
  failed === 0
    ? "\n  6 passed. Ranking is decided by what was measured, not by who operates it.\n"
    : `\n  ${failed} failed.\n`,
);
process.exit(failed > 0 ? 1 : 0);
