"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatEther, parseEther, type Address } from "viem";
import CategoryMark from "@/components/v2/marks/CategoryMark";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/config";
import { marketChain } from "@/lib/chain/market";
import { useWallet, sendMarketTx, type TxState } from "@/lib/chain/wallet";
import type { MarketMandate } from "@/app/api/market/state/route";

/**
 * The other half of a marketplace.
 *
 * Retiring the old floor took the bid control with it, which would have left a
 * venue where buyers could open jobs and nobody could ever take one. A market
 * with one side is a form.
 *
 * Bidding is written from the agent operator's point of view rather than the
 * contract's: what the job is, what it pays, what has to be staked, and what
 * happens if the target is missed. The bond is not a deposit and saying so
 * plainly is the whole disclosure, it is money that is taken away, a quarter
 * at a time, for falling behind.
 */

const bnbOf = (wei: string) => Number(formatEther(BigInt(wei)));
const fmt = (wei: string, dp = 5) => `${bnbOf(wei).toFixed(dp)} BNB`;

export default function JobBoard() {
  const { address, ready, available, connect, switchChain, balanceWei } = useWallet();
  const [rows, setRows] = useState<MarketMandate[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/market/state", { cache: "no-store" });
      const body = (await res.json()) as { mandates?: MarketMandate[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? `The market answered ${res.status}.`);
      setRows(body.mandates ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The market could not be read.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = useMemo(
    () => (rows ?? []).filter((r) => r.canonical && r.state === 0),
    [rows],
  );

  if (error) {
    return (
      <div className="m-absent">
        <p className="m-absent__t">The market could not be read just now.</p>
        <p className="m-small">{error}</p>
      </div>
    );
  }

  if (!rows) return <p className="m-small">Reading the market…</p>;

  if (open.length === 0) {
    return (
      <div className="m-absent">
        <p className="m-absent__t">No job is open for bids right now.</p>
        <p className="m-small">
          Jobs appear here the moment somebody opens one, and any wallet can bid on
          them. Nothing is gated and there is no application.
        </p>
        <Link className="m-btn m-btn--sm" href="/activity" style={{ marginTop: "1rem" }}>
          See what has been opened before →
        </Link>
      </div>
    );
  }

  return (
    <div className="m-stack m-stack--lg">
      {open.map((m) => (
        <JobRow
          key={m.id}
          m={m}
          address={address}
          ready={ready}
          available={available}
          balanceWei={balanceWei}
          connect={connect}
          switchChain={switchChain}
          onDone={load}
        />
      ))}
    </div>
  );
}

function JobRow({
  m,
  address,
  ready,
  available,
  balanceWei,
  connect,
  switchChain,
  onDone,
}: {
  m: MarketMandate;
  address: Address | null;
  ready: boolean;
  available: boolean;
  balanceWei: bigint | null;
  connect: () => Promise<void>;
  switchChain: () => Promise<void>;
  onDone: () => Promise<void>;
}) {
  const [target, setTarget] = useState("200");
  const [bond, setBond] = useState<string>("");
  const [tx, setTx] = useState<TxState>({ phase: "idle" });

  const floorWei = m.requiredBondWei ? BigInt(m.requiredBondWei) : null;
  const floor = floorWei ? Number(formatEther(floorWei)) : null;
  // A little over the floor by default, so a rounding difference between what
  // we read and what the contract recomputes can never refuse the bid.
  const suggested = floor ? (floor * 1.05).toFixed(6) : "";
  const value = bond.trim() === "" ? suggested : bond;
  const valueNum = Number(value);
  const targetNum = Number(target);
  const category = CATEGORIES[m.category] ?? null;

  const refusal = (() => {
    if (!Number.isFinite(targetNum)) return "The target has to be a number, in basis points.";
    if (targetNum < 0) return "A negative target is a promise to lose money; the contract refuses it.";
    if (targetNum > 32_767) return "That target does not fit in the field the contract stores it in.";
    if (!Number.isFinite(valueNum) || valueNum <= 0) return "Enter the bond you are staking.";
    if (floor !== null && valueNum < floor)
      return `The contract requires at least ${floor.toFixed(6)} BNB on this job. Anything less is rejected.`;
    if (balanceWei !== null && parseEther(value as `${number}`) > balanceWei)
      return "This wallet does not hold that much BNB, and gas is on top of it.";
    return null;
  })();

  const submit = async () => {
    if (!address || refusal) return;
    try {
      await sendMarketTx(
        address,
        "bid",
        [BigInt(m.id), Math.round(targetNum), 0n, 0n],
        parseEther(value as `${number}`),
        setTx,
      );
      await onDone();
    } catch {
      /* the phase carries it */
    }
  };

  return (
    <article className="m-job">
      <header className="m-job__head">
        <div className="m-cluster">
          {category ? <CategoryMark category={category} size={32} /> : null}
          <div>
            <h3 className="m-h3">
              {category ? CATEGORY_LABEL[category] : "Mandate"} · #{m.id}
            </h3>
            <p className="m-note">
              {fmt(m.capitalWei)} of capital · {m.epochsTotal} hourly checkpoints
            </p>
          </div>
        </div>
        <span className="m-tag">
          {m.bids.filter((b) => !b.spent).length} bids so far
        </span>
      </header>

      <dl className="m-kv m-job__kv">
        <div>
          <dt>You must stake at least</dt>
          <dd className="m-fig">{floorWei ? fmt(floorWei.toString(), 6) : "not read"}</dd>
        </div>
        <div>
          <dt>You lose per strike</dt>
          <dd className="m-fig">
            {floorWei ? fmt((floorWei / 4n).toString(), 6) : "not read"} (a quarter)
          </dd>
        </div>
        <div>
          <dt>You keep, of what you make above the benchmark</dt>
          <dd className="m-fig">a share set by the buyer</dd>
        </div>
      </dl>

      <div className="m-job__act">
        {tx.phase === "confirmed" ? (
          <p className="m-ok">
            Bid placed.{" "}
            <a
              className="m-link"
              href={`${marketChain.blockExplorers?.default.url}/tx/${tx.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View it
            </a>{" "}
          , the buyer decides from here.
          </p>
        ) : !available ? (
          <div className="m-gate">
            <p className="m-gate__why">
              Bidding stakes real money, so it needs a wallet. There is none in this
              browser.
            </p>
            <a className="m-btn" href="https://www.bnbchain.org/en/wallets" target="_blank" rel="noreferrer">
              Get a wallet →
            </a>
          </div>
        ) : !address ? (
          <div className="m-gate">
            <p className="m-gate__why">Connect the wallet you want to bid from.</p>
            <button className="m-btn m-btn--primary" type="button" onClick={() => void connect()}>
              Connect wallet →
            </button>
          </div>
        ) : !ready ? (
          <div className="m-gate">
            <p className="m-gate__why">This market is on {marketChain.name}.</p>
            <button className="m-btn m-btn--primary" type="button" onClick={() => void switchChain()}>
              Switch network →
            </button>
          </div>
        ) : (
          <>
            <div className="m-bidform">
              <label className="m-field">
                <span className="m-label m-field__label">You will beat the benchmark by</span>
                <input
                  className="m-input m-input--fig"
                  inputMode="numeric"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                />
                <span className="m-field__hint">
                  {Number.isFinite(targetNum) ? `${(targetNum / 100).toFixed(2)}% an hour.` : "Enter a whole number of basis points."}
                </span>
              </label>
              <label className="m-field">
                <span className="m-label m-field__label">Your bond</span>
                <input
                  className="m-input m-input--fig"
                  inputMode="decimal"
                  placeholder={suggested}
                  value={bond}
                  onChange={(e) => setBond(e.target.value)}
                />
                <span className="m-field__hint">
                  In BNB. Returned in full if you serve the term.
                </span>
              </label>
            </div>

            {refusal ? (
              <p className="m-error" style={{ marginTop: "0.8rem" }}>{refusal}</p>
            ) : null}
            {tx.phase === "failed" ? (
              <p className="m-error" style={{ marginTop: "0.8rem" }}>{tx.error}</p>
            ) : null}

            <button
              className="m-btn m-btn--primary"
              type="button"
              style={{ marginTop: "1rem" }}
              disabled={Boolean(refusal) || tx.phase === "signing" || tx.phase === "pending"}
              onClick={() => void submit()}
            >
              {tx.phase === "signing"
                ? "Waiting for your wallet…"
                : tx.phase === "pending"
                  ? "Placing the bid…"
                  : `Stake ${valueNum ? valueNum.toFixed(6) : "0"} BNB and bid →`}
            </button>
          </>
        )}
      </div>
    </article>
  );
}
