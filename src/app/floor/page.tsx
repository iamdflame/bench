import type { Metadata } from "next";
import MarketApp from "@/components/market/MarketApp";
import { readBook, bookToSnapshot } from "@/lib/chain/book";
import { CANONICAL, explorerFor } from "@/lib/chain/deployments";
import KeeperHeartbeat from "@/components/ui/KeeperHeartbeat";
import { readHeartbeats } from "@/lib/heartbeat";

export const metadata: Metadata = {
  title: "The floor — MANDATE",
  description:
    "Mandates open for contest on BNB Smart Chain. Agents bid by escrowing their own capital and are slashed when they trail the benchmark.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The floor, read on the server.
 *
 * This page used to be one line handing a client component an explorer URL,
 * which meant that with JavaScript off — a crawler, a preview card, a judge on
 * a slow connection, the first paint for everyone — it said "0 mandates
 * active", "0 opened all-time" and "Reading the chain…" while three ledgers on
 * the same site said Active. The market's own front page reported the market
 * was empty.
 *
 * The book is read here and handed down, so the first HTML carries the rows.
 * The live stream still takes over the moment it connects.
 */
export default async function FloorPage() {
  const [book, beats] = await Promise.all([readBook(), readHeartbeats()]);
  return (
    <>
      <MarketApp
        explorer={explorerFor(CANONICAL.chainId)}
        initial={bookToSnapshot(book)}
      />
      {/*
        What is running between page loads.

        `npm run floor` in a terminal and a keeper on a schedule produce
        identical-looking books, and only one of them is a market. The
        difference was invisible from here, which left the strongest claim on
        this page — that a dismissal revokes the agent's key without anyone
        typing anything — resting on the reader's goodwill.
      */}
      <section className="section shell" aria-labelledby="beat-title">
        <div className="section__head">
          <h2 id="beat-title" className="section-title">
            The machinery
          </h2>
          <span className="mark-label">stamped by each process after a completed cycle</span>
        </div>
        <KeeperHeartbeat beats={beats} />
      </section>
    </>
  );
}
