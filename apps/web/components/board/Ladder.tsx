/**
 * §15's trust ladder: nine binary facts, each with its proof.
 *
 * Not a score. A score is one number standing in for a dozen judgements nobody
 * can see, and the moment it exists people optimise the number instead of the
 * thing. A ladder hides nothing: every rung is a yes or a no, the proof is
 * printed beside it, and a buyer can see exactly where an agent stops.
 *
 * ---------------------------------------------------------------------------
 * Rung 3 is the point of the whole exercise
 * ---------------------------------------------------------------------------
 *
 * "Answers differently to different inputs" is the check nobody runs, and it
 * eliminates a large share of the registry. An endpoint returning byte-identical
 * output to every request reads as perfectly healthy to anything that looks at
 * the status code — 200, fast, up. It is not reading the request at all. A
 * marketplace that sells a hire on that has sold a customer a wall.
 *
 * ---------------------------------------------------------------------------
 * Rungs that cannot light, and why they stay on the ladder
 * ---------------------------------------------------------------------------
 *
 * Rung 7 asks for B402's `l30DaysUniquePayers`. Binance documents that field;
 * the public discovery API does not serve it — measured against
 * `/bazaar/resources`, `/bazaar/search` and `/bazaar/merchant`, every item
 * carries exactly `resource`, `type`, `x402Version`, `description`, `accepts`
 * and `lastUpdated`. Rung 8 needs a job settled through this marketplace, and
 * none has settled yet.
 *
 * Both stay visible and unlit, with the reason. Deleting a rung nobody can
 * reach today would make the ladder look complete and make the product look
 * further along than it is; an unlit rung with a sentence attached is the
 * honest shape, and it is also the roadmap.
 */

import type { Row } from "@/lib/board";
import type { Agent, BazaarService } from "@bench/shared";

type Verdict = "lit" | "unlit" | "unknown";

interface Rung {
  n: number;
  fact: string;
  /** How it is proven, in the plan's own words. */
  how: string;
  verdict: Verdict;
  /** What was actually found. Always concrete where a check ran. */
  detail: string;
}

const MARK: Record<Verdict, string> = { lit: "✓", unlit: "·", unknown: "?" };

function build(row: Row, agent: Agent | null, service: BazaarService | null): Rung[] {
  const probe = agent?.probe ?? service?.probe ?? null;
  const registered = Boolean(row.tokenId && !row.tokenId.startsWith("house:") && row.kind === "agent");
  const cardBroken =
    agent?.rails?.call?.available === false && agent.rails.call.reason === "card-unparseable";
  const answered = probe?.status !== null && probe?.status !== undefined;
  const identical = probe?.identicalAcrossInputs ?? null;

  const railOpen = (name: "call" | "hire" | "mandate") =>
    (agent?.rails?.[name]?.available ?? (name === "call" ? service?.call?.available : false)) === true;
  const railWhy = (name: "call" | "hire" | "mandate") => {
    const r = agent?.rails?.[name];
    if (r && r.available === false && r.reason) return r.reason;
    if (name === "call" && service?.call && service.call.available === false) return service.call.reason ?? "";
    return "";
  };

  return [
    {
      n: 0,
      fact: "Registered",
      how: "ERC-8004 ownerOf",
      verdict: registered ? "lit" : "unlit",
      detail: registered
        ? `token ${row.tokenId} on the identity registry`
        : row.kind === "service"
          ? "a B402 paid endpoint, which carries no on-chain identity — and is not pretended to"
          : "not registered under ERC-8004; no id is claimed on its behalf",
    },
    {
      n: 1,
      fact: "Card parses",
      how: "tokenURI fetched and parsed",
      /*
        The verdict and the sentence have to agree. An unregistered agent has no
        `tokenURI` to fetch, so this is not "unknown" — it is a settled no, for a
        reason that is not the agent's fault and is stated as such.
      */
      verdict: cardBroken ? "unlit" : registered ? "lit" : row.kind === "service" ? "lit" : "unlit",
      detail: cardBroken
        ? "its agent card could not be parsed, so what it claims to do is unreadable"
        : registered
          ? "read from the registry, with a name and a description"
          : row.kind === "service"
            ? "declared in the B402 catalogue rather than an ERC-8004 card, which is a different thing and is not counted as one"
            : "there is no card to parse, because nothing is registered on chain for it to hang from",
    },
    {
      n: 2,
      fact: "Endpoint answers",
      how: "HTTP probe, status and latency recorded",
      verdict: answered ? "lit" : probe ? "unlit" : "unknown",
      detail: answered
        ? `HTTP ${probe?.status}${row.latencyMs !== null ? ` in ${row.latencyMs} ms` : ""}`
        : probe
          ? `it did not answer — ${probe.refusal ?? "no response"}`
          : "it has not come up in the probe queue yet",
    },
    {
      n: 3,
      fact: "Answers differently to different inputs",
      how: "three distinct inputs, body hashes compared",
      verdict: identical === false ? "lit" : identical === true ? "unlit" : "unknown",
      detail:
        identical === false
          ? "three different requests, three different answers — which is what a service does"
          : identical === true
            ? "byte-identical output to three different requests. It is not reading them, and no rail is sold on it"
            : answered
              ? "not tested — it asks to be paid before it answers, so it has never served a body for us to compare. The check needs three replies, and a challenge is not a reply"
              : "not tested — it never answered, so there was nothing to compare",
    },
    {
      n: 4,
      fact: "Priced",
      how: "a parseable 402 challenge",
      verdict: railOpen("call") ? "lit" : answered ? "unlit" : "unknown",
      detail: railOpen("call")
        ? `it asks to be paid, in terms we can settle on this chain${row.rails.call.price ? ` — ${row.rails.call.price}` : ""}`
        : railWhy("call")
          ? `no payable challenge — ${railWhy("call")}`
          : "no challenge we could parse",
    },
    {
      n: 5,
      fact: "Hireable",
      how: "a signed ERC-8183 quote returned",
      verdict: railOpen("hire") ? "lit" : "unlit",
      detail: railOpen("hire")
        ? "it returned a signed quote, so an escrow can be opened against it"
        : "no signed quote — it does not implement the ERC-8183 seller side",
    },
    {
      n: 6,
      fact: "Capable on-chain",
      how: "the chain shows the wallet using the category's protocols",
      verdict: railOpen("mandate") ? "lit" : "unlit",
      detail: railOpen("mandate")
        ? "the chain shows this wallet at the venues its job needs"
        : railWhy("mandate")
          ? `not shown — ${railWhy("mandate")}`
          : "the chain does not show this wallet using the venues its job would need",
    },
    {
      n: 7,
      fact: "Paid by strangers",
      how: "B402 l30DaysUniquePayers > 0",
      verdict: "unknown",
      detail:
        "Binance documents this field and the public discovery API does not serve it — every item carries only resource, type, x402Version, description, accepts and lastUpdated. This rung cannot light for anyone until that changes or we derive payer counts from settle logs ourselves.",
    },
    {
      n: 8,
      fact: "Measured outcome",
      how: "a settled BENCH job with a chain-read result",
      verdict: "unknown",
      detail:
        "No job has settled through this marketplace yet. This rung is the only one that cannot be reached by inspection — it exists only by being hired here, which is why it is the one worth having.",
    },
  ];
}

export default function Ladder({
  row,
  agent,
  service,
}: {
  row: Row;
  agent: Agent | null;
  service: BazaarService | null;
}) {
  const rungs = build(row, agent, service);
  const reached = rungs.filter((r) => r.verdict === "lit").length;
  const highest = rungs.reduce((acc, r) => (r.verdict === "lit" ? r.n : acc), -1);

  return (
    <div>
      <p className="prose" style={{ maxWidth: "74ch", marginBottom: 14 }}>
        Nine facts, each either true or not, each with what proved it. Not a score: a score hides its
        inputs and invites gaming, and this is meant to be argued with.{" "}
        {/*
          "Stands on rung N" would imply the ones below it were climbed. They
          are not ordered that way — an agent can be priced without being
          registered — so the sentence reports the highest fact cleared and the
          count, which is what the data actually supports.
        */}
        {highest >= 0 ? (
          <>
            This one has cleared <span className="num">{reached}</span> of nine, the highest being rung{" "}
            <span className="num">{highest}</span>.
          </>
        ) : (
          "This one has cleared none of them."
        )}
      </p>

      <ol className="ladder">
        {rungs.map((r) => (
          <li key={r.n} className="ladder__rung" data-verdict={r.verdict}>
            <span className="ladder__mark" aria-hidden>
              {MARK[r.verdict]}
            </span>
            <span className="ladder__n num">{r.n}</span>
            <span className="ladder__body">
              <span className="ladder__fact">{r.fact}</span>
              <span className="ladder__how">{r.how}</span>
              <span className="ladder__detail">{r.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
