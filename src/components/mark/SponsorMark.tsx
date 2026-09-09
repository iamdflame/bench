import { sponsorLetters, sponsorShield } from "./geometry";

/**
 * The sponsor's mark — who submitted the item.
 *
 * Derived deterministically from the agent's ERC-8004 identity, so the same
 * agent carries the same mark forever and anyone can regenerate it. The
 * algorithm is `src/components/mark/geometry.ts` and it is published, because
 * a generative identity nobody can reproduce is decoration.
 *
 * This is what makes a register of 301,391 agents visually rich while staying
 * entirely data-derived. Nothing here is drawn; every pixel is a fact about
 * the token id beside it.
 */
export default function SponsorMark({
  chainId,
  tokenId,
  size = 24,
  metal = "var(--base)",
}: {
  chainId: number;
  tokenId: string;
  size?: number;
  metal?: string;
}) {
  const shield = sponsorShield(chainId, tokenId);
  const letters = sponsorLetters(chainId, tokenId);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={`Sponsor's mark ${letters}`}
      className="sponsor-mark"
    >
      <title>{`Sponsor's mark ${letters} · derived from ${chainId}:${tokenId}`}</title>
      <path d={shield} fill={metal} />
      <text
        x="12"
        y="12.5"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--void)"
        style={{ fontFamily: "var(--serif)", fontSize: 9, letterSpacing: "-0.02em" }}
      >
        {letters}
      </text>
    </svg>
  );
}
