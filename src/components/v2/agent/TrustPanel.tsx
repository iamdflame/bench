"use client";

import { useCallback, useState } from "react";
import type { AssayReport, AssayResult, AssayId } from "@/lib/assay/types";

/**
 * The six checks, asked as questions a buyer would ask.
 *
 * The checks are unchanged; this is the same engine that produces the
 * technical report. What changes is the framing. "Custody: fail, weight 150"
 * tells a stranger nothing. "Is the agent's wallet separate from its owner's?
 * No, they are the same address, so the owner can move anything the agent
 * holds" tells them exactly what they are deciding about. The raw finding is
 * still one disclosure away, with its evidence links.
 *
 * Results arrive already settled, rendered on the server from a snapshot, so
 * the page opens on answers rather than on a spinner. The reading's age is
 * printed next to it and the live re-run is one press away, because a cached
 * verification that hides its own age is the same kind of unverifiable claim
 * this product exists to refuse.
 */

const QUESTION: Record<AssayId, { q: string; why: string }> = {
  identity: {
    q: "Does the endpoint it published actually answer?",
    why: "An agent you cannot reach cannot do the job, whatever its description says.",
  },
  custody: {
    q: "Is the agent's wallet separate from its owner's?",
    why: "If they are the same address, whoever owns the agent can move anything it holds.",
  },
  activity: {
    q: "Has this wallet ever done anything on chain?",
    why: "A wallet with no history has no behaviour to judge, good or bad.",
  },
  capability: {
    q: "Has it ever touched the contracts this job needs?",
    why: "A liquidity manager that has never called a position manager has not managed a position.",
  },
  reputation: {
    q: "Do its reviews come from addresses that review anything else?",
    why: "A perfect score from a wallet that only ever reviews this agent is not a score.",
  },
  performance: {
    q: "Is there a settled record to measure?",
    why: "Returns can only be checked once positions have opened, closed and been marked.",
  },
};

const MARK = { pass: "✓", fail: "✕", inconclusive: "?" } as const;
const CLASS = {
  pass: "m-check--pass",
  fail: "m-check--fail",
  inconclusive: "m-check--unknown",
} as const;

function answer(r: AssayResult): string {
  if (r.verdict === "pass") return "Yes.";
  if (r.verdict === "inconclusive") return "We could not tell.";
  return "No.";
}

function age(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const m = Math.round(ms / 60_000);
  if (m < 1) return "seconds ago";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} days ago`;
}

export default function TrustPanel({
  chainId,
  tokenId,
  initial,
  blockNumber,
}: {
  chainId: number;
  tokenId: string;
  /** The snapshot reading, rendered on the server. Null means none exists. */
  initial: AssayReport | null;
  blockNumber?: string | null;
}) {
  const [report, setReport] = useState<AssayReport | null>(initial);
  const [state, setState] = useState<"idle" | "running" | "failed">(initial ? "idle" : "running");
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const run = useCallback(async () => {
    setState("running");
    setError(null);
    try {
      const res = await fetch(`/api/v1/assay/${chainId}/${tokenId}`, {
        headers: { accept: "application/json" },
      });
      const body = (await res.json()) as { data?: AssayReport; error?: string };
      if (!res.ok || !body.data) {
        throw new Error(body.error ?? `The check service answered ${res.status}.`);
      }
      setReport(body.data);
      setLive(true);
      setState("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The checks could not be run just now.");
      setState("failed");
    }
  }, [chainId, tokenId]);

  // No snapshot for this agent: run it now rather than show nothing.
  if (!report && state === "running") {
    return (
      <div className="m-checks" aria-busy="true">
        {(Object.keys(QUESTION) as AssayId[]).map((id) => (
          <div className="m-check" key={id}>
            <span className="m-check__mark">·</span>
            <div>
              <p className="m-check__title">{QUESTION[id].q}</p>
              <p className="m-check__body">
                No stored reading for this agent, so the checks are running against
                the chain now. This takes about fifteen seconds.
              </p>
            </div>
          </div>
        ))}
        <RunOnMount run={run} />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="m-absent">
        <p className="m-absent__t">The checks could not be run just now.</p>
        <p className="m-small">
          {error} This is our failure, not the agent&rsquo;s. Nothing here should be
          read as a result about it.
        </p>
        <button className="m-btn m-btn--sm" type="button" onClick={() => void run()} style={{ marginTop: "0.8rem" }}>
          Try again
        </button>
      </div>
    );
  }

  const passed = report.results.filter((r) => r.verdict === "pass").length;

  return (
    <div>
      <div className="m-freshness">
        <p className="m-small">
          <strong>
            {passed} of {report.results.length} checks passed.
          </strong>{" "}
          {live
            ? "Run against BNB Smart Chain just now."
            : `Read ${age(report.assayedAt)}${blockNumber ? `, at block ${Number(blockNumber).toLocaleString("en-GB")}` : ""}.`}
        </p>
        <button
          className="m-btn m-btn--sm m-btn--quiet"
          type="button"
          onClick={() => void run()}
          disabled={state === "running"}
        >
          {state === "running" ? "Checking the chain…" : "Run them again now"}
        </button>
      </div>

      {state === "failed" && error ? <p className="m-error">{error}</p> : null}

      <div className="m-checks">
        {report.results.map((r) => {
          const q = QUESTION[r.id] ?? { q: r.title, why: r.claim };
          return (
            <div className={`m-check ${CLASS[r.verdict]}`} key={r.id}>
              <span className="m-check__mark" aria-hidden="true">
                {MARK[r.verdict]}
              </span>
              <div>
                <p className="m-check__title">
                  {q.q} <span style={{ fontWeight: 400 }}>{answer(r)}</span>
                </p>
                <p className="m-check__body">{r.finding}</p>
                <p className="m-note" style={{ marginTop: "0.3rem" }}>
                  {q.why}
                </p>
                {r.evidence.length ? (
                  <details className="m-disclose" style={{ borderTop: 0, marginTop: "0.4rem" }}>
                    <summary style={{ padding: "0.4rem 0", fontSize: "0.78rem" }}>
                      What we looked at
                    </summary>
                    <div className="m-disclose__body" style={{ paddingBottom: "0.5rem" }}>
                      <dl className="m-kv">
                        {r.evidence.map((e) => (
                          <div key={`${e.label}-${e.value}`}>
                            <dt>{e.label}</dt>
                            <dd className="m-mono">
                              {e.url ? (
                                <a className="m-link" href={e.url} target="_blank" rel="noreferrer">
                                  {e.value}
                                </a>
                              ) : (
                                e.value
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </details>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <p className="m-note" style={{ marginTop: "1rem" }}>
        A failed check is not an accusation. Most agents on this registry fail most
        of these because nobody has ever asked them to pass, which is the point of
        asking.
      </p>
    </div>
  );
}

/** Kicks the live run once, for agents with no stored reading. */
function RunOnMount({ run }: { run: () => Promise<void> }) {
  const [started, setStarted] = useState(false);
  if (!started) {
    setStarted(true);
    void run();
  }
  return null;
}
