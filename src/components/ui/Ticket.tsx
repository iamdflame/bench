"use client";

import { useMemo, useState } from "react";
import { parseEther } from "viem";
import { marketChain } from "@/lib/chain/market";
import { sendMarketTx, useWallet, type TxState } from "@/lib/chain/wallet";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/lib/config";
import Observation from "./Observation";

/**
 * The ticket.
 *
 * A mandate was openable before this, from a panel on the floor with the terms
 * written into the source as six positional arguments and restated underneath
 * in a sentence. That is a form, not a ticket. What a principal is actually
 * agreeing to — which contracts the agent may call, which calls are withheld
 * from it and why, what fraction of the bond a failing epoch costs, and what
 * ends the mandate — was nowhere on the screen where they signed.
 *
 * Everything that governs the money is on the ticket, above the button, before
 * the wallet opens. Two things follow from that and both are deliberate:
 *
 *   The allowlist is shown per selector, not per contract. An agent allowed to
 *   swap through the V3 router is not allowed to call `sweepToken` on the same
 *   address, and a ticket that said "PancakeSwap V3" would have hidden exactly
 *   the distinction that makes the session safe.
 *
 *   The withheld calls are shown too. A permission list that only shows what
 *   was granted reads as generous; the same list beside what was refused, with
 *   the reason, reads as what it is — a boundary drawn from evidence.
 *
 * A refusal is named on the ticket rather than thrown as a toast: the failed
 * condition sits next to the field that caused it and stays there.
 */

export interface AllowedCall {
  /** Contract the session may call. */
  to: string;
  /** Human label for that contract. */
  target: string;
  /** The selector, in full. Never abbreviated to the contract. */
  signature: string;
}

export interface TicketScope {
  category: Category;
  allowed: AllowedCall[];
  /**
   * Calls the category defines that this agent has not earned, with the
   * reason. `granted ⊆ proven` is enforced in the type system; this is where
   * a reader sees the difference it made.
   */
  withheld: { signature: string; target: string; why: string }[];
}

const TERMS = {
  toleranceBps: 200,
  feeBps: 2_000,
  slashBps: 2_500,
  epochLength: 3_600,
  epochsTotal: 24,
} as const;

const EXPLORER = marketChain.blockExplorers?.default?.url;

export default function Ticket({
  scopes,
  initialCategory,
  initialAgent,
  blockNumber,
  readAt,
}: {
  /** One entry per office, so the allowlist changes with the selection. */
  scopes: Record<Category, TicketScope>;
  initialCategory?: Category;
  /** Prefilled when arriving from an agent's certificate. */
  initialAgent?: string | null;
  blockNumber?: string | null;
  readAt?: string | null;
}) {
  const { address, available, ready, chainId, connect, switchChain } = useWallet();
  const [connecting, setConnecting] = useState(false);
  const [category, setCategory] = useState<Category>(initialCategory ?? "grid-trading");
  const [capital, setCapital] = useState("0.05");
  const [tx, setTx] = useState<TxState>({ phase: "idle" });

  const scope = scopes[category];
  const capitalNum = Number(capital);

  /*
    The refusal, named, beside the field that caused it.

    A disabled button with no explanation is the commonest way a marketplace
    tells somebody their money is not welcome. Every reason it could be
    disabled is written out instead.
  */
  const refusal = useMemo(() => {
    if (!Number.isFinite(capitalNum) || capitalNum <= 0)
      return "Capital must be a positive number of BNB.";
    if (capitalNum < 0.00001)
      return "Below 0.00001 BNB the bond tier rounds to nothing and the agent would risk zero.";
    return null;
  }, [capitalNum]);

  const busy = tx.phase === "signing" || tx.phase === "pending";
  const bondFloor = capitalNum > 0 ? capitalNum * 0.25 : 0;

  const submit = async () => {
    if (refusal || !address) return;
    try {
      await sendMarketTx(
        address,
        "openMandate",
        [
          CATEGORIES.indexOf(category),
          TERMS.toleranceBps,
          TERMS.feeBps,
          TERMS.slashBps,
          TERMS.epochLength,
          TERMS.epochsTotal,
        ],
        parseEther(capital as `${number}`),
        setTx,
      );
    } catch {
      /* The phase already carries the reason. */
    }
  };

  return (
    <section className="ticket" aria-labelledby="ticket-title">
      <header className="ticket__head">
        <h2 id="ticket-title" className="mark-label">
          Ticket · open a mandate
        </h2>
        <Observation size="small" block={blockNumber ?? undefined} at={readAt ?? undefined} />
      </header>

      <div className="ticket__grid">
        <Field label="Office">
          <div className="ticket__offices">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className="ticket__office"
                data-on={category === c ? "1" : undefined}
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
              >
                {CATEGORY_LABEL[c]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Agent">
          <p className="ticket__value num">
            {initialAgent ? `#${initialAgent}` : "Let agents bid"}
          </p>
          <p className="ticket__note">
            {initialAgent
              ? "Named from the certificate you arrived from. It still has to post a bond to take the mandate."
              : "The mandate opens to the floor and is taken by the first agent to escrow a bond against it."}
          </p>
        </Field>

        <Field label="Capital">
          <div className="ticket__amount">
            <input
              className="ticket__input num"
              value={capital}
              onChange={(e) => setCapital(e.target.value)}
              inputMode="decimal"
              aria-label="Capital in BNB"
            />
            <span className="mark-label">BNB</span>
          </div>
          <p className="ticket__note">
            Escrowed in the market contract and returned to you when the term
            completes. USDT and USD1 mandates are supported by the contract; this
            ticket opens BNB ones.
          </p>
        </Field>

        <Field label="Benchmark">
          <p className="ticket__value">Category benchmark, committed before the epoch</p>
          <p className="ticket__note">
            Settlement compares the agent against a measurement whose hash is on
            chain before the outcome is known, so the score cannot be written after
            the fact — by them or by us.
          </p>
        </Field>

        <Field label="Epoch and term">
          <p className="ticket__value num">
            {TERMS.epochLength / 3600}h × {TERMS.epochsTotal}
          </p>
          <p className="ticket__note">
            Settled hourly over twenty-four epochs. {TERMS.toleranceBps / 100}%
            underperformance is tolerated before a strike.
          </p>
        </Field>

        <Field label="Bond floor">
          <p className="ticket__value num">{bondFloor > 0 ? bondFloor.toFixed(5) : "—"} BNB</p>
          <p className="ticket__note">
            The least an agent must escrow of its own to take this mandate, at the
            tier your capital falls in. {TERMS.slashBps / 100}% of it is slashed
            for every epoch it trails past tolerance.
          </p>
        </Field>
      </div>

      {/*
        What the session key may do, per selector, before the wallet opens.
      */}
      <div className="ticket__scope">
        <div className="ticket__scopehead">
          <span className="mark-label">Session allowlist</span>
          <span className="mark-label">
            {scope.allowed.length} call{scope.allowed.length === 1 ? "" : "s"} granted ·{" "}
            {scope.withheld.length} withheld
          </span>
        </div>
        <table className="tbl ticket__tbl">
          <thead>
            <tr>
              <th scope="col">state</th>
              <th scope="col">target</th>
              <th scope="col">selector</th>
              <th scope="col">why not</th>
            </tr>
          </thead>
          <tbody>
            {scope.allowed.map((c) => (
              <tr key={`${c.to}-${c.signature}`}>
                <td className="mark-label ticket__state">granted</td>
                <td className="ticket__target">
                  {EXPLORER ? (
                    <a href={`${EXPLORER}/address/${c.to}`} target="_blank" rel="noreferrer">
                      {c.target}
                    </a>
                  ) : (
                    c.target
                  )}
                </td>
                <td className="num ticket__sel">{c.signature}</td>
                <td className="ticket__why">—</td>
              </tr>
            ))}
            {/*
              The reason sits in its own column rather than trailing the
              selector. Run together they made one cell long enough to push the
              whole page sideways, and the selector — the thing that makes the
              grant specific — was the part that got pushed off screen.
            */}
            {scope.withheld.map((c) => (
              <tr key={`w-${c.signature}`} data-withheld="1">
                <td className="mark-label ticket__state">withheld</td>
                <td className="ticket__target">{c.target}</td>
                <td className="num ticket__sel">{c.signature}</td>
                <td className="ticket__why">{c.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ticket__note">
          The key is scoped per selector, not per contract. An agent allowed to swap
          through the V3 router still cannot call <span className="num">sweepToken</span>{" "}
          on the same address. Registered in the Altana Keystore, and revocable by you
          from <a className="link-underline" href="/authority">Authority</a> at any time.
        </p>
      </div>

      <div className="ticket__rules">
        <Rule label="Slash">
          {TERMS.slashBps / 100}% of the bond per epoch trailing the benchmark by more
          than {TERMS.toleranceBps / 100}%.
        </Rule>
        <Rule label="Dismiss">
          Three strikes, or one catastrophic epoch, ends the mandate in a single
          transaction. The bond is forfeit and the succession queue takes over.
        </Rule>
        <Rule label="Fee">
          {TERMS.feeBps / 100}% of alpha to the agent, and nothing when alpha is
          negative.
        </Rule>
      </div>

      {/*
        The wallet is asked for here and nowhere else.

        Everything above this line is readable, checkable and shareable with no
        wallet at all, which is the whole shape of the product: the office is
        open to anyone, and the key is only needed by the person about to put
        capital behind a decision they have already been shown in full.
      */}
      <div className="ticket__sign">
        {refusal ? (
          <p className="ticket__refusal">{refusal}</p>
        ) : (
          <p className="ticket__note">
            Signing escrows {capital} BNB and opens the mandate to the floor. Nothing
            leaves your wallet beyond that amount and the gas.
          </p>
        )}

        {!available ? (
          <p className="ticket__refusal">
            No wallet extension is available in this browser, so this ticket cannot be
            signed here. Everything above is still readable, and the same transaction
            can be sent from a terminal.
          </p>
        ) : !address ? (
          <button
            type="button"
            className="btn btn--primary"
            disabled={connecting}
            onClick={async () => {
              setConnecting(true);
              try {
                await connect();
              } catch {
                /* The wallet has already said why. */
              } finally {
                setConnecting(false);
              }
            }}
          >
            {connecting ? "…" : "Connect a wallet to sign"}
          </button>
        ) : !ready ? (
          <button type="button" className="btn btn--primary" onClick={() => void switchChain()}>
            Switch to BNB Smart Chain (on {chainId})
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            onClick={submit}
            disabled={Boolean(refusal) || busy}
          >
            {busy ? "…" : "Sign and open the mandate"}
          </button>
        )}
        <Phase tx={tx} />
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ticket__field">
      <span className="mark-label">{label}</span>
      {children}
    </div>
  );
}

function Rule({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ticket__rule">
      <span className="mark-label">{label}</span>
      <p className="ticket__note">{children}</p>
    </div>
  );
}

/** Where the transaction is, and its hash the moment there is one. */
function Phase({ tx }: { tx: TxState }) {
  if (tx.phase === "idle") return null;
  const label =
    tx.phase === "signing"
      ? "waiting for your wallet…"
      : tx.phase === "pending"
        ? "submitted, waiting for a block…"
        : tx.phase === "confirmed"
          ? "confirmed"
          : (tx.error ?? "failed");
  return (
    <p className="ticket__phase" data-ok={tx.phase === "confirmed" ? "1" : undefined}>
      {label}
      {tx.hash ? (
        <>
          {" "}
          {EXPLORER ? (
            <a
              className="link-underline num"
              href={`${EXPLORER}/tx/${tx.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              {tx.hash.slice(0, 18)}…
            </a>
          ) : (
            <span className="num">{tx.hash.slice(0, 18)}…</span>
          )}
        </>
      ) : null}
    </p>
  );
}
