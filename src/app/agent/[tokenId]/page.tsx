import type { Metadata } from "next";
import { Suspense } from "react";
import SiteHeader from "@/components/shell/SiteHeader";
import SiteFooter from "@/components/shell/SiteFooter";
import Certificate from "@/components/agents/Certificate";
import AutopsyPanel from "@/components/ui/Autopsy";
import CareerPanel from "@/components/agents/CareerPanel";
import Exclusions from "@/components/agents/Exclusions";
import { resolveAgent, type AgentRecord } from "@/lib/agent-record";
import { notFound } from "next/navigation";
import { readAutopsy } from "@/lib/autopsy";
import { readCareerForWallet } from "@/lib/career";
import { placeAgent, readMarketSets } from "@/lib/rung";
import { exclusionsFor } from "@/lib/assay/evidence";
import { getAgent } from "@/lib/sources/scan";
import { CHAIN_ID, EXPLORER } from "@/lib/config";
import { withTimeout } from "@/lib/cache";
import { MARKET_ADDRESS } from "@/lib/chain/market";

/**
 * Any agent in the ERC-8004 registry has a page here, not only the ones in a
 * snapshot: the assay runs live on open. Rendered on demand for that reason.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tokenId: string }>;
}): Promise<Metadata> {
  const { tokenId } = await params;
  // The chain knows the name of every agent; our crawl knows 3,808 of them.
  const a = await resolveAgent(tokenId).catch(() => null);
  return {
    title: `${a?.name ?? `Agent ${tokenId}`} — certificate of assay — MANDATE`,
    description:
      a?.description?.slice(0, 180) ??
      `Agent ${tokenId} on BNB Smart Chain, tested against the chain rather than taken at its word.`,
  };
}

/*
  Everything below the certificate streams.

  These panels read the registry API and scan event logs, and against a free
  BSC provider that can take well over a minute. Awaiting them in the page body
  meant the whole certificate — including the live assay, which needs nothing
  from them — waited too, and a judge opening an agent page saw a blank
  document for two minutes.

  So each is its own Suspense boundary with its own fallback. The certificate
  paints at once and the slow reads arrive when the chain answers, which is
  also the honest way to render them: a panel that is still reading says so.
*/

async function Placement({ agent }: { agent: AgentRecord }) {
  const tokenId = agent.tokenId;
  const indexed = agent;
  const [sets, detail] = await Promise.all([
    readMarketSets(),
    withTimeout(getAgent(CHAIN_ID, tokenId).catch(() => null), PANEL_TIMEOUT_MS),
  ]);
  const placement = placeAgent({ ...indexed, rung: undefined }, sets);

  /*
    The chain's owner wins.

    8004scan's `agent_wallet` is its reading of the registration; `ownerOf` is
    the registration. They agree for most tokens and the index is missing
    entirely for the newest ones, including ours.
  */
  const wallet = (agent.chain?.owner ?? detail?.agent_wallet ?? indexed?.owner ?? "").toLowerCase();
  const exclusions = exclusionsFor({
    name: indexed.name ?? detail?.name,
    description: indexed.description ?? detail?.description,
    owner: indexed.owner ?? detail?.owner_address,
    agentWallet: agent.chain?.owner ?? detail?.agent_wallet,
    endpoint:
      agent.chain?.services[0]?.endpoint ??
      detail?.agent_url ??
      detail?.a2a_endpoint ??
      detail?.mcp_server,
    endpointVerified: Boolean(detail?.is_endpoint_verified ?? indexed?.endpointVerified),
    category: indexed?.category ?? null,
    // The nonce is the assay's to establish; omitting it here is honest — a
    // missing check must not become a stated failure.
    nonce: null,
    assayed: wallet ? sets.assayed.has(wallet) : false,
    bonded: wallet ? sets.bonded.has(wallet) : false,
  });

  return (
    <>
      {placement ? (
        <section className="panel placement">
          <div className="panel__head">
            <h2 className="mark-label">Ladder placement</h2>
            <span className="mark-label">
              rung {placement.rung} · {placement.name}
            </span>
          </div>
          <div className="panel__body">
            <p className="small">{placement.reason}</p>
            {placement.unknown.length ? (
              <p className="mark-label placement__unknown">
                Not settled either way:{" "}
                {placement.unknown
                  .sort((a, b) => a - b)
                  .map((n) => `rung ${n}`)
                  .join(", ")}
                . Absence of evidence, recorded as such.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
      <Exclusions exclusions={exclusions} />
    </>
  );
}

/**
 * How long a panel may take before it is reported as unread.
 *
 * Generous, because these are real reads against a rate-limited API and a free
 * RPC — but finite, because a panel that never resolves holds the whole
 * response open and tells the reader nothing at all.
 */
const PANEL_TIMEOUT_MS = 20_000;

/**
 * The autopsy gets longer, but not this long.
 *
 * It is the highest-value component in the product — an official score beside
 * the score that survives de-duplication, with the command that reproduces
 * both — and it costs eighteen calls against an API that allows twenty-five a
 * minute, so twenty seconds was not enough for it to ever appear.
 *
 * Fifty was too many. The certificate reaches first byte in under a second and
 * paints immediately, but the response stayed open for the better part of a
 * minute waiting on a panel most agents have no data for, which a crawler and
 * a preview card both sit through. Twenty-five clears the corpus for an agent
 * that has one and gives up in half the time on an agent that does not, and
 * the panel says which happened rather than showing an empty result.
 */
const AUTOPSY_TIMEOUT_MS = 25_000;

async function Reputation({ tokenId }: { tokenId: string }) {
  const autopsy = await withTimeout(
    readAutopsy(CHAIN_ID, tokenId).catch(() => null),
    AUTOPSY_TIMEOUT_MS,
  );
  if (!autopsy) {
    return (
      <Reading
        title="Reputation autopsy"
        note="The feedback corpus could not be read inside the time allowed, so nothing is claimed about this agent's reputation. An agent nobody has reviewed and an agent whose reviews could not be loaded are different statements, and this is the second one."
      />
    );
  }
  return <AutopsyPanel autopsy={autopsy} />;
}

async function CareerSection({ agent }: { agent: AgentRecord }) {
  const career = await withTimeout(
    readCareerForWallet(agent.owner).catch(() => null),
    PANEL_TIMEOUT_MS,
  );
  if (!career) {
    return (
      <Reading
        title="Career"
        note="The market could not be read for this wallet inside the time allowed. That is a statement about the provider, not about the agent, and no conclusion is drawn from it."
      />
    );
  }
  return <CareerPanel career={career} />;
}

/** A panel that is still reading, or that could not read. Never a spinner. */
function Pending({ title }: { title: string }) {
  return (
    <section className="panel" aria-busy="true">
      <div className="panel__head">
        <h2 className="mark-label">{title}</h2>
        <span className="mark-label">reading the chain</span>
      </div>
      <div className="panel__body">
        <span className="hairline" aria-hidden />
      </div>
    </section>
  );
}

function Reading({ title, note }: { title: string; note: string }) {
  return (
    <section className="panel">
      <div className="panel__head">
        <h2 className="mark-label">{title}</h2>
      </div>
      <div className="panel__body">
        <p className="small dim">{note}</p>
      </div>
    </section>
  );
}

export default async function AgentPage({
  params,
}: {
  params: Promise<{ tokenId: string }>;
}) {
  const { tokenId } = await params;

  /*
    The identity, from the registry itself.

    This page used to read only our own crawl, so an agent we had not indexed —
    which is 300,979 of them, including our own registration and every token in
    this hackathon minted in the last two days — rendered as a name-less shell
    or not at all. `ownerOf` and `tokenURI` answer for all of them, and
    `ownerOf` reverting is the existence test: a token that was never minted is
    a 404, and nothing else is.
  */
  const agent = await resolveAgent(tokenId).catch(() => null);
  if (!agent) notFound();

  /*
    The market's answer about this wallet, read before the certificate paints.

    It has to be here rather than inside the streamed placement panel: the
    action under the verdict depends on it, and a button that appears as
    "open a mandate" and then corrects itself two seconds later is worse than
    one that was right the first time. The read is memoised and shared with
    the placement panel below, so it costs one chain read, not two.
  */
  const sets = await readMarketSets();
  const wallet = agent.owner?.toLowerCase() ?? "";
  const st = wallet ? sets.standing.get(wallet) : undefined;
  const placement = placeAgent({ ...agent, rung: undefined }, sets);
  const standing = {
    rung: sets.read ? placement.rung : null,
    bondWei: st ? st.bondWei.toString() : null,
    mandateId: st?.mandateIds[0] ?? null,
  };

  return (
    <div className="app">
      <SiteHeader current="/agents" />

      <main className="shell cert-page">
        <Certificate
          tokenId={tokenId}
          chainId={CHAIN_ID}
          indexed={agent}
          standing={standing}
        />

        <Suspense fallback={<Pending title="Ladder placement" />}>
          <Placement agent={agent} />
        </Suspense>

        <Suspense fallback={<Pending title="Reputation autopsy" />}>
          <Reputation tokenId={tokenId} />
        </Suspense>

        <Suspense fallback={<Pending title="Career" />}>
          <CareerSection agent={agent} />
        </Suspense>
      </main>

      <SiteFooter
        market={MARKET_ADDRESS}
        note={`Claims from the ERC-8004 registry · findings from BNB Smart Chain RPC · explorer ${EXPLORER.replace("https://", "")}`}
      />
    </div>
  );
}
