/**
 * Independent verification of a MANDATE settlement.
 *
 * The rule this file exists to honour: it reads nothing but the chain. No
 * database, no API, no file the operator controls. If verification needed
 * anything from us, it would be the same unverifiable claim the whole product
 * was built to reject — so the package lives outside the application and has no
 * dependency on it, and that is enforced rather than promised.
 */

import {
  createPublicClient,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbi,
  parseAbiItem,
  type Address,
  type PublicClient,
} from "viem";
import { bsc, bscTestnet } from "viem/chains";

export const MARKET_ABI = parseAbi([
  "function openAttestation(uint256) view returns (bytes32 observationHash, uint96 valuationWei, uint64 blockNumber, uint64 takenAt)",
  "function epochAttestation(uint256, uint32) view returns (bytes32 observationHash, uint96 valuationWei, uint64 blockNumber, uint64 takenAt)",
  "function getMandate(uint256) view returns ((address principal, uint96 capital, address agent, uint96 bond, uint8 category, uint8 state, uint16 toleranceBps, uint16 feeBps, uint16 slashBps, uint32 epochLength, uint32 epochsTotal, uint32 epochsSettled, uint64 lastSettledAt, int256 cumulativeAlphaBps, uint32 strikes))",
  "function mandateCount() view returns (uint256)",
]);

/**
 * The v0/v1 observation event.
 *
 * Kept alongside the v2 shape rather than replaced: all three deployments hold
 * mandates with settled epochs, and a verifier that only understands the newest
 * one silently stops being able to check the history it was built to check.
 */
const OBSERVED = parseAbiItem(
  "event Observed(uint256 indexed mandateId, uint32 indexed epoch, bytes32 observationHash, (address wallet, uint96 valuationWei, uint96 gasSpentWei, uint160 priceX96, uint64 blockNumber, bytes32 breakdownRef) observation)",
);

/** The v2 observation event, which carries the benchmark it was judged against. */
const OBSERVED_V2 = parseAbiItem(
  "event Observed(uint256 indexed mandateId, uint32 indexed epoch, bytes32 observationHash, (address wallet, uint96 valuationWei, uint96 gasSpentWei, uint160 priceX96, uint64 blockNumber, bytes32 breakdownRef, uint96 benchmarkWei) observation)",
);

const SETTLED = parseAbiItem(
  "event EpochSettled(uint256 indexed mandateId, uint32 indexed epoch, address indexed agent, int256 realizedAlphaBps, uint96 feePaid, uint96 slashed)",
);

const POOL_ABI = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 a, uint16 b, uint16 c, uint32 d, bool e)",
]);
const ERC20_ABI = parseAbi(["function balanceOf(address) view returns (uint256)"]);

/** The deepest WBNB/USDT V3 pool on BSC — the reference the operator prices with. */
const WBNB_USDT_POOL = "0x36696169C63e42cd08ce11f5deeBbCeBae652050" as const;
const USDT = "0x55d398326f99059fF775485246999027B3197955" as const;

const BPS = 10_000n;
/** The sentinel epoch the opening observation is emitted under. */
export const OPEN_EPOCH = 4_294_967_295;

/** Known deployments, so the common case needs no configuration. */
/**
 * Every market this office has run, by label.
 *
 * There are three live deployments on BNB Smart Chain and all three hold
 * mandates with settled epochs. The site linked one in its footer, printed a
 * second on another page, named a third in its README, and this file defaulted
 * to a fourth answer — so "the market contract" meant something different
 * depending on where you read it.
 *
 * Naming them is the fix. `--deployment v1` is the short form; `--market` still
 * takes any address, because a fork should be able to verify its own market.
 */
export const DEPLOYMENTS: Record<string, Address> = {
  v2: "0x6052C0ab83a99Fb37aC598c23b8E369fB21C71B2",
  v1: "0xeD331c44183EFF1e8eDc31f6C60AfDA187681544",
  v0: "0x4c2BeE70b4Acaf3b242860C9AefF97217D1758EC",
};

/** Which contract an address is, for the header. Unknown addresses say so. */
export function deploymentLabel(address: Address): string {
  const hit = Object.entries(DEPLOYMENTS).find(
    ([, a]) => a.toLowerCase() === address.toLowerCase(),
  );
  return hit ? hit[0] : "unrecognised market";
}

export const DEFAULT_MARKET: Record<number, Address> = {
  56: DEPLOYMENTS.v2!,
};

/**
 * Read endpoints, tried in order.
 *
 * Most public BSC nodes refuse `eth_getLogs` over any real range, and the ones
 * that serve it change: publicnode answered these queries happily and now
 * returns "Archive requests require a personal token" for anything a few hours
 * old. So there is a list rather than an endpoint, and — more importantly — a
 * provider that refuses is never allowed to look like an empty answer.
 */
export const DEFAULT_RPCS: Record<number, string[]> = {
  56: [
    "https://bsc.rpc.blxrbdn.com",
    "https://bsc-dataseed1.binance.org",
    "https://bsc.blockrazor.xyz",
    "https://bsc-rpc.publicnode.com",
  ],
  97: ["https://bsc-testnet-rpc.publicnode.com", "https://bsc-testnet.public.blastapi.io"],
};

/**
 * Providers for `eth_getLogs`, which is a different capability from calls.
 *
 * Measured across thirteen public BSC endpoints: drpc is the only one that
 * answers a ranged log query correctly. blxrbdn returns an empty array for
 * ranges it declines to serve, dataseed refuses outright, publicnode and
 * blockrazor reject the parameters. drpc also rate-limits a public caller
 * within a handful of requests, so it leads this list and does not appear in
 * the call list at all — put it in front of `mandateCount()` and the rate limit
 * arrives before the verification does.
 */
export const DEFAULT_LOG_RPCS: Record<number, string[]> = {
  56: ["https://bsc.drpc.org", ...DEFAULT_RPCS[56]!],
  97: DEFAULT_RPCS[97]!,
};

export const DEFAULT_RPC: Record<number, string> = {
  56: DEFAULT_RPCS[56]![0]!,
  97: DEFAULT_RPCS[97]![0]!,
};

export interface Observation {
  wallet: Address;
  valuationWei: bigint;
  gasSpentWei: bigint;
  priceX96: bigint;
  blockNumber: bigint;
  breakdownRef: `0x${string}`;
  /**
   * The benchmark the epoch was judged against, added in v2.
   *
   * Absent on v1 and v0 observations, which is not a missing field but a
   * different struct: the two shapes hash differently and their events have
   * different topics.
   */
  benchmarkWei?: bigint;
}

export interface Attestation {
  observationHash: `0x${string}`;
  valuationWei: bigint;
  blockNumber: bigint;
  takenAt: bigint;
}

export type Tier = 0 | 1 | 2 | 3;

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
  /**
   * What the check would have to read to be wrong, and therefore what its
   * failure is allowed to mean.
   *
   * `state` is contract storage, read by `eth_call`. Every node serves it, so
   * a failed state check is a finding: the chain positively says otherwise.
   *
   * `log` is an event. A failed log check means "we did not find it", and on
   * BSC that is not the same sentence as "it was not emitted" — of the public
   * providers one refuses `eth_getLogs` over any range, one rejects the
   * parameters outright, and one answers an empty array for windows that
   * demonstrably contain events. An empty answer from a provider that will not
   * admit it is empty because it declined is indistinguishable from an honest
   * nothing, so absence of a log can never convict.
   */
  evidence: "state" | "log";
}

export interface EpochResult {
  epoch: number;
  settledAlphaBps: bigint | null;
  impliedAlphaBps: bigint | null;
  previousWei: bigint | null;
  previousLabel: string;
  attestation: Attestation | null;
  observation: Observation | null;
  rederivedWei: bigint | null;
  tier: Tier;
  checks: Check[];
}

/** The unawarded agent slot, lower-cased for comparison. */
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface VerifyResult {
  market: Address;
  chainId: number;
  mandateId: number;
  agent: Address;
  capitalWei: bigint;
  bondWei: bigint;
  epochsSettled: number;
  epochsTotal: number;
  opening: { attestation: Attestation; observation: Observation | null; checks: Check[] } | null;
  /**
   * A mandate nobody has won yet. It has no agent, so there is nothing it
   * could have committed and nothing to judge it against.
   */
  awarded: boolean;
  epochs: EpochResult[];
  /** The weakest tier any settled epoch reached. */
  tier: Tier;
  ok: boolean;
  failures: string[];
  /** Things that could not be checked, as distinct from things that failed. */
  unresolved: string[];
  scanned: { fromBlock: bigint; toBlock: bigint };
  logGaps: number;
  logWindows: number;
  notes: string[];
}

/**
 * The digest, computed the way the contract computes it.
 *
 * Encoded here from the struct definition rather than fetched by calling
 * `hashObservation` on the market, so a contract that hashed inconsistently
 * would be caught instead of mirrored.
 */
export function hashObservation(o: Observation): `0x${string}` {
  /*
    Two struct shapes, because there are two live contract generations.

    v2 added `benchmarkWei` to the observation, which changes both the event
    topic and the preimage. Hashing a v2 observation with the v1 layout
    produces a hash that matches nothing, and the verifier would report that a
    committed value had been altered — the most serious accusation it can make,
    against a contract that had done nothing wrong.

    The shape is chosen by what the log actually carried, never by which
    contract we think we are talking to.
  */
  const v2 = o.benchmarkWei !== undefined;
  const types = [
    { type: "address" },
    { type: "uint96" },
    { type: "uint96" },
    { type: "uint160" },
    { type: "uint64" },
    { type: "bytes32" },
    ...(v2 ? [{ type: "uint96" }] : []),
  ];
  const values = [
    o.wallet,
    o.valuationWei,
    o.gasSpentWei,
    o.priceX96,
    o.blockNumber,
    o.breakdownRef,
    ...(v2 ? [o.benchmarkWei as bigint] : []),
  ];
  return keccak256(encodeAbiParameters(types as never, values as never));
}

/** Alpha in basis points, in the same integer arithmetic the contract uses. */
export const alphaFrom = (previousWei: bigint, nowWei: bigint): bigint =>
  (nowWei * BPS) / previousWei - BPS;

export function makeClient(chainId: number, rpc?: string): PublicClient {
  const chain = chainId === 97 ? bscTestnet : bsc;
  const url = rpc ?? DEFAULT_RPC[chainId] ?? DEFAULT_RPC[56]!;
  return createPublicClient({ chain, transport: http(url, { timeout: 30_000, retryCount: 2 }) });
}

/** Every endpoint worth trying for logs, caller's choice first. */
/**
 * Log readers, tried in order until one returns something.
 *
 * An explicitly named node is used alone. Someone passing `--rpc` has told the
 * verifier which node to trust — usually their own, often precisely because
 * they do not want the query going anywhere else — and quietly asking four
 * public providers alongside it would both contradict that instruction and
 * broadcast which mandate is being examined. Without the flag, the public list
 * is used, because no single public BSC endpoint answers reliably.
 */
export function makeClients(chainId: number, rpc?: string): PublicClient[] {
  const urls = rpc
    ? [rpc]
    : (DEFAULT_LOG_RPCS[chainId] ?? DEFAULT_LOG_RPCS[56]!);
  return [...new Set(urls)].map((u) => makeClient(chainId, u));
}

/**
 * The observation an attestation actually committed to.
 *
 * Where several were emitted for one epoch, the commitment picks it out: the
 * hash was written to storage before the outcome was known, and only one
 * preimage can produce it. That is the whole mechanism, used here for what it
 * is rather than trusting log ordering.
 *
 * When nothing matches, the first is returned so the mismatch is reported
 * against a concrete value rather than vanishing into "not found" — a
 * contradicted commitment is a finding and must stay one.
 */
function pickPreimage(
  candidates: Observation[] | undefined,
  committed: `0x${string}` | undefined,
): Observation | null {
  if (!candidates || candidates.length === 0) return null;
  if (!committed) return candidates[0]!;
  return candidates.find((o) => hashObservation(o) === committed) ?? candidates[0]!;
}

const abs = (v: bigint) => (v < 0n ? -v : v);
const check = (
  name: string,
  ok: boolean,
  detail: string,
  evidence: Check["evidence"] = "state",
): Check => ({ name, ok, detail, evidence });

/**
 * Re-reads a wallet's value at a past block, from chain state alone.
 *
 * Only possible where the node still serves that state. A node that pruned it
 * errors, and the caller stays at tier 1 rather than pretending otherwise.
 *
 * The valuation lives in `./valuation.ts` and is this package's own — native,
 * every tracked token, V3 positions with their uncollected fees, and Venus
 * supply *and borrow*. It replaced a version that read native BNB and USDT
 * and nothing else, whose comment said it mirrored the operator's conversion.
 * It did, and that was the flaw: it would have confirmed every settlement the
 * operator's blind spots produced. A verifier that reproduces the bug it
 * exists to catch does not fail to help — it certifies the error.
 */
async function rederive(
  client: PublicClient,
  wallet: Address,
  blockNumber: bigint,
): Promise<bigint | null> {
  const { rederiveValue } = await import("./valuation.js");
  const v = await rederiveValue(client, wallet, blockNumber);
  return v ? v.netWei : null;
}

async function readAttestation(
  client: PublicClient,
  market: Address,
  mandateId: number,
  epoch: number | "open",
): Promise<Attestation | null> {
  const r = (await client.readContract({
    address: market,
    abi: MARKET_ABI,
    functionName: epoch === "open" ? "openAttestation" : "epochAttestation",
    args: epoch === "open" ? [BigInt(mandateId)] : [BigInt(mandateId), epoch],
  })) as readonly [`0x${string}`, bigint, bigint, bigint];
  return r[1] === 0n
    ? null
    : { observationHash: r[0], valuationWei: r[1], blockNumber: r[2], takenAt: r[3] };
}

/**
 * Collects this mandate's observations and settlements from the logs.
 *
 * The window is derived from the attestations themselves — the first mark's
 * block to a little past the last — so nothing has to be configured and the
 * scan stays small however old the market gets.
 */
/**
 * One log window, across every provider until one answers.
 *
 * Returns null when they all refuse. That distinction is the whole point: an
 * empty array means "this range contains no such event", and null means "no
 * node would tell me". Collapsing the second into the first is how a verifier
 * reports a sound mandate as broken, which this did until a provider started
 * charging for log history.
 */
async function windowLogs(
  clients: PublicClient[],
  market: Address,
  event: typeof OBSERVED | typeof OBSERVED_V2 | typeof SETTLED,
  mandateId: number,
  from: bigint,
  to: bigint,
): Promise<unknown[] | null> {
  /*
    Keep asking until something is found, rather than trusting the first
    answer.

    This returned whatever the first provider said, and the first provider on
    BSC answers an empty array for ranges it has decided not to serve — no
    error, no indication that it declined. So a window that demonstrably
    contains an Observed event came back empty, the loop stopped, and the
    verifier went on to report that a mandate had no preimage behind a
    commitment it does hold.

    Preferring a non-empty answer is sound rather than merely convenient: a
    provider can omit an event, but it cannot invent one that hashes to a
    commitment already stored on chain. Every log this returns is checked
    against that commitment, so the worst a lying provider can do is fail the
    check it was trying to pass. Omission is the only real attack, and asking
    more providers is exactly the defence against it.
  */
  let refusals = 0;
  let empties = 0;
  for (const client of clients) {
    try {
      const logs = (await client.getLogs({
        address: market,
        event: event as never,
        args: { mandateId: BigInt(mandateId) } as never,
        fromBlock: from,
        toBlock: to,
      })) as unknown[];
      if (logs.length > 0) return logs;
      empties++;
    } catch {
      refusals++;
    }
  }
  // Nobody would serve it at all: unknown, which is not the same as empty.
  if (empties === 0) return null;
  return [];
}

async function collectLogs(
  clients: PublicClient[],
  market: Address,
  mandateId: number,
  from: bigint,
  to: bigint,
): Promise<{
  /**
   * Every observation seen for an epoch, not just the last.
   *
   * An epoch can carry more than one Observed log — a re-observation, a
   * retried transaction, or an event deliberately emitted to muddy the record.
   * Keeping one arbitrarily and comparing it against the commitment made the
   * verifier accuse a contract of tampering because a duplicate existed.
   */
  observed: Map<number, Observation[]>;
  settled: Map<number, bigint>;
  scanned: [bigint, bigint];
  /** Windows no provider would serve. Any gap makes a missing log unprovable. */
  gaps: number;
  windows: number;
}> {
  const observed = new Map<number, Observation[]>();
  const settled = new Map<number, bigint>();
  // Public providers cap log ranges, so the window is walked rather than asked for whole.
  const span = 4_000n;
  let gaps = 0;
  let windows = 0;
  for (let cursor = from; cursor <= to; cursor += span) {
    const end = cursor + span - 1n > to ? to : cursor + span - 1n;
    windows++;
    const [obsV1, obsV2, set] = await Promise.all([
      windowLogs(clients, market, OBSERVED, mandateId, cursor, end),
      windowLogs(clients, market, OBSERVED_V2, mandateId, cursor, end),
      windowLogs(clients, market, SETTLED, mandateId, cursor, end),
    ]);
    if ((obsV1 === null && obsV2 === null) || set === null) {
      gaps++;
      continue;
    }
    const obs = [...(obsV1 ?? []), ...(obsV2 ?? [])];
    for (const l of obs) {
      const a = (l as { args: { epoch?: number; observation?: Observation } }).args;
      if (a.epoch === undefined || !a.observation) continue;
      const key = Number(a.epoch);
      const list = observed.get(key) ?? [];
      list.push(a.observation);
      observed.set(key, list);
    }
    for (const l of set) {
      const a = (l as { args: { epoch?: number; realizedAlphaBps?: bigint } }).args;
      if (a.epoch === undefined || a.realizedAlphaBps === undefined) continue;
      settled.set(Number(a.epoch), a.realizedAlphaBps);
    }
  }
  return { observed, settled, scanned: [from, to], gaps, windows };
}

export interface VerifyOptions {
  market?: Address;
  mandateId: number;
  chainId: number;
  rpc?: string;
  /** A node that serves historical state, for tier 3. */
  archive?: string;
  /** Blocks of slack either side of the attested window. */
  margin?: bigint;
}

export async function verifyMandate(opts: VerifyOptions): Promise<VerifyResult> {
  const chainId = opts.chainId;
  const market = opts.market ?? DEFAULT_MARKET[chainId];
  if (!market) throw new Error(`no known market on chain ${chainId}; pass --market`);

  const client = makeClient(chainId, opts.rpc);
  const logReaders = makeClients(chainId, opts.rpc);
  const archiveClient = opts.archive ? makeClient(chainId, opts.archive) : null;
  const failures: string[] = [];
  const unresolved: string[] = [];
  const notes: string[] = [];

  const count = (await client.readContract({
    address: market,
    abi: MARKET_ABI,
    functionName: "mandateCount",
  })) as bigint;
  if (BigInt(opts.mandateId) >= count) {
    throw new Error(`mandate ${opts.mandateId} does not exist; the market holds ${count}`);
  }

  const m = (await client.readContract({
    address: market,
    abi: MARKET_ABI,
    functionName: "getMandate",
    args: [BigInt(opts.mandateId)],
  })) as Record<string, unknown>;
  const epochsSettled = Number(m.epochsSettled);

  // Every committed mark, straight from storage.
  const openAtt = await readAttestation(client, market, opts.mandateId, "open");
  const epochAtts: (Attestation | null)[] = [];
  for (let e = 0; e < epochsSettled; e++) {
    epochAtts.push(await readAttestation(client, market, opts.mandateId, e));
  }

  // The scan window locates itself from the marks.
  const margin = opts.margin ?? 600n;
  const blocks = [openAtt, ...epochAtts].filter(Boolean).map((a) => a!.blockNumber);
  const head = await client.getBlockNumber();
  const from = blocks.length ? (blocks.reduce((a, b) => (a < b ? a : b)) - margin) : head - 5_000n;
  const to = blocks.length
    ? min(blocks.reduce((a, b) => (a > b ? a : b)) + margin, head)
    : head;

  const { observed, settled, scanned, gaps, windows } = await collectLogs(
    logReaders,
    market,
    opts.mandateId,
    from < 0n ? 0n : from,
    to,
  );

  // ---- the opening mark ------------------------------------------------
  let opening: VerifyResult["opening"] = null;
  const awarded = (m.agent as Address).toLowerCase() !== ZERO_ADDRESS;
  if (!openAtt) {
    /*
      A missing opening mark means opposite things either side of the award.

      On an awarded mandate it is the worst finding the verifier has: capital
      is being managed against nothing, so no settlement can ever be checked.
      On a mandate nobody has bid for, it is simply what an unstarted mandate
      looks like — there is no agent to have committed anything.

      Reporting the second as FAILED is what this did, on two of the four live
      mandates, and it costs more than a wrong word. The exit code is the whole
      product: a CI job that greps for non-zero learns to ignore it once it
      fires on a healthy open mandate, and by then it will not be read when it
      is right.
    */
    if (awarded) {
      failures.push(
        "no opening attestation: nothing was committed for this mandate to be judged against",
      );
    } else {
      notes.push(
        "this mandate has not been awarded, so there is no agent, no opening mark and nothing yet to verify",
      );
    }
  } else {
    const obs = pickPreimage(observed.get(OPEN_EPOCH), openAtt.observationHash);
    const checks: Check[] = [];
    checks.push(
      check(
        "opening preimage present",
        !!obs,
        obs ? `emitted in an Observed log at block ${obs.blockNumber}` : "not found in the logs",
        "log",
      ),
    );
    if (!obs && gaps > 0) {
      unresolved.push(
        `opening: no provider would serve ${gaps} of ${windows} log windows, so a missing preimage cannot be told from an unreadable one`,
      );
    }
    if (obs) {
      const h = hashObservation(obs);
      checks.push(
        check(
          "opening hash matches its commitment",
          h === openAtt.observationHash,
          `${h.slice(0, 18)}… vs ${openAtt.observationHash.slice(0, 18)}…`,
        ),
      );
      checks.push(
        check(
          "opening value matches its commitment",
          obs.valuationWei === openAtt.valuationWei,
          `${obs.valuationWei} wei vs ${openAtt.valuationWei} wei stored`,
        ),
      );
      checks.push(
        check(
          "opening block matches its commitment",
          obs.blockNumber === openAtt.blockNumber,
          `block ${obs.blockNumber} vs ${openAtt.blockNumber} stored`,
        ),
      );
    }
    for (const c of checks) {
      if (c.ok) continue;
      if (c.evidence === "log") {
        unresolved.push(`opening: ${c.name} — ${c.detail}`);
        continue;
      }
      failures.push(`opening: ${c.name} — ${c.detail}`);
    }
    opening = { attestation: openAtt, observation: obs, checks };
  }

  // ---- each settled epoch ----------------------------------------------
  const epochs: EpochResult[] = [];
  let weakest: Tier = 3;

  for (let e = 0; e < epochsSettled; e++) {
    const checks: Check[] = [];
    const att = epochAtts[e];
    const obs = pickPreimage(observed.get(e), att?.observationHash);
    const settledAlpha = settled.has(e) ? settled.get(e)! : null;

    checks.push(check("attestation stored", !!att, att ? `${att.valuationWei} wei at block ${att.blockNumber}` : "storage holds nothing for this epoch"));
    checks.push(
      check(
        "preimage in the logs",
        !!obs,
        obs ? `wallet ${obs.wallet}` : "no Observed log for this epoch",
        "log",
      ),
    );
    checks.push(
      check(
        "settlement event found",
        settledAlpha !== null,
        settledAlpha !== null
          ? `EpochSettled reported ${settledAlpha} bps`
          : "no EpochSettled log in the scanned window",
        "log",
      ),
    );

    if (att && obs) {
      const h = hashObservation(obs);
      checks.push(check("hash matches its commitment", h === att.observationHash, `${h.slice(0, 18)}… vs ${att.observationHash.slice(0, 18)}…`));
      checks.push(check("value matches its commitment", obs.valuationWei === att.valuationWei, `${obs.valuationWei} wei vs ${att.valuationWei} stored`));
      checks.push(check("block matches its commitment", obs.blockNumber === att.blockNumber, `block ${obs.blockNumber} vs ${att.blockNumber} stored`));
    }

    // The mark this epoch is measured against.
    const prev = e === 0 ? openAtt : epochAtts[e - 1];
    const previousLabel = e === 0 ? "the opening mark" : `epoch ${e - 1}`;
    const previousWei = prev?.valuationWei ?? null;

    const implied =
      previousWei && previousWei > 0n && att ? alphaFrom(previousWei, att.valuationWei) : null;

    if (implied === null) {
      checks.push(check("alpha derivable", false, `${previousLabel} is unavailable, so the ratio cannot be formed`));
    } else if (settledAlpha === null) {
      checks.push(check("alpha derivable", true, `the two marks imply ${implied} bps`));
      /*
        There is nothing to compare against, which is a different sentence from
        "the comparison came out wrong". The settlement event is a log, so its
        absence carries a log's authority — none. When the event is present and
        the alpha contradicts what the marks imply, the same check convicts,
        which is how `--tamper` catches an inflated alpha.
      */
      checks.push(
        check(
          "settled alpha matches the marks",
          false,
          "no settlement event to compare against",
          "log",
        ),
      );
    } else {
      // The contract tolerates a basis point of integer rounding; so does this.
      const ok = abs(settledAlpha - implied) <= 1n;
      checks.push(
        check(
          "settled alpha matches the marks",
          ok,
          ok
            ? `${settledAlpha} bps, re-derived independently from ${previousLabel} (${previousWei} wei → ${att!.valuationWei} wei)`
            : `settled ${settledAlpha} bps but ${previousWei} wei → ${att!.valuationWei} wei implies ${implied} bps`,
        ),
      );
    }

    // ---- tier 2/3: recompute the valuation from chain state -------------
    let rederivedWei: bigint | null = null;
    let tier: Tier = obs && att ? 1 : 0;
    if (obs) {
      const source = archiveClient ?? client;
      rederivedWei = await rederive(source, obs.wallet, obs.blockNumber);
      if (rederivedWei === null) {
        notes.push(
          `epoch ${e}: state at block ${obs.blockNumber} is no longer served, so the valuation was not re-derived` +
            (archiveClient ? "" : " — pass --archive <url> for tier 3"),
        );
      } else {
        // A wei or two of drift is the price conversion's rounding, not a lie.
        const slack = obs.valuationWei / 10_000n + 2n;
        const ok = abs(rederivedWei - obs.valuationWei) <= slack;
        checks.push(
          check(
            "valuation re-derived from chain state",
            ok,
            ok
              ? `${rederivedWei} wei read back at block ${obs.blockNumber}`
              : `committed ${obs.valuationWei} wei, the chain shows ${rederivedWei} at block ${obs.blockNumber}`,
          ),
        );
        if (tier > 0) tier = archiveClient ? 3 : 2;
      }
    }

    if (gaps > 0 && (!obs || settledAlpha === null)) {
      unresolved.push(
        `epoch ${e}: ${gaps} of ${windows} log windows were refused by every provider`,
      );
    }
    for (const c of checks) {
      if (c.ok) continue;
      if (c.evidence === "log") {
        unresolved.push(`epoch ${e}: ${c.name} — ${c.detail}`);
        continue;
      }
      failures.push(`epoch ${e}: ${c.name} — ${c.detail}`);
    }
    if (tier < weakest) weakest = tier;

    epochs.push({
      epoch: e,
      settledAlphaBps: settledAlpha,
      impliedAlphaBps: implied,
      previousWei,
      previousLabel,
      attestation: att,
      observation: obs,
      rederivedWei,
      tier,
      checks,
    });
  }

  if (epochsSettled === 0) {
    weakest = opening ? 1 : 0;
    notes.push("no epochs have settled yet; only the opening mark could be checked");
  }

  return {
    market,
    chainId,
    mandateId: opts.mandateId,
    agent: m.agent as Address,
    awarded,
    capitalWei: m.capital as bigint,
    bondWei: m.bond as bigint,
    epochsSettled,
    epochsTotal: Number(m.epochsTotal),
    opening,
    epochs,
    tier: weakest,
    ok: failures.length === 0 && unresolved.length === 0,
    failures,
    unresolved,
    scanned: { fromBlock: scanned[0], toBlock: scanned[1] },
    logGaps: gaps,
    logWindows: windows,
    notes,
  };
}

const min = (a: bigint, b: bigint) => (a < b ? a : b);
