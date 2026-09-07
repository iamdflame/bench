import Mark from "@/components/instrument/Mark";

/**
 * One quiet bar across the product.
 *
 * The mark, the wordmark, and a handful of rooms. No eyebrow, no tracked caps,
 * no wallet chip, browsing needs no wallet, and a bar that mounts a wallet
 * hook opens a connect dialog at strangers who only came to read. The wallet is
 * asked for once, at activation, by someone who has decided to hire.
 *
 * The wordmark holds its place; the nav shrinks and scrolls on a narrow phone
 * rather than pushing the page sideways. The body never scrolls horizontally.
 */
const NAV = [
  { href: "/hire/health", label: "Hire" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/registry", label: "Registry" },
  { href: "/method", label: "Method" },
  { href: "/api", label: "API" },
];

export default function Header({ current }: { current?: string }) {
  return (
    <header className="site-header">
      <div className="shell site-header__inner">
        <a href="/" aria-label="MANDATE, home" className="site-word">
          <Mark size={22} />
          <span style={{ fontWeight: 500, letterSpacing: "-0.01em", fontSize: "1.0625rem" }}>MANDATE</span>
        </a>
        <nav aria-label="Primary" className="site-nav">
          {NAV.map((n) => {
            const active = current === n.href || (current && current.startsWith(n.href) && n.href !== "/");
            return (
              <a
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className="nav-link"
                data-active={active ? "" : undefined}
              >
                {n.label}
              </a>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
