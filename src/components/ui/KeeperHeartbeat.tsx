import Observation from "./Observation";
import type { Heartbeat, Process } from "@/lib/heartbeat";

const LABEL: Record<Process, string> = {
  keeper: "Keeper",
  worker: "Indexer",
  probe: "Probe",
};

const DOES: Record<Process, string> = {
  keeper: "matches every dismissal to its session and revokes the key",
  worker: "crawls the registry and writes the index",
  probe: "calls each registered endpoint and records whether it answered",
};

/**
 * Whether anything is actually running behind this market.
 *
 * `npm run floor` in a terminal and a keeper on a schedule produce
 * identical-looking books, and only one of them is a market. The difference
 * was invisible from the site, which meant the strongest claim here — that a
 * dismissal revokes a key without anyone typing anything — rested on the
 * reader's goodwill.
 *
 * Three states, and the third is the one that matters:
 *
 *   running    stamped inside its tolerance
 *   down       stamped, but not recently enough — with the last time it was
 *   never run  no stamp has ever been written
 *
 * A process that has never run is not shown as down and a process that is down
 * is not shown as absent. Both are worse news than "running" and neither is
 * hidden, because a buyer is entitled to know whether the machinery that would
 * fire their agent is switched on before they escrow anything.
 */
export default function KeeperHeartbeat({
  beats,
}: {
  beats: Record<Process, Heartbeat | null>;
}) {
  const order: Process[] = ["keeper", "worker", "probe"];

  return (
    <div className="beat">
      <div className="beat__head">
        <span className="mark-label">Machinery</span>
        <span className="mark-label">
          what runs between page loads · stamped by the process, not the page
        </span>
      </div>
      <ul className="beat__list">
        {order.map((p) => {
          const b = beats[p];
          const state = !b ? "never" : b.alive ? "running" : "down";
          return (
            <li className="beat__row" key={p} data-state={state}>
              <span className="beat__name mark-label">
                <span className={`pulse ${state === "running" ? "pulse--on" : ""}`} aria-hidden />
                {LABEL[p]}
              </span>
              <span className="beat__state mark-label">
                {state === "running"
                  ? "running"
                  : state === "down"
                    ? "DOWN"
                    : "never run against this database"}
              </span>
              {b ? (
                <Observation
                  size="small"
                  label={state === "running" ? "last cycle" : "last seen"}
                  value={`${b.cycles} cycle${b.cycles === 1 ? "" : "s"}`}
                  at={b.at}
                  showBlock={false}
                />
              ) : (
                <span className="beat__none mark-label">no stamp has ever been written</span>
              )}
              <span className="beat__does">{DOES[p]}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
