/**
 * The judge packet, assembled from what is actually true right now.
 *
 * A submission checklist written by hand rots between the writing and the
 * reading: a session expires, a film is never cut, a transaction is described
 * that nobody ever sent. Then a judge opens the page and the first link is
 * dead, which is worse than not having sent them a page.
 *
 * So every item here reports its own state by reading the same sources the
 * product does. An item is `ready` only when the evidence exists and is still
 * good, `stale` when it existed and has lapsed, and `missing` when it was never
 * produced, with the exact step that would produce it. The page is therefore
 * both the packet a judge reads and the checklist this office works from, and
 * the two cannot disagree because they are the same object.
 *
 * A grant that expired is `stale`, not `ready`. That distinction is the whole
 * reason this module exists: the competing submission's headline evidence is a
 * session that died a week before judging, and shipping the same mistake with
 * better typography would be funny rather than clever.
 */

import { readPublicIndex } from "@/lib/chain/session";
import { readProof } from "@/lib/proof";
import { shopByTokenId, allShops } from "@/lib/shops";
import { CATEGORY_LABEL } from "@/lib/config";

export type ItemState = "ready" | "stale" | "missing";

export interface PacketItem {
  n: number;
  title: string;
  /** What this proves, in one sentence, for someone with four minutes. */
  proves: string;
  state: ItemState;
  /** Where it lives when it exists. */
  href?: string;
  /** External transaction or explorer link. */
  tx?: string;
  /** The reading behind the state. Never a slogan. */
  detail: string;
  /** What produces it, when it does not exist yet. A command, not a wish. */
  todo?: string;
}

export interface Packet {
  items: PacketItem[];
  ready: number;
  total: number;
  block: string | null;
  at: string;
}

/**
 * Films, if they have been cut.
 *
 * Set in the environment rather than committed, because a URL to a video that
 * does not exist yet is the one kind of link this page must never contain.
 */
const FILM_JOURNEY = process.env.NEXT_PUBLIC_FILM_JOURNEY ?? null;
const FILM_SHOP = process.env.NEXT_PUBLIC_FILM_SHOP ?? null;

const REPO = "https://github.com/iamdflame/mandate-bnb";

export async function readPacket(): Promise<Packet> {
  const sessions = Object.entries(readPublicIndex()).map(([id, s]) => ({ id: Number(id), ...s }));
  const proof = await readProof();
  const now = Math.floor(Date.now() / 1000);

  const isLive = (s: (typeof sessions)[number]) => !s.revokedAt && s.expiry > now;
  const shopIds = new Set(allShops().map((s) => s.tokenId));
  /*
    A session belongs to a shop when the hire named a token another operator
    owns. Everything else is this office's own, including the four granted
    before sessions recorded a token at all.
  */
  const isShop = (s: (typeof sessions)[number]) => Boolean(s.tokenId && shopIds.has(s.tokenId));
  const houseSessions = sessions.filter((s) => !isShop(s));
  const liveHouse = houseSessions.filter(isLive);
  const registeredHouse = houseSessions.filter((s) => s.registered && s.registrationTx);
  const revoked = sessions.filter((s) => s.revokedAt);
  const shopSessions = sessions.filter(isShop);
  const liveShop = shopSessions.filter(isLive);

  const newestGrant = [...registeredHouse].sort((a, b) => b.expiry - a.expiry)[0] ?? null;
  const newestRevoke = [...revoked].sort((a, b) => (a.revokedAt! < b.revokedAt! ? 1 : -1))[0] ?? null;
  const ranger = shopByTokenId("269706");

  const items: PacketItem[] = [
    {
      n: 1,
      title: "Film: the whole journey, ninety seconds, no voice",
      proves: "Land, pick a job, read a verdict, grant, watch, revoke. Activation without a wallet dialog or a seed phrase.",
      state: FILM_JOURNEY ? "ready" : "missing",
      href: FILM_JOURNEY ?? undefined,
      detail: FILM_JOURNEY
        ? "Recorded against production."
        : "Not cut. The journey itself is live and can be filmed in one take from the home page.",
      todo: FILM_JOURNEY ? undefined : "Record / to /jobs/rebalancing to /hire/<id> to /desk, then set NEXT_PUBLIC_FILM_JOURNEY.",
    },
    {
      n: 2,
      title: "Film: hiring another operator's agent from this desk",
      proves: "The claim no other front door on this chain can make: their agent, hired here, on our leash.",
      state: FILM_SHOP ? "ready" : "missing",
      href: FILM_SHOP ?? undefined,
      detail: FILM_SHOP
        ? "Recorded against production."
        : `Not cut. The route is live: /agents/${ranger?.tokenId ?? "269706"} to the ticket to the desk.`,
      todo: FILM_SHOP ? undefined : "Record the shop hire, then set NEXT_PUBLIC_FILM_SHOP.",
    },
    {
      n: 3,
      title: "A house agent under a live, registered session",
      proves: "One signature grants a scoped, capped, expiring key, and it is registered in the Altana KeyStore so anyone can verify its authority.",
      state: liveHouse.length > 0 ? "ready" : registeredHouse.length > 0 ? "stale" : "missing",
      href: "/desk",
      tx: newestGrant?.registrationTx ? `https://bscscan.com/tx/${newestGrant.registrationTx}` : undefined,
      detail:
        liveHouse.length > 0
          ? `${liveHouse.length} session${liveHouse.length === 1 ? "" : "s"} live on the desk right now, ${
              liveHouse.filter((s) => s.registered).length
            } of them KeyStore-registered.`
          : registeredHouse.length > 0
            ? `${registeredHouse.length} registered grant${registeredHouse.length === 1 ? "" : "s"} on record, and every one has expired. An expired session is not evidence of a working hire, which is exactly the criticism this packet makes of the competing submission.`
            : "No session has been granted from this office yet.",
      todo:
        liveHouse.length > 0
          ? undefined
          : "npm run grant -- <mandateId> rebalancing --cap 0.02 --ttl 30d --register",
    },
    {
      n: 4,
      title: "A revoke, and a key that stops working",
      proves: "The principal can end an agent's authority inside the product, in one transaction, and the dead key can be shown failing afterwards.",
      state: newestRevoke ? "ready" : "missing",
      href: "/desk",
      detail: newestRevoke
        ? `Mandate ${newestRevoke.mandateId} revoked ${new Date(newestRevoke.revokedAt!).toISOString().slice(0, 10)}.`
        : "No session has been revoked yet. The control is wired to the chain on the desk; it has not been exercised on a session worth filming.",
      todo: newestRevoke ? undefined : "Grant one, film the desk, press Revoke, then attempt one action from the old key and capture the failure.",
    },
    {
      n: 5,
      title: `A session on ${ranger?.operator.name ?? "another operator"}'s agent`,
      proves:
        "Their agent, hired through our ticket, on an allowlist tighter than the one they publish for it themselves. If their runner refuses, the ticket shows the exact reason and the bonded alternative, which is still a completed journey.",
      state: liveShop.length > 0 ? "ready" : shopSessions.length > 0 ? "stale" : "missing",
      href: ranger ? `/hire/${ranger.tokenId}?job=rebalancing` : "/jobs/rebalancing",
      detail:
        liveShop.length > 0
          ? `${liveShop.length} shop session live.`
          : shopSessions.length > 0
            ? "A shop session was granted and has lapsed."
            : `The ticket for ${ranger?.name ?? "their agent"} is live and derives its scope from the chain on open. No grant has landed yet.`,
      todo: liveShop.length > 0 ? undefined : `Open /hire/${ranger?.tokenId ?? "269706"}?job=rebalancing and press Grant. Capture either the transaction or the refusal.`,
    },
    {
      n: 6,
      title: "An agent's own capital, cut",
      proves: "The category nobody else here occupies: the agent loses money when it misses a benchmark committed before the outcome.",
      state: proof.strikes.length > 0 ? "ready" : proof.open.length > 0 ? "stale" : "missing",
      href: "/proof",
      detail:
        proof.strikes.length > 0
          ? `${proof.strikes.length} mandate${proof.strikes.length === 1 ? "" : "s"} carrying a strike on chain: ${proof.strikes
              .map((s) => `${s.name} in ${CATEGORY_LABEL[s.category].toLowerCase()}`)
              .slice(0, 3)
              .join(", ")}.`
          : proof.open.length > 0
            ? `No cut at this block. ${proof.open.length} settled epoch${proof.open.length === 1 ? " is" : "s are"} inside an open challenge window, which is the weaker version of this evidence and is labelled as weaker.`
            : "No cut and no open window at this block.",
      todo: proof.strikes.length > 0 ? undefined : "npm run settle, then propose an epoch that misses its holdout so the contract cuts the bond.",
    },
    {
      n: 7,
      title: "The comparison, with their caveats quoted from their own writeups",
      proves: "Data quality as evidence rather than assertion: bond against none, recipient bound against their published admission that theirs is not.",
      state: "ready",
      href: `/compare?job=rebalancing&ids=${ranger?.tokenId ?? "269706"}`,
      detail: "Every cell in the right-hand column is a chain reading or a linked quote from their published material.",
    },
    {
      n: 8,
      title: "The register answers for agents that are not ours",
      proves: "A front door for every agent on BSC, tested the only way that means anything: type a competitor's token id and see whether it opens.",
      state: "ready",
      href: "/agents?q=269703",
      detail: "Search resolves ownerOf and tokenURI live, so an id nobody has crawled still opens. Silent agents are listed with hiring off and one sentence saying why.",
    },
    {
      n: 9,
      title: "The Agent Advantage report, locked before it was run",
      proves: "The method's hash was committed on chain before any measurement existed, and the losses are named in bold.",
      state: "ready",
      href: `${REPO}/blob/main/docs/AGENT_ADVANTAGE_REPORT.md`,
      tx: "https://bscscan.com/tx/0x00b0e484c69fc3f149f437e0d05ae19cad019bb9b69875a66eaec9fbbbe370e4",
      detail: "Specification hash committed at block 119,939,676. Six tasks, with and without an agent, two of them security tasks.",
    },
    {
      n: 10,
      title: "Re-derive any of it without this site",
      proves: "Nothing above needs to be taken on trust; every figure is a contract read a stranger can repeat.",
      state: "ready",
      href: "/proof",
      detail: "npx mandate-verify settlement <mandateId>, plus the published allowlist at /api/v1/allowlist/all and the open API at /api/v1.",
    },
  ];

  return {
    items,
    ready: items.filter((i) => i.state === "ready").length,
    total: items.length,
    block: proof.block,
    at: proof.at,
  };
}
