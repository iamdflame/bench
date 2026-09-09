/**
 * The legend that turns the floor from art into an instrument.
 *
 * Everything moving on that canvas is a field of a mandate. Without this
 * panel it reads as a generative background; with it, a viewer can name what
 * they are looking at and check it against the table. The WebGL was always
 * the strongest image in the product and always the worst front door — the
 * legend is the difference.
 */
export default function Legend({ compact = false }: { compact?: boolean }) {
  const rows: [string, string][] = [
    ["radius", "capital under management"],
    ["ring", "bond still at risk"],
    ["tint", "realised alpha per epoch"],
    ["tremor", "strikes against the holder"],
    ["rupture", "dismissal — the bond changed hands"],
  ];
  return (
    <dl className={compact ? "legend legend--compact" : "legend"}>
      <dt className="mark-label legend__head">Legend</dt>
      {rows.map(([k, v]) => (
        <div className="legend__row" key={k}>
          <dt className="mark-label">{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
