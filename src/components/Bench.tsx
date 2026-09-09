"use client";

/**
 * The bench.
 *
 * Streams a live assay and renders each test as it resolves. The waiting is
 * the content here — a judge watching an agent's claims fail against the chain
 * one line at a time is the whole argument, so nothing is hidden behind a
 * spinner and no result is revealed before the chain has actually answered.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AssayReport, AssayResult } from "@/lib/assay/types";
import Hallmark from "./mark/Hallmark";
import Strike from "./mark/Strike";
import AssayBar from "./ui/AssayBar";
import Command from "./ui/Command";
import CountUp from "./ui/CountUp";
import { gradeOf } from "./mark/geometry";
import { CATEGORY_LABEL, type Category } from "@/lib/config";

type Status = "idle" | "running" | "done" | "error";

export default function Bench({
  chainId,
  suggestions,
}: {
  chainId: number;
  suggestions: { tokenId: string; name: string; fineness: number }[];
}) {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [stage, setStage] = useState<string>("");
  const [elapsed, setElapsed] = useState(0);
  const [results, setResults] = useState<AssayResult[]>([]);
  const [report, setReport] = useState<AssayReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const run = useCallback(
    (raw: string) => {
      const tokenId = parseAgentId(raw);
      if (!tokenId) {
        setError("Enter a token id, or an agent id like 56:0x8004…:153776");
        setStatus("error");
        return;
      }

      sourceRef.current?.close();
      setStatus("running");
      setResults([]);
      setReport(null);
      setError(null);
      setStage("Opening");
      setElapsed(0);

      const es = new EventSource(`/api/assay/${chainId}/${tokenId}`);
      sourceRef.current = es;

      es.addEventListener("progress", (ev) => {
        const d = JSON.parse((ev as MessageEvent).data) as {
          stage: string;
          result: AssayResult | null;
          elapsed: number;
        };
        setStage(d.stage);
        setElapsed(d.elapsed);
        if (d.result) setResults((prev) => [...prev, d.result as AssayResult]);
      });

      es.addEventListener("report", (ev) => {
        setReport(JSON.parse((ev as MessageEvent).data) as AssayReport);
      });

      es.addEventListener("error", (ev) => {
        const data = (ev as MessageEvent).data;
        if (data) {
          const d = JSON.parse(data) as { message: string };
          setError(d.message);
          setStatus("error");
        }
      });

      es.addEventListener("done", () => {
        setStatus((s) => (s === "error" ? s : "done"));
        es.close();
      });

      es.onerror = () => {
        setStatus((s) => {
          if (s === "running") {
            setError("The stream closed before the assay finished.");
            return "error";
          }
          return s;
        });
        es.close();
      };
    },
    [chainId],
  );

  useEffect(() => () => sourceRef.current?.close(), []);

  const busy = status === "running";
  const fineness = report?.fineness ?? null;
  const grade = gradeOf(fineness ?? 0);
  const category = (report?.category ?? null) as Category | null;
  const done = new Set(results.map((r) => r.id));
  const pending = report ? [] : ORDER.filter((id) => !done.has(id as AssayResult["id"]));

  return (
    <div className="bench">
      <form
        className="bench__form"
        onSubmit={(e) => {
          e.preventDefault();
          run(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="153776"
          inputMode="numeric"
          aria-label="Agent token id"
          className="bench__input num"
        />
        <button type="submit" disabled={busy} className="btn btn--primary bench__go">
          {busy ? "assaying" : "assay"}
        </button>
      </form>

      {status === "idle" && suggestions.length ? (
        <div className="bench__try">
          <span className="mark-label">try</span>
          <div className="chips">
            {suggestions.map((s) => (
              <button
                key={s.tokenId}
                type="button"
                className="chip"
                onClick={() => {
                  setInput(s.tokenId);
                  run(s.tokenId);
                }}
              >
                {s.tokenId} · {s.name.slice(0, 28)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {status !== "idle" ? (
        <div className="bench__status">
          <span className="mark-label">
            {busy ? `${stage}…` : status === "error" ? "halted" : "complete"}
          </span>
          <span className="mark-label num">
            {(elapsed / 1000).toFixed(1)}s · {results.length}/6 tests
          </span>
        </div>
      ) : null}

      {error ? <p className="small bench__error">{error}</p> : null}

      {status !== "idle" ? (
        <div className="bench__results">
          <AssayBar
            results={results}
            fineness={fineness}
            pending={pending}
            halted={status === "error"}
          />
        </div>
      ) : null}

      {report ? (
        <div className="bench__verdict">
          <div className="bench__who">
            <span className="mark-label">Verdict</span>
            <h2 className="h2 bench__name">{report.name ?? "Unnamed agent"}</h2>
            <span className="mark-label num">{report.agentId}</span>
            {report.registryScore !== null ? (
              <span className="mark-label">
                registry reports {report.registryScore} · we publish {fineness}
              </span>
            ) : null}
          </div>

          <div className="bench__mark">
            {/* The strike lands when the assay does. It is the only motion here. */}
            <Strike when={report.assayedAt}>
              <Hallmark
                size={40}
                record={{
                  chainId: report.chainId,
                  tokenId: report.tokenId,
                  fineness,
                  category,
                  assayedAt: report.assayedAt,
                }}
              />
            </Strike>
            <span className="bench__fig num" style={{ color: grade.metal }}>
              <CountUp value={fineness} />
              <span className="bench__denom"> / 999</span>
            </span>
            <span className="mark-label">
              {grade.shape ? grade.label : "unstruck · base metal"}
              {category ? ` · ${CATEGORY_LABEL[category]}` : ""}
            </span>
          </div>
        </div>
      ) : null}

      {report ? (
        <div className="bench__cmd">
          <Command note="The same six tests, from a terminal. Neither run reads anything the other wrote.">
            {`npm run assay -- ${report.tokenId}`}
          </Command>
          <a className="btn" href={`/agent/${report.tokenId}`}>
            Full certificate →
          </a>
        </div>
      ) : null}
    </div>
  );
}

const ORDER = ["identity", "custody", "activity", "capability", "reputation", "performance"];

/** Accepts a bare token id or a full `chain:registry:token` agent id. */
function parseAgentId(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^\d{1,20}$/.test(v)) return v;
  const parts = v.split(":");
  const last = parts.at(-1)?.trim();
  return last && /^\d{1,20}$/.test(last) ? last : null;
}
