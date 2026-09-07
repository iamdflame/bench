import FinenessDial from "./FinenessDial";
import { isHallmarked, type AssayReport } from "@/lib/assay/types";
import { CATEGORY_LABEL, type Category } from "@/lib/config";
import { ago } from "./HonestCount";

/**
 * The verdict, in plain language, for a human who has never heard of ERC-8004.
 *
 * The dial carries the number; this carries the sentence. Passed or not, in
 * words, followed by what the agent actually does and the single strongest
 * thing the chain showed, not the six-test breakdown, which lives one tap down
 * in the certificate. Verdict first, proof second, auditor third.
 */
export default function Verdict({ report }: { report: AssayReport }) {
  const passed = isHallmarked(report.fineness);
  const cap = report.results.find((r) => r.id === "capability");
  const identity = report.results.find((r) => r.id === "identity");
  const activity = report.results.find((r) => r.id === "activity");

  const label = report.category ? CATEGORY_LABEL[report.category as Category] : null;

  // The strongest true sentence we can say about this agent.
  const headline = passed
    ? cap?.verdict === "pass"
      ? cap.finding
      : (identity?.finding ?? "It passed the assay against the chain.")
    : cap?.verdict === "fail"
      ? cap.finding
      : activity?.verdict === "fail"
        ? activity.finding
        : (identity?.finding ?? "The chain does not yet support what it claims.");

  const title = passed
    ? "Passed the assay."
    : report.results.every((r) => r.verdict === "inconclusive")
      ? "Not enough to grade yet."
      : "Below the hallmark bar.";

  const titleColor = passed ? "var(--color-pass)" : "var(--color-ink)";

  return (
    <section
      className="panel"
      style={{ padding: "1.5rem", display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "center" }}
    >
      <div style={{ flex: "none" }}>
        <FinenessDial fineness={report.fineness} size={190} strike />
      </div>
      <div style={{ flex: 1, minWidth: "18rem" }}>
        <h2 className="hd-2" style={{ color: titleColor }}>{title}</h2>
        <p className="lede" style={{ fontSize: "var(--text-base)", marginTop: "0.5rem" }}>
          {label ? (
            <>It is classified as <strong style={{ fontWeight: 500 }}>{label}</strong>. </>
          ) : null}
          {headline}
        </p>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.85rem" }}>
          {report.results.map((r) => (
            <span
              key={r.id}
              className={`chip ${r.verdict === "pass" ? "chip--pass" : r.verdict === "fail" ? "chip--fail" : ""}`}
              title={r.finding}
            >
              {r.verdict === "pass" ? "✓" : r.verdict === "fail" ? "✕" : "·"} {r.title}
            </span>
          ))}
        </div>
        <p className="meta" style={{ marginTop: "0.85rem" }}>
          Assayed {ago(report.assayedAt)} · six tests against BNB Smart Chain · {report.ms}ms
          {report.registryScore != null ? ` · registry scored it ${report.registryScore}` : ""}
        </p>
      </div>
    </section>
  );
}
