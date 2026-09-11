"use client";

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

export default function AppHeader() {
  const path = usePathname() ?? "/";

  return (
    <header className="m-header">
      <div className="m-wrap m-header__in">
        <Link href="/" aria-label="Mandate, home">
          <Logo />
        </Link>

        <nav className="m-nav" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={path === n.href || path.startsWith(`${n.href}/`) ? "page" : undefined}
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="m-header__right">
          <Link className="m-btn m-btn--sm m-hide-sm" href="/agents">
            Hire an agent
          </Link>
          <WalletButton />
        </div>
      </div>
    </header>
  );
}
