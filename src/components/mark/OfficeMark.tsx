/**
 * The office mark — MANDATE's own punch.
 *
 * A struck surround with a balance beam knocked out of it. The balance is the
 * Vienna Convention's Common Control Mark reduced to its minimum: it is the
 * universal sign for *assayed*, it means judgement, and it survives 16px.
 */
export default function OfficeMark({
  size = 24,
  metal = "var(--gold-999)",
  title,
}: {
  size?: number;
  metal?: string;
  title?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className="office-mark"
    >
      {title ? <title>{title}</title> : null}
      {/* Filled surround, device knocked out — silhouette first. */}
      <path d="M4 2 H20 V15 L15 20 H9 L4 15 Z" fill={metal} />
      {/*
        A balance in equilibrium, knocked out of the punch.

        An earlier cut hung the pans off a centre column and the whole device
        read as a capital T at any size below 48px — the column and the beam
        closed into one another and the pans were lost against the chamfer.
        This one keeps the beam clear of everything, drops the pans well
        outside the fulcrum's spread, and lets the fulcrum carry the vertical,
        so the three elements never touch and the silhouette stays a balance
        down to 16px.
      */}
      <g fill="var(--void)">
        {/* beam */}
        <rect x="5.8" y="7.4" width="12.4" height="1.5" />
        {/* pans, clear of the fulcrum at every height */}
        <rect x="5.2" y="10.4" width="3" height="1.3" />
        <rect x="15.8" y="10.4" width="3" height="1.3" />
        {/* fulcrum */}
        <path d="M12 9.4 L14.6 16.3 H9.4 Z" />
      </g>
    </svg>
  );
}

/** Mark + wordmark, mark height matched to cap height. */
export function Wordmark({
  size = 22,
  stacked = false,
}: {
  size?: number;
  stacked?: boolean;
}) {
  if (stacked) {
    return (
      <span className="wordmark wordmark--stacked">
        <OfficeMark size={size * 1.8} title="MANDATE" />
        <span className="wordmark__name" style={{ fontSize: size * 1.6 }}>
          MANDATE
        </span>
        <span className="wordmark__sub mark-label">Assay Office for Autonomous Agents</span>
      </span>
    );
  }
  return (
    <span className="wordmark">
      <OfficeMark size={size} title="MANDATE" />
      <span className="wordmark__name" style={{ fontSize: size }}>
        MANDATE
      </span>
    </span>
  );
}
