"use client";

import OfficeMark from "@/components/mark/OfficeMark";
import { WalletChip } from "@/components/floor/Actions";

/*
  The archive's own bar, pointing home first.

  These pages are the technical record behind the marketplace, not a separate
  site, and the first link has to be the way back. Reading a methodology page
  and finding no route to the thing it is a methodology for is a dead end with
  a scroll bar.
*/
const NAV = [
  { href: "/", label: "← Marketplace" },
  { href: "/verify", label: "How we check" },
  { href: "/assay", label: "Method" },
  { href: "/bench", label: "Bench" },
  { href: "/authority", label: "Authority" },
  { href: "/evidence", label: "Evidence" },
  { href: "/offices", label: "Categories" },
  { href: "/api", label: "API" },
  { href: "/list-your-agent", label: "List yours" },
  /*
    Our own ERC-8004 entry is not in this bar.

    It was, as "Us", and it was the worst link in the product: token 336161 is
    unclassified, has no card the index will resolve and has never posted a
    bond, so the face of the office was an agent the office would refuse. It
    stays listed in the register at whatever rung it earns — which is the
    point of registering it — but the header of a market does not advertise
    its own unmarked entry as though it were the exhibit.
  */
];

/**
 * One bar across the whole product.
 *
 * The office mark is struck once, small, on the left, and the wordmark sits
 * beside it at cap height. Nothing else in the header is allowed to compete
 * with the register underneath it.
 */
export default function SiteHeader({
  live,
  status,
  current,
  wallet = true,
}: {
  live?: boolean;
  status?: string;
  current?: string;
  /**
   * Show the wallet control. On by default; a page may still opt out.
   *
   * This defaulted to `false`, and the reasoning was sound at the time: the
   * chip mounted the wallet hook, and the hook called `eth_accounts` on mount,
   * and several multi-chain extensions answer any bare provider call with
   * their own connect overlay. So the front page of an assay office threw a
   * wallet popup at people who had asked for nothing.
   *
   * That cause was fixed underneath this: the hook now does a property read on
   * mount and only reflects an existing connection when this browser has
   * connected here before. Nothing reaches an extension unbidden.
   *
   * What the default cost, meanwhile, was the product. Fourteen of the
   * seventeen pages that render this header never passed the prop, so a
   * visitor could land, read an agent's certificate, decide to hire it, and
   * find no way to connect anywhere on the page. The criterion this
   * marketplace is judged against says a stranger must get through the journey
   * "without hitting a dead end", and an invisible wallet is the first one.
   */
  wallet?: boolean;
}) {
  return (
    <header className="app-header">
      <div className="app-header__inner shell">
        <a href="/" className="wordmark" aria-label="MANDATE, home">
          <OfficeMark size={20} />
          <span className="wordmark__name" style={{ fontSize: 20 }}>
            MANDATE
          </span>
        </a>

        <nav className="app-nav" aria-label="Primary">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} aria-current={current === n.href ? "page" : undefined}>
              {n.label}
            </a>
          ))}
        </nav>

        {/*
          The wallet lives here, on every page that does not opt out.

          Browsing still needs no wallet and nothing is asked of an extension
          until somebody asks for one — see the hook. But the control has to be
          findable *before* the moment of signing, because somebody who has just
          read a certificate and decided to act should not have to guess which
          page carries the button.
        */}
        <div className="app-header__right">
          {status ? (
            <>
              <span className={`pulse ${live ? "pulse--on" : ""}`} aria-hidden />
              <span className="mark-label">{status}</span>
            </>
          ) : null}
          {wallet ? <WalletChip /> : null}
        </div>
      </div>
    </header>
  );
}
