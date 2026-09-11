"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import WalletButton from "./WalletButton";

const NAV = [
  { href: "/agents", label: "Agents" },
  { href: "/diagnose", label: "Check a position" },
  { href: "/jobs", label: "Open jobs" },
  { href: "/dashboard", label: "Your agents" },
  { href: "/activity", label: "Activity" },
  { href: "/verify", label: "How we check" },
  { href: "/judges", label: "Judges" },
  { href: "/desk", label: "Desk" },
] as const;

/**
 * The header. Eight links fit on one line from about 1,180 px; below that they
 * move into a Menu disclosure rather than wrapping inside their labels, and the
 * duplicate "Hire an agent" button gives up its room first. Phones used to get
 * no navigation at all: the links were simply hidden under 860 px.
 */
export default function AppHeader() {
  const path = usePathname() ?? "/";
  const menu = useRef<HTMLDetailsElement>(null);
  const current = (href: string) => (path === href || path.startsWith(`${href}/`) ? "page" : undefined);

  // The menu closes when the page changes, on a click outside it, and on Escape.
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [path]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = menu.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      const el = menu.current;
      if (e.key === "Escape" && el?.open) {
        el.open = false;
        el.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <header className="m-header">
      <div className="m-wrap m-header__in">
        <Link href="/" aria-label="Mandate, home">
          <Logo />
        </Link>

        <nav className="m-nav" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={current(n.href)}>
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="m-header__right">
          <Link className="m-btn m-btn--sm m-header__hire" href="/agents">
            Hire an agent
          </Link>
          <WalletButton />
          <details className="m-menu" ref={menu}>
            <summary className="m-btn m-btn--sm m-btn--quiet">Menu</summary>
            <nav className="m-menu__panel" aria-label="Main">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} aria-current={current(n.href)}>
                  {n.label}
                </Link>
              ))}
              <Link className="m-btn m-btn--sm m-btn--primary" href="/agents">
                Hire an agent
              </Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
