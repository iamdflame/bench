"use client";

import { useWallet, fmtBnb } from "@/lib/chain/wallet";
import { marketChain } from "@/lib/chain/market";

/**
 * The wallet control, in the header, on every page.
 *
 * It has four states and each of them says something. The failure this
 * replaces was a control that appeared on three routes out of seventeen and,
 * where it did appear, went grey without a word when a wallet was missing or
 * on the wrong chain. Here the button always carries both the reason and the
 * next action, because those are the same thing to somebody trying to get
 * something done.
 */
export default function WalletButton() {
  const { address, ready, available, chainId, balanceWei, connect, switchChain } = useWallet();

  if (!available) {
    return (
      <a
        className="m-btn m-btn--sm m-btn--quiet"
        href="https://www.bnbchain.org/en/wallets"
        target="_blank"
        rel="noreferrer"
      >
        Get a wallet
      </a>
    );
  }

  if (!address) {
    return (
      <button className="m-btn m-btn--sm m-btn--primary" onClick={() => void connect()} type="button">
        Connect wallet
      </button>
    );
  }

  if (!ready) {
    return (
      <button className="m-btn m-btn--sm" onClick={() => void switchChain()} type="button">
        Switch to {marketChain.name}
        <span className="m-note" style={{ color: "inherit", opacity: 0.7 }}>
          {chainId ? `· on ${chainId}` : ""}
        </span>
      </button>
    );
  }

  return (
    <span className="m-btn m-btn--sm m-btn--quiet" style={{ cursor: "default" }}>
      <span className="m-dot m-dot--live" />
      <span className="m-mono">
        {address.slice(0, 6)}…{address.slice(-4)}
      </span>
      <span className="m-hide-sm m-note" style={{ color: "inherit" }}>
        {fmtBnb(balanceWei)} BNB
      </span>
    </span>
  );
}
