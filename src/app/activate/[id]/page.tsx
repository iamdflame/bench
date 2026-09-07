import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import ActivateFlow from "@/components/instrument/ActivateFlow";
import Hallmark from "@/components/instrument/Hallmark";
import { resolveAgent } from "@/lib/agent-record";
import { jobBySegment, jobByCategory, type JobSpec } from "@/lib/categories";
import type { Category } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const a = await resolveAgent(id).catch(() => null);
  return { title: `Hire ${a?.name ?? `agent ${id}`}` };
}

export default async function ActivatePage({
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

  const job: JobSpec | null =
    (jobSeg ? jobBySegment(jobSeg) : null) ??
    (agent.category ? jobByCategory(agent.category as Category) : null);

  if (!job) {
    return (
      <>
        <Header current="/hire/health" />
        <main className="shell" style={{ paddingBlock: "3rem", maxWidth: "44rem" }}>
          <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)" }}>Which job is this for?</h1>
          <p className="sub" style={{ marginTop: "0.5rem" }}>
            This agent isn&rsquo;t classified into one of the four jobs, so there&rsquo;s no leash to
            derive yet. Assay it first, or pick the job you want it to do.
          </p>
          <a href={`/agent/56/${id}`} className="btn btn--primary" style={{ marginTop: "1.25rem" }}>See the assay →</a>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Header current="/hire/health" />
      <main className="shell" style={{ paddingBlock: "2rem", maxWidth: "48rem" }}>
        <a href={`/agent/56/${id}`} className="meta link-accent" style={{ boxShadow: "none" }}>← Back to the assay</a>
        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", marginTop: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
          <Hallmark fineness={null} size="md" title="You are hiring this agent" />
          <div>
            <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)" }}>Hire {agent.name ?? `agent ${id}`}</h1>
            <p className="sub" style={{ fontSize: "var(--text-sm)" }}>For: {job.job}</p>
          </div>
        </div>

        <ActivateFlow tokenId={id} job={job} agentName={agent.name ?? `Agent ${id}`} />
      </main>
      <Footer note="A hire is an ERC-8183 session: a scoped, capped, expiring key you can revoke. The signer is a passkey you hold, with no seed phrase." />
    </>
  );
}
