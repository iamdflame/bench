"use client";

import { useState } from "react";
import { connect, ensureChain, explain, send, short, silent, type Intent } from "@/lib/wallet";

/**
 * The two controls that were disabled spans.
 *
 * `Reclaim` sat over `buildReclaim`, which has existed in `packages/rails` and
 * been called by nothing. `Revoke` sat over `revokeEngagement`, same. Both were
 * rendered as `<span aria-disabled="true">` — not buttons, with no handler and
 * no way to acquire one, because the page around them is a server component.
 *
 * They are different in a way the UI has to keep straight:
 *
 *   RECLAIM   is the buyer's own call against the job kernel. It moves the
 *             buyer's money back to the buyer, so it is signed by the buyer's
 *             wallet and this deployment could not make it for them if it
 *             wanted to. Only possible after the deadline.
 *
 *   REVOKE    ends a session this deployment granted over an account it
 *             administers, so it is a request to the server, which holds the
 *             admin key for that account and no key of yours.
 *
 * Conflating those two would be the exact custody confusion this product exists
 * to avoid, so they do not share a code path and they do not share a sentence.
 */

export function Reclaim({
  intent,
  chainId,
  reclaimableAt,
}: {
  intent: Intent;
  chainId: number;
  /** Unix seconds. Before this the kernel reverts, so the button says so. */
  reclaimableAt: number;
}) {
  const [busy, setBusy] = useState(false);
  const [hash, setHash] = useState<string | null>(null);
  const [why, setWhy] = useState<string | null>(null);

  const now = Math.floor(Date.now() / 1000);
  const ready = now >= reclaimableAt;

  async function run() {
    setBusy(true);
    setWhy(null);
    try {
      const w = (await silent()) ?? (await connect());
      await ensureChain(chainId);
      setHash(await send(w.address, intent));
    } catch (e) {
      setWhy(explain(e));
    } finally {
      setBusy(false);
    }
  }

  if (hash) {
    return (
      <p className="provenance" style={{ margin: 0 }}>
        Reclaimed in{" "}
        <a className="leash__tx" href={`https://${chainId === 97 ? "testnet." : ""}bscscan.com/tx/${hash}`}>
          {short(hash)}
        </a>
        . The escrow is back in your wallet.
      </p>
    );
  }

  return (
    <>
      <button className={`btn btn--sm ${busy ? "pulse" : ""}`} onClick={run} disabled={busy || !ready}>
        {busy ? "Check your wallet" : ready ? "Reclaim the escrow" : "Reclaim after the deadline"}
      </button>
      <span className="provenance">
        {ready
          ? "One call from your own wallet against the kernel. This deployment holds no key and is not a party to the job."
          : `The kernel refuses a reclaim before ${new Date(reclaimableAt * 1000).toUTCString().replace("GMT", "UTC")}, so this does nothing until then.`}
      </span>
      {why ? <span className="refusal">{why}</span> : null}
    </>
  );
}

export function Revoke({ id }: { id: number }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ txHash: string | null; says: string } | null>(null);
  const [why, setWhy] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setWhy(null);
    try {
      const res = await fetch("/api/rails/mandate/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const payload = (await res.json()) as {
        ok: boolean;
        txHash?: string | null;
        says?: string;
        refusedBecause?: string;
      };
      if (payload.ok) setDone({ txHash: payload.txHash ?? null, says: payload.says ?? "The session is revoked." });
      else setWhy(payload.refusedBecause ?? "The revocation was refused without a reason, which is itself a bug.");
    } catch (e) {
      setWhy(`The request did not complete: ${String(e).slice(0, 140)}`);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <p className="provenance" style={{ margin: 0, maxWidth: "64ch" }}>
        <span className="chip chip--refused">revoked</span> {done.says}
        {done.txHash ? (
          <>
            {" "}
            <a className="leash__tx" href={`https://bscscan.com/tx/${done.txHash}`}>
              {short(done.txHash)}
            </a>
          </>
        ) : null}
      </p>
    );
  }

  return (
    <>
      <button className={`btn btn--sm ${busy ? "pulse" : ""}`} onClick={run} disabled={busy}>
        {busy ? "Ending it" : "Revoke"}
      </button>
      <span className="provenance">
        One transaction. After it lands the session key fails at the account contract, not in a runner&rsquo;s
        filter — so it fails whether or not anything of ours is running.
      </span>
      {why ? <span className="refusal">{why}</span> : null}
    </>
  );
}
