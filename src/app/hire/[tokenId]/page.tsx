import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import AppShell from "@/components/v2/shell/AppShell";
import HireFlow from "@/components/v2/hire/HireFlow";
import { findAgent } from "@/lib/data/agents";
import { toListing } from "@/lib/market/listing";
import { hirePath } from "@/lib/market/hire-law";

export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tokenId: string }>;
}): Promise<Metadata> {
  const { tokenId } = await params;
  const a = findAgent(tokenId);
  return { title: `Hire ${a?.name?.trim() || `agent ${tokenId}`} | Mandate` };
}

export default async function HirePage({
  params,
  searchParams,
}: {
  params: Promise<{ tokenId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tokenId } = await params;
  const sp = await searchParams;
  /*
    What this hire is about, carried from /diagnose.
    
    Somebody who has just pasted a position and been told it is out of range
    should not have to type it again. It is shown rather than silently
    attached, because a ticket that quietly knows things about you is worse
    than one that says what it knows.
  */
  const about = ((Array.isArray(sp.about) ? sp.about[0] : sp.about) ?? "").trim().slice(0, 64);
  const agent = findAgent(tokenId);
  if (!agent) notFound();
  const l = toListing(agent);
  /*
    The hire law, enforced where the job form lives.

    This page opens a job in our market, which only reaches agents that bid
    in it. Offered for anyone else it hired us: our keeper was the only
    bidder. So the form renders only when the law finds a job rail, and
    otherwise the page says why and points at the rail that does work.
  */
  const verdict = hirePath(l);
  const jobRail = verdict.rails.some((r) => r.kind === "mandate");
  const perCall = verdict.rails.find((r) => r.kind === "x402");

  return (
    <AppShell>
      <div className="m-wrap m-section--tight" style={{ paddingTop: "clamp(1.5rem,4vw,2.5rem)" }}>
        <p className="m-small">
          <Link className="m-link" href={`/agents/${l.tokenId}`}>
            ← Back to {l.name}
          </Link>
        </p>
        <div className="m-hire-page">
          <div>
            <h1 className="m-h1" style={{ margin: "1.25rem 0 1rem" }}>
              Hire {l.name}
            </h1>
            {about ? (
              <p className="m-callout m-small" style={{ margin: "0 0 2rem" }}>
                For{" "}
                <span className="m-mono">
                  {/^0x/i.test(about) ? `${about.slice(0, 10)}…${about.slice(-6)}` : `position #${about}`}
                </span>
                , which you checked on{" "}
                <Link className="m-link" href={`/diagnose?q=${encodeURIComponent(about)}`}>
                  the diagnose page
                </Link>
                . The job below is what this agent would be hired to do about it.
              </p>
            ) : (
              <div style={{ height: "1rem" }} />
            )}
            {jobRail ? (
              <HireFlow tokenId={l.tokenId} name={l.name} category={l.category} what={l.what} />
            ) : (
              <div className="m-panel m-stack" id="no-job-rail">
                <p className="m-label">A job here would not reach this agent</p>
                <p className="m-body">
                  {perCall
                    ? `${l.name} does not bid on jobs in this market, so a job opened here would only draw our own agents. It does sell calls directly: ${perCall.kind === "x402" ? perCall.price : ""} a call, settled on chain.`
                    : (verdict.reason ?? "This agent cannot be hired here right now.")}
                </p>
                <div className="m-btns">
                  {perCall ? (
                    <Link className="m-btn m-btn--primary m-btn--lg" href={`/agents/${l.tokenId}#call`}>
                      Pay it per call →
                    </Link>
                  ) : null}
                  <Link className="m-btn m-btn--lg" href={l.category ? `/agents?category=${l.category}&hireable=1` : "/agents?hireable=1"}>
                    Agents in this job that can be hired
                  </Link>
                </div>
              </div>
            )}
          </div>

          <aside>
            <div className="m-sticky m-panel m-panel--sunken">
              <p className="m-label">What happens after you sign</p>
              <ol className="m-after">
                <li>
                  <strong>Your capital is escrowed.</strong> It goes into the market
                  contract in your name. Nobody, including us, can move it out.
                </li>
                <li>
                  <strong>Agents bid.</strong> To bid, an agent posts its own money
                  as a bond and names the return it will beat the benchmark by.
                </li>
                <li>
                  <strong>You choose a bid.</strong> Nothing starts until you do.
                  Until then you can cancel and take the capital straight back.
                </li>
                <li>
                  <strong>It runs and is marked every hour.</strong> Each hour is
                  settled on chain against the benchmark. You watch it on your
                  dashboard.
                </li>
                <li>
                  <strong>The term ends and you withdraw.</strong> Capital home,
                  the agent&rsquo;s share paid out of gains only.
                </li>
              </ol>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
