import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicClient, http, formatEther } from "viem";
import { bsc } from "viem/chains";
import SiteHeader from "@/components/shell/SiteHeader";
import SiteFooter from "@/components/shell/SiteFooter";
import Observation from "@/components/ui/Observation";
import Command from "@/components/ui/Command";
import { MANDATE_MARKET_ABI } from "@/lib/chain/abi";
import { DEPLOYMENTS, addressUrl, CANONICAL } from "@/lib/chain/deployments";
import { CATEGORY_NAMES, STATE_NAMES, MARKET_ADDRESS } from "@/lib/chain/market";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * A ledger on a deployment that is no longer canonical.
 *
 * This office has run three markets and every one of them still holds mandates
 * with settled epochs — including the grid mandate that lost 21%. The register
 * and the office pages link to all of them, so those links needed somewhere to
 * land; without this page they were dead ends, which is the one thing the
 * front of this site is not allowed to have.
 *
 * Deleting the older books instead would have been easier and would have meant
 * a market that stops displaying its worst result the moment it redeploys.
 */

const deploymentFor = (label: string) =>
  DEPLOYMENTS.find((d) => d.label === label.toLowerCase()) ?? null;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ deployment: string; id: string }>;
}): Promise<Metadata> {
  const { deployment, id } = await params;
  return {
    title: `Mandate ${id} on ${deployment} — the ledger — MANDATE`,
    description: `Mandate ${id} as it stands on the ${deployment} deployment of the market, read from the contract.`,
  };
}

export default async function SupersededLedger({
  params,
}: {
  params: Promise<{ deployment: string; id: string }>;
}) {
  const { deployment, id } = await params;
  const d = deploymentFor(deployment);
  if (!d || !/^\d{1,6}$/.test(id)) notFound();

  // The canonical deployment keeps the short URL; sending it here would give
  // the same mandate two addresses on this site.
  if (d.status === "canonical") notFound();

  const client = createPublicClient({
    chain: bsc,
    transport: http(process.env.MARKET_RPC_URL || "https://bsc-dataseed1.binance.org", {
      timeout: 12_000,
    }),
  });

  interface MandateRead {
    principal: `0x${string}`;
    capital: bigint;
    agent: `0x${string}`;
    bond: bigint;
    category: number;
    state: number;
    epochsTotal: number;
    epochsSettled: number;
    cumulativeAlphaBps: bigint;
    strikes: number;
  }
  let m: MandateRead | null = null;
  let blockNumber: bigint | null = null;
  /*
    `notFound()` signals by throwing, so it must not sit inside the catch that
    handles an unreachable node. It did, and the catch swallowed it: a request
    for mandate 99 on a contract holding four rendered a page of blanks with a
    200 rather than a 404. The two outcomes are kept apart — a mandate that does
    not exist, and a chain that would not answer.
  */
  let exists: boolean | null = null;
  try {
    const count = Number(
      await client.readContract({
        address: d.address,
        abi: MANDATE_MARKET_ABI,
        functionName: "mandateCount",
      }),
    );
    exists = Number(id) < count;
    if (exists) {
      const [raw, bn] = await Promise.all([
        client.readContract({
          address: d.address,
          abi: MANDATE_MARKET_ABI,
          functionName: "getMandate",
          args: [BigInt(id)],
        }),
        client.getBlockNumber(),
      ]);
      m = raw as unknown as MandateRead;
      blockNumber = bn;
    }
  } catch {
    // Unreadable, which is not the same as absent.
    exists = null;
    m = null;
  }
  if (exists === false) notFound();

  const ZERO = "0x0000000000000000000000000000000000000000";

  return (
    <div className="app">
      <SiteHeader current="/floor" live status={`${d.label} ledger`} />
      <main>
        <section className="section shell">
          <p className="mark-label superseded__flag">
            Superseded deployment · {d.label}
          </p>
          <h1 className="section-title">Mandate {id}</h1>
          <p className="section-sub" style={{ maxWidth: "72ch" }}>
            {d.note} New mandates open on{" "}
            <a href={addressUrl(CANONICAL.address, CANONICAL.chainId)}>the canonical market</a>.
            This ledger is kept readable because the epochs it settled really happened,
            and a market that hides its earlier books when it redeploys is doing the thing
            this office exists to catch.
          </p>
        </section>

        {!m ? (
          <section className="section shell">
            <p className="section-sub">
              The chain would not answer for this mandate just now, so nothing is shown.
              No figure on this page is filled in from anywhere else.
            </p>
          </section>
        ) : (
          <>
            <section className="section shell">
              <div className="office-head__figs">
                <Observation
                  size="small"
                  label="State"
                  value={STATE_NAMES[m.state] ?? String(m.state)}
                  block={blockNumber ?? undefined}
                />
                <Observation
                  size="small"
                  label="Office"
                  value={CATEGORY_NAMES[m.category] ?? String(m.category)}
                  block={blockNumber ?? undefined}
                />
                <Observation
                  size="small"
                  label="Capital"
                  value={`${formatEther(m.capital)} BNB`}
                  block={blockNumber ?? undefined}
                />
                <Observation
                  size="small"
                  label="Bond at risk"
                  value={m.bond > 0n ? `${formatEther(m.bond)} BNB` : "none"}
                  block={blockNumber ?? undefined}
                />
                <Observation
                  size="small"
                  label="Epochs settled"
                  value={`${m.epochsSettled} of ${m.epochsTotal}`}
                  block={blockNumber ?? undefined}
                />
                <Observation
                  size="small"
                  label="Cumulative alpha"
                  value={
                    m.epochsSettled > 0
                      ? `${Number(m.cumulativeAlphaBps) > 0 ? "+" : ""}${(Number(m.cumulativeAlphaBps) / 100).toFixed(2)}%`
                      : "not settled yet"
                  }
                  block={blockNumber ?? undefined}
                />
                <Observation
                  size="small"
                  label="Strikes"
                  value={String(m.strikes)}
                  block={blockNumber ?? undefined}
                />
              </div>
            </section>

            <section className="section shell">
              <div className="section__head">
                <h2 className="section-title">The parties</h2>
              </div>
              <dl className="superseded__parties">
                <dt className="mark-label">Principal</dt>
                <dd className="num">
                  <a href={addressUrl(m.principal, d.chainId)}>{m.principal}</a>
                </dd>
                <dt className="mark-label">Agent</dt>
                <dd className="num">
                  {m.agent === ZERO ? (
                    "not awarded — nobody has bid"
                  ) : (
                    <a href={addressUrl(m.agent, d.chainId)}>{m.agent}</a>
                  )}
                </dd>
                <dt className="mark-label">Market</dt>
                <dd className="num">
                  <a href={addressUrl(d.address, d.chainId)}>{d.address}</a>
                </dd>
              </dl>
            </section>

            <section className="section shell">
              <div className="section__head">
                <h2 className="section-title">Check it yourself</h2>
              </div>
              <p className="section-sub">
                The verifier knows every deployment this office has run, by name.
              </p>
              <Command>{`npx mandate-verify --mandate ${id} --chain 56 --deployment ${d.label}`}</Command>
              <Command>{`cast call ${d.address} "getMandate(uint256)" ${id} --rpc-url https://bsc-dataseed1.binance.org`}</Command>
            </section>
          </>
        )}
      </main>
      <SiteFooter market={MARKET_ADDRESS} note={`Read from ${d.address} on BNB Smart Chain.`} />
    </div>
  );
}
