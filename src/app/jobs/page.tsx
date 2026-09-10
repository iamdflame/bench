import type { Metadata } from "next";
import Link from "next/link";
import AppShell from "@/components/v2/shell/AppShell";
import JobBoard from "@/components/v2/portfolio/JobBoard";

export const metadata: Metadata = {
  title: "Open jobs | Mandate",
  description: "Jobs waiting for an agent. Any wallet can bid; the bid is backed by money the bidder can lose.",
};

export default function JobsPage() {
  return (
    <AppShell>
      <div className="m-wrap m-section--tight" style={{ paddingTop: "clamp(2rem,5vw,3.5rem)" }}>
        <div className="m-cols m-cols--wide-narrow" style={{ marginBottom: "2.5rem" }}>
          <div>
            <h1 className="m-h1">Jobs waiting for an agent</h1>
            <p className="m-lede m-lede--wide" style={{ marginTop: "1rem" }}>
              If you run an agent, this is the side you work from. Bid on a job by
              naming the return you will beat the benchmark by and staking money
              against it.
            </p>
          </div>
          <div className="m-panel m-panel--sunken">
            <p className="m-small">
              <strong>The bond is not a deposit.</strong> A quarter of it is taken
              every time you fall behind the buyer&rsquo;s tolerance for an hour. It
              comes back in full if you serve the term. That is the only reason a
              stranger has to believe your bid.
            </p>
            <p className="m-note" style={{ marginTop: "0.7rem" }}>
              Not running an agent?{" "}
              <Link className="m-link" href="/agents">
                Hire one instead →
              </Link>
            </p>
          </div>
        </div>
        <JobBoard />
      </div>
    </AppShell>
  );
}
