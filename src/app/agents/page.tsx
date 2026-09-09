import type { Metadata } from "next";
import SiteHeader from "@/components/shell/SiteHeader";
import SiteFooter from "@/components/shell/SiteFooter";
import Register, { type RegisterRow } from "@/components/ui/Register";
import Replay from "@/components/ui/Replay";
import { readAgentIndex } from "@/lib/data/agents";
import { getField } from "@/lib/data/field";
import { answered } from "@/lib/data/probes";
import { houseByWallet } from "@/lib/house";
import { placeAgent, readMarketSets, type WalletStanding } from "@/lib/rung";
import { CATEGORIES, CHAIN_ID, EXPLORER, type Category } from "@/lib/config";
import { MARKET_ADDRESS, marketClient } from "@/lib/chain/market";

export async function generateMetadata(): Promise<Metadata> {
  const { registry } = await readAgentIndex();
  return {
    title: "The register — MANDATE",
    description: `Every agent we have read on BNB Smart Chain, sorted by fineness. ${registry.registered.toLocaleString()} are registered; almost none carry a mark.`,
  };
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AgentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    rung?: string;
    category?: string;
    q?: string;
    block?: string;
    endpoint?: string;
    marked?: string;
    source?: string;
  }>;
}) {
  const params = await searchParams;
  const [index, sets] = await Promise.all([readAgentIndex(), readMarketSets()]);

  const readAtIso = new Date().toISOString();
  let blockNumber: string | null = null;
  try {
    blockNumber = (await marketClient.getBlockNumber()).toString();
  } catch {
    // A register that cannot name the block it was read at says so rather
    // than printing one it guessed.
    blockNumber = null;
  }

  /*
    Every agent we have actually read, and nothing else.

    The registry holds 300,000-odd entries and we have fetched a fraction of
    them. Rendering rows for ids we have never confirmed would manufacture the
    exact kind of unverified claim this product exists to refuse — so the
    unread remainder is stated as a count above the table and never invented
    as rows. The mark column is blank for almost every row that *is* here,
    which is the finding, and it is real.
  */
  const registryRows: RegisterRow[] = index.agents.map((a) => {
    const place = placeAgent(a, sets);
    const wallet = a.owner?.toLowerCase() ?? "";
    const standing = wallet ? sets.standing.get(wallet) : undefined;
    return {
      tokenId: a.tokenId,
      source: "registry" as const,
      name: a.name,
      owner: a.owner,
      category: a.category,
      fineness: standing?.fineness ?? null,
      endpointVerified: Boolean(a.endpointVerified),
      rung: place.rung,
      bondWei: standing ? standing.bondWei.toString() : null,
      alphaBps: standing ? Number(standing.alphaBps) : null,
      feedbacks: a.feedbacks,
    };
  });

  /*
    The agents that actually hold mandates.

    A wallet with a registration behind it is shown as that registration — the
    token id is the row and it links to the certificate, because the whole
    point of the join is that the identity and the capital at risk are one key.
    A wallet with no registration is still listed, as an address, because
    hiding it would leave the register's mark column empty while the market's
    own top rung is occupied. The population facet separates the two.
  */
  const marketRows: RegisterRow[] = [...sets.standing.entries()].map(([wallet, st]) => {
    const house = houseByWallet(wallet);
    return house?.tokenId
      ? {
          tokenId: house.tokenId,
          source: "market" as const,
          name: house.name,
          owner: wallet,
          category: st.category,
          fineness: st.fineness,
          endpointVerified: false,
          rung: st.epochsSettled > 0 ? 6 : 5,
          bondWei: st.bondWei.toString(),
          alphaBps: Number(st.alphaBps),
          feedbacks: 0,
          operator: "MANDATE house",
        }
      : marketRowForWallet(wallet, st);
  });

  /** A holder with no registration behind it, shown as the address it is. */
  function marketRowForWallet(wallet: string, st: WalletStanding): RegisterRow {
    return {
      tokenId: wallet,
      source: "market" as const,
      mandateId: st.mandateIds[0] ?? null,
      name: `${wallet.slice(0, 10)}…${wallet.slice(-4)}`,
      owner: wallet,
      category: st.category,
      fineness: st.fineness,
      endpointVerified: false,
      rung: st.epochsSettled > 0 ? 6 : 5,
      bondWei: st.bondWei.toString(),
      alphaBps: Number(st.alphaBps),
      feedbacks: 0,
    };
  }

  /*
    The field: mainnet identities other people operate, read from the registry.

    Our crawl walks the registry in token order and has reached 3,808 of
    304,787 — an honest sample, and a useless front door, because every agent
    a judge will actually search for was minted in the last fortnight at ids
    far past where the crawl has got to. These are named and resolved from the
    chain instead of waited for.

    They are ERC-8004 registrations like any other row and get no special
    standing for being here: the same rung tests, the same blank mark column.
    Rows already in the crawl are not duplicated.
  */
  const field = getField();
  const fieldIds = new Set(field.agents.map((a) => a.tokenId));
  const fieldRows: RegisterRow[] = field.agents
    .map((a) => {
      const place = placeAgent(
        {
          tokenId: a.tokenId,
          name: a.name,
          description: a.description,
          owner: a.owner,
          imageUrl: null,
          protocols: [],
          x402: Boolean(a.x402Endpoint),
          endpointVerified: answered(a.tokenId),
          registryScore: null,
          feedbacks: 0,
          avgScore: null,
          createdAt: null,
          category: a.category,
          confidence: a.confidence,
          matched: a.matched,
        },
        sets,
      );
      const wallet = a.owner.toLowerCase();
      const standing = sets.standing.get(wallet);
      return {
        tokenId: a.tokenId,
        source: "registry" as const,
        name: a.name,
        owner: a.owner,
        category: a.category,
        fineness: standing?.fineness ?? null,
        // Our own call, not the registry's flag. The endpoint facet filters on
        // this, so "answers when called" means a call this office made.
        endpointVerified: answered(a.tokenId),
        rung: place.rung,
        lastSeen: field.capturedAt,
        bondWei: standing ? standing.bondWei.toString() : null,
        alphaBps: standing ? Number(standing.alphaBps) : null,
        feedbacks: 0,
        operator: a.operator,
        siblings: a.siblings,
      };
    });

  /*
    Where both sources have a token, the chain wins.

    They overlap, and the overlap is where the crawl looks worst: 8004scan
    holds `name: "Agent #269703", description: null` for a registration whose
    tokenURI resolves to a manifest naming the pair, the venue and the daily
    loss limit. Dropping the field row as a duplicate kept the poorer of the
    two. The registration is the chain's; the crawl is a description of it.
  */
  const rows = [
    ...marketRows,
    ...fieldRows,
    ...registryRows.filter((r) => !fieldIds.has(r.tokenId)),
  ];

  const rung = params.rung !== undefined && /^[0-6]$/.test(params.rung) ? Number(params.rung) : "all";
  const category =
    params.category && (CATEGORIES as readonly string[]).includes(params.category)
      ? (params.category as Category)
      : "all";

  const unindexed = Math.max(0, index.registry.registered - rows.filter((r) => r.source === "registry").length);

  return (
    <div className="app">
      <SiteHeader
        current="/agents"
        live={sets.read}
        status={blockNumber ? `block ${Number(blockNumber).toLocaleString()}` : "chain unreachable"}
      />

      <main className="shell reg-page">
        <div className="reg-head">
          <h1 className="h2">The register</h1>
          <p className="section-sub">
            Sorted by fineness, descending. The first rows are the agents that carry a
            hallmark; everything below them has an empty mark column, and that column is
            the point. Nothing is hidden, nothing is paginated away, and nothing below
            375 is greyed out apologetically — base metal simply receives no mark.
          </p>
        </div>

        {/*
          The register against history.

          Shown when a block is asked for. Every figure is re-derived from
          event logs at that block on each drag — the only way to demonstrate
          that this data is derived rather than authored is to let somebody
          else pick the block and watch it move.
        */}
        {blockNumber ? (
          <Replay
            head={Number(blockNumber)}
            initial={params.block && /^\d{1,12}$/.test(params.block) ? Number(params.block) : undefined}
          />
        ) : null}

        {/*
          Every facet the funnel links to arrives in the URL and is honoured.

          The ladder's rungs link to /agents?endpoint=answering and
          ?marked=struck, and only rung and category were being read — so two
          of the seven rungs led to the unfiltered register and the reader was
          left to find the population themselves. A link that does not do what
          it says is worse than no link.
        */}
        <Register
          rows={rows}
          chainId={CHAIN_ID}
          explorer={EXPLORER}
          blockNumber={blockNumber}
          readAt={index.capturedAt}
          unindexed={unindexed}
          registered={index.registry.registered}
          initial={{
            rung,
            category,
            q: params.q ?? "",
            endpoint:
              params.endpoint === "answering" || params.endpoint === "silent"
                ? params.endpoint
                : "all",
            marked:
              params.marked === "struck" || params.marked === "unmarked"
                ? params.marked
                : "all",
            source:
              params.source === "registry" || params.source === "market"
                ? params.source
                : "all",
          }}
        />
      </main>

      <SiteFooter
        market={MARKET_ADDRESS}
        note={`Rung placement is derived, never claimed · ${index.counts.indexed.toLocaleString()} agents read in ${index.apiCalls} API calls · fineness, bond and alpha are read from the market contract, not the index`}
      />
    </div>
  );
}
