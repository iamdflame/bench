"use client";

import { useEffect, useState } from "react";
import { EXPLORER } from "@/lib/config";
import { weiToBnb } from "./Attestation";

export interface SessionView {
  mandateId: number;
  category: string;
  sessionKey: string;
  walletAddress: string;
  capWei: string;
  expiry: number;
  expiresIn: number;
  registered: boolean;
  registrationTx: string | null;
  allowlist: { to: string; signature: string }[];
  withheld: { to: string; signature: string; because?: string }[];
  provenProtocols: string[];
  scopeRationale: string | null;
  revokedAt: string | null;
  revokedBecause: string | null;
  market: string | null;
}

/**
 * What this agent may do, and the button that stops it.
 *
 * A principal has to be able to see the authority they granted and withdraw it
 * from inside the product. A paragraph describing revocation is not
 * revocation, so the control is here and it is real.
 *
 * The withheld list is the interesting half. `granted ⊆ proven` means the
 * allowlist is the intersection of what the category permits with what the
 * assay actually observed on chain — so a call the category allows and the
 * agent has never made is *absent*, and showing what was taken away is how a
 * principal sees the narrowing happened rather than taking it on trust.
 */
export default function SessionScope({
  session,
  revocable,
}: {
  session: SessionView;
  /** False where the deployment has no operator token; the button says so. */
  revocable: boolean;
}) {
  const s = session;
  const left = useCountdown(s.expiry);
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const revoked = Boolean(s.revokedAt) || state === "done";

  const revoke = async () => {
    setState("working");
    setMessage(null);
    try {
      const token = window.prompt("Operator token") ?? "";
      const res = await fetch("/api/sessions/revoke", {
        method: "POST",
        headers: { "content-type": "application/json", "x-operator-token": token },
        body: JSON.stringify({ mandateId: s.mandateId }),
      });
      const body = (await res.json()) as { ok?: boolean; reason?: string };
      if (res.ok && body.ok) {
        setState("done");
        setMessage("Key removed from the account and from KeyStore.");
      } else {
        setState("error");
        setMessage(body.reason ?? `Refused (${res.status}).`);
      }
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Request failed.");
    }
  };

  return (
    <section className="panel scope" data-revoked={revoked ? "1" : undefined}>
      <div className="panel__head">
        <h3 className="mark-label">
          Session · mandate {s.mandateId} · {s.category}
        </h3>
        <span className="mark-label">
          {revoked ? "revoked" : s.registered ? "registered in keystore" : "ephemeral"}
        </span>
      </div>

      <div className="panel__body">
        <dl className="kv scope__kv">
          <dt>key</dt>
          <dd>
            {/* An uncompressed public key is 132 characters and breaks the
                column. Elided in the middle, never truncated at the end, with
                the whole value on the title and one click away. */}
            <a
              href={`${EXPLORER}/address/${s.sessionKey}`}
              target="_blank"
              rel="noreferrer"
              className="scope__link"
              title={s.sessionKey}
            >
              {s.sessionKey.length > 30
                ? `${s.sessionKey.slice(0, 18)}…${s.sessionKey.slice(-8)}`
                : s.sessionKey}
            </a>
          </dd>
          <dt>acts for</dt>
          <dd>
            <a
              href={`${EXPLORER}/address/${s.walletAddress}`}
              target="_blank"
              rel="noreferrer"
              className="scope__link"
            >
              {s.walletAddress}
            </a>
          </dd>
          <dt>cap</dt>
          <dd>{weiToBnb(s.capWei)} BNB</dd>
          <dt>expires</dt>
          <dd suppressHydrationWarning>{revoked ? "revoked" : left}</dd>
          {s.registrationTx ? (
            <>
              <dt>registration</dt>
              <dd>
                <a
                  href={`${EXPLORER}/tx/${s.registrationTx}`}
                  target="_blank"
                  rel="noreferrer"
                  className="scope__link"
                >
                  {s.registrationTx.slice(0, 14)}…
                </a>
              </dd>
            </>
          ) : null}
        </dl>

        {/*
          One table, with the state as a column.

          Granted and withheld sat in two columns side by side, and the withheld
          column is empty for most sessions — so half of every panel was the
          words "nothing withheld" and a great deal of ground. Read as one list
          they also compare properly: the point is not that two calls were
          allowed, it is that these two were allowed and that one beside them
          was not, for a reason the chain can be asked about.
        */}
        <div className="scope__scope">
          <div className="scope__scopehead">
            <span className="mark-label">The whole authority</span>
            <span className="mark-label">
              {s.allowlist.length} granted · {s.withheld.length} withheld
            </span>
          </div>
          <table className="tbl scope__tbl">
            <thead>
              <tr>
                <th scope="col">state</th>
                <th scope="col">selector</th>
                <th scope="col">target</th>
                <th scope="col">why not</th>
              </tr>
            </thead>
            <tbody>
              {s.allowlist.map((c) => (
                <tr key={`g:${c.to}:${c.signature}`}>
                  <td className="mark-label scope__state">granted</td>
                  <td className="num scope__sel">{c.signature}</td>
                  <td className="num scope__tgt">{c.to.slice(0, 10)}…</td>
                  <td className="scope__whynot">—</td>
                </tr>
              ))}
              {s.withheld.map((c) => (
                <tr key={`w:${c.to}:${c.signature}`} data-withheld="1">
                  <td className="mark-label scope__state">withheld</td>
                  <td className="num scope__sel">{c.signature}</td>
                  <td className="num scope__tgt">{c.to.slice(0, 10)}…</td>
                  <td className="scope__whynot">{c.because ?? "not observed on chain"}</td>
                </tr>
              ))}
              {s.allowlist.length === 0 && s.withheld.length === 0 ? (
                <tr>
                  <td colSpan={4} className="empty">
                    This session grants no calls at all. It can read the chain and
                    decide; it can spend nothing.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {s.scopeRationale ? <p className="small dim scope__why">{s.scopeRationale}</p> : null}

        <div className="scope__foot">
          <button
            type="button"
            className="btn"
            onClick={revoke}
            disabled={revoked || state === "working" || !revocable}
            aria-disabled={revoked || !revocable}
          >
            {revoked ? "Revoked" : state === "working" ? "Revoking…" : "Revoke this session"}
          </button>
          {!revocable && !revoked ? (
            <span className="small dim">
              This deployment has no operator token. Revocation still works from the
              operator&rsquo;s machine.
            </span>
          ) : null}
          {message ? <span className="small dim">{message}</span> : null}
          {s.revokedBecause ? (
            <span className="small dim">{s.revokedBecause}</span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * Time left on the key, counted down rather than printed once.
 *
 * An expiry rendered as a static string is a claim about a moment that has
 * already passed by the time it is read.
 */
function useCountdown(expiry: number): string {
  const [text, setText] = useState("—");
  useEffect(() => {
    const tick = () => {
      const s = expiry - Math.floor(Date.now() / 1000);
      setText(s <= 0 ? "expired" : humanise(s));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiry]);
  return text;
}

function humanise(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${String(h).padStart(2, "0")}h`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
