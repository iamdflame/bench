/**
 * The band above the board.
 *
 * §12.1 says "no marketing hero — the inventory is the homepage", and this is a
 * deliberate departure from that line, taken with the decision in front of us.
 * The mitigation is what fills it: **every figure here is live and every claim
 * is a transaction**. The left column carries the product's one sentence and its
 * one primary action; the right carries what this marketplace has actually
 * proven on chain, read from `proofs.json`; the strip underneath carries the
 * funnel. There is no slogan in it and nothing that would still be true if the
 * product did not work.
 *
 * That is the difference between a hero and a market band, and it is the reason
 * this is allowed to be as large as it is: the space is paid for in evidence.
 *
 * ---------------------------------------------------------------------------
 * The figures are the decoration
 * ---------------------------------------------------------------------------
 *
 * §13.1 asks for "dark panel, illuminated type, dense rows, numbers that glow",
 * and until now every figure on the page rendered in the same muted grey as the
 * prose around it. The strip at the bottom of this band is the plan's own
 * instruction taken literally: real counts, at display size, in the rail
 * colours, with their units small and quiet beneath them.
 *
 * No client JavaScript. Everything here is server-rendered markup and CSS, so
 * the homepage bundle is unchanged and the whole band works with scripting off.
 */

import Link from "next/link";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Snapshot } from "@bench/shared";
import Logotype from "./Logotype";
import { BoardPositionForm } from "./BoardForYou";

interface ProofRow {
  id: string;
  rail?: "call" | "hire" | "mandate";
  title: string;
  passed?: number;
  failed?: number;
  inconclusive?: number;
  txHash?: string;
  revokeTx?: string;
  chainId?: number;
}

/**
 * The proofs, read the same way `/data` reads them.
 *
 * Deliberately the same file and the same shape rather than a summary written
 * for this component: a hero that quotes a number the evidence page cannot
 * corroborate is exactly the kind of thing this product exists not to do.
 */
function readProofs(): ProofRow[] {
  for (const p of [
    join(process.cwd(), "data", "proofs.json"),
    join(process.cwd(), "apps/web/data", "proofs.json"),
  ]) {
    if (!existsSync(p)) continue;
    try {
      return (JSON.parse(readFileSync(p, "utf8")) as { proofs?: ProofRow[] }).proofs ?? [];
    } catch {
      return [];
    }
  }
  return [];
}

const RAIL_LABEL = {
  call: "Call it",
  hire: "Hire it",
  mandate: "Mandate it",
} as const;

const RAIL_GIVES = {
  call: "a payment, and nothing else",
  hire: "an escrow it can only open by delivering",
  mandate: "a capped, expiring session",
} as const;

/**
 * One live figure, at display size. §13.1's "numbers that glow".
 *
 * A figure takes its rail colour only when the count is above zero, by the same
 * rule the rail dots follow: an open rail is lit and a closed one is not. A
 * gold nought would be the loudest thing on the page saying nothing is
 * available — the figure stays, because it is measured and true, but it is not
 * illuminated.
 */
function Figure({
  value,
  label,
  rail,
}: {
  value: number;
  label: string;
  rail?: "call" | "hire" | "mandate";
}) {
  return (
    <div className="figure">
      <span
        className="figure__n num"
        {...(rail && value > 0 ? { "data-rail": rail } : {})}
        {...(rail && value === 0 ? { "data-rail-off": "" } : {})}
      >
        {value.toLocaleString("en-US")}
      </span>
      <span className="figure__label">{label}</span>
    </div>
  );
}

export default function Hero({ snapshot, position }: { snapshot: Snapshot; position?: string }) {
  const proofs = readProofs();
  const byRail = new Map(proofs.filter((p) => p.rail).map((p) => [p.rail!, p]));
  const registered = snapshot.registry.registered;

  return (
    <section className="hero" aria-labelledby="hero-h">
      <div className="hero__grid">
        {/* ------------------------------------------------------- the claim */}
        <div className="hero__say">
          <Logotype scale="hero" />

          <h1 id="hero-h" className="display hero__headline">
            Hire an agent to run your money on BNB Chain.
          </h1>

          <p className="hero__promise">
            Choose how much it can do. Watch it work. Take it back anytime.
            {/*
              Dropped on a phone. It is the third sentence of a preamble above a
              live market, and it is repeated in the footer of every page.
            */}
            <span className="hide-phone"> Nothing is listed here until we have called it ourselves.</span>
          </p>

          {/*
            The primary action, and it is the plan's first discontinuity rather
            than a sign-up. Reuses the form the board already uses, so there is
            one control and one code path — a second form here would be a second
            place for the two to disagree.
          */}
          <div className="hero__cta">
            <BoardPositionForm action="/" address={position} variant="hero" />
            <p className="provenance" style={{ marginTop: 8 }}>
              We read your position from the chain. Nothing is signed, and nothing here can move it.
            </p>
          </div>
        </div>

        {/* ------------------------------------------- what has actually happened */}
        <aside className="hero__proof" aria-label="What this marketplace has proven on chain">
          <p className="hero__proof-title">Proven on BNB Smart Chain</p>
          {(["call", "hire", "mandate"] as const).map((rail) => {
            const p = byRail.get(rail);
            return (
              <div key={rail} className="proofrow" data-rail={rail}>
                <span className="proofrow__dot" aria-hidden />
                <span className="proofrow__body">
                  <span className="proofrow__label">{RAIL_LABEL[rail]}</span>
                  <span className="proofrow__detail">
                    {/*
                      Only counts the artifact actually carries. An earlier
                      version defaulted `passed` to zero and said "none failed"
                      whenever `failed` was absent — both of which turn a field
                      the artifact never recorded into a claim about the chain.
                      `tools/checks/absence.ts` failed the build on the first of
                      those, correctly.
                    */}
                    {p && p.passed !== undefined ? (
                      <>
                        {p.passed} proven
                        {p.failed === undefined ? "" : p.failed > 0 ? `, ${p.failed} failed` : ", none failed"}
                        {p.inconclusive ? `, ${p.inconclusive} inconclusive` : ""}
                        {p.chainId === 97 ? " · testnet" : " · mainnet"}
                      </>
                    ) : (
                      <span className="unmeasured">
                        not proven yet
                        <span className="unmeasured__why">
                          No artifact for this rail has been recorded. You give {RAIL_GIVES[rail]}.
                        </span>
                      </span>
                    )}
                  </span>
                </span>
              </div>
            );
          })}
          <Link href="/data" className="proofrow__more">
            Every number, and how it was measured →
          </Link>
        </aside>
      </div>

      {/* ------------------------------------------------------- the funnel */}
      <div className="hero__figures">
        {registered.known ? (
          <Figure value={registered.value} label="registered on BSC" />
        ) : (
          <div className="figure">
            <span className="unmeasured">
              not counted
              <span className="unmeasured__why">{registered.reason}</span>
            </span>
          </div>
        )}
        <Figure value={snapshot.totals.callable} label="callable right now" rail="call" />
        <Figure value={snapshot.totals.hireable} label="hireable right now" rail="hire" />
        <Figure value={snapshot.totals.mandatable} label="can hold a session" rail="mandate" />
        <Figure value={snapshot.totals.probed} label="called by us" />
      </div>
    </section>
  );
}
