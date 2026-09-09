import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/shell/SiteHeader";
import SiteFooter from "@/components/shell/SiteFooter";
import Command from "@/components/ui/Command";
import { MARKET_ADDRESS } from "@/lib/chain/market";

export const metadata: Metadata = {
  title: "Evidence — MANDATE",
  description:
    "The Agent Advantage Report, the Sybil finding, session-scope proofs, and the measurements that went against us. Every one with the command that reproduces it.",
};

interface Item {
  title: string;
  body: string;
  command?: string;
  href?: string;
  hrefLabel?: string;
}

const PROOFS: Item[] = [
  {
    title: "The Agent Advantage Report",
    body: "Six tasks run with an agent and without one, two of them security tasks. The method was hashed and written to BSC before any result existed, so the measurement window was chosen by the chain rather than by us.",
    href: "https://github.com/iamdflame/mandate-bnb/blob/main/docs/AGENT_ADVANTAGE_REPORT.md",
    hrefLabel: "Read the report",
  },
  {
    title: "Independent verification",
    body: "A published package that re-derives any settlement from public chain state. It reads no database, no API and no file we control — enforced by a build step that fails if any of those appear in its source.",
    command: "npx mandate-verify --mandate 0 --chain 56 --deployment v1",
  },
  {
    title: "The reputation registry is manufactured",
    body: "3,000 feedback records on the BSC registry were written by 32 distinct wallets. 99% of them come from the 14 flagged as coordinated, and the flag set does not move across the whole threshold sweep.",
    command: "npm run sybil",
  },
  {
    title: "Session scope, proven by attacking it",
    body: "An agent permitted to swap through the PancakeSwap V3 router still cannot call sweepToken on it. Both refusals return a named UnauthorizedCall, before any simulation.",
    command: "npm run prove-session",
  },
  {
    title: "Authority follows demonstrated capability",
    body: "A session's allowlist is the intersection of its category's calls and the protocols the chain has shown that agent using. The rule is enforced by the type system: a grant that has not been through an assay does not compile.",
    command: "npm run scope-audit",
  },
  {
    title: "The working, on Greenfield",
    body: "Every attestation's full breakdown is stored on BNB Greenfield, read back over the storage provider's public gateway, and re-hashed against what the chain records.",
    command: "npm run greenfield -- check",
  },
];

/**
 * Adverse results, as policy.
 *
 * A product whose thesis is that self-reported numbers are worthless does not
 * get to publish only its wins. These are the measurements that went against
 * us, kept here permanently rather than dropped when they stopped being
 * convenient.
 */
const ADVERSE: Item[] = [
  {
    title: "We measured our own agents wrong, and slashed one for it",
    body: "The valuation read native BNB and USDT and nothing else, so a V3 position, a Venus supply, a debt repayment or a WBNB wrap all counted as zero — the better an agent performed, the harder it was punished. Three slashes totalling 0.00037 BNB stand against one agent on that basis. The gauge is fixed; the re-derivation that would prove each slash wrong needs archive state no free BSC endpoint serves, so nothing has been returned on an assumption and the gap is stated rather than closed quietly.",
    href: "https://github.com/iamdflame/mandate-bnb/blob/main/docs/RESTATEMENT.md",
    hrefLabel: "Read the restatement",
  },
  {
    title: "The rebalancing agent lost to doing nothing",
    body: "Over the locked window, the one sampled position that crossed the agent's re-centre trigger came back into range on its own. A re-centre would have paid gas and crystallised impermanent loss for nothing. On that window, at that tolerance, inaction beat the agent.",
  },
  {
    title: "Our own pre-registered metric was badly specified",
    body: "The yield task defined the spread across all listed Venus markets with no liquidity filter, so it named a dead Terra market paying 2,491% APY with $0 of cash in it. The stopping rule forbids repairing a metric after seeing its result, so the flawed number is published as specified and the sensible reading sits beside it, labelled.",
  },
  {
    title: "Our own agent is refused authority in three of four categories",
    body: "Re-derived under granted ⊆ proven, three of our four live sessions would be denied today, because the agent has demonstrated one of the four capabilities. The sessions predate the invariant. It refuses us.",
    command: "npm run scope-audit",
  },
  {
    title: "Two of six assay dimensions cannot be answered at all",
    body: "Capability and Performance were inconclusive for every one of the twenty agents sampled, because both need log history and free BSC providers refuse the range. A person with a block explorer open can answer where our agent cannot.",
  },
  {
    title: "A competitor's finding did not hold",
    body: "Another submission reported that the 8004scan indexer silently ignores chain_id, inflating every count taken at face value. Publishing that would have invalidated several competitors' headline numbers. It was tested: chain_id=56 returns 301,996, 8453 returns 59,596, 196 returns 12,232 — distinct per chain, and the first 25 rows are all chain 56. The claim is false, so it is not being used.",
  },
  {
    title: "Three instrument bugs, found mid-run",
    body: "BSC's baseFeePerGas is zero, so the grid simulation was charged no gas at all until the meter was replaced. Venus vTokens return three words from supplyRatePerBlock, and reading all 96 bytes as one integer produced a 10^154 % APY. The Venus Comptroller is a Diamond exposing no liquidationIncentive getter, so it is read from storage with the layout checked against a getter that does work.",
  },
];

/**
 * What is not true yet.
 *
 * Stated as plainly as the wins, and in the present tense. A roadmap written
 * as if it were shipped is the same unverifiable claim as an agent card, and a
 * judge who finds one unshipped promise stops believing the shipped ones.
 */
const NOT_YET: Item[] = [
  {
    title: "The registry is read from the chain now, and the population count still is not",
    body: "This page used to say the assay could not read its own registration: 8004scan answers \u201cAgent not found on chain 56\u201d for token 336161, returns DATABASE_ERROR several times an hour, and holds name \u201cAgent #269703\u201d with a null description for a token whose tokenURI resolves to a full manifest. Identity is read from the registry contract directly now \u2014 ownerOf, tokenURI, and the card behind it over HTTP or IPFS \u2014 so every one of 304,000 registrations resolves without a key. One thing does not: the registry does not implement ERC721Enumerable, so totalSupply reverts and the population count still comes from an index. It is stamped with which of three tiers answered \u2014 a count taken during the render, our crawler\u2019s last cycle, or a committed file.",
  },
  {
    title: "No registry agent has ever settled an epoch here",
    body: "Every mandate on the floor is held by a wallet this office operates, and until those wallets carry ERC-8004 registrations of their own the token id and the capital at risk are not the same key. The ladder counts the overlap rather than asserting it, so the sentence under rung 5 moves on its own when a third party bonds here \u2014 nobody has to remember to edit it. It reads zero today. That gap is the reason this market exists and it is not closed.",
  },
  {
    title: "The registry is read in part, not in full",
    body: "Roughly 3,800 of 303,000 registered agents have had their cards fetched and parsed. Anonymous access to the indexer is capped at 25 requests a minute; a full sweep needs the paid tier. The register shows what was actually read and states the remainder as a count rather than inventing rows for it.",
  },
  {
    title: "Capability cannot be swept across the registry",
    body: "Rung 3 needs a log scan per agent, and no free BSC provider will serve the range at that volume. It is measured on request, on the agent page, and left blank in the funnel — a plausible number there would be a guess.",
  },
  {
    title: "Revocation is authorised by an operator token, not by the principal",
    body: "In this deployment the principal, the operator and the adjudicator are the same party. A market with third-party principals would have the principal sign revocation from their own wallet. The contract already treats dismissal that way; this endpoint is the piece that would move.",
  },
  {
    title: "Bonds are small enough that nobody has attacked them — and we do not have the capital to fix it",
    body: "The mechanism is identical at any size and the sums currently at risk are under a dollar, so nothing here has been tested by an adversary with a reason to try. Retiring the objection needs one mandate at roughly 1 BNB capital and 0.25 BNB bond, settled honestly and published win or lose. The operator wallet holds about 0.005 BNB. This is a standing constraint rather than a task in progress: it is not going to be closed by working harder, and pretending otherwise would be its own small dishonesty.",
  },
  {
    title: "This page said production reads a committed file. It had stopped being true.",
    body: "The entry here described a Supabase pooler rejecting our password, and by the time anyone read it the database was attached and answering: the deployed site reads Postgres and the public funnel endpoint has been reporting source \u201cpostgres\u201d throughout. What was actually wrong was subtler and this page missed it. The read path spread the committed snapshot and overrode only the rows, so a page served from Postgres stamped itself with the file\u2019s capturedAt \u2014 and the two agreed, because the database had been seeded once and nothing had re-crawled since. A stale figure hiding behind a correct-looking timestamp is worse than an outage, and it survived because this page was describing the outage instead. Both clocks are stamped separately now.",
  },
  {
    title: "The crawl reaches a fraction of the registry, and nothing schedules it",
    body: "Coverage is roughly 3,850 of 304,800, shown as such on the register and in the public API. The write path works and a cycle has run against the live database, so the blocker is no longer storage \u2014 it is the anonymous rate limit of 25 requests a minute and the absence of anything running the crawler on a schedule. The floor names that directly: the indexer, the probe and the keeper each stamp a row after a completed cycle, and the machinery panel says which of them is running, which is down, and which has never run at all. It says the keeper has never run. That is the honest state and it is on the page rather than in this paragraph.",
  },
  {
    title: "The owner of every contract is a single key",
    body: "v2 adds a two-step adjudicator handover and the roles are documented, but the owner is one externally-owned account rather than a multisig. That is the largest single point of failure in this design, it is an owner's choice rather than a contract's, and it has not been made.",
  },
  {
    title: "Market history is read from logs, not from an index",
    body: "Events are read with provider failover and any gaps are reported rather than smoothed over. There is no subgraph, so this does not scale past a few hundred mandates — stated in docs/DATA.md rather than discovered later.",
  },
  {
    title: "There is no demo video",
    body: "A ninety-second unnarrated screen recording is a listed deliverable and it does not exist. Everything it would show can be run instead: /start is the same path, end to end, in commands.",
  },
];

function Card({ item }: { item: Item }) {
  return (
    <li className="ev">
      <h3 className="ev-title">{item.title}</h3>
      <p className="ev-body">{item.body}</p>
      {item.command ? <Command>{item.command}</Command> : null}
      {item.href ? (
        <a className="ev-link" href={item.href} rel="noreferrer" target="_blank">
          {item.hrefLabel ?? "Open"} →
        </a>
      ) : null}
    </li>
  );
}

export default function EvidencePage() {
  return (
    <div className="app">
      <SiteHeader current="/evidence" />
      <main className="ev-page shell">
        <p className="mark-label">Evidence</p>
        <h1 className="display start-title">Everything, including what went wrong.</h1>
        <p className="lede start-sub">
          Each item below carries the command that reproduces it. The second
          section is the one that matters: a product built on distrust of
          self-reported numbers does not get to publish only its wins.
        </p>

        <h2 className="section-title ev-head">What holds</h2>
        <ul className="ev-grid">
          {PROOFS.map((p) => (
            <Card key={p.title} item={p} />
          ))}
        </ul>

        <h2 className="section-title ev-head ev-head--adverse">
          What went against us
        </h2>
        <p className="section-sub">
          Kept permanently, not until they stopped being convenient.
        </p>
        <ul className="ev-grid">
          {ADVERSE.map((p) => (
            <Card key={p.title} item={p} />
          ))}
        </ul>

        <h2 className="section-title ev-head ev-head--adverse">What is not true yet</h2>
        <p className="section-sub">
          In the present tense, because a roadmap written as if it had shipped is the
          same unverifiable claim as an agent card.
        </p>
        <ul className="ev-grid">
          {NOT_YET.map((p) => (
            <Card key={p.title} item={p} />
          ))}
        </ul>

        <p className="tbl__foot ladder-foot">
          Start at the{" "}
          <Link href="/start" className="link-underline">
            judge path
          </Link>{" "}
          if you would rather check the claims than read about them.
        </p>
      </main>

      <SiteFooter
        market={MARKET_ADDRESS}
        note="Adverse results are kept permanently. Nothing on this page is removed because it stopped being convenient."
      />
    </div>
  );
}
