"use client";

import { useEffect, useRef, useState } from "react";
import { useWallet, fmtBnb } from "@/lib/chain/wallet";
import { marketChain } from "@/lib/chain/market";

/**
 * The wallet control, in the header, on every page.
 *
 * Disconnected, it says what to do next: get a wallet, or connect one.
 * Connected, it is a button that opens a small panel with the full address,
 * the network and balance, a way to switch network when needed, and a way to
 * disconnect. It used to be a label with nothing behind it, so a person who
 * had connected had no way to stop the site reading their wallet.
 *
 * The panel is a native disclosure, so it opens with scripting off; with
 * scripting on it also closes on an outside click and on Escape.
 */
export default function WalletButton() {
  const { address, ready, available, chainId, balanceWei, connect, switchChain, disconnect } = useWallet();
  const ref = useRef<HTMLDetailsElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current;
      if (e.key === "Escape" && el?.open) {
        el.open = false;
        el.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!available) {
    return (
      <a className="m-btn m-btn--sm m-btn--quiet" href="https://www.bnbchain.org/en/wallets" target="_blank" rel="noreferrer">
        Get a wallet
      </a>
    );
  }

  if (!address) {
    return (
      <button className="m-btn m-btn--sm m-btn--primary" onClick={() => void connect().catch(() => undefined)} type="button">
        Connect wallet
      </button>
    );
  }

  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  const explorer = marketChain.blockExplorers?.default?.url ?? "https://bscscan.com";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* The clipboard is blocked here; the address is on screen to select. */
    }
  };

  return (
    <details className="m-wallet" ref={ref}>
      <summary
        className={`m-btn m-btn--sm m-btn--quiet m-wallet__chip${ready ? "" : " m-wallet__chip--warn"}`}
        aria-label={`Wallet ${short}${ready ? "" : ", wrong network"}. Open the wallet menu`}
      >
        <span className={`m-dot ${ready ? "m-dot--live" : "m-dot--cold"}`} />
        <span className="m-mono">{short}</span>
        <span className="m-hide-sm m-note" style={{ color: "inherit" }}>
          {ready ? `${fmtBnb(balanceWei)} BNB` : "wrong network"}
        </span>
      </summary>

      <div className="m-wallet__panel">
        <p className="m-label">Connected wallet</p>
        <p className="m-mono m-wallet__addr">{address}</p>
        <div className="m-wallet__row">
          <button type="button" className="m-btn m-btn--sm m-btn--quiet" onClick={() => void copy()}>
            {copied ? "Copied" : "Copy address"}
          </button>
          <a className="m-btn m-btn--sm m-btn--quiet" href={`${explorer}/address/${address}`} target="_blank" rel="noreferrer">
            View on BscScan
          </a>
        </div>

        <dl className="m-wallet__facts">
          <div>
            <dt>Network</dt>
            <dd>{ready ? marketChain.name : `chain ${chainId ?? "unknown"}`}</dd>
          </div>
          <div>
            <dt>Balance</dt>
            <dd>{ready ? `${fmtBnb(balanceWei)} BNB` : "switch network to read it"}</dd>
          </div>
        </dl>

        {!ready ? (
          <button
            type="button"
            className="m-btn m-btn--sm m-btn--primary m-btn--block"
            onClick={() => void switchChain().catch(() => undefined)}
          >
            Switch to {marketChain.name}
          </button>
        ) : null}

        <button
          type="button"
          className="m-btn m-btn--sm m-btn--block"
          onClick={() => {
            if (ref.current) ref.current.open = false;
            void disconnect();
          }}
        >
          Disconnect
        </button>
        <p className="m-note">
          Disconnecting stops this site reading your wallet. It does not move funds or cancel anything you have signed.
        </p>
      </div>
    </details>
  );
}
