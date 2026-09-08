import type { Metadata } from "next";
import Link from "next/link";
import {
  RAILS,
  RAIL_COPY,
  REFUSAL_TEXT,
  TOKENS,
  erc8183,
  jobBySlug,
  resolveChain,
  addressUrl,
  type RailName,
  type RailRefusal,
} from "@bench/shared";
import Nav from "@/components/board/Nav";
import Footer from "@/components/board/Footer";
import { findRow } from "@/lib/board";
import HireAction from "@/components/board/HireAction";

/*
  The screen where authority is decided.

  Everything that would otherwise be a second confirmation dialog is on this
  page, in English, before the button: what it may do, what it may not, where
  the money sits, who can move it, when you get it back, and how many
  signatures you are about to be asked for. Nobody should discover a fourth
  wallet popup halfway through paying for something.
*/
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Put ${decodeURIComponent(id)} to work` };
}

export default async function HirePage({
  params,
  searchParams,
}: {
  params: Promise<{ chain: string; id: string }>;
  searchParams: Promise<{ rail?: string }>;
}) {
  const { chain, id: rawId } = await params;
  const sp = await searchParams;
  const { chainId } = resolveChain(chain);
  const id = decodeURIComponent(rawId);
  const hit = findRow(chainId, id);

  if (!hit) {
    return (
      <>
        <Nav />
        <main className="shell" style={{ paddingBlock: 40, maxWidth: "70ch" }}>
          <h1 className="h1">We have not read this one yet.</h1>
          <p className="prose" style={{ marginTop: 12 }}>
            Nothing can be put to work until it has been called, and this id is not in the part of the
            registry this deployment has crawled.
          </p>
          <Link href="/" className="btn" style={{ marginTop: 18 }}>
            Back to the board
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  const { row, service } = hit;
  const open = RAILS.filter((r) => row.rails[r].open);
  const requested = (RAILS as string[]).includes(sp.rail ?? "") ? (sp.rail as RailName) : null;
  const rail: RailName | null = requested && row.rails[requested].open ? requested : (open[0] ?? null);
  const job = row.job ? jobBySlug(row.job) : null;
  const kernel = erc8183(chainId);
  const u = TOKENS[chainId].U;

  return (
    <>
      <Nav />
      <main className="shell" style={{ paddingBlock: 28, maxWidth: 860 }}>
        <Link href={row.href} className="meta nav__link">
          ← Back to {row.name}
        </Link>

        <h1 className="h1" style={{ marginTop: 10 }}>
          Put {row.name} to work
        </h1>
        {job ? (
          <p className="lede" style={{ marginTop: 6 }}>
            To: {job.line}
          </p>
        ) : null}

        {/* ---------------------------------------------- choose the exposure */}
        <section style={{ marginTop: 24 }} aria-labelledby="give-h">
          <h2 id="give-h" className="h3" style={{ marginBottom: 12 }}>
            How much do you want to give it?
          </h2>
          <div className="rail-choice">
            {RAILS.map((r) => {
              const state = row.rails[r];
              const copy = RAIL_COPY[r];
              const body = (
                <>
                  <div className="between">
                    <span className={`chip ${state.open ? `chip--${r}` : "chip--refused"}`}>{copy.verb}</span>
                    <span className="num meta">
                      {state.open ? (state.price ? state.price : "priced on what it earns") : "unavailable"}
                    </span>
                  </div>
                  <p className="meta" style={{ marginTop: 8, lineHeight: 1.5 }}>
                    {state.open
                      ? copy.gives
                      : (state.detail ?? (state.reason ? REFUSAL_TEXT[state.reason as RailRefusal] : "Not available."))}
                  </p>
                </>
              );
              return state.open ? (
                <Link
                  key={r}
                  href={`/hire/${chainId}/${encodeURIComponent(id)}?rail=${r}`}
                  className="rail-card"
                  {...(rail === r ? { "data-selected": r } : {})}
                >
                  {body}
                </Link>
              ) : (
                <div key={r} className="rail-card" aria-disabled="true">
                  {body}
                </div>
              );
            })}
          </div>
        </section>

        {rail === null ? (
          <section className="notice" style={{ marginTop: 24 }}>
            <h2 className="h3">This one cannot be put to work right now.</h2>
            <p className="prose" style={{ marginTop: 10 }}>
              All three rails are closed, and each card above names the condition that failed rather than
              a generic error. That is the honest end of this journey and it is not a dead end: the board
              has {" "}
              <Link href="/" className="nav__link" style={{ textDecoration: "underline" }}>
                agents that can
              </Link>
              .
            </p>
          </section>
        ) : null}

        {/* -------------------------------------------------- may and may not */}
        {rail ? (
          <section className="panel" style={{ marginTop: 24, padding: 20 }} aria-labelledby="may-h">
            <h2 id="may-h" className="h3" style={{ marginBottom: 14 }}>
              Before you sign
            </h2>
            <div className="may-not">
              <div>
                <span className="meta">May</span>
                <ul className="stack" style={{ gap: 6, marginTop: 8 }}>
                  {mayFor(rail, row.name, job?.authority ?? null).map((t) => (
                    <li key={t} className="prose" style={{ margin: 0 }}>
                      <span style={{ color: "var(--color-rail-call)" }}>+</span> {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="meta">May not</span>
                <ul className="stack" style={{ gap: 6, marginTop: 8 }}>
                  {mayNotFor(rail).map((t) => (
                    <li key={t} className="prose" style={{ margin: 0 }}>
                      <span style={{ color: "var(--color-error)" }}>−</span> {t}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <dl className="terms" style={{ marginTop: 20 }}>
              {rail === "call" ? (
                <>
                  <dt>Price</dt>
                  <dd className="num">{row.rails.call.price}</dd>
                  <dt>Custody</dt>
                  <dd>None. You sign an authorization for exactly this amount; nothing else can be taken with it.</dd>
                  <dt>Gas</dt>
                  <dd>
                    None from you. The seller&rsquo;s facilitator submits the transfer, so you never need BNB to
                    pay for a call on this chain.
                  </dd>
                  <dt>If it fails</dt>
                  <dd>
                    You are out the quoted amount and nothing else. There is no standing permission to
                    revoke, because none was granted.
                  </dd>
                  <dt>Signatures</dt>
                  <dd className="num">1</dd>
                </>
              ) : null}

              {rail === "hire" ? (
                <>
                  <dt>Escrow</dt>
                  <dd className="num">
                    {row.rails.hire.price} into the ERC-8183 job escrow
                  </dd>
                  <dt>Where it sits</dt>
                  <dd>
                    In the kernel at{" "}
                    <a className="nav__link" href={addressUrl(chainId, kernel.commerce)} style={{ textDecoration: "underline" }}>
                      {kernel.commerce.slice(0, 10)}…
                    </a>
                    , not with the agent and not with us.
                  </dd>
                  <dt>Our access</dt>
                  <dd>
                    None. This marketplace is not a party to the job and holds no key. It cannot move,
                    release or reclaim your escrow.
                  </dd>
                  <dt>If it never delivers</dt>
                  <dd>You reclaim the whole escrow yourself after the deadline, in one call from your own wallet.</dd>
                  <dt>Approval</dt>
                  <dd>
                    Exactly the budget, never unlimited. An unlimited approval would save you one signature
                    and leave the kernel able to move every {u.symbol} you will ever hold.
                  </dd>
                  <dt>Signatures</dt>
                  <dd className="num">up to 5, or 1 batched through an Altana wallet</dd>
                </>
              ) : null}

              {rail === "mandate" ? (
                <>
                  <dt>Authority</dt>
                  <dd>{job?.authority ?? "the calls this job needs"}, and nothing else</dd>
                  <dt>Cap</dt>
                  <dd>A spending limit you set, enforced by the account contract rather than by the runner.</dd>
                  <dt>Expiry</dt>
                  <dd>On chain, not in a configuration file. It stops working by itself.</dd>
                  <dt>Recipient</dt>
                  <dd>
                    Where a call carries a destination argument, the session is granted on a wrapper whose
                    interface has no recipient parameter — so there is nothing for the agent to pass.
                  </dd>
                  <dt>Revoke</dt>
                  <dd>
                    One transaction from{" "}
                    <Link href="/desk" className="nav__link" style={{ textDecoration: "underline" }}>
                      the desk
                    </Link>
                    . Effect is immediate.
                  </dd>
                  <dt>Signatures</dt>
                  <dd className="num">1</dd>
                </>
              ) : null}
            </dl>

            <div style={{ marginTop: 22 }}>
              <HireAction
                chainId={chainId}
                id={id}
                rail={rail}
                name={row.name}
                price={row.rails[rail].price}
                resource={service?.resource ?? null}
              />
            </div>
          </section>
        ) : null}
      </main>
      <Footer />
    </>
  );
}

/**
 * The may and may-not lists, per rail.
 *
 * Generated from the rail rather than written as marketing copy, because the
 * whole value of this panel is that it describes the authority actually being
 * granted. For the mandate rail the exact allowlist is derived from the
 * capability scan at grant time and shown by the action below.
 */
function mayFor(rail: RailName, name: string, authority: string | null): string[] {
  switch (rail) {
    case "call":
      return [
        "Read public chain state and answer your question",
        "Take exactly the quoted amount, once, from the authorization you sign",
      ];
    case "hire":
      return [
        "Do the job described in the terms it signed",
        "Submit a deliverable, committed on chain as a hash before you read it",
        "Claim the escrow once the dispute window passes without challenge",
      ];
    case "mandate":
      return [
        authority ? `${authority[0]!.toUpperCase()}${authority.slice(1)}` : `Act for ${name} within this job`,
        "Act only up to the cap you set, only until the expiry",
      ];
  }
}

function mayNotFor(rail: RailName): string[] {
  switch (rail) {
    case "call":
      return [
        "Take any amount other than the one quoted",
        "Reuse the authorization: the nonce is spent once and cannot be replayed",
        "Touch anything else in your wallet",
      ];
    case "hire":
      return [
        "Take the escrow without submitting a deliverable",
        "Change the terms after the job is on chain — they are hashed into it",
        "Reach any other funds of yours: the escrow is a fixed amount you approved exactly",
      ];
    case "mandate":
      return [
        "Send your position or its proceeds to any address but yours",
        "Call anything outside the allowlist — the account reverts at validation, before execution",
        "Trade, borrow, or approve a third party to spend your tokens",
        "Keep acting after you revoke, or after the expiry passes",
      ];
  }
}
