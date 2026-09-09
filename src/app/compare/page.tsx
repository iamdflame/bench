import type { Metadata } from "next";
import SiteHeader from "@/components/shell/SiteHeader";
import SiteFooter from "@/components/shell/SiteFooter";
import Observation from "@/components/ui/Observation";
import Command from "@/components/ui/Command";
import CategoryMark from "@/components/mark/CategoryMark";
import Fineness from "@/components/mark/Fineness";
import TokenLookup from "@/components/ui/TokenLookup";
import { resolveAgent, type AgentRecord } from "@/lib/agent-record";
import { placeAgent, readMarketSets, type MarketSets } from "@/lib/rung";
import { CATEGORY_LABEL, CHAIN_ID, EXPLORER, RUNG_NAMES } from "@/lib/config";
import { MARKET_ADDRESS, marketClient } from "@/lib/chain/market";

export const revalidate = 30;

export const metadata: Metadata = {
  title: "Compare two agents — MANDATE",
  description:
    "Two ERC-8004 token ids on BNB Smart Chain, side by side, on the same tests at the same block. Absence of evidence is shown as absence, not as a low score.",
};

/**
 * Two agents, side by side, on the same tests at the same block.
 *
 * A register sorts; it does not answer "which of these two". Somebody choosing
 * between the best-known agent in a category and the one that actually holds a
 * bond is doing the thing this office exists for, and they were being asked to
 * open two tabs and hold the numbers in their head.
 *
 * Every row is a test both agents were put through, not a feature matrix. Where
 * a test could not be run for one of them the cell says so rather than showing
 * a zero, because "we could not measure this" and "this measured nothing" are
 * different claims and a comparison is exactly where conflating them decides
 * something.
 */

interface Side {
  tokenId: string;
  agent: AgentRecord | null;
  rung: number | null;
  rungReason: string | null;
  fineness: number | null;
  bondWei: bigint;
  alphaBps: bigint;
  epochsSettled: number;
  mandates: number;
}

async function read(tokenId: string | null, sets: MarketSets): Promise<Side | null> {
  if (!tokenId || !/^\d{1,20}$/.test(tokenId)) return null;
  const agent = await resolveAgent(tokenId).catch(() => null);
  if (!agent) {
    return {
      tokenId,
      agent: null,
      rung: null,
      rungReason: null,
      fineness: null,
      bondWei: 0n,
      alphaBps: 0n,
      epochsSettled: 0,
      mandates: 0,
    };
  }
  const place = placeAgent({ ...agent, rung: undefined }, sets);
  const st = agent.owner ? sets.standing.get(agent.owner.toLowerCase()) : undefined;
  return {
    tokenId,
    agent,
    rung: sets.read ? place.rung : null,
    rungReason: place.reason,
    fineness: st?.fineness ?? null,
    bondWei: st?.bondWei ?? 0n,
    alphaBps: st?.alphaBps ?? 0n,
    epochsSettled: st?.epochsSettled ?? 0,
    mandates: st?.mandates ?? 0,
  };
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a, b } = await searchParams;
  const sets = await readMarketSets();
  const [left, right] = await Promise.all([read(a ?? null, sets), read(b ?? null, sets)]);

  let blockNumber: string | null = null;
  try {
    blockNumber = (await marketClient.getBlockNumber()).toString();
  } catch {
    blockNumber = null;
  }

  const both = left && right;

  return (
    <div className="app">
      <SiteHeader current="/agents" />
      <main className="shell section">
        <div className="section__head">
          <h1 className="section-title">Compare</h1>
          <Observation size="small" block={blockNumber ?? undefined} at={new Date().toISOString()} />
        </div>
        <p className="section-sub" style={{ maxWidth: "72ch" }}>
          Two ERC-8004 token ids, on the same tests, read at the same block. Where a
          test could not be run for one of them the cell says so — a comparison is
          exactly where &ldquo;could not be measured&rdquo; and &ldquo;measured
          nothing&rdquo; must not be allowed to look the same.
        </p>

        {both ? (
          <div className="cmp">
            <table className="tbl cmp__tbl">
              <thead>
                <tr>
                  <th scope="col">test</th>
                  <th scope="col">
                    <Head side={left} />
                  </th>
                  <th scope="col">
                    <Head side={right} />
                  </th>
                </tr>
              </thead>
              <tbody>
                <Row
                  label="Exists in the registry"
                  l={left.agent ? "yes" : "no — ownerOf reverts"}
                  r={right.agent ? "yes" : "no — ownerOf reverts"}
                />
                <Row
                  label="Card resolves"
                  l={cardCell(left)}
                  r={cardCell(right)}
                />
                <Row label="Office" l={officeCell(left)} r={officeCell(right)} />
                <Row
                  label="Endpoint answered a call we made"
                  l={left.agent?.endpointVerified ? "yes" : "not yet"}
                  r={right.agent?.endpointVerified ? "yes" : "not yet"}
                />
                <Row
                  label="Ladder rung"
                  l={left.rung === null ? "chain unread" : `${left.rung} · ${RUNG_NAMES[left.rung]}`}
                  r={right.rung === null ? "chain unread" : `${right.rung} · ${RUNG_NAMES[right.rung]}`}
                />
                <Row
                  label="Fineness on chain"
                  l={left.fineness === null ? "never assayed" : String(left.fineness)}
                  r={right.fineness === null ? "never assayed" : String(right.fineness)}
                  num
                />
                <Row
                  label="Mandates held"
                  l={String(left.mandates)}
                  r={String(right.mandates)}
                  num
                />
                <Row
                  label="Bond at risk"
                  l={left.mandates ? `${bnb(left.bondWei)} BNB` : "none"}
                  r={right.mandates ? `${bnb(right.bondWei)} BNB` : "none"}
                  num
                />
                <Row
                  label="Epochs settled"
                  l={String(left.epochsSettled)}
                  r={String(right.epochsSettled)}
                  num
                />
                <Row
                  label="Cumulative alpha"
                  l={left.epochsSettled ? alpha(left.alphaBps) : "no settled epoch"}
                  r={right.epochsSettled ? alpha(right.alphaBps) : "no settled epoch"}
                  num
                />
                <Row
                  label="Can take a mandate today"
                  l={verdict(left)}
                  r={verdict(right)}
                />
              </tbody>
            </table>

            <p className="section-sub">
              Neither column is a score. The only rows that cost anybody anything are
              the last four: a bond can be slashed, and an epoch settles against a
              measurement committed before the outcome was known.
            </p>

            <Command>{`npx mandate-verify --chain 56 --deployment v2 --mandate 0`}</Command>
          </div>
        ) : (
          <div className="cmp cmp--empty">
            <p className="section-sub">
              Give two token ids: <span className="num">/compare?a=269703&amp;b=336161</span>.
              Any id in the registry works, whether or not this office has crawled it.
            </p>
            <TokenLookup label="Open one agent" cta="Open →" />
          </div>
        )}
      </main>
      <SiteFooter
        market={MARKET_ADDRESS}
        note={`Both columns read from BNB Smart Chain at the block above · identity from ERC-8004, standing from the market contract · chain ${CHAIN_ID}`}
      />
    </div>
  );
}

function Head({ side }: { side: Side }) {
  return (
    <span className="cmp__head">
      <Fineness fineness={side.fineness ?? 0} size={20} />
      <a className="cmp__name" href={`/agent/${side.tokenId}`}>
        {side.agent?.name ?? `Agent ${side.tokenId}`}
      </a>
      <span className="mark-label num">
        {side.agent?.owner ? (
          <a
            href={`${EXPLORER}/address/${side.agent.owner}`}
            target="_blank"
            rel="noreferrer"
          >
            {side.agent.owner.slice(0, 10)}…{side.agent.owner.slice(-4)}
          </a>
        ) : (
          "no holder"
        )}
      </span>
    </span>
  );
}

function Row({
  label,
  l,
  r,
  num,
}: {
  label: string;
  l: React.ReactNode;
  r: React.ReactNode;
  num?: boolean;
}) {
  return (
    <tr>
      <th scope="row" className="mark-label cmp__label">
        {label}
      </th>
      <td className={num ? "num" : undefined}>{l}</td>
      <td className={num ? "num" : undefined}>{r}</td>
    </tr>
  );
}

const cardCell = (s: Side) =>
  !s.agent
    ? "—"
    : s.agent.chain?.cardError
      ? `no — ${s.agent.chain.cardError}`
      : s.agent.name
        ? `yes, from ${s.agent.chain?.cardSource === "data-uri" ? "the registration itself" : "its URL"}`
        : "no card";

const officeCell = (s: Side) =>
  s.agent?.category ? (
    <span className="cmp__office">
      <CategoryMark category={s.agent.category} size={16} metal="var(--pewter-500)" />
      {CATEGORY_LABEL[s.agent.category]}
    </span>
  ) : (
    "unclassified"
  );

/*
  The one row that is a recommendation, and it is the contract's, not ours.
*/
const verdict = (s: Side) =>
  s.rung === null
    ? "the market could not be read"
    : s.rung >= 5
      ? "yes — it already holds one"
      : s.rung === 4
        ? "yes — assayed above the bar, never bid"
        : "no — the market requires a bond it has never posted";

const bnb = (wei: bigint) => (Number(wei) / 1e18).toFixed(5);
const alpha = (bps: bigint) => `${bps > 0n ? "+" : ""}${(Number(bps) / 100).toFixed(2)}%`;
