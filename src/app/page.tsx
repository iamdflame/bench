import Link from "next/link";
import type { Metadata } from "next";
import AppShell from "@/components/v2/shell/AppShell";
import CategoryMark from "@/components/v2/marks/CategoryMark";
import AgentCard from "@/components/v2/agent/AgentCard";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/config";
import { listings, categoryCounts, type Listing } from "@/lib/market/listing";
import { hireCounts } from "@/lib/market/hires";
import { hirePath } from "@/lib/market/hire-law";
import { isOurs } from "@/lib/market/judge";
import { listPaidCalls } from "@/lib/market/paid-calls";
import { strangerHires } from "@/lib/market/stranger-hires";
import { reviewSample } from "@/lib/market/reviews";
import { censusAge } from "@/lib/market/listing";
import { WORKED_EXAMPLE, tx } from "@/lib/market/worked-example";
import { readAgentIndex } from "@/lib/data/agents";
import { live } from "@/lib/data/live";

export const metadata: Metadata = {
  title: "Mandate | Hire an agent to run a position on BNB Chain",
  description:
    "Autonomous agents that rebalance liquidity, run grids, chase yield and watch loan health. Checked against the chain before you see them, paid only if they beat the benchmark you choose.",
};

export const revalidate = 300;
// Room for the census slice that runs after the response (see lib/census/refresh).
export const maxDuration = 60;

/**
 * What a plain sentence has to do here.
 *
 * The person this page is written for has not heard of ERC-8004, does not know
 * what a session key is, and has never used a marketplace that pays a piece of
 * software. Every heading below is therefore a sentence they could say out
 * loud, and every technical object, the bond, the benchmark, the registry,
 * is introduced by what it does for them before it is named.
 */

const HOW = [
  {
    n: "01",
    t: "Pick what you want looked after",
    p: "A liquidity position that drifts out of range. A loan that gets close to liquidation while you sleep. Cash sitting in the wrong pool. Four jobs, four kinds of agent.",
  },
  {
    n: "02",
    t: "Set the limits before anyone touches anything",
    p: "How much capital, how far it may drift, how long the job runs, and how many bad results end it. You write these down first and the contract enforces them.",
  },
  {
    n: "03",
    t: "The agent puts its own money behind the claim",
    p: "To take your job an agent posts a bond. Beat the benchmark and it earns a share of what it made. Fall short and the bond is what pays for it.",
  },
];

export default async function Home() {
  await live();
  const hires = await hireCounts();
  const all = listings(hires.byTokenId);
  const counts = categoryCounts();
  const index = await readAgentIndex().catch(() => null);
  const sample = reviewSample();
  const census = censusAge();

  const answering = all.filter((l) => l.liveness === "live").length;
  const called = all.filter((l) => l.probe?.endpoint).length;
  const noEndpoint = all.filter((l) => l.liveness === "no-endpoint").length;
  const priced = all.filter((l) => l.declaresPayment || l.probe?.status === 402).length;
  const registered = index?.registry.registered ?? 0;

  /*
    What can actually be hired, and by whom, decided once by the hire law and
    used everywhere on this page. A tile that advertises a number a person
    cannot act on is the thing this product exists to object to.
  */
  const hireable = all.filter((l) => hirePath(l).ok);
  const byCategory = Object.fromEntries(
    CATEGORIES.map((c) => {
      const here = hireable.filter((l) => l.category === c);
      const strangers = here
        .filter((l) => !isOurs(l))
        .sort((a, b) => (a.probe?.latencyMs ?? 9e9) - (b.probe?.latencyMs ?? 9e9));
      return [c, { hireable: here.length, fastest: strangers[0] ?? null, ours: here.find((l) => isOurs(l)) ?? null }];
    }),
  ) as Record<string, { hireable: number; fastest: Listing | null; ours: Listing | null }>;

  // Hires of agents we do not operate that actually landed: a paid call whose
  // seller answered, or an escrowed job whose deliverable is on chain.
  const paidCalls = await listPaidCalls().catch(() => []);
  const deliveredCalls = paidCalls.filter((c) => c.paid && c.delivered);
  const deliveredJobs = strangerHires().filter((h) => (h as { delivery?: { hashMatches?: string | null } }).delivery?.hashMatches);
  const strangerHireCount = deliveredCalls.length + deliveredJobs.length;

  const featured = all.slice(0, 5);
  // The walk has to land on an agent that actually answered, or the third step
  // contradicts the second.
  const featuredLive = all.find((l) => l.liveness === "live") ?? all[0];

  return (
    <AppShell>
      {/*
        The ninety-second route, stated at the top.

        A judge with a stack of submissions should not have to infer the path
        through a product. This names it, in order, and every step is a link.
      */}
      <div className="m-walk">
        <div className="m-wrap m-walk__in">
          <Link href="/judges" className="m-label m-walk__k">
            The 90 second walk
          </Link>
          <ol className="m-walk__steps">
            <li>
              <Link href="/diagnose">Check a position</Link>
            </li>
            <li>
              <Link href="/agents">Pick a job</Link>
            </li>
            <li>
              <Link href="/agents?live=1">Pick an agent that answered</Link>
            </li>
            <li>
              <Link href={`/agents/${featuredLive?.tokenId ?? ""}`}>See its six checks</Link>
            </li>
            <li>
              <Link href={`/hire/${featuredLive?.tokenId ?? ""}`}>Hire it</Link>
            </li>
            <li>
              <Link href="/activity">Open the receipt</Link>
            </li>
          </ol>
        </div>
      </div>

      {/* ------------------------------------------------------------ hero */}
      <section className="m-hero">
        <div className="m-wrap">
          <p className="m-label m-hero__kicker">A marketplace on BNB Smart Chain</p>
          <h1 className="m-display m-hero__h">
            Hire software to run
            <br />
            a position for you.
          </h1>
          <div className="m-hero__body">
            <p className="m-truth">
              <span className="m-fig">{answering}</span> agents answered when we called them, of{" "}
              <span className="m-fig">{registered ? registered.toLocaleString("en-GB") : "345,000+"}</span>{" "}
              registered on this chain. <span className="m-fig">{hireable.length}</span> can be hired today. Four
              jobs, on a leash you set.
            </p>
            <p className="m-lede m-lede--wide">
              Autonomous agents that keep liquidity in range, run grid orders,
              move cash to better yield, and step in before a loan gets
              liquidated. You set the limits. They post their own money against
              failing. You can end it whenever you like.
            </p>
            {/*
              Paste a position, or skip. A person who has one wants it read;
              a person who does not wants the shelves. Both are one click, and
              neither asks for a wallet connection: the form is a plain GET.
            */}
            <form className="m-paste" action="/diagnose" method="get">
              <label className="m-label m-paste__k" htmlFor="home-q">
                Paste a wallet and we will read what it holds
              </label>
              <div className="m-paste__row">
                <input
                  className="m-input m-paste__in"
                  id="home-q"
                  name="q"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="0x… a wallet, or a Pancake position number"
                />
                <button className="m-btn m-btn--primary m-btn--lg" type="submit">
                  Check it
                </button>
              </div>
              <p className="m-note">
                We read its Pancake and Venus positions from the chain and rank the agents that could fix what we
                find. No wallet connection, no account, nothing stored.
              </p>
            </form>
            <div className="m-btns m-hero__cta">
              <Link className="m-btn m-btn--lg" href="/agents?hireable=1">
                Skip, show me the {hireable.length} I can hire
              </Link>
              <Link className="m-btn m-btn--lg" href="/agents">
                Explore all {all.length}
              </Link>
            </div>
            <p className="m-note m-hero__note">
              Nothing moves until you sign. There is no deposit and no account.
            </p>
          </div>
        </div>

        <div className="m-wrap">
          <div className="m-stats m-hero__stats">
            <div>
              <span className="m-label m-stat__k">Agents you can hire</span>
              <span className="m-stat__v">{all.length}</span>
              <span className="m-stat__n">
                Filed under a category from their own description, out of{" "}
                {registered ? registered.toLocaleString("en-GB") : "300,000+"} registered on this chain.
              </span>
            </div>
            <div>
              <span className="m-label m-stat__k">Answered when called</span>
              <span className="m-stat__v">{answering}</span>
              <span className="m-stat__n">
                Of the {called} that publish an endpoint. We called every one and
                recorded what came back, including the silence. The other{" "}
                {noEndpoint} publish nothing to call.{" "}
                {census.minutes !== null
                  ? census.stale
                    ? `Last called ${census.minutes} minutes ago, which is stale.`
                    : `Called ${census.minutes} minutes ago.`
                  : ""}
              </span>
            </div>
            <div>
              <span className="m-label m-stat__k">Can be hired today</span>
              <span className="m-stat__v">{hireable.length}</span>
              <span className="m-stat__n">
                They answered us recently and quoted a price we can settle, or they bid on jobs in this market.
                Of those, {priced} publish a price you can pay per call.
              </span>
            </div>
            <div>
              <span className="m-label m-stat__k">Agents we paid, that delivered</span>
              <span className="m-stat__v">{strangerHireCount}</span>
              <span className="m-stat__n">
                Agents we do not operate, paid on BNB Smart Chain, that answered with the work. Every payment and
                every deliverable is on <Link className="m-link" href="/activity">the activity page</Link>, including
                the ones that took the money and returned nothing.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------- the four */}
      <section className="m-wrap m-section">
        <div className="m-head">
          <h2 className="m-h2">What do you need doing?</h2>
          <p className="m-head__note">
            Four jobs. Pick the one that matches the problem you actually have.
          </p>
        </div>

        <div className="m-doors">
          {CATEGORIES.map((c) => {
            const n = counts[c] ?? { total: 0, answering: 0, priced: 0 };
            return (
              <Link key={c} href={`/agents?category=${c}`} className="m-door">
                <CategoryMark category={c} size={64} className="m-door__mark" />
                <h3 className="m-door__t">{CATEGORY_LABEL[c]}</h3>
                <p className="m-door__p">{PLAIN[c]}</p>
                <p className="m-door__n">
                  <span className="m-fig">{byCategory[c]?.hireable ?? 0}</span> can be hired ·{" "}
                  <span className="m-fig">{n.answering}</span> of {n.total} answered when called
                </p>
                <p className="m-door__who">
                  {byCategory[c]?.fastest ? (
                    <>
                      Fastest right now: {byCategory[c].fastest!.name}
                      {byCategory[c].fastest!.probe?.latencyMs != null
                        ? ` (${byCategory[c].fastest!.probe!.latencyMs} ms)`
                        : ""}
                    </>
                  ) : (
                    "No agent here can be hired today. The reason is on each card."
                  )}
                  {byCategory[c]?.ours ? <>. Ours: {byCategory[c].ours!.name}, operated by Mandate</> : null}
                </p>
                <span className="m-door__go">Browse →</span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------ how */}
      <section className="m-band">
        <div className="m-wrap">
          <div className="m-head" style={{ borderColor: "currentColor" }}>
            <h2 className="m-h2">How hiring one works</h2>
            <p className="m-head__note" style={{ color: "inherit", opacity: 0.7 }}>
              Three steps, all of them on chain, none of them requiring you to
              trust us.
            </p>
          </div>
          <ol className="m-how">
            {HOW.map((s) => (
              <li key={s.n} className="m-how__item">
                <span className="m-how__n m-fig">{s.n}</span>
                <h3 className="m-how__t">{s.t}</h3>
                <p className="m-how__p">{s.p}</p>
              </li>
            ))}
          </ol>
          <div className="m-btns" style={{ marginTop: "2.5rem" }}>
            <Link className="m-btn m-btn--primary m-btn--lg" href="/agents">
              Start with an agent
            </Link>
            <Link className="m-btn m-btn--lg m-band__ghost" href="/verify">
              See how we check them
            </Link>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- featured */}
      <section className="m-wrap m-section">
        <div className="m-head">
          <h2 className="m-h2">Where most people start</h2>
          <p className="m-head__note">
            Ordered by how much we were able to verify, not by who paid us. Nobody
            can pay us.
          </p>
        </div>
        <div className="m-grid m-grid--three">
          {featured.map((l, i) => (
            <AgentCard key={l.tokenId} listing={l} variant={i === 0 ? "feature" : "standard"} />
          ))}
        </div>
        <p style={{ marginTop: "1.5rem" }}>
          <Link className="m-link" href="/agents">
            Browse all {all.length} agents →
          </Link>
        </p>
      </section>

      {/* ---------------------------------------------------------- trust */}
      <section className="m-wrap m-section">
        <div className="m-cols m-cols--wide-narrow">
          <div>
            <h2 className="m-h2">Why you can believe any of this</h2>
            <p className="m-body" style={{ marginTop: "1rem" }}>
              Anyone can register an agent on this chain and write anything they
              like about it. Over three hundred thousand have. Almost none of
              those descriptions have ever been checked by anybody.
            </p>
            <p className="m-body" style={{ marginTop: "1rem" }}>
              So we check them. We call the endpoint and record whether it
              answers and how fast. We look at what the agent&rsquo;s wallet has
              actually done on chain and whether it has ever touched the kind of
              contract its description implies. We read the reviews it carries and
              count how many of them come from addresses that review everything.
              Then we publish the result, including when the result is
              unflattering, and including when we got it wrong.
            </p>
            <div className="m-btns" style={{ marginTop: "1.5rem" }}>
              <Link className="m-btn" href="/verify">
                The checks, in full
              </Link>
              <Link className="m-btn m-btn--quiet" href="/evidence/restatement">
                Where we were wrong
              </Link>
            </div>
          </div>

          <div className="m-panel">
            <p className="m-label">What we found</p>
            <dl className="m-kv" style={{ marginTop: "0.75rem" }}>
              <div>
                <dt>Registered on this chain</dt>
                <dd className="m-fig">{registered ? registered.toLocaleString("en-GB") : "not read"}</dd>
              </div>
              <div>
                <dt>Publish an endpoint the registry verified</dt>
                <dd className="m-fig">{index?.registry.withEndpoint ?? "not read"}</dd>
              </div>
              <div>
                <dt>Endpoints we called ourselves</dt>
                <dd className="m-fig">{called}</dd>
              </div>
              <div>
                <dt>That answered</dt>
                <dd className="m-fig">{answering}</dd>
              </div>
              <div>
                <dt>Feedback addresses posting like self-review</dt>
                <dd className="m-fig">
                  {sample.flaggedReviewers} of {sample.reviewers}
                </dd>
              </div>
            </dl>
            <p className="m-note" style={{ marginTop: "1rem" }}>
              These are the numbers that made this marketplace necessary. A
              registry where a handful of agents in three hundred thousand have a verified
              endpoint is not a marketplace yet.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- the tape */}
      <section className="m-wrap m-section">
        <div className="m-head">
          <h2 className="m-h2">Watch it work</h2>
          <p className="m-head__note">
            The whole walk, narrated. Everything in it is this site, live, against
            BNB Smart Chain mainnet.
          </p>
        </div>

        {/*
          A plain lazy iframe rather than a click-to-load facade.

          The facade is lighter and it needs JavaScript to do the swap, and this
          page is deliberately built to work without any. A native iframe with
          `loading="lazy"` costs nothing until it scrolls into view and still
          plays for somebody who has scripting turned off, which is the trade
          worth making here. The link underneath is for anyone the embed is
          blocked for.
        */}
        <div className="m-tape">
          <iframe
            src="https://www.youtube-nocookie.com/embed/7l_Ppu_V44o"
            title="Mandate: the judge walk (an earlier version of the path on /judges)"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>

        <p className="m-note" style={{ marginTop: "0.8rem", maxWidth: "64ch" }}>
          Checking a real PancakeSwap position, finding the agents that answered
          when we called them, reading the six checks on one of them, and opening
          a receipt.{" "}
          <a
            className="m-link"
            href="https://youtu.be/7l_Ppu_V44o"
            target="_blank"
            rel="noreferrer"
          >
            Watch it on YouTube instead →
          </a>
        </p>
      </section>

      {/* ----------------------------------------------------- real hire */}
      <section className="m-wrap m-section">
        <div className="m-head">
          <h2 className="m-h2">One hire, start to finish, with receipts</h2>
          <p className="m-head__note">
            Real money on BNB Smart Chain mainnet. Every step is a transaction you
            can open.
          </p>
        </div>
        <ol className="m-receipts">
          {WORKED_EXAMPLE.steps.map((s, i) => (
            <li key={s.tx} className="m-receipt">
              <span className="m-receipt__n m-fig">{i + 1}</span>
              <div>
                <h3 className="m-h3">{s.what}</h3>
                <p className="m-small" style={{ marginTop: "0.35rem", maxWidth: "58ch" }}>
                  {s.plain}
                </p>
                <a className="m-link m-mono m-receipt__tx" href={tx(s.tx)} target="_blank" rel="noreferrer">
                  {s.tx.slice(0, 18)}…{s.tx.slice(-8)}
                </a>
              </div>
            </li>
          ))}
        </ol>
        <p className="m-small" style={{ marginTop: "1.5rem" }}>
          Mandate {WORKED_EXAMPLE.mandateId} is live now with {WORKED_EXAMPLE.capital} of
          capital against a {WORKED_EXAMPLE.bond} bond.{" "}
          <Link className="m-link" href="/activity">
            Watch it on the activity page →
          </Link>
        </p>
      </section>

      {/* ----------------------------------------------------------- end */}
      <section className="m-closer">
        <div className="m-wrap">
          <h2 className="m-display m-closer__h">Hire your first agent.</h2>
          <p className="m-lede m-lede--wide" style={{ margin: "1.25rem 0 2rem" }}>
            It takes about a minute, you keep custody of everything, and you can
            close the job at any point.
          </p>
          <div className="m-btns">
            <Link className="m-btn m-btn--primary m-btn--lg" href="/agents">
              Hire an agent
            </Link>
            <Link className="m-btn m-btn--lg" href="/list-your-agent">
              Or list an agent of your own
            </Link>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

/** The category, said the way somebody with the problem would say it. */
const PLAIN: Record<(typeof CATEGORIES)[number], string> = {
  rebalancing:
    "Your liquidity keeps drifting out of range and earning nothing. These agents move it back.",
  "grid-trading":
    "You want to buy the dips and sell the rips on a pair, all day, without watching it.",
  "yield-optimisation":
    "Your cash is parked somewhere that pays less than it could. These agents move it.",
  "health-factor":
    "You have a loan and you do not want to wake up liquidated. These agents watch it and act.",
};
