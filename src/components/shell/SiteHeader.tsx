"use client";

import OfficeMark from "@/components/mark/OfficeMark";
import { WalletChip } from "@/components/floor/Actions";

const NAV = [
  { href: "/start", label: "Start" },
  // The four offices carry equal weight in the rubric and equal weight here.
  { href: "/offices", label: "Offices" },
  { href: "/agents", label: "Register" },
  { href: "/floor", label: "Floor" },
  { href: "/authority", label: "Authority" },
  { href: "/evidence", label: "Evidence" },
  { href: "/assay", label: "Method" },
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
  wallet = false,
}: {
  live?: boolean;
  status?: string;
  current?: string;
  /**
   * Show the wallet control.
   *
   * Off everywhere by default. The bar used to carry it on every page, which
   * meant an office advertised a wallet state to readers who had not asked for
   * one — and, because the chip mounts the wallet hook, the front page opened
   * a connect dialogue in any browser whose extension answers a bare provider
   * call. Removing it outright went too far the other way: the pages where you
   * bid, revoke or sign then had no way to connect at all. It belongs where
   * there is something to sign, and nowhere else.
   */
  wallet?: boolean;
}) {
  return (
    <header className="app-header">
      <div className="app-header__inner shell">
        <a href="/" className="wordmark" aria-label="MANDATE — home">
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
          No wallet in the header.

          A "no wallet detected" chip sat here on every page, which meant the
          bar across an assay office was advertising a wallet state to readers
          who had not asked for one — and, because the chip mounted the wallet
          hook, the front page opened a connect dialogue in any browser whose
          extension answers a bare provider call. Browsing needs no wallet at
          any point; it is asked for once, at the ticket, by somebody who has
          decided to sign something.
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
