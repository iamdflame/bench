"use client";

import { useCallback, useEffect, useState } from "react";
import {
  batchStatus,
  connect,
  ensureChain,
  explain,
  send,
  sendBatch,
  short,
  silent,
  supportsBatch,
  type Connected,
  type Intent,
} from "@/lib/wallet";

/**
 * Rail 2, executed — from the buyer's wallet, never from ours.
 *
 * The server already built this. `buildHirePlan` returns the five ERC-8183
 * calls as `{ step, says, to, data, value }` with `executed: false` in the
 * payload, and that has been true for weeks; what was missing was anything in
 * the browser able to send them. This is that, and nothing more. It does not
 * decide the terms, compute the budget, or choose the deadline — it takes a
 * document the server signed off on and asks a wallet to execute it in order.
 *
 * The escrow sits in the kernel and this marketplace is not a party to it. We
 * could not release or reclaim it if we wanted to, which is the single most
 * valuable property of the rail and the reason none of this happens on a server.
 *
 * ---------------------------------------------------------------------------
 * Five confirmations, or one
 * ---------------------------------------------------------------------------
 *
 * Funding a job is five calls: approve, createJob, registerJob, setBudget,
 * fund. On a wallet that implements EIP-5792 they go as a single atomic batch
 * and the user confirms once. On one that does not, they go one at a time.
 *
 * Which of those it will be is worked out **before the first popup**, on mount,
 * and printed on the screen. §12.3 is explicit that `maximumSignatures` is
 * declared before the user starts, and the failure it exists to prevent is
 * discovering a fourth wallet dialog halfway through paying for something. A
 * count that turns out to be five after someone was told one is the same
 * failure with better intentions.
 *
 * Sequential mode is not a lesser path with a warning on it. Each call names
 * itself as it goes, and a wallet declined at step three leaves a job that
 * exists and is unfunded — recoverable, stated, and not a silent half-state.
 */

export interface Plan {
  jobId: string;
  buyer: string;
  provider: string;
  budget: string;
  expiredAt: number;
  disputeWindow: number;
  settlesAt: string;
  signatures: number;
  steps: (Intent & { step: string; says: string })[];
  note?: string;
}

type Landed = { step: string; hash: string };

export default function Execute({
  plan,
  chainId,
  name,
}: {
  plan: Plan;
  chainId: number;
  name: string;
}) {
  const [w, setW] = useState<Connected | null>(null);
  const [batch, setBatch] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState<string | null>(null);
  const [landed, setLanded] = useState<Landed[]>([]);
  const [why, setWhy] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  /*
    Asked once, on mount, and never during the flow. `silent()` does not open a
    dialog, so a reader who has not connected sees the honest "up to five"
    rather than being prompted for permission to count.
  */
  useEffect(() => {
    void silent().then(async (s) => {
      if (!s) return;
      setW(s);
      setBatch(await supportsBatch(s.address, chainId));
    });
  }, [chainId]);

  const signatures = batch === true ? 1 : plan.steps.length;

  const run = useCallback(async () => {
    setBusy(true);
    setWhy(null);
    setLanded([]);
    try {
      const account = w ?? (await connect());
      setW(account);
      await ensureChain(chainId);

      const canBatch = batch ?? (await supportsBatch(account.address, chainId));
      setBatch(canBatch);

      if (canBatch) {
        setAt("One confirmation for all five calls");
        const id = await sendBatch(account.address, chainId, plan.steps);
        /*
          Polled rather than awaited. `wallet_sendCalls` returns an identifier
          the moment the user confirms, and the calls land afterwards; a screen
          that showed nothing until they did would look broken for the ten
          seconds that matter most.
        */
        for (let i = 0; i < 60; i++) {
          const st = await batchStatus(id);
          if (st.done) {
            setLanded(st.receipts.map((r, n) => ({ step: plan.steps[n]?.step ?? "call", hash: r.transactionHash })));
            break;
          }
          setAt(`Waiting for the batch to land (${i + 1})`);
          await new Promise((r) => setTimeout(r, 2_000));
        }
      } else {
        for (const intent of plan.steps) {
          setAt(intent.says);
          const hash = await send(account.address, intent);
          setLanded((prev) => [...prev, { step: intent.step, hash }]);
        }
      }
      setDone(true);
    } catch (e) {
      setWhy(explain(e));
    } finally {
      setBusy(false);
      setAt(null);
    }
  }, [batch, chainId, plan.steps, w]);

  return (
    <div className="execute">
      {/* ------------------------------------- the count, before the first popup */}
      <dl className="terms">
        <dt>Signatures</dt>
        <dd>
          <span className="num">{signatures}</span>{" "}
          {batch === null ? (
            <span className="unmeasured">
              at most
              <span className="unmeasured__why">
                Your wallet has not been asked yet whether it can take all {plan.steps.length} calls as one
                batch. Connect and this becomes exact before anything is signed.
              </span>
            </span>
          ) : batch ? (
            <span className="dim">— your wallet takes all {plan.steps.length} calls as one atomic batch</span>
          ) : (
            <span className="dim">— one per call; your wallet does not batch (EIP-5792)</span>
          )}
        </dd>
        <dt>Settles</dt>
        <dd>
          <span className="num">{new Date(plan.settlesAt).toUTCString().replace("GMT", "UTC")}</span>{" "}
          <span className="dim">
            — a {(plan.disputeWindow / 86_400).toFixed(plan.disputeWindow % 86_400 === 0 ? 0 : 1)} day dispute
            window, read from the policy contract
          </span>
        </dd>
        <dt>Custody</dt>
        <dd>
          Your wallet. The escrow sits in the job kernel; this marketplace is not a party to it and could not
          release or reclaim it.
        </dd>
      </dl>

      <button className={`btn btn--hire btn--lg ${busy ? "pulse" : ""}`} onClick={run} disabled={busy || done}>
        {done ? "Hired." : busy ? (at ?? "Working…") : `Hire ${name} — ${plan.budget}`}
      </button>

      {/* --------------------------------------- what has landed, as it lands */}
      {plan.steps.length > 0 ? (
        <ol className="execute__steps">
          {plan.steps.map((s, i) => {
            const hit = landed.find((l) => l.step === s.step);
            return (
              <li key={s.step} className="execute__step" data-done={hit ? "" : undefined}>
                <span className="num dim">{i + 1}</span>
                <span>
                  {s.says}
                  {hit ? (
                    <a
                      className="leash__tx execute__hash"
                      href={`https://${chainId === 97 ? "testnet." : ""}bscscan.com/tx/${hit.hash}`}
                    >
                      {short(hit.hash)}
                    </a>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      ) : null}

      {done ? (
        <p className="provenance execute__done">
          Job <span className="num">{plan.jobId}</span> is funded. It is on{" "}
          <a className="leash__tx" href={`/desk?wallet=${plan.buyer}`}>
            your desk
          </a>{" "}
          with its settlement date, and reclaimable by you if the seller never delivers.
        </p>
      ) : null}

      {why ? (
        <p className="refusal execute__why">
          <strong style={{ fontWeight: 500 }}>{name} was not hired.</strong> {why}
          {landed.length > 0 ? (
            <>
              {" "}
              {landed.length} of {plan.steps.length} calls had already landed, so the job exists and is not yet
              funded. Nothing is lost; running this again resumes from a fresh plan.
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
