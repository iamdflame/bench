/**
 * LOCAL DEVELOPMENT ONLY — the alpha here is invented.
 *
 * This drives a market on anvil so the interface has something moving to
 * render while it is being built. The performance it reports is drawn from a
 * gaussian, which is fine against a throwaway chain and is exactly what
 * `src/lib/settlement.ts` exists to replace on a real one: there, alpha is the
 * difference between two on-chain valuations of the same wallet.
 *
 * It refuses to run against BSC. A simulator pointed at mainnet would slash
 * real bonds against random numbers, which is the single worst thing this
 * codebase could do.
 *
 * This is not mock data. It opens real mandates, posts real bonds from real
 * agent accounts, settles real epochs and slashes real balances against a
 * deployed contract. On anvil it runs against a local chain; point it at BSC
 * and the same script drives mainnet.
 *
 *   npm run floor
 *
 * Agents are given distinct temperaments — a steady outperformer, a volatile
 * one, one that decays — because a floor where everyone performs identically
 * shows nothing. The alpha each produces is drawn from its own distribution,
 * then reported by the adjudicator exactly as a real settlement would be.
 */

import { formatEther, parseEther, type Address, type Hex } from "viem";
import {
  MANDATE_MARKET_ABI,
  MARKET_ADDRESS,
  bnb,
  marketChain,
  marketClient,
  readLiveMandates,
  walletFor,
} from "@/lib/chain/market";

if (marketChain.id === 56 || marketChain.id === 97) {
  console.error(
    `refusing to run: this simulator invents alpha and is pointed at chain ${marketChain.id}.\n` +
      "use src/scripts/settle.ts, which measures, for anything that is not anvil.",
  );
  process.exit(1);
}

if (!MARKET_ADDRESS) {
  console.error("MARKET_ADDRESS is not set. Deploy the contract first:");
  console.error("  cd contracts && forge script script/Deploy.s.sol --rpc-url <rpc> --broadcast");
  process.exit(1);
}

/** anvil's deterministic accounts. On a real chain these come from env. */
const ANVIL_KEYS: Hex[] = [
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // 0 deployer / adjudicator
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // 1 principal
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // 2 agent
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // 3 agent
  "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // 4 agent
  "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba", // 5 agent
];

const key = (i: number): Hex => (process.env[`KEY_${i}`] as Hex) ?? ANVIL_KEYS[i];

const adjudicator = walletFor(key(0));
const principal = walletFor(key(1));

interface Persona {
  name: string;
  wallet: ReturnType<typeof walletFor>;
  /** Mean alpha in bps per epoch. */
  mean: number;
  /** Standard deviation in bps. */
  sigma: number;
  /** Per-epoch drift applied to the mean, for agents that decay or improve. */
  drift: number;
  target: number;
  bond: bigint;
}

const AGENTS: Persona[] = [
  {
    name: "Meridian",
    wallet: walletFor(key(2)),
    mean: 180,
    sigma: 90,
    drift: 0,
    target: 150,
    bond: parseEther("2"),
  },
  {
    name: "Corvus",
    wallet: walletFor(key(3)),
    mean: 220,
    sigma: 420,
    drift: 0,
    target: 300,
    bond: parseEther("3"),
  },
  {
    name: "Halcyon",
    wallet: walletFor(key(4)),
    mean: 260,
    sigma: 120,
    drift: -90, // decays: strong early, then gives it back
    target: 250,
    bond: parseEther("2.5"),
  },
  {
    name: "Ferrous",
    wallet: walletFor(key(5)),
    mean: 60,
    sigma: 70,
    drift: 12,
    target: 80,
    bond: parseEther("1.5"),
  },
];

const CATEGORIES = [0, 1, 2, 3] as const;
const CATEGORY_NAMES = ["Rebalancing", "Grid Trading", "Yield Optimisation", "Health Factor"];

const EPOCH_SECONDS = 60;
const isLocal = marketChain.id === 31337;

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** Box-Muller, so alpha is drawn from a distribution rather than a shuffle. */
function gaussian(mean: number, sigma: number) {
  const u = Math.max(Math.random(), 1e-9);
  const v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.round(mean + z * sigma);
}

async function advanceTime(seconds: number) {
  if (!isLocal) return; // real chains keep their own time
  await marketClient.request({
    method: "evm_increaseTime" as never,
    params: [seconds] as never,
  });
  await marketClient.request({ method: "evm_mine" as never, params: [] as never });
}

async function send(
  wallet: ReturnType<typeof walletFor>,
  functionName: string,
  args: unknown[],
  value?: bigint,
) {
  const hash = await wallet.writeContract({
    address: MARKET_ADDRESS,
    abi: MANDATE_MARKET_ABI,
    functionName,
    args,
    value,
    chain: marketChain,
    account: wallet.account!,
  } as never);
  return marketClient.waitForTransactionReceipt({ hash });
}

async function openAndStaff(category: number, capital: bigint, holderIndex: number) {
  const receipt = await send(
    principal,
    "openMandate",
    [category, 200, 2_000, 2_500, EPOCH_SECONDS, 8],
    capital,
  );
  const count = await marketClient.readContract({
    address: MARKET_ADDRESS,
    abi: MANDATE_MARKET_ABI,
    functionName: "mandateCount",
  });
  const id = Number(count) - 1;
  log(
    `mandate ${id} opened · ${CATEGORY_NAMES[category]} · ${formatEther(capital)} BNB` +
      ` · block ${receipt.blockNumber}`,
  );

  // Every agent bids. Losing bids stay live as the succession queue, which is
  // what makes dismissal instant rather than a re-tender.
  //
  // An agent below the market's assay bar is refused here by the contract, so
  // a bid that reverts is the gate working rather than a failure to handle.
  const admitted: number[] = [];
  for (const [i, a] of AGENTS.entries()) {
    try {
      await send(a.wallet, "bid", [BigInt(id), a.target], a.bond);
      admitted.push(i);
      log(`  ${a.name} bids ${formatEther(a.bond)} BNB @ +${(a.target / 100).toFixed(2)}%`);
    } catch (error) {
      const why = /0xff79d86d/.test(String(error))
        ? "below the assay bar"
        : /0xb3f487f9/.test(String(error))
          ? "never assayed"
          : String(error).slice(0, 60);
      log(`  ${a.name} refused — ${why}`);
    }
  }
  if (admitted.length === 0) {
    log("  no agent cleared the bar; mandate stays open");
    return id;
  }

  // A different manager per mandate. Awarding purely on the highest committed
  // target hands every mandate to the same agent, which is a market with one
  // participant — the succession queue is where the competition lives.
  // Bid indices are positions in the mandate's queue, which only contains
  // agents the gate admitted — not positions in AGENTS.
  const slot = holderIndex % admitted.length;
  await send(principal, "award", [BigInt(id), BigInt(slot)]);
  log(`  awarded to ${AGENTS[admitted[slot]].name}`);
  return id;
}

function personaFor(agentAddress: string): Persona | undefined {
  return AGENTS.find(
    (a) => a.wallet.account!.address.toLowerCase() === agentAddress.toLowerCase(),
  );
}

async function settleAll(epochIndex: number) {
  const { live: mandates } = await readLiveMandates();
  for (const m of mandates) {
    if (m.state !== 1) continue; // Active only
    if (m.epochsSettled >= m.epochsTotal) continue;

    const persona = personaFor(m.agent);
    if (!persona) continue;

    // Drift is a tendency, not a ramp. Left uncapped it compounded across
    // hundreds of epochs into alpha no market would produce.
    const drift = Math.max(-600, Math.min(600, persona.drift * (epochIndex % 12)));
    const mean = persona.mean + drift;
    const alpha = Math.max(-9_000, Math.min(9_000, gaussian(mean, persona.sigma)));

    try {
      const receipt = await send(adjudicator, "settleEpoch", [BigInt(m.id), BigInt(alpha)]);
      const dismissed = receipt.logs.length > 1;
      log(
        `  mandate ${m.id} · ${persona.name} · ${alpha >= 0 ? "+" : ""}${(alpha / 100).toFixed(2)}%` +
          (dismissed ? "  ← settled with consequences" : ""),
      );
    } catch (error) {
      log(`  mandate ${m.id} settle failed: ${String(error).slice(0, 90)}`);
    }
  }
}

async function report() {
  const { live: mandates, total } = await readLiveMandates();
  const active = mandates.filter((m) => m.state === 1);
  const capital = mandates.reduce((s, m) => s + m.capital, 0n);
  const bonded = mandates.reduce((s, m) => s + m.bond, 0n);
  log(
    `— ${active.length} active · ${total} opened all-time · ` +
      `${bnb(capital)} BNB under mandate · ${bnb(bonded)} BNB bonded`,
  );
}

// ---------------------------------------------------------------------------

log(`floor simulation · chain ${marketChain.id} · market ${MARKET_ADDRESS}`);

/**
 * Keeps a target number of mandates live.
 *
 * Seeding only when the book is completely empty leaves the floor bare the
 * moment a stray mandate exists that this principal cannot recycle.
 */
const TARGET_LIVE = 4;

async function topUp(seed: number) {
  const { live } = await readLiveMandates();
  const mine = live.filter(
    (m) => m.principal.toLowerCase() === principal.account!.address.toLowerCase(),
  );
  for (let i = mine.length; i < TARGET_LIVE; i++) {
    const c = (seed + i) % 4;
    await openAndStaff(c, parseEther(String(6 + Math.floor(Math.random() * 14))), i);
  }
}

await topUp(0);

/**
 * Retires finished mandates and opens replacements, so the floor is a running
 * market rather than one cohort that plays out and stops. A completed term
 * returns capital to the principal and releases every bond; the replacement
 * re-tenders from scratch.
 */
async function recycle(nextCategory: number) {
  const { live: mandates } = await readLiveMandates();
  const me = principal.account!.address.toLowerCase();
  let opened = 0;
  for (const m of mandates) {
    // Only the principal that opened a mandate can close it, so anything
    // opened by another account is none of this loop's business.
    if (m.principal.toLowerCase() !== me) continue;
    const finished = m.epochsSettled >= m.epochsTotal;
    const stalled = m.state === 0; // dismissed with nobody to take over
    if (m.state === 2 || m.state === 3) continue;
    if (!finished && !stalled) continue;
    try {
      await send(principal, "closeMandate", [BigInt(m.id)]);
      log(`  mandate ${m.id} closed · capital returned, bonds released`);
      const c = (nextCategory + opened) % 4;
      await openAndStaff(c, parseEther(String(6 + Math.floor(Math.random() * 14))), c);
      opened += 1;
    } catch (error) {
      log(`  recycle failed for ${m.id}: ${String(error).slice(0, 80)}`);
    }
  }
  return opened;
}

let epoch = 0;
for (;;) {
  await advanceTime(EPOCH_SECONDS + 5);
  log(`epoch ${epoch}`);
  await settleAll(epoch);
  await recycle(epoch);
  await topUp(epoch);
  await report();
  epoch += 1;

  // On a local chain, keep the floor moving. On a real chain, epochs are real.
  await new Promise((r) => setTimeout(r, isLocal ? 4_000 : EPOCH_SECONDS * 1000));
}
