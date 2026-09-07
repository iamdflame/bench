import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import Ticket from "@/components/instrument/Ticket";
import { resolveAgent } from "@/lib/agent-record";
import { jobBySegment, jobByCategory, type JobSpec } from "@/lib/categories";
import { allowlistFor, RECIPIENT_BOUND_WRAPPER } from "@/lib/chain/allowlist";
import { shopByTokenId, CUSTODY_QUOTE } from "@/lib/shops";
import { HOUSE, houseByTokenId } from "@/lib/house";
import type { Category } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const a = await resolveAgent(id).catch(() => null);
  return { title: `Hire ${a?.name ?? `agent ${id}`} · the ticket` };
}

export default async function HireTicket({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ job?: string }>;
}) {
  const { id } = await params;
  const { job: jobSeg } = await searchParams;
  const agent = await resolveAgent(id).catch(() => null);
  if (!agent) notFound();

  const shop = shopByTokenId(id);
  const category = (shop?.category ?? agent.category) as Category | null;
  const job: JobSpec | null =
    (jobSeg ? jobBySegment(jobSeg) : null) ?? (category ? jobByCategory(category) : null);

  if (!job) {
    return (
      <>
        <Header current="/jobs" />
        <main className="shell" style={{ paddingBlock: "3rem", maxWidth: "44rem" }}>
          <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)" }}>Which job is this for?</h1>
          <p className="sub" style={{ marginTop: "0.5rem" }}>
            This agent is not classified into one of the four jobs, so there is no leash to derive
            yet. Assay it first, or pick the job you want it to do.
          </p>
          <a href={`/agents/${id}`} className="btn btn--primary" style={{ marginTop: "1.25rem" }}>See the assay →</a>
        </main>
        <Footer />
      </>
    );
  }

  const doc = allowlistFor(job.category);
  const isHouse = Boolean(houseByTokenId(id));

  /*
    The bonded alternative in the same job, named on a shop's ticket.

    Not a warning against hiring the shop: the button next to this paragraph
    works. It is the one comparison a person about to grant authority is
    entitled to, and putting it on the ticket rather than in a footnote is the
    difference between a market and a funnel.
  */
  const houseAlt = HOUSE.find((h) => h.offices.includes(job.category) && h.tokenId) ?? null;
  const fallbackHref = houseAlt?.tokenId ? `/hire/${houseAlt.tokenId}?job=${job.segment}` : null;

  return (
    <>
      <Header current="/jobs" />
      <main className="shell" style={{ paddingBlock: "2rem", maxWidth: "48rem" }}>
        <a href={`/agents/${id}`} className="meta link-accent" style={{ boxShadow: "none" }}>← Back to the assay</a>

        <section className="ticket" style={{ marginTop: "0.75rem", padding: "clamp(1.25rem, 4vw, 2rem)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
            <div>
              <span className="meta">The ticket</span>
              <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)", marginTop: "0.15rem" }}>
                Hire {agent.name ?? `agent ${id}`}
              </h1>
              <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.25rem" }}>
                To: {job.job}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <span className="chip">
                {isHouse ? "MANDATE · bonded" : shop ? `${shop.operator.name} · shop · unbonded` : "registered"}
              </span>
              <div className="meta" style={{ marginTop: "0.3rem" }}>token {id}</div>
            </div>
          </div>

          {/* --------------------------------------- the shop paragraph */}
          {shop ? (
            <p className="sub" style={{ marginTop: "1.1rem", fontSize: "var(--text-sm)", lineHeight: 1.6 }}>
              This is {shop.operator.name}&rsquo;s agent, hired on MANDATE. It has not posted a bond
              here, so we cannot cut it if it misses. You can revoke it in one tap.
              {houseAlt ? <> {houseAlt.name} is the bonded alternative in this job.</> : null}
            </p>
          ) : null}

          <hr className="rule" style={{ marginBlock: "1.25rem" }} />

          {/* -------------------------------------------- may / may not */}
          <h2 className="hd-3" style={{ fontSize: "var(--text-base)" }}>It may</h2>
          <div style={{ marginTop: "0.4rem" }}>
            {doc.may.map((c) => (
              <div key={c.signature} className="clause clause--may">
                <span className="clause__mark" aria-hidden>+</span>
                <span>
                  {c.plain}
                  {c.recipient ? (
                    <>
                      {" "}
                      <span className="chip">to you, always</span>
                    </>
                  ) : null}
                  <span className="meta" style={{ display: "block", fontSize: "var(--text-2xs)", wordBreak: "break-all", marginTop: "0.1rem" }}>
                    {c.target} · {c.signature}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <h2 className="hd-3" style={{ fontSize: "var(--text-base)", marginTop: "1.25rem" }}>It may not</h2>
          <div style={{ marginTop: "0.4rem" }}>
            {doc.mayNot.map((c) => (
              <div key={c.signature} className="clause clause--not">
                <span className="clause__mark" aria-hidden>&minus;</span>
                <span>
                  <span className="num" style={{ fontSize: "var(--text-xs)" }}>{c.signature.split("(")[0]}</span>
                  <span className="meta" style={{ display: "block", fontSize: "var(--text-2xs)", marginTop: "0.1rem" }}>{c.because}</span>
                </span>
              </div>
            ))}
          </div>

          {/* ------------------------------------------ recipient binding */}
          <div style={{ marginTop: "1.25rem", padding: "0.85rem 1rem", background: "#1b2027", borderRadius: "var(--radius-ui)" }}>
            <span className="meta">Where the money can go</span>
            <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.3rem", lineHeight: 1.55 }}>
              {doc.binding}
            </p>
            {job.category === "rebalancing" ? (
              <p className="meta" style={{ marginTop: "0.5rem", lineHeight: 1.5 }}>
                {shop ? `${shop.operator.name} publish` : "The largest agent shop on this chain publishes"} the opposite
                of this about their own grant: &ldquo;{CUSTODY_QUOTE.text}&rdquo;{" "}
                <a className="link-accent" href={CUSTODY_QUOTE.source} target="_blank" rel="noopener noreferrer">
                  {CUSTODY_QUOTE.attribution} ↗
                </a>
                {shop ? " Hired here, their agent is bound tighter than it is hired there." : ""}
              </p>
            ) : null}
            {RECIPIENT_BOUND_WRAPPER ? (
              <p className="meta" style={{ marginTop: "0.4rem" }}>
                Wrapper:{" "}
                <a className="link-accent num" href={`https://bscscan.com/address/${RECIPIENT_BOUND_WRAPPER}#code`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "var(--text-2xs)" }}>
                  {RECIPIENT_BOUND_WRAPPER} ↗
                </a>
              </p>
            ) : null}
          </div>

          <hr className="rule" style={{ marginBlock: "1.25rem" }} />

          <Ticket
            tokenId={id}
            job={job.segment}
            agentName={agent.name ?? `Agent ${id}`}
            clauses={doc.may.map((c) => ({ plain: c.plain, signature: c.signature, recipient: c.recipient?.boundTo ?? null }))}
            defaultCap={0.02}
            fallbackName={shop && houseAlt ? houseAlt.name : null}
            fallbackHref={shop ? fallbackHref : null}
          />

          <p className="meta" style={{ marginTop: "1.25rem", lineHeight: 1.5 }}>
            {doc.invariant} Allowlist version {doc.version}, published at{" "}
            <a className="link-accent" href={`/api/v1/allowlist/${job.category}`}>/api/v1/allowlist/{job.category}</a>.
          </p>
        </section>
      </main>
      <Footer note="A hire is an ERC-8183 session: a scoped, capped, expiring key, revocable from the desk in one transaction. The signer never leaves the machine that made it." />
    </>
  );
}
