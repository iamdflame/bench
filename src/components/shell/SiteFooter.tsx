import { EXPLORER } from "@/lib/config";

/**
 * The footer.
 *
 * "Built on BNB Chain" appears here, small, once, and nowhere else in the
 * product. Their guidelines forbid "Official", "Partnering" and
 * "Collaborating" without clearance, and much of this field will use those
 * words anyway because they are in the prize description. Confidence is
 * quieter than a logo lockup.
 */
export default function SiteFooter({
  note,
  market,
}: {
  /** Provenance for whatever this page rendered. */
  note?: string;
  market?: string;
}) {
  return (
    <footer className="foot shell">
      <div className="foot__row">
        <span className="mark-label">MANDATE · Assay Office for Autonomous Agents</span>
        <span className="mark-label">Built on BNB Chain</span>
      </div>
      {note ? <p className="mark-label foot__note">{note}</p> : null}
      {market ? (
        <p className="mark-label foot__note">
          Market{" "}
          <a href={`${EXPLORER}/address/${market}`} target="_blank" rel="noreferrer">
            {market}
          </a>
        </p>
      ) : null}
    </footer>
  );
}
