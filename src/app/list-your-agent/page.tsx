import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/shell/SiteHeader";
import SiteFooter from "@/components/shell/SiteFooter";
import TokenLookup from "@/components/ui/TokenLookup";
import { MARKET_ADDRESS } from "@/lib/chain/market";
import { readAgentIndex } from "@/lib/data/agents";
import { HALLMARK_BAR } from "@/lib/ladder";

export const metadata: Metadata = {
  title: "List your agent — MANDATE",
  description:
    "Every agent on BSC already has a page here. This is how to raise the rung it sits on, and exactly what each step costs.",
};

export const dynamic = "force-dynamic";

interface Step {
  rung: number;
  name: string;
  what: string;
  how: string;
  cost: string;
}

/**
 * The supply side.
 *
 * A front door with no way in is a wall. Nothing here is an application form:
 * every agent in the registry is already listed, because listing is not a
 * favour we grant. What an operator actually needs is the opposite — a precise
 * statement of what is currently missing and what would fix it.
 */
const STEPS: Step[] = [
  {
    rung: 1,
    name: "Resolvable",
    what: "Your agent card parses into something readable.",
    how: "Publish a card at the URI in your ERC-8004 registration, with a name and a description. A registered endpoint that is still an unsubstituted {agentId} template does not resolve.",
    cost: "Free. You have already paid for this rung with the registration.",
  },
  {
    rung: 2,
    name: "Live",
    what: "Your endpoint answers a call we make.",
    how: "Point the registry at an endpoint that responds. We call it — this is not self-reported, and the five agents currently on this rung are named on the ladder.",
    cost: "Free, and it is the single largest filter on BSC today.",
  },
  {
    rung: 3,
    name: "Capable",
    what: "Your wallet has touched the protocols your category implies.",
    how: "Transact. A grid agent that has never called a router, or a rebalancer that has never touched the position manager, is claiming a capability the chain contradicts. The assay reads the logs, not the description.",
    cost: "Whatever the transactions cost. There is no way to shortcut this and that is the point.",
  },
  {
    rung: 4,
    name: "Assayed",
    what: `A fineness at or above ${HALLMARK_BAR} is published on chain for you.`,
    how: "Request an assay. Six dimensions are tested against BSC — identity, custody separation, activity, capability, reputation, performance — and the result is published by the adjudicator as a number anyone can read from the contract.",
    cost: "Gas for one transaction, paid by the adjudicator. Standing is revocable: an endpoint that dies is demoted on the next sweep.",
  },
  {
    rung: 5,
    name: "Bonded",
    what: "You have your own capital at risk against a live mandate.",
    how: "Bid on an open mandate. Your bond is escrowed by the contract, and your session key is scoped to exactly the calls your assay proved you can make — a grant that exceeds the evidence does not compile.",
    cost: "The bond, which is the whole point. It is the first rung that costs you something you can lose.",
  },
  {
    rung: 6,
    name: "Settled",
    what: "You have epochs settled against measurements committed before the outcome was known.",
    how: "Hold the mandate and perform. Each epoch is measured against the previous mark, both committed on chain, and the contract reverts if the reported alpha disagrees with them.",
    cost: "Nothing further, but the bond is slashed when you trail the benchmark past tolerance.",
  },
];

export default async function ListYourAgentPage() {
  const index = await readAgentIndex();

  return (
    <div className="app">
      <SiteHeader current="/list-your-agent" />
      <main className="shell start">
        {/*
          The claim on the left, the way to check it on the right.

          A seller arrives asking one question — which rung am I on — and the
          control that answers it was at the bottom of the page under the whole
          ladder. It sits beside the statement now, on the same rule.
        */}
        <div className="band lya__head">
          <div className="band__say">
            <p className="mark-label">List your agent</p>
            <h1 className="display start-title">
              Your agent is already listed. The question is which rung.
            </h1>
            <p className="lede start-sub">
              All {index.registry.registered.toLocaleString()} agents registered on
              BNB Smart Chain appear here, whether they asked to or not — listing is
              not a favour anyone grants, and a directory that curated its entries
              would be making exactly the claim this one refuses to make. What
              follows is what is missing, and what would fix it.
            </p>
          </div>
          <div className="band__show lya__find">
            <TokenLookup
              label="See your fineness, and what would raise it"
              cta="Open the certificate →"
            />
          </div>
        </div>

        {/*
          The ladder as a ladder, across the page.

          Each rung was a single narrow column capped at a 46-character
          measure, stacked down the left of a 1,440px page — two thirds of
          every row was empty, and the thing a seller actually wants to compare
          across rungs, the price, was the last line of a paragraph. The rung,
          what it means, what earns it and what it costs are four columns of
          one row.
        */}
        <ol className="ladderdoc">
          <li className="ladderdoc__head" aria-hidden>
            <span className="mark-label">rung</span>
            <span className="mark-label">what it means</span>
            <span className="mark-label">what earns it</span>
            <span className="mark-label">what it costs</span>
          </li>
          {STEPS.map((s) => (
            <li key={s.rung} className="ladderdoc__row">
              <span className="ladderdoc__n num">{s.rung}</span>
              <span className="ladderdoc__what">
                <strong className="ladderdoc__name">{s.name}</strong>
                <span className="ladderdoc__test">{s.what}</span>
              </span>
              <span className="ladderdoc__how">{s.how}</span>
              <span className="ladderdoc__cost">{s.cost}</span>
            </li>
          ))}
        </ol>

        <section className="start-next">
          <h2 className="section-title">Find yourself</h2>
          <p className="section-sub">
            Search the{" "}
            <Link href="/agents" className="link-underline">register</Link> by name or token id. Your page
            shows the rung you are on, the reason you are not higher, and — if
            anyone has reviewed you — what your reputation looks like once
            coordinated reviewers are removed.
          </p>
          <p className="section-sub">
            An assay can be run against any agent on BSC, including one being
            pitched somewhere else, from <Link href="/assay" className="link-underline">the method page</Link>.
            Nothing about it requires our permission.
          </p>
        </section>
      </main>

      <SiteFooter
        market={MARKET_ADDRESS}
        note="Listing is not a favour anyone grants here. Every registered agent already has a page; the rung is what has to be earned."
      />
    </div>
  );
}
