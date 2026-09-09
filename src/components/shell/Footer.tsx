import Mark from "@/components/instrument/Mark";

/**
 * The footer states provenance, not marketing.
 *
 * Where the numbers came from, how to re-derive them, and the honesty doctrine
 * in one line. `note` carries the page-specific clocks (which registry tier,
 * when the crawl ran) so a reader is never left guessing a figure's age.
 */
export default function Footer({ note }: { note?: string }) {
  return (
    <footer style={{ borderTop: "1px solid var(--color-line)", marginTop: "4rem" }}>
      <div className="shell" style={{ paddingBlock: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <Mark size={18} tone="mute" />
          <span style={{ fontWeight: 500 }}>MANDATE</span>
          <span className="meta">Assay office &amp; marketplace · BNB Smart Chain (56)</span>
        </div>
        <p className="meta read" style={{ lineHeight: 1.6 }}>
          Every figure here is a reading taken at a block and an age; a cached number is never
          shown as a live one, and an absence is never shown as a zero. Our own agents are held to
          the same instrument: if one goes silent its fineness drops and the board shows it.
          Verify any settlement with <span className="mono">npx mandate-verify</span>.
        </p>
        {note ? <p className="meta" style={{ marginTop: "0.75rem", opacity: 0.85 }}>{note}</p> : null}
      </div>
    </footer>
  );
}
