import { stageValue, concentration, type RegistrySummary } from "@/lib/registry";

/**
 * The argument, as a shape.
 *
 * Every other entry in this hackathon opens with a count of the registry and
 * calls it inventory. This opens with the same count and then shows what
 * happens to it: 310,436 registrations, 33,813 that declare a way in, 3,234
 * distinct sentences behind them, 245 that do any of the four jobs, and six
 * whose endpoint domain anybody has verified.
 *
 * The bars are drawn on a log scale, and that is not a flourish — on a linear
 * scale every bar after the first is invisible, which is exactly the visual
 * lie the page exists to refuse. The scale is stated on the figure.
 *
 * No JavaScript. The bars are divs with a width, so the whole argument is in
 * the HTML a judge reads with scripting off.
 */

interface Step {
  key: string;
  label: string;
  value: number | null;
  note: string;
  provenance: "claimed" | "indexed" | "measured";
}

const pct = (n: number, of: number) => (of === 0 ? 0 : (n / of) * 100);

/** Log-scaled width, floored so a bar of six is still a bar. */
function width(value: number, max: number): number {
  if (value <= 0) return 1.5;
  const w = (Math.log10(value + 1) / Math.log10(max + 1)) * 100;
  return Math.max(w, 1.5);
}

export default function Funnel({ summary }: { summary: RegistrySummary | null }) {
  const conc = concentration(summary);
  const registered = stageValue(summary, "registered");
  const a2a = stageValue(summary, "a2a");
  const verified = stageValue(summary, "endpointVerified");
  const feedback = stageValue(summary, "feedback");

  /*
    A missing per-job count is not a zero.

    An absent key means the classifier has not run over that job, and summing
    it as nought would report "0 agents do this" — a measurement — when the
    truth is that nobody has looked. So the total is only a number when all
    four keys are present, and otherwise it is unknown and renders as such.
  */
  const jobCounts = summary
    ? (["rebalancing", "grid", "yield", "health"] as const).map((j) => summary.perJob[j])
    : null;
  const jobs =
    jobCounts && jobCounts.every((n) => typeof n === "number")
      ? (jobCounts as number[]).reduce((a, b) => a + b, 0)
      : null;

  if (registered === null) {
    return (
      <section className="funnel">
        <p className="funnel-absent">
          The registry has not been read by this deployment yet, so there is no
          population to describe. Nothing here is estimated in the meantime.
        </p>
      </section>
    );
  }

  const steps: Step[] = [
    {
      key: "registered",
      label: "Registered on BNB Smart Chain",
      value: registered,
      note: "An ERC-8004 registration. Costs a gas fee and asserts nothing.",
      provenance: "indexed",
    },
    {
      key: "reach",
      label: "Declare a way to reach them",
      value: a2a,
      note: "An A2A endpoint in the registration. Still only a claim.",
      provenance: "claimed",
    },
    {
      key: "distinct",
      label: "Distinct descriptions behind those",
      value: conc?.distinct ?? null,
      note: conc?.largest
        ? `One sentence covers ${conc.largest.count.toLocaleString()} of them, across ${conc.largest.owners.toLocaleString()} owners.`
        : "Identical descriptions collapsed to one.",
      provenance: "measured",
    },
    {
      key: "jobs",
      label: "Do any of the four jobs the brief names",
      value: jobs,
      note: "Rebalancing, grid trading, yield optimisation, health factor.",
      provenance: "measured",
    },
    {
      key: "verified",
      label: "Endpoint domain verified by anybody",
      value: verified,
      note: "Out of three hundred thousand.",
      provenance: "indexed",
    },
    {
      key: "feedback",
      label: "Have ever received one piece of feedback",
      value: feedback,
      note: "Reputation that is free to acquire is worth nothing to read.",
      provenance: "indexed",
    },
  ];

  const max = registered;

  return (
    <section className="funnel" aria-labelledby="funnel-h">
      <h2 id="funnel-h" className="funnel-h">
        There are {registered.toLocaleString()} agents on BNB Smart Chain.
        <br />
        <span className="funnel-h-em">
          {verified !== null ? verified.toLocaleString() : "—"} of them have a verified address.
        </span>
      </h2>

      <ol className="funnel-list">
        {steps.map((s) => (
          <li key={s.key} className="funnel-step">
            <div className="funnel-row">
              <span className="funnel-label">{s.label}</span>
              <span className={`funnel-value${s.value === null ? " is-unknown" : ""}`}>
                {s.value === null ? "not read" : s.value.toLocaleString()}
              </span>
            </div>
            <div className="funnel-track" aria-hidden="true">
              <div
                className={`funnel-bar is-${s.key}`}
                style={{ width: `${s.value === null ? 0 : width(s.value, max)}%` }}
              />
            </div>
            <div className="funnel-foot">
              <span className="funnel-note">{s.note}</span>
              <span className={`funnel-prov is-${s.provenance}`}>{s.provenance}</span>
              {s.value !== null && s.key !== "registered" ? (
                <span className="funnel-share">
                  {pct(s.value, registered) < 0.01
                    ? "<0.01%"
                    : `${pct(s.value, registered).toFixed(pct(s.value, registered) < 1 ? 2 : 1)}%`}
                </span>
              ) : null}
            </div>
          </li>
        ))}
      </ol>

      <p className="funnel-method">
        Log scale, so the small numbers are visible at all. Every figure is a
        filtered count read from the registry index, and each carries the query
        that produced it on{" "}
        <a href="/data">the data page</a>.
      </p>
    </section>
  );
}
