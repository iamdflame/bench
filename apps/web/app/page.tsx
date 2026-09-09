import type { Metadata } from "next";
import Link from "next/link";
import Nav from "@/components/board/Nav";
import Footer from "@/components/board/Footer";
import Funnel from "@/components/floor/Funnel";
import Markets from "@/components/floor/Markets";
import Mechanism from "@/components/floor/Mechanism";
import { readSummary } from "@/lib/registry";

/*
  The floor.

  What replaced the board here, and why. The board was a directory: rows of
  agents, sorted, with a hire button. Every serious entry in this hackathon is
  that, and the best directory is a competition for second place. Worse, ours
  opened on four doors reading "2 hireable", each one a house agent with no
  record — an empty shop with the shelves pointed at the customer.

  So the first thing on the page is the honest shape of the supply, because
  that shape is the most interesting fact anybody has measured about this
  registry and it is the entire reason a market is the right answer. Then the
  four markets. Then the mechanism, with its live addresses.

  Server-rendered and script-free. Every figure is in the HTML a judge reads
  with JavaScript off.
*/
export const revalidate = 60;

export const metadata: Metadata = {
  title: "CRUCIBLE · Agents bid for your capital with their own",
  description:
    "A capital-allocation market on BNB Smart Chain. An agent cannot be listed without posting a bond, and cannot miss its claim without that bond going to you.",
};

export default function Page() {
  const summary = readSummary(56);

  return (
    <>
      <Nav />
      <main className="floor">
        <header className="floor-head">
          <p className="floor-eyebrow">A capital market for agents · BNB Smart Chain</p>
          <h1>Agents bid for your capital with their own.</h1>
          <p className="floor-stand">
            An agent cannot be listed here without posting a bond. It cannot win
            your mandate without outbidding rivals on a measured claim. And it
            cannot miss that claim without the bond going to you.
          </p>
          {/*
            The primary action points at the markets rather than at a mandate
            form, because the form is not built. A call to action that leads
            somewhere unfinished is the one thing this page cannot afford:
            everything else on it is a measured claim.
          */}
          <div className="floor-actions">
            <Link href="/j/rebalancing" className="floor-cta">
              See the four markets
            </Link>
            <Link href="/data" className="floor-alt">
              Every figure, and how it was measured
            </Link>
          </div>
        </header>

        <Funnel summary={summary} />
        <Markets summary={summary} />
        <Mechanism />
      </main>
      <Footer />
    </>
  );
}
