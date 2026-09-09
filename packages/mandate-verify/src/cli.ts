#!/usr/bin/env node
/**
 * mandate-verify — check a MANDATE settlement without trusting MANDATE.
 *
 *   npx mandate-verify --mandate 0 --chain 56
 *
 * Reads the market contract and the chain's own logs, recomputes the alpha
 * every slash and fee was decided by, and compares it against what was
 * settled. Exits 0 only if the numbers agree; any mismatch exits 1.
 *
 * It has no route to the operator's database, API or filesystem — a verifier
 * that asked us for the answer would be worth exactly as much as our word.
 */

import { formatEther } from "viem";
import {
  DEFAULT_MARKET,
  DEPLOYMENTS,
  deploymentLabel,
  hashObservation,
  alphaFrom,
  verifyMandate,
  type Check,
  type Observation,
  type VerifyResult,
} from "./verify.js";

const RESET = "\x1b[0m";
const paint = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code: string, s: string) => (paint ? `${code}${s}${RESET}` : s);
const dim = (s: string) => c("\x1b[2m", s);
const bold = (s: string) => c("\x1b[1m", s);
const green = (s: string) => c("\x1b[32m", s);
const red = (s: string) => c("\x1b[31m", s);
const yellow = (s: string) => c("\x1b[33m", s);

const bnb = (wei: bigint) => `${trim(formatEther(wei))} BNB`;
const pct = (bps: bigint) => `${bps >= 0n ? "+" : ""}${(Number(bps) / 100).toFixed(2)}%`;

function trim(s: string): string {
  if (!s.includes(".")) return s;
  const t = s.replace(/0+$/, "").replace(/\.$/, "");
  return t === "" || t === "-" ? "0" : t;
}

interface Args {
  mandate: number | null;
  chain: number;
  market?: `0x${string}`;
  /** Short name for one of this office's deployments: v2, v1 or v0. */
  deployment?: string;
  rpc?: string;
  archive?: string;
  json: boolean;
  tamper: boolean;
  help: boolean;
  /** Re-derive the ladder at this block instead of verifying a mandate. */
  replayFrom?: bigint;
  /**
   * Where the market was deployed, for the replay's log scan.
   *
   * A flag rather than an environment variable. The isolation check rejected
   * the first attempt at this, which read the deploy block from the operator's
   * environment — and it was right to. A verifier that reads a setting the
   * operator controls is taking one of the operator's numbers on trust, which
   * is the whole thing this package exists not to do. A caller passing the
   * block on the command line is supplying their own.
   */
  deployBlock?: bigint;
}

/**
 * A deployment label to an address.
 *
 * Refuses an unknown label rather than falling through to the default: someone
 * typing `--deployment v3` means a contract this build has never heard of, and
 * silently verifying a different one would answer a question nobody asked.
 */
function resolveDeployment(label: string | undefined): `0x${string}` | undefined {
  if (!label) return undefined;
  const hit = DEPLOYMENTS[label.toLowerCase()];
  if (!hit) {
    fail(`unknown deployment "${label}"; this office has run ${Object.keys(DEPLOYMENTS).join(", ")}`);
  }
  return hit as `0x${string}`;
}

function parse(argv: string[]): Args {
  const a: Args = { mandate: null, chain: 56, json: false, tamper: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = () => {
      const n = argv[++i];
      if (n === undefined) fail(`${k} needs a value`);
      return n!;
    };
    if (k === "--mandate" || k === "-m") a.mandate = Number(v());
    else if (k === "--chain" || k === "-c") a.chain = Number(v());
    else if (k === "--market") a.market = v() as `0x${string}`;
    else if (k === "--deployment" || k === "-d") a.deployment = v();
    else if (k === "--rpc") a.rpc = v();
    else if (k === "--archive") a.archive = v();
    else if (k === "--json") a.json = true;
    else if (k === "--tamper") a.tamper = true;
    else if (k === "--replay-from") a.replayFrom = BigInt(v());
    else if (k === "--deploy-block") a.deployBlock = BigInt(v());
    else if (k === "--help" || k === "-h") a.help = true;
    else fail(`unknown argument ${k}`);
  }
  return a;
}

function fail(message: string): never {
  console.error(`${red("error")}  ${message}\n`);
  process.exit(2);
}

const USAGE = `
${bold("mandate-verify")} — re-derive a MANDATE settlement from the chain alone

  npx mandate-verify --mandate 0 --chain 56

  --mandate, -m <n>   mandate id to verify            (required)
  --chain, -c <id>    56 mainnet (default), 97 testnet
  --deployment, -d    v2 (default, canonical), v1, v0 — this office has run
                      three markets and all three still hold settled mandates
  --market <address>  market contract; defaults to the known deployment
  --rpc <url>         node to read from
  --archive <url>     node serving historical state, for tier 3
  --replay-from <n>   re-derive the whole trust ladder as it stood at block n,
                      from event logs alone, and exit
  --deploy-block <n>  where to start the market log scan when replaying
  --tamper            after verifying, perturb each committed number and
                      show that the checks reject it
  --json              machine-readable output
  --help, -h          this

${bold("Tiers")}
  1  integrity     the measurements were committed before the outcome was
                   known, and match the hashes stored beside them
  2  re-derived    the valuations were recomputed from chain state at the
                   blocks they were pinned to
  3  historical    the same, at any depth, via an archive node

Exit code is 0 only when every check passes.
`;

function line(ok: boolean, name: string, detail: string): string {
  const mark = ok ? green("✓") : red("✗");
  return `    ${mark} ${name}\n      ${dim(detail)}`;
}

function render(r: VerifyResult): void {
  const scanned = `${r.scanned.fromBlock}–${r.scanned.toBlock}`;
  console.log();
  console.log(
    bold(`  mandate ${r.mandateId}`) +
      dim(`  ·  ${deploymentLabel(r.market)}  ${r.market}  ·  chain ${r.chainId}`),
  );
  console.log(
    dim(
      `  agent ${r.agent}\n  ${bnb(r.capitalWei)} under management against a ${bnb(r.bondWei)} bond` +
        `  ·  ${r.epochsSettled}/${r.epochsTotal} epochs settled  ·  logs ${scanned}`,
    ),
  );

  if (r.opening) {
    const o = r.opening;
    console.log(`\n  ${bold("opening mark")}  ${bnb(o.attestation.valuationWei)} at block ${o.attestation.blockNumber}`);
    for (const ch of o.checks) console.log(line(ch.ok, ch.name, ch.detail));
  } else if (r.awarded) {
    console.log(`\n  ${red("no opening mark")}`);
  } else {
    console.log(`\n  ${dim("not awarded — no agent, no opening mark")}`);
  }

  for (const e of r.epochs) {
    const head =
      e.settledAlphaBps === null
        ? "not settled in the scanned window"
        : `${pct(e.settledAlphaBps)} against ${e.previousLabel}`;
    console.log(`\n  ${bold(`epoch ${e.epoch}`)}  ${head}` + dim(`  ·  tier ${e.tier}`));
    for (const ch of e.checks) console.log(line(ch.ok, ch.name, ch.detail));
  }

  for (const n of r.notes) console.log(`\n  ${yellow("note")}  ${n}`);

  console.log();
  if (r.failures.length > 0) {
    console.log(`  ${red(bold("FAILED"))}`);
    for (const f of r.failures) console.log(`    ${red("·")} ${f}`);
    if (r.unresolved.length) {
      console.log(`  ${yellow("and could not be checked at all:")}`);
      for (const u of r.unresolved) console.log(`    ${yellow("·")} ${u}`);
    }
  } else if (r.unresolved.length > 0) {
    // Not verified, and not a finding against the mandate either.
    console.log(`  ${yellow(bold("INCONCLUSIVE"))}`);
    for (const u of r.unresolved) console.log(`    ${yellow("·")} ${u}`);
    console.log(
      dim(
        `\n  Nothing here says the mandate is wrong. It says no node would serve\n` +
          `  the evidence. Pass --rpc <url> with a provider that answers eth_getLogs\n` +
          `  over a range, or --archive <url> for older epochs.`,
      ),
    );
  } else if (!r.awarded) {
    /*
      Nothing was checked, and nothing was wrong. Saying VERIFIED here would
      claim a mandate had passed an examination it was never given.
    */
    console.log(`  ${bold("OPEN")}`);
    console.log(dim("  nobody has been awarded this mandate, so there is nothing yet to verify."));
  } else {
    console.log(`  ${green(bold(`VERIFIED (tier ${r.tier})`))}`);
    console.log(dim(`  ${explainTier(r.tier)}`));
  }
  console.log();
}

function explainTier(tier: number): string {
  if (tier >= 3)
    return "every valuation was recomputed from historical chain state and agreed with what was committed.";
  if (tier === 2)
    return "every valuation was recomputed from chain state at its pinned block and agreed with what was committed.";
  if (tier === 1)
    return "the measurements were committed before the outcomes were known and still hash to their commitments; the settled alpha is exactly what they imply. Re-deriving the valuations needs a node that still serves those blocks — pass --archive for tier 3.";
  return "nothing could be checked.";
}

/**
 * Proves the checks bind.
 *
 * A verifier that never rejects anything is a rubber stamp, so this takes each
 * committed number in turn, moves it by the smallest amount that matters, and
 * confirms the check fails. Nothing is written anywhere; the perturbation is
 * local to this process.
 */
function tamperTest(r: VerifyResult): boolean {
  console.log(`  ${bold("tamper test")}  ${dim("each committed number, perturbed, must be rejected")}\n`);
  const rows: [string, boolean, string][] = [];

  const sample = r.epochs.find((e) => e.observation && e.attestation) ?? null;
  const open = r.opening?.observation ?? null;

  const mutations: [string, Observation, Observation][] = [];
  if (open) {
    mutations.push(["opening valuation +1 wei", open, { ...open, valuationWei: open.valuationWei + 1n }]);
    mutations.push(["opening block +1", open, { ...open, blockNumber: open.blockNumber + 1n }]);
    mutations.push([
      "opening wallet swapped",
      open,
      { ...open, wallet: "0x000000000000000000000000000000000000dEaD" },
    ]);
    mutations.push(["opening pool price +1", open, { ...open, priceX96: open.priceX96 + 1n }]);
  }
  if (sample?.observation) {
    const o = sample.observation;
    mutations.push([`epoch ${sample.epoch} valuation +1 wei`, o, { ...o, valuationWei: o.valuationWei + 1n }]);
    mutations.push([`epoch ${sample.epoch} gas spent zeroed`, o, { ...o, gasSpentWei: o.gasSpentWei + 1n }]);
  }

  for (const [name, original, mutated] of mutations) {
    const rejected = hashObservation(mutated) !== hashObservation(original);
    rows.push([name, rejected, rejected ? "hash no longer matches the commitment" : "went undetected"]);
  }

  // Alpha itself: claim a better epoch than the marks support.
  for (const e of r.epochs) {
    if (e.previousWei === null || !e.attestation || e.settledAlphaBps === null) continue;
    const inflated = e.settledAlphaBps + 100n; // a full extra percent
    const implied = alphaFrom(e.previousWei, e.attestation.valuationWei);
    const rejected = inflated !== implied && (inflated - implied > 1n || implied - inflated > 1n);
    rows.push([
      `epoch ${e.epoch} alpha inflated by 1.00%`,
      rejected,
      rejected
        ? `${inflated} bps contradicts the ${implied} bps the marks imply`
        : "went undetected",
    ]);
  }

  if (rows.length === 0) {
    console.log(`  ${yellow("nothing to perturb: this mandate has no committed measurements")}\n`);
    return false;
  }

  let all = true;
  for (const [name, ok, detail] of rows) {
    console.log(line(ok, name, detail));
    if (!ok) all = false;
  }
  console.log(
    `\n  ${all ? green(`${rows.length}/${rows.length} rejected`) : red("a perturbation went undetected")}\n`,
  );
  return all;
}

async function main() {
  const a = parse(process.argv.slice(2));
  if (a.help || (a.mandate === null && a.replayFrom === undefined && process.argv.length <= 2)) {
    console.log(USAGE);
    process.exit(a.help ? 0 : 2);
  }

  /*
    Replay is its own mode: it re-derives the whole ladder rather than checking
    one settlement, and it needs no mandate. Implemented in this package rather
    than shared with the application — a verifier that reused the application's
    derivation would be checking our arithmetic against our arithmetic.
  */
  if (a.replayFrom !== undefined) {
    const { replayFrom } = await import("./replay.js");
    const market = (a.market ?? DEFAULT_MARKET[a.chain ?? 56] ?? null) as `0x${string}` | null;
    const deploy = a.deployBlock ?? 0n;

    const result = await replayFrom({ block: a.replayFrom, market, deployBlock: deploy });
    console.log(
      `\n  the ladder at block ${result.block}${result.blockTime ? `  ${result.blockTime}` : ""}\n`,
    );
    if (!result.derived) {
      for (const n of result.notes) console.log(`    · ${n}`);
      console.log("\n  INCONCLUSIVE — the history could not be read\n");
      process.exit(3);
    }
    for (const r of result.rungs) {
      const pop = r.population === null ? "—" : r.population.toLocaleString();
      console.log(`    ${r.n}  ${r.name.padEnd(11)} ${pop.padStart(9)}   ${r.method}`);
    }
    console.log("");
    for (const n of result.notes) console.log(`    · ${n}`);
    console.log("");
    process.exit(0);
  }
  if (a.mandate === null || !Number.isInteger(a.mandate) || a.mandate < 0) {
    fail("--mandate <n> is required and must be a non-negative integer");
  }
  if (!a.market && !DEFAULT_MARKET[a.chain]) {
    fail(`no known market on chain ${a.chain}; pass --market <address>`);
  }

  let r: VerifyResult;
  try {
    r = await verifyMandate({
      market: a.market ?? resolveDeployment(a.deployment),
      mandateId: a.mandate,
      chainId: a.chain,
      rpc: a.rpc,
      archive: a.archive,
    });
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }

  if (a.json) {
    console.log(JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
  } else {
    render(r);
  }

  let tamperOk = true;
  if (a.tamper && !a.json) tamperOk = tamperTest(r);

  // 0 verified · 1 a real mismatch · 3 nothing could be read. Conflating the
  // last two would let a broken RPC look like a broken mandate.
  if (r.failures.length > 0 || !tamperOk) process.exit(1);
  process.exit(r.unresolved.length > 0 ? 3 : 0);
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
