import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import Verdict from "@/components/instrument/Verdict";
import Certificate from "@/components/instrument/Certificate";
import Reproduce from "@/components/instrument/Reproduce";
import FinenessDial from "@/components/instrument/FinenessDial";
import TrackRecord from "@/components/instrument/TrackRecord";
import { readWalletRecord } from "@/lib/board";
import { resolveAgent } from "@/lib/agent-record";
import { assayAgent } from "@/lib/assay";
import { isHallmarked } from "@/lib/assay/types";
import { jobByCategory, type JobSpec } from "@/lib/categories";
import { allowlistFor } from "@/lib/chain/allowlist";
import { shopByTokenId } from "@/lib/shops";
import { houseByTokenId, HOUSE } from "@/lib/house";
import { EXPLORER, addressUrl, CHAIN_ID } from "@/lib/config";
import type { Category } from "@/lib/config";

/** The assay runs live on open, so every agent in the registry has a page. */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const a = await resolveAgent(id).catch(() => null);
  return {
    title: `${a?.name ?? `Agent ${id}`} · certificate of assay`,
    description:
      a?.description?.slice(0, 180) ??
      `Agent ${id} on BNB Smart Chain, tested against the chain rather than taken at its word.`,
  };
}

/**
 * What it may do, and what it may not, before anyone signs anything.
 *
 * Rendered from the published allowlist rather than written out again here, so
 * the page and the grant cannot drift. The "may not" half is the half nobody
 * shows, and it is the half that tells you what kind of key this is.
 */
function Leash({ job, tokenId }: { job: JobSpec; tokenId: string }) {
  const doc = allowlistFor(job.category);
  return (
    <section className="panel" style={{ padding: "1.25rem 1.4rem" }}>
      <h2 className="hd-2" style={{ fontSize: "var(--text-lg)" }}>If you hire it</h2>
      <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.3rem" }}>
        The exact key it would hold. Not a summary of one.
      </p>
      <div className="work-grid" style={{ marginTop: "0.9rem" }}>
        <div>
          <span className="meta">May</span>
          <ul style={{ marginTop: "0.35rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {doc.may.map((c) => (
              <li key={c.signature} className="sub" style={{ fontSize: "var(--text-sm)" }}>
                <span style={{ color: "var(--color-pass)" }}>+</span> {c.plain}
                {c.recipient ? <span className="chip" style={{ marginLeft: "0.4rem" }}>to you, always</span> : null}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <span className="meta">May not</span>
          <ul style={{ marginTop: "0.35rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            {doc.mayNot.slice(0, 5).map((c) => (
              <li key={c.signature} className="sub" style={{ fontSize: "var(--text-sm)" }}>
                <span style={{ color: "var(--color-fail)" }}>&minus;</span>{" "}
                <span className="num" style={{ fontSize: "var(--text-xs)" }}>{c.signature.split("(")[0]}</span>
                <span className="meta" style={{ display: "block", marginLeft: "1rem" }}>{c.because}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="meta" style={{ marginTop: "0.9rem", lineHeight: 1.5 }}>{doc.binding}</p>
      <a href={`/hire/${tokenId}?job=${job.segment}`} className="btn btn--primary" style={{ marginTop: "1rem" }}>
        Hire on this leash →
      </a>
    </section>
  );
}

async function Assay({ chainId, tokenId, job }: { chainId: number; tokenId: string; job: JobSpec | null }) {
  let report;
  try {
    report = await assayAgent(chainId, tokenId, undefined, { registryDeadlineMs: 20_000 });
  } catch {
    return (
      <section className="panel" style={{ padding: "1.5rem" }}>
        <h2 className="hd-2">The assay could not complete.</h2>
        <p className="sub" style={{ marginTop: "0.5rem" }}>
          The ERC-8004 index did not answer for this token inside the time allowed. That is a
          statement about the provider, not about the agent. Nothing is concluded, and a struck or
          failed verdict is not invented in its place. Try again in a moment.
        </p>
      </section>
    );
  }

  const passed = isHallmarked(report.fineness);
  const shop = shopByTokenId(tokenId);
  /*
    A shop agent is hireable whether or not it clears our hallmark bar.

    The bar decides whether we vouch for it, not whether you may act on it. An
    agent someone else operates, listed on our board with a Hire button and a
    row that says "no bond posted here", is the honest offer; refusing to let
    you hire it because it scored below our own line would be us deciding for
    you while calling ourselves a market. The grant still narrows to what the
    chain has shown it doing, which is the real protection.
  */
  const canHire = Boolean(job) && (passed || Boolean(shop));

  return (
    <>
      <Verdict report={report} />

      {job && canHire ? <Leash job={job} tokenId={tokenId} /> : null}

      <section className="work-grid">
        {!canHire ? (
          <div className="card" style={{ padding: "1.1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <span className="hd-3" style={{ fontSize: "var(--text-base)" }}>Not hireable here</span>
            <span className="sub" style={{ fontSize: "var(--text-sm)", flex: 1 }}>
              {report.results.every((r) => r.verdict === "inconclusive")
                ? "Nothing about this agent has been settled by the chain yet, so there is no authority to derive and nothing to hire."
                : job
                  ? "It sits below the hallmark bar and no other operator vouches for it, so this office will not put your capital behind it."
                  : "It is not classified into one of the four jobs, so there is no leash to derive."}
            </span>
          </div>
        ) : null}
        <div className="card" style={{ padding: "1.1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <span className="hd-3" style={{ fontSize: "var(--text-base)" }}>One call over x402</span>
          <span className="sub" style={{ fontSize: "var(--text-sm)", flex: 1 }}>
            Ask it once and pay per call, about a cent, no mandate. The lighter way to put it to work.
          </span>
          <a href={`/api/x402/agent/${tokenId}/status`} className="btn" style={{ alignSelf: "flex-start", marginTop: "0.4rem" }}>Check pay-per-call →</a>
        </div>
      </section>

      <Certificate results={report.results} />

      <Reproduce
        commands={[
          { label: "Re-run this whole assay", cmd: `npm run assay -- ${tokenId}` },
          { label: "Read it over the open API", cmd: `curl https://mandate-coral.vercel.app/api/v1/assay/${chainId}/${tokenId}` },
          ...(report.agentWallet ? [{ label: "Verify the wallet on chain", cmd: `cast nonce ${report.agentWallet} --rpc-url https://bsc-rpc.publicnode.com` }] : []),
        ]}
      />
    </>
  );
}

function AssayPending({ fineness }: { fineness: number | null }) {
  return (
    <section className="panel" style={{ padding: "1.5rem", display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap" }} aria-busy="true">
      <FinenessDial fineness={fineness} size={190} />
      <div style={{ flex: 1, minWidth: "16rem" }}>
        <h2 className="hd-2" style={{ color: "var(--color-ink-3)" }}>Assaying against the chain…</h2>
        <p className="sub" style={{ marginTop: "0.5rem" }}>
          Six tests: identity, custody, activity, capability, reputation, performance. Each compares
          the registry&rsquo;s claim to what BNB Smart Chain actually shows. This takes a few seconds
          because the reads are real.
        </p>
      </div>
    </section>
  );
}

async function TrackRecordSection({ wallet }: { wallet: string | null }) {
  const record = await readWalletRecord(wallet).catch(() => null);
  if (!record) return null;
  return <TrackRecord record={record} />;
}

export default async function AgentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await resolveAgent(id).catch(() => null);
  if (!agent) notFound();

  const shop = shopByTokenId(id);
  const house = houseByTokenId(id);
  const category = (shop?.category ?? agent.category) as Category | null;
  const job = category ? jobByCategory(category) : null;
  const alternative = job ? HOUSE.find((h) => h.offices.includes(job.category) && h.tokenId) ?? null : null;

  return (
    <>
      <Header current="/agents" />
      <main className="shell" style={{ paddingBlock: "2rem", display: "flex", flexDirection: "column", gap: "0.85rem", maxWidth: "56rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: "18rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)" }}>{agent.name ?? `Agent ${id}`}</h1>
              {house ? <span className="chip chip--struck">MANDATE · bonded</span> : null}
              {shop ? <span className="chip">{shop.operator.name} · shop</span> : null}
              {shop && !shop.verified ? <span className="chip chip--fail">contract unverified</span> : null}
            </div>
            {agent.description ? (
              <p className="sub read" style={{ marginTop: "0.35rem", fontSize: "var(--text-sm)" }}>
                {agent.description.slice(0, 220)}{agent.description.length > 220 ? "…" : ""}
              </p>
            ) : null}
            {shop ? (
              <p className="meta" style={{ marginTop: "0.4rem", lineHeight: 1.5 }}>
                Operated by {shop.operator.name}, not by us. It has posted no bond here, so we cannot
                cut it if it misses; you can revoke it in one tap.
                {alternative ? <> {alternative.name} is the bonded alternative in this job.</> : null}
                {shop.caveat ? (
                  <>
                    {" "}
                    {shop.caveat}
                    {shop.caveatSource ? (
                      <> <a className="link-accent" href={shop.caveatSource} target="_blank" rel="noopener noreferrer">their writeup ↗</a></>
                    ) : null}
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
          <div style={{ textAlign: "right", flex: "none" }}>
            <a className="chip num" href={`${EXPLORER}/token/0x8004a169fb4a3325136eb29fa0ceb6d2e539a432?a=${id}`} target="_blank" rel="noopener noreferrer">
              token {id} ↗
            </a>
            {agent.owner ? (
              <div className="meta" style={{ marginTop: "0.3rem" }}>
                holder <a className="link-accent num" href={addressUrl(agent.owner)} target="_blank" rel="noopener noreferrer" style={{ fontSize: "var(--text-xs)" }}>{agent.owner.slice(0, 6)}…{agent.owner.slice(-4)}</a>
              </div>
            ) : null}
            {job ? (
              <div className="meta" style={{ marginTop: "0.3rem" }}>
                <a className="link-accent" href={`/compare?job=${job.segment}&ids=${id}`}>compare in this job →</a>
              </div>
            ) : null}
          </div>
        </div>

        <Suspense fallback={<AssayPending fineness={null} />}>
          <Assay chainId={CHAIN_ID} tokenId={id} job={job} />
        </Suspense>

        <Suspense fallback={null}>
          <TrackRecordSection wallet={agent.owner} />
        </Suspense>
      </main>
      <Footer note={`Claims from the ERC-8004 registry · findings from BNB Smart Chain RPC · explorer ${EXPLORER.replace("https://", "")}`} />
    </>
  );
}
