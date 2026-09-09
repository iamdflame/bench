import Command from "./Command";
import { CATEGORY_LABEL, EXPLORER, type Category } from "@/lib/config";

/**
 * How to put this agent to work — and, more often, what it would take before
 * anyone could.
 *
 * The brief asks for one venue to browse agents, see how they have performed,
 * and put them to work. Browsing and performance were built; hiring was
 * reachable only from the floor, which meant an agent's own page — the page
 * you land on having decided you might want it — had no way to act on that
 * decision. A marketplace you cannot buy from is a directory.
 *
 * The correction to that overshot. Every agent, at every rung, was offered
 * "Open a mandate with this agent named" as its primary action, including our
 * own registration on the day it was minted with no card, no endpoint and no
 * bond. That button was an instruction to escrow capital against an agent the
 * market would refuse to let bid — a dead end dressed as the product, on the
 * one page where a judge is deciding whether any of this is real.
 *
 * So the action is derived from the rung, the way every other figure on this
 * site is derived rather than claimed:
 *
 *   0-1 unresolvable or silent   assay it; say what is missing
 *   2   answering, unbonded      call it over x402; it cannot take a mandate
 *   4   assayed above the bar    it may bid, so name the office it may bid in
 *   5+  bonded                   open a mandate, prefilled
 *
 * The rung is computed on the server from the market's own holders, not from
 * the streamed assay, because whether an agent may take capital is the
 * contract's answer and not ours.
 */
export default function Hire({
  tokenId,
  rung,
  fineness,
  endpointVerified,
  agentWallet,
  category,
  bondWei,
  mandateId,
}: {
  tokenId: string;
  /** Ladder placement, from the market. Null while the chain is unread. */
  rung: number | null;
  /** Null while the assay is still running. */
  fineness: number | null;
  endpointVerified: boolean;
  agentWallet?: string | null;
  category?: Category | null;
  /** Bond currently at risk across this holder's mandates, in wei. */
  bondWei?: string | null;
  /** A mandate this agent already holds, for the ledger link. */
  mandateId?: number | null;
}) {
  const bonded = rung !== null && rung >= 5;
  const assayed = rung === 4;
  const answering = endpointVerified || rung === 2;

  return (
    <section className="panel hire" aria-labelledby="hire-title">
      <div className="panel__head">
        <h2 id="hire-title" className="mark-label">
          {bonded ? "Put it to work" : "What it would take"}
        </h2>
        <span className="mark-label">
          {rung === null
            ? "the market could not be read"
            : bonded
              ? "bonded · may hold capital"
              : assayed
                ? "assayed · may bid"
                : answering
                  ? "answering · may be called, may not be mandated"
                  : "unmarked · not callable"}
        </span>
      </div>

      <div className="panel__body">
        <div className="hire__routes">
          <div className="hire__route">
            <span className="mark-label">Under mandate</span>
            {bonded ? (
              <>
                <p className="small hire__what">
                  This agent holds capital under a mandate now
                  {bondWei && BigInt(bondWei) > 0n
                    ? `, with ${(Number(BigInt(bondWei)) / 1e18).toFixed(5)} BNB of its own escrowed against it`
                    : ""}
                  . Open another and it bids the same way: its bond is slashed when it
                  trails the benchmark past tolerance, and you never hand over your keys
                  — it acts under an ERC-8183 session key scoped to the calls its assay
                  proved it can make.
                </p>
                <a className="btn btn--primary" href={`/floor?agent=${tokenId}`}>
                  Open a mandate →
                </a>
                {mandateId !== null && mandateId !== undefined ? (
                  <a className="btn btn--sm" href={`/mandate/${mandateId}`}>
                    Read its current ledger →
                  </a>
                ) : null}
              </>
            ) : assayed ? (
              <>
                <p className="small hire__what">
                  Its fineness is published on chain at or above 375, so the market will
                  accept a bid from it. It has never posted one. A mandate opened in{" "}
                  {category ? CATEGORY_LABEL[category] : "its office"} is a lot it can bid
                  for; until it does, no capital of yours is at risk and none of its own
                  is either.
                </p>
                <a
                  className="btn btn--primary"
                  href={category ? `/office/${category}` : "/floor"}
                >
                  Open a lot it can bid for →
                </a>
              </>
            ) : (
              <>
                {/*
                  The refusal is named, in the present tense, with the thing
                  that would change it. PositionCrew puts the failed condition
                  on the ticket rather than in a toast; this is the same move
                  one step earlier — before a button exists to be pressed.
                */}
                <p className="small hire__what">
                  This agent cannot take a mandate. The market requires a bond, and
                  nothing has ever been escrowed from this wallet
                  {fineness !== null && fineness < 375
                    ? `; its fineness of ${fineness} is below the 375 bar besides`
                    : ""}
                  . Offering you a button here would be offering a transaction the
                  contract would refuse.
                </p>
                <a className="btn" href="/list-your-agent">
                  What it would take to bid →
                </a>
              </>
            )}
          </div>

          <span className="hire__rule" aria-hidden />

          <div className="hire__route">
            <span className="mark-label">Per call, over x402</span>
            <p className="small hire__what">
              {answering
                ? "This agent's endpoint answers, so a single question can be bought outright: the first request returns a 402 carrying the price, the second carries a signed USD1 authorisation and returns the answer. The seller submits the transfer, so the buyer needs no BNB."
                : "No endpoint of ours has ever reached this agent, so there is nothing to call. The assay below is still purchasable — it is our reading of the agent, not the agent's own answer."}
            </p>
            <Command note="Returns 402 with the price and the payment terms. Priced at 0.01 USD1.">
              {`curl -i https://mandate-coral.vercel.app/api/x402/agent/${tokenId}/status`}
            </Command>
          </div>
        </div>

        {!bonded && !assayed ? (
          <p className="mark-label hire__wallet">
            <a className="link-underline" href="/assay">
              How the six tests work →
            </a>{" "}
            — what each one asks of the chain, and what makes it fail.
          </p>
        ) : null}

        {agentWallet ? (
          <p className="mark-label hire__wallet">
            Acts from{" "}
            <a
              className="link-underline num"
              href={`${EXPLORER}/address/${agentWallet}`}
              target="_blank"
              rel="noreferrer"
            >
              {agentWallet}
            </a>
          </p>
        ) : null}
      </div>
    </section>
  );
}
