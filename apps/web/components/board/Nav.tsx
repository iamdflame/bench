import Link from "next/link";
import { Suspense } from "react";
import Shortcuts from "./Shortcuts";
import Live from "./Live";
import Logotype from "./Logotype";
import Connect from "./Connect";

/**
 * One bar: the mark, four rooms, a search field, and the create call to action.
 *
 * Three decisions in it are the plan's rather than mine.
 *
 * **No wallet.** Browsing never requires one, and a bar that mounts a wallet
 * hook opens a connect dialog at strangers who came to read. The wallet is
 * asked for once, on the hire screen, by somebody who has decided to act.
 *
 * **Search is in the bar.** The board is the product, so finding a row is one
 * keystroke away from anywhere rather than a control you scroll to. It is a
 * plain form, so it works with JavaScript off; the `/` shortcut that focuses
 * it is the only thing that needs script.
 *
 * **Listing is a button.** A marketplace with no supply side is a directory,
 * and making the seller's path the fifth link in a row of five says the
 * opposite of what the product means.
 */

const LINKS = [
  { href: "/", label: "Board", match: (p: string) => p === "/" || p.startsWith("/j/") },
  { href: "/register", label: "Register", match: (p: string) => p.startsWith("/register") },
  { href: "/desk", label: "Desk", match: (p: string) => p.startsWith("/desk") },
  { href: "/data", label: "Data", match: (p: string) => p.startsWith("/data") },
];

export default function Nav({ path = "/", q }: { path?: string; q?: string }) {
  return (
    <header className="nav">
      <div className="shell nav__inner">
        <Link href="/" className="wordmark" aria-label="BENCH, home">
          <Logotype />
        </Link>

        <nav className="nav__links" aria-label="Primary">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="nav__link"
              {...(l.match(path) ? { "data-active": "", "aria-current": "page" as const } : {})}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <form className="nav__search" method="get" action="/register" role="search">
          <label htmlFor="board-search" className="sr-only">
            Search the board by name, token id or address
          </label>
          <input
            id="board-search"
            name="q"
            type="search"
            defaultValue={q ?? ""}
            placeholder="Search token id, address, name"
            autoComplete="off"
          />
          <kbd className="kbd" aria-hidden>
            /
          </kbd>
        </form>

        {/*
          Suspense because `Connect` reads the query string, and an unsuspended
          `useSearchParams` opts every page that renders this bar out of static
          rendering. The fallback is nothing: the bar is complete without it,
          which is the same reason there is no connect gate on any screen.
        */}
        <Suspense fallback={null}>
          <Connect />
        </Suspense>

        <Link href="/list" className="nav__cta">
          List yours
        </Link>
      </div>
      <Shortcuts />
      <Live />
    </header>
  );
}
