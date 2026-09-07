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
import { jobByCategory } from "@/lib/categories";
import { EXPLORER, addressUrl } from "@/lib/config";
import type { Category } from "@/lib/config";

/** The assay runs live on open, so every agent in the registry has a page. */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ chainId: string; id: string }>;
}): Promise<Metadata> {
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
 * The assay itself, streamed.
 *
 * Six tests against a rate-limited index and a free RPC, seconds, not
 * milliseconds. The identity paints at once above this boundary; the verdict
 * and certificate arrive when the chain answers, and if the index will not
 * answer at all the boundary says so rather than hanging the page.
 */
async function Assay({ chainId, tokenId, job }: { chainId: number; tokenId: string; job: ReturnType<typeof jobByCategory> | null }) {
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
  const canHire = passed && Boolean(job);

  return (
    <>
      <Verdict report={report} />

      {/* two ways to put it to work */}
      <section className="work-grid">
        <div className="card" style={{ padding: "1.1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <span className="hd-3" style={{ fontSize: "var(--text-base)" }}>Hire it, as a mandate</span>
          <span className="sub" style={{ fontSize: "var(--text-sm)", flex: 1 }}>
            {job ? `It will ${job.may}, inside a cap and an expiry you set. It can be slashed and revoked.` : "It manages your position inside caps you set."}
          </span>
          {canHire ? (
            <a href={`/activate/${tokenId}${job ? `?job=${job.segment}` : ""}`} className="btn btn--primary" style={{ alignSelf: "flex-start", marginTop: "0.4rem" }}>Hire</a>
          ) : (
            <span className="chip" style={{ alignSelf: "flex-start", marginTop: "0.4rem" }} title="An agent below the hallmark bar cannot be hired here.">
              {report.results.every((r) => r.verdict === "inconclusive") ? "Not graded yet, nothing to hire" : "Below the bar, not hireable"}
            </span>
          )}
        </div>
        <div className="card" style={{ padding: "1.1rem 1.25rem", display: "flex", flexDirection: "column", gap: "0.4rem", opacity: 1 }}>
          <span className="hd-3" style={{ fontSize: "var(--text-base)" }}>One call over x402</span>
          <span className="sub" style={{ fontSize: "var(--text-sm)", flex: 1 }}>
            Ask it once and pay per call, ~$0.01, no mandate. The lighter way to put it to work.
          </span>
          <a href={`/api/x402/agent/${tokenId}/status`} className="btn" style={{ alignSelf: "flex-start", marginTop: "0.4rem" }}>Check pay-per-call →</a>
        </div>
      </section>

      <Certificate results={report.results} />

      <Reproduce
        commands={[
          { label: "Re-run this whole assay", cmd: `npm run assay -- ${tokenId}` },
          { label: "Read it over the open API", cmd: `curl ${EXPLORER.includes("testnet") ? "" : ""}https://mandate.example/api/v1/assay/${chainId}/${tokenId}` },
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

/** The wallet's realized record on chain, streamed like the assay. */
async function TrackRecordSection({ wallet }: { wallet: string | null }) {
  const record = await readWalletRecord(wallet).catch(() => null);
  if (!record) return null;
  return <TrackRecord record={record} />;
}

export default async function AgentPage({
  params,
}: {
  params: Promise<{ chainId: string; id: string }>;
}) {
  const { chainId: chainStr, id } = await params;
  const chainId = Number(chainStr) || 56;
  const agent = await resolveAgent(id).catch(() => null);
  if (!agent) notFound();

  const job = agent.category ? jobByCategory(agent.category as Category) : null;

  return (
    <>
      <Header current="/registry" />
      <main className="shell" style={{ paddingBlock: "2rem", display: "flex", flexDirection: "column", gap: "0.85rem", maxWidth: "56rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)" }}>{agent.name ?? `Agent ${id}`}</h1>
            {agent.description ? (
              <p className="sub read" style={{ marginTop: "0.35rem", fontSize: "var(--text-sm)" }}>
                {agent.description.slice(0, 220)}{agent.description.length > 220 ? "…" : ""}
              </p>
            ) : null}
          </div>
          <div style={{ textAlign: "right", flex: "none" }}>
            <a className="chip num" href={`${EXPLORER}/token/0x8004a169fb4a3325136eb29fa0ceb6d2e539a432?a=${id}`} target="_blank" rel="noopener noreferrer">
              token {id} ↗
            </a>
            {agent.owner ? (
              <div className="meta" style={{ marginTop: "0.3rem" }}>
                owner <a className="link-accent num" href={addressUrl(agent.owner)} target="_blank" rel="noopener noreferrer" style={{ fontSize: "var(--text-xs)" }}>{agent.owner.slice(0, 6)}…{agent.owner.slice(-4)}</a>
              </div>
            ) : null}
          </div>
        </div>

        <Suspense fallback={<AssayPending fineness={null} />}>
          <Assay chainId={chainId} tokenId={id} job={job} />
        </Suspense>

        <Suspense fallback={null}>
          <TrackRecordSection wallet={agent.owner} />
        </Suspense>
      </main>
      <Footer note={`Claims from the ERC-8004 registry · findings from BNB Smart Chain RPC · explorer ${EXPLORER.replace("https://", "")}`} />
    </>
  );
}
