import Hallmark from "./Hallmark";
import type { BoardAgent } from "@/lib/board";

/**
 * One row on a hiring board.
 *
 * Hallmark first (the glance), then the name and the honest line, then the two
 * figures that matter for this job. Ours and the proven sit at the top with a
 * real hallmark; a stranger's row is shown exactly as true, resolvable, maybe
 * live, never scored to a grade it has not earned, with a way to assay it on
 * the spot. No fake score, no zero, no blank.
 */
export default function AgentRow({ agent, segment, index = 0 }: { agent: BoardAgent; segment: string; index?: number }) {
  const canHire = agent.proven || agent.kind === "house";
  return (
    <li className="card agent-row reveal-scroll" style={{ ["--i" as string]: Math.min(index, 6), padding: "1rem 1.1rem" }}>
      <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ paddingTop: "0.1rem" }}>
          <Hallmark fineness={agent.fineness} size="md" />
        </div>
        <div style={{ flex: 1, minWidth: "14rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span className="hd-3" style={{ fontSize: "var(--text-base)" }}>{agent.name}</span>
            {agent.kind === "house" ? <span className="chip chip--struck">ours</span> : null}
            {agent.proven ? (
              <span className="chip chip--pass">
                <span className="dot dot--pass" /> proven
              </span>
            ) : agent.kind === "registry" ? (
              <span className="chip">unmarked</span>
            ) : null}
          </div>
          <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.25rem" }}>{agent.line}</p>
          {agent.note ? <p className="meta" style={{ marginTop: "0.2rem" }}>{agent.note}</p> : null}
        </div>

        <div style={{ display: "flex", gap: "1.25rem", alignItems: "center", marginLeft: "auto" }}>
          <div style={{ textAlign: "right" }}>
            <div className="meta">alpha</div>
            <div className="num" style={{ fontSize: "var(--text-base)", color: agent.alpha ? "var(--color-touchstone)" : "var(--color-ink-3)" }}>
              {agent.alpha ?? "none yet"}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="meta">slashes</div>
            <div className="num" style={{ fontSize: "var(--text-base)", color: "var(--color-ink-2)" }}>
              {agent.proven ? "0" : "none yet"}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <a href={agent.href} className="btn btn--sm">View</a>
            {canHire && agent.tokenId ? (
              <a href={`/hire/${agent.tokenId}?job=${segment}`} className="btn btn--sm btn--primary">Hire</a>
            ) : agent.kind === "registry" && agent.tokenId ? (
              <a href={`/agents/${agent.tokenId}`} className="btn btn--sm">Assay it →</a>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
