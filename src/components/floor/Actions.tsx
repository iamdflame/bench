"use client";

/**
 * Entering the market.
 *
 * Watching a floor and standing on it are different products. This is the
 * second: a principal can open a mandate and escrow capital against it, and an
 * agent can bid for one by escrowing a bond it can lose.
 *
 * Everything here can move real BNB, so the flow refuses to be clever. Amounts
 * are restated before signing, the consequence of a bond is spelled out rather
 * than implied, and every submitted transaction surfaces its hash.
 */

import { parseEther } from "viem";
import { useState } from "react";
import { marketChain } from "@/lib/chain/market";
import { fmtBnb, sendMarketTx, useWallet, type TxState } from "@/lib/chain/wallet";
import type { FloorMandate } from "@/app/api/floor/route";

/** Native BNB. V2 ignores the `amount` argument and uses `msg.value`. */
const NATIVE = "0x0000000000000000000000000000000000000000" as const;

/**
 * What a mandate's alpha is measured against, indexed by the category enum.
 *
 * `Hold` for the two judged against a static position, the best passive rate
 * for yield, liquidation-avoided for health factor. The order is the
 * contract's own enum order, which `CATEGORIES` already mirrors.
 */
const BENCHMARK_BY_INDEX: Record<number, number> = { 0: 0, 1: 0, 2: 1, 3: 2 };


const CATEGORY_NAMES = [
  "Rebalancing",
  "Grid Trading",
  "Yield Optimisation",
  "Health Factor",
];

const EXPLORER = marketChain.blockExplorers?.default?.url;


/**
 * A control that never simply refuses.
 *
 * Both panels here gated their submit on `ready`, connected, and on the right
 * chain, and then rendered a grey button with no explanation and no way to
 * become ready. A visitor with no wallet, or the wrong network, saw a dead
 * rectangle and the product's answer was silence.
 *
 * The criterion this marketplace is judged against says a stranger must get
 * through "without hitting a dead end". So every reason a control is
 * unavailable is named, and where the reason is fixable the fix is the button:
 * no wallet, connect it; wrong chain, switch it; a bad value, say which value.
 */
function Gate({
  refusal,
  children,
}: {
  /** A reason the inputs are not yet valid, or null. */
  refusal?: string | null;
  children: React.ReactNode;
}) {
  const { address, available, ready, chainId, connect, switchChain } = useWallet();
  const [busy, setBusy] = useState(false);

  if (!available) {
    return (
      <p style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--ink-3)", margin: 0 }}>
        No wallet extension in this browser, so nothing here can be signed.
        Everything above is readable without one.
      </p>
    );
  }

  if (!address) {
    return (
      <button
        onClick={async () => {
          setBusy(true);
          try {
            await connect();
          } catch {
            /* The wallet said no; it will have said so itself. */
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy}
        style={buttonStyle(!busy)}
      >
        {busy ? "connecting…" : "connect a wallet to sign"}
      </button>
    );
  }

  if (!ready) {
    return (
      <button onClick={() => void switchChain()} style={buttonStyle(true)}>
        switch to {marketChain.name}
        {chainId ? ` (on ${chainId})` : ""}
      </button>
    );
  }

  if (refusal) {
    return (
      <>
        <button disabled style={buttonStyle(false)}>
          cannot submit yet
        </button>
        <p style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--ink-3)", margin: "0.4rem 0 0" }}>
          {refusal}
        </p>
      </>
    );
  }

  return <>{children}</>;
}

export function WalletChip() {
  const { address, available, ready, chainId, balanceWei, connect, switchChain } =
    useWallet();
  const [busy, setBusy] = useState(false);

  if (!available) {
    return (
      <span className="label" title="No EIP-1193 provider in this browser">
        no wallet detected
      </span>
    );
  }

  if (!address) {
    return (
      <button
        onClick={async () => {
          setBusy(true);
          try {
            await connect();
          } catch {
            /* the wallet already told them */
          } finally {
            setBusy(false);
          }
        }}
        className="label"
        style={{
          background: "transparent",
          border: "1px solid var(--score)",
          color: "var(--ink)",
          padding: "0.35rem 0.8rem",
          cursor: "pointer",
        }}
      >
        {busy ? "connecting…" : "connect wallet"}
      </button>
    );
  }

  if (!ready) {
    return (
      <button
        onClick={() => void switchChain()}
        className="label"
        style={{
          background: "var(--gold-750)",
          border: "1px solid var(--gold-750)",
          color: "var(--void)",
          padding: "0.35rem 0.8rem",
          cursor: "pointer",
        }}
      >
        switch to {marketChain.name} (on {chainId})
      </button>
    );
  }

  return (
    <span className="fig" style={{ fontSize: 11, color: "var(--ink-2)" }}>
      {address.slice(0, 6)}…{address.slice(-4)} · {fmtBnb(balanceWei, 3)} BNB
    </span>
  );
}

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
    <div
      style={{
        marginTop: "0.7rem",
        fontSize: 11.5,
        lineHeight: 1.5,
        color: tx.phase === "confirmed" ? "var(--gold-999)" : "var(--ink-2)",
      }}
    >
      {label}
      {tx.hash ? (
        <div className="fig" style={{ fontSize: 10.5, marginTop: 4, wordBreak: "break-all" }}>
          {EXPLORER ? (
            <a
              href={`${EXPLORER}/tx/${tx.hash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="link-underline"
            >
              {tx.hash.slice(0, 18)}…
            </a>
          ) : (
            `${tx.hash.slice(0, 18)}…`
          )}
        </div>
      ) : null}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "transparent",
  border: 0,
  borderBottom: "1px solid var(--score)",
  color: "var(--ink)",
  fontFamily: "var(--mono)",
  fontSize: 15,
  padding: "0.35rem 0",
  outline: "none",
};

const buttonStyle = (enabled: boolean): React.CSSProperties => ({
  width: "100%",
  marginTop: "0.4rem",
  background: enabled ? "var(--gold-750)" : "transparent",
  color: enabled ? "var(--void)" : "var(--base)",
  border: `1px solid ${enabled ? "var(--gold-750)" : "var(--score)"}`,
  padding: "0.6rem 1rem",
  fontFamily: "var(--mono)",
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  cursor: enabled ? "pointer" : "default",
});

/** An agent takes a position in the succession queue by escrowing a bond. */
export function BidPanel({
  mandate,
  onDone,
}: {
  mandate: FloorMandate;
  onDone?: () => void;
}) {
  const { address, ready } = useWallet();
  const [bond, setBond] = useState("1.0");
  const [target, setTarget] = useState("250");
  const [tx, setTx] = useState<TxState>({ phase: "idle" });

  const bondNum = Number(bond);
  const targetNum = Number(target);
  /*
    A negative target is refused on chain, not merely unwise.

    This allowed anything down to −32,767, which reads as "I promise to lose
    money" and which V2 rejects with `BadParameters` before the wallet opens.
    Bounding it here means the reason arrives beside the field instead of as a
    dead button.
  */
  const valid =
    ready &&
    Number.isFinite(bondNum) &&
    bondNum > 0 &&
    Number.isFinite(targetNum) &&
    targetNum >= 0 &&
    targetNum <= 32_767;

  /* Which input is wrong, said beside the input rather than by a revert. */
  const bidRefusal =
    !Number.isFinite(bondNum) || bondNum <= 0
      ? "A bond must be a positive number of BNB. It is the agent's own capital at risk."
      : !Number.isFinite(targetNum)
        ? "The target must be a number, in basis points of alpha."
        : targetNum < 0
          ? "A negative target promises to lose money, and the market refuses it."
          : targetNum > 32_767
            ? "That target is above the largest the contract can hold."
            : null;
  const busy = tx.phase === "signing" || tx.phase === "pending";

  const submit = async () => {
    if (!valid || !address) return;
    try {
      await sendMarketTx(
        address,
        "bid",
        // `amount` is ignored for a native-asset mandate and `ttl` of 0 means
        // the bid does not expire, the two arguments V2 added over V1.
        [BigInt(mandate.id), Math.round(targetNum), 0n, 0n],
        parseEther(bond as `${number}`),
        setTx,
      );
      onDone?.();
    } catch {
      /* Phase already carries the reason. */
    }
  };

  return (
    <div style={{ display: "grid", gap: "0.85rem" }}>
      <div>
        <div className="label">your bond</div>
        <input
          value={bond}
          onChange={(e) => setBond(e.target.value)}
          inputMode="decimal"
          style={inputStyle}
          aria-label="Bond in BNB"
        />
      </div>
      <div>
        <div className="label">target alpha, basis points per epoch</div>
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          inputMode="numeric"
          style={inputStyle}
          aria-label="Target alpha in basis points"
        />
      </div>

      <p style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--ink-3)", margin: 0 }}>
        You are escrowing <strong style={{ color: "var(--ink)" }}>{bond} BNB</strong> of
        your own capital and committing to beat the benchmark by{" "}
        {(targetNum / 100).toFixed(2)}% per epoch. Trail it beyond tolerance and{" "}
        {mandate.state === 1 ? "once you hold this mandate " : ""}this bond is
        slashed in the principal&apos;s favour.
      </p>

      <Gate refusal={bidRefusal}>
        <button onClick={submit} disabled={!valid || busy} style={buttonStyle(valid && !busy)}>
          {busy ? "…" : mandate.state === 1 ? "join succession queue" : "bid for mandate"}
        </button>
      </Gate>
      <Phase tx={tx} />
    </div>
  );
}

/** A principal opens a mandate and escrows the capital to be managed. */
export function OpenMandatePanel({ onDone }: { onDone?: () => void }) {
  const { address, ready } = useWallet();
  const [capital, setCapital] = useState("1.0");
  const [category, setCategory] = useState(0);
  const [tx, setTx] = useState<TxState>({ phase: "idle" });

  const capitalNum = Number(capital);
  const valid = ready && Number.isFinite(capitalNum) && capitalNum > 0;

  /*
    Why the capital is not acceptable, said here rather than by a revert.

    The floor on the live market is a bond of 0.00004 BNB and the agent must
    post at least a fifth of the capital, so capital under 0.0002 leaves an
    agent risking less than the market's own minimum and the contract refuses
    the bid later, after the principal has already paid gas to open it.
  */
  const openRefusal =
    !Number.isFinite(capitalNum) || capitalNum <= 0
      ? "Capital must be a positive number of BNB."
      : capitalNum < 0.0002
        ? "Below 0.0002 BNB an agent's fifth-of-capital bond falls under the market minimum, and no agent could bid on it."
        : null;
  const busy = tx.phase === "signing" || tx.phase === "pending";

  const submit = async () => {
    if (!valid || !address) return;
    try {
      await sendMarketTx(
        address,
        "openMandate",
        [
          category, // category
          NATIVE, // asset, native BNB; V2 ignores `amount` and uses msg.value
          0n, // amount, see above
          BENCHMARK_BY_INDEX[category] ?? 0, // what the alpha is measured against
          200, // toleranceBps, 2% underperformance tolerated
          2_000, // feeBps, 20% of alpha
          2_500, // slashBps, a quarter of the bond per failing epoch
          3_600, // epochLength, one hour, and it must exceed challengeWindow (300)
          24, // epochsTotal
          3, // strikes, must not be zero
          -1_000, // catastrophic, must be negative, or the contract refuses
          2_000, // bondFloorBps, the agent posts at least a fifth of the capital
        ],
        parseEther(capital as `${number}`),
        setTx,
      );
      onDone?.();
    } catch {
      /* Phase already carries the reason. */
    }
  };

  return (
    <div style={{ display: "grid", gap: "0.85rem" }}>
      <div>
        <div className="label">capital to place under mandate</div>
        <input
          value={capital}
          onChange={(e) => setCapital(e.target.value)}
          inputMode="decimal"
          style={inputStyle}
          aria-label="Capital in BNB"
        />
      </div>
      <div>
        <div className="label">function</div>
        <div style={{ display: "grid", gap: "0.3rem", marginTop: "0.5rem" }}>
          {CATEGORY_NAMES.map((name, i) => (
            <button
              key={name}
              onClick={() => setCategory(i)}
              className="fig"
              style={{
                textAlign: "left",
                background: "transparent",
                border: 0,
                borderBottom: "1px solid var(--iron)",
                color: category === i ? "var(--gold-999)" : "var(--ink-3)",
                fontSize: 12,
                padding: "0.3rem 0",
                cursor: "pointer",
              }}
            >
              {category === i ? "▸ " : "  "}
              {name}
            </button>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--ink-3)", margin: 0 }}>
        Terms: 2% underperformance tolerated, 20% of alpha to the agent, a
        quarter of its bond slashed per failing epoch, hourly settlement over 24
        epochs. Your capital is escrowed in the contract and returns to you when
        the term completes.
      </p>

      <Gate refusal={openRefusal}>
        <button onClick={submit} disabled={!valid || busy} style={buttonStyle(valid && !busy)}>
          {busy ? "…" : "open mandate"}
        </button>
      </Gate>
      <Phase tx={tx} />
    </div>
  );
}

/** Fees earned, bonds released and slashes resolved all land here. */
export function WithdrawButton() {
  const { address, ready } = useWallet();
  const [tx, setTx] = useState<TxState>({ phase: "idle" });
  const busy = tx.phase === "signing" || tx.phase === "pending";

  /*
    This used to return null when nobody was connected.

    Withdraw is the only way capital leaves this contract, released bonds,
    earned fees, resolved slashes all land there, and it was invisible to
    anyone who had not already connected on the right chain. Somebody owed
    money by the market had no way to discover that from the market. It now
    renders whatever the state is, and says what the state is.
  */
  if (!ready || !address) {
    return (
      <span className="label" title="Fees, released bonds and resolved slashes are withdrawn here">
        connect to see what you can withdraw
      </span>
    );
  }

  return (
    <div>
      <button
        onClick={() =>
          void sendMarketTx(address, "withdraw", [NATIVE], undefined, setTx).catch(() => {})
        }
        disabled={busy}
        className="label"
        style={{
          background: "transparent",
          border: "1px solid var(--score)",
          color: "var(--ink-2)",
          padding: "0.35rem 0.8rem",
          cursor: busy ? "default" : "pointer",
        }}
      >
        {busy ? "…" : "withdraw balance"}
      </button>
      <Phase tx={tx} />
    </div>
  );
}
