"use client";

import { useState } from "react";
import type { RailName } from "@bench/shared";
import { ensureChain, explain, short, signTypedData, silent } from "@/lib/wallet";

/**
 * The button, and the only interactive thing on the hire screen.
 *
 * It does one job: post the engagement and render exactly what came back. A
 * success shows the goods; a refusal shows the condition that failed. There is
 * no toast, no generic error, and no spinner — a hairline pulse on the button
 * while it waits, because a spinner tells a person nothing they did not
 * already know.
 *
 * ---------------------------------------------------------------------------
 * Whose cent it is
 * ---------------------------------------------------------------------------
 *
 * With a wallet connected, Rail 1 is paid by the visitor: this asks the server
 * for the EIP-712 document, the wallet signs it, and the server delivers it.
 * The buyer pays no gas — x402 settles through EIP-3009, so a signature is the
 * whole transaction from their side.
 *
 * Without one, this deployment pays from its own float and the button says so.
 * That is a deliberate, stated arrangement rather than a disguised one: a
 * marketplace whose cheapest path requires the visitor to fund a wallet first
 * has a demo, not a front door, and pretending the cent came from them would be
 * worse than saying where it came from.
 *
 * Whichever happened, the result says which. `paidBy` is in the payload and in
 * the chip, because "an agent answered" and "you paid an agent and it answered"
 * are different claims and only one of them is a marketplace.
 */

/**
 * Everything the three rail routes actually return.
 *
 * This type used to carry `{ ok, body, status, paid, txHash, latencyMs,
 * refusedBecause, plan }` and nothing else — so a successful mandate, whose
 * route spends up to sixty seconds deriving a leash from chain, rendered an
 * empty panel with a chip in it. The leash, the evidence it was derived from,
 * the wrapper, the Keystore entry and the call rail's settlement all arrived
 * over the wire and were dropped on the floor. Adding them here is most of the
 * fix; rendering them is the rest.
 */

interface Result {
  ok: boolean;
  body?: string;
  status?: number;
  paid?: string;
  paidBy?: "you" | "house";
  txHash?: string;
  latencyMs?: number;
  refusedBecause?: string;
  plan?: { steps: { says: string }[]; signatures?: number; note?: string };
  /** Rail 1, buyer-funded: the document to sign. */
  needsSignature?: boolean;
  typed?: unknown;
  authorization?: Record<string, unknown>;
  envelope?: Record<string, unknown>;
  says?: string;
  cost?: { amount: string; asset: string; symbol: string | null };
  /** Rail 1: what became of the money. */
  settlement?: { state: "settled" | "outstanding" | "unpaid"; why: string };
  /** Rail 3: the leash, which is the whole product of that route. */
  leash?: {
    job?: string;
    may?: { plain: string; signature: string; target: string; boundNote: string | null }[];
    mayNot?: { signature: string; because: string }[];
    cap?: string;
    expiry?: string;
    enforcedBy?: string[];
    rationale?: string;
  };
  derivedFrom?: {
    window?: string;
    venues?: string[];
    evidence?: { label: string; tx: string; block: string | number }[];
    complete?: boolean;
  };
  wrapper?: { address: string; url: string; binds: string } | null;
  keystore?: string;
  note?: string;
}

const VERB: Record<RailName, string> = {
  call: "Ask it",
  hire: "Prepare the escrow",
  mandate: "Prepare the session",
};

export default function HireAction({
  chainId,
  id,
  rail,
  name,
  price,
  resource,
}: {
  chainId: number;
  id: string;
  rail: RailName;
  name: string;
  price: string | null;
  resource: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  /*
    The one motion that follows a write. It plays once, on the confirmation
    that the engagement landed, and it is deliberately not repeated on a
    re-render: a lift that replays every time React reconciles is decoration.
  */
  const [lifted, setLifted] = useState(false);

  /** What the button is doing right now, so it can say so rather than spin. */
  const [stage, setStage] = useState<string | null>(null);

  const post = async (path: string, payload: unknown): Promise<Result> => {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return (await res.json()) as Result;
  };

  const land = (payload: Result) => {
    setResult(payload);
    if (payload.ok && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLifted(true);
      setTimeout(() => setLifted(false), 600);
    }
  };

  async function run() {
    setBusy(true);
    setResult(null);
    setStage(null);
    try {
      /*
        A connected wallet pays for itself. `silent()` never opens a dialog, so
        a reader who has not connected is not prompted here — they get the float
        path, which is the whole reason the float exists.
      */
      const w = rail === "call" ? await silent() : null;

      if (w) {
        setStage("Reading the price");
        const prep = await post("/api/rails/call", { chainId, id, resource, payer: w.address });
        if (!prep.ok || !prep.needsSignature || !prep.typed) return land(prep);

        setStage("Check your wallet");
        await ensureChain(chainId);
        const signature = await signTypedData(w.address, prep.typed);

        setStage("Delivering it");
        const done = await post("/api/rails/call/settle", {
          chainId,
          id,
          resource,
          signature,
          authorization: prep.authorization,
          envelope: prep.envelope,
        });
        return land({ ...done, paidBy: "you" });
      }

      setStage(null);
      const payload = await post(`/api/rails/${rail}`, { chainId, id, resource });
      return land(rail === "call" ? { ...payload, paidBy: "house" } : payload);
    } catch (e) {
      /*
        `explain` turns a wallet rejection into a sentence. Declining a
        signature is a legitimate answer and is not reported as a failure of the
        agent — §13.6, a refusal names the condition, and the condition here is
        that you said no.
      */
      setResult({ ok: false, refusedBecause: explain(e) });
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  return (
    <div>
      <button className={`btn btn--hire ${busy ? "pulse" : ""}`} onClick={run} disabled={busy}>
        {busy ? (stage ?? "Working…") : `${VERB[rail]}${price ? ` — ${price}` : ""}`}
      </button>

      {rail === "call" ? (
        <p className="provenance" style={{ marginTop: 8, maxWidth: "62ch" }}>
          Connect a wallet and you pay your own cent — a signature, not a transaction, so it costs you no
          gas. Without one this deployment pays from its own float so you can see the rail work without
          funding anything; that path is rate-limited and stops when the float runs out and says so.
        </p>
      ) : null}

      {result ? (
        <div style={{ marginTop: 16 }}>
          {result.ok ? (
            <div className={`panel ${lifted ? "lifted" : ""}`} style={{ padding: 14 }}>
              <div className="between">
                <span className="chip chip--call">
                  {rail === "call"
                    ? result.paidBy === "you"
                      ? "you paid, it answered"
                      : "paid from the float, it answered"
                    : "prepared"}
                </span>
                <span className="provenance">
                  {result.paid ? `${result.paid} · ` : ""}
                  {result.latencyMs !== undefined ? `${result.latencyMs} ms` : ""}
                </span>
              </div>
              {result.txHash ? (
                <p className="provenance" style={{ marginTop: 8 }}>
                  settled in{" "}
                  <a
                    className="nav__link"
                    style={{ textDecoration: "underline" }}
                    href={`https://bscscan.com/tx/${result.txHash}`}
                  >
                    {result.txHash.slice(0, 14)}…
                  </a>
                </p>
              ) : null}
              {result.plan ? (
                <ol className="stack" style={{ gap: 6, marginTop: 10 }}>
                  {result.plan.steps.map((s, i) => (
                    <li key={i} className="prose" style={{ margin: 0 }}>
                      <span className="num dim">{i + 1}.</span> {s.says}
                    </li>
                  ))}
                </ol>
              ) : null}
              {result.plan?.note ? (
                <p className="provenance" style={{ marginTop: 10 }}>
                  {result.plan.note}
                </p>
              ) : null}

              {/* ----------------------------------- what became of the money */}
              {result.settlement ? (
                <p className="provenance" style={{ marginTop: 10, maxWidth: "68ch" }}>
                  <span className="dim">{result.settlement.state}</span> — {result.settlement.why}
                </p>
              ) : null}

              {/* ------------------------------------------------- the leash */}
              {result.leash ? (
                <div className="leash">
                  <div className="leash__cols">
                    <div>
                      <p className="leash__h">May</p>
                      <ul className="leash__list">
                        {(result.leash.may ?? []).map((c) => (
                          <li key={c.signature}>
                            {c.plain}
                            <span className="leash__sig num">{c.signature}</span>
                            {c.boundNote ? <span className="leash__bound">{c.boundNote}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      {/*
                        The withheld half is not a footnote. A leash is defined
                        by what it refuses, and a screen that lists only the
                        permissions is an advertisement for the grant.
                      */}
                      <p className="leash__h">May not</p>
                      <ul className="leash__list leash__list--not">
                        {(result.leash.mayNot ?? []).map((c) => (
                          <li key={c.signature}>
                            <span className="num">{c.signature}</span>
                            <span className="leash__bound">{c.because}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <dl className="terms leash__terms">
                    <dt>Cap</dt>
                    <dd>{result.leash.cap}</dd>
                    <dt>Expiry</dt>
                    <dd>{result.leash.expiry}</dd>
                    {result.derivedFrom?.window ? (
                      <>
                        <dt>Derived from</dt>
                        <dd>
                          {result.derivedFrom.window}
                          {result.derivedFrom.venues?.length ? ` · ${result.derivedFrom.venues.join(", ")}` : ""}
                          {result.derivedFrom.complete === false ? " · scan incomplete, so this refuses rather than narrows" : ""}
                        </dd>
                      </>
                    ) : null}
                  </dl>

                  {result.leash.enforcedBy?.length ? (
                    <ul className="leash__enforced">
                      {result.leash.enforcedBy.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  ) : null}

                  {result.derivedFrom?.evidence?.length ? (
                    <p className="provenance leash__evidence">
                      {result.derivedFrom.evidence.slice(0, 4).map((e) => (
                        <a key={e.tx} href={e.tx} className="leash__tx">
                          {e.label} <span className="dim">@{String(e.block)}</span>
                        </a>
                      ))}
                    </p>
                  ) : null}

                  {result.wrapper ? (
                    <p className="provenance" style={{ marginTop: 8 }}>
                      Recipient bound by{" "}
                      <a href={result.wrapper.url} className="leash__tx">
                        the wrapper
                      </a>{" "}
                      — {result.wrapper.binds}.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {result.note ? (
                <p className="provenance" style={{ marginTop: 10, maxWidth: "70ch" }}>
                  {result.note}
                </p>
              ) : null}
              {/*
                Where it went. A confirmation that does not say what to do next
                is a dead end, and the desk is the room that answers it.
              */}
              <p className="provenance" style={{ marginTop: 10 }}>
                <a className="nav__link" href="/desk" style={{ textDecoration: "underline" }}>
                  See it on the desk
                </a>
              </p>
              {result.body ? (
                <pre
                  className="num"
                  style={{
                    marginTop: 12,
                    padding: 12,
                    background: "var(--color-ground)",
                    borderRadius: 8,
                    fontSize: "var(--text-2xs)",
                    overflowX: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: 320,
                  }}
                >
                  {result.body.slice(0, 4000)}
                </pre>
              ) : null}
            </div>
          ) : (
            <p className="refusal" style={{ maxWidth: "72ch" }}>
              <strong style={{ fontWeight: 500 }}>{name} was not put to work.</strong>{" "}
              {result.refusedBecause ?? "The condition that failed was not reported, which is itself a bug."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
