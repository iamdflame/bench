"use client";

import { useCallback, useState } from "react";
import type { Address, Hex } from "viem";
import { useWallet, readableError } from "@/lib/chain/wallet";
import { USD1, USD1_DECIMALS, USD1_DOMAIN, TRANSFER_TYPES } from "@/lib/x402";
import { marketChain, marketClient } from "@/lib/chain/market";

/**
 * Buying a single call, in the browser, without holding any BNB.
 *
 * The handshake happens in the order the protocol specifies: ask unpaid, read
 * the price the server names, sign an authorisation, ask again carrying it.
 * The buyer never sends a transaction. EIP-3009 is what makes that true: the
 * signature authorises a transfer somebody else pays gas to submit, so a wallet
 * holding stablecoin and no BNB at all can buy.
 *
 * Nothing is signed before the price is on screen. The challenge is fetched
 * first and rendered, so the number a person approves in their wallet is one
 * they have already read here.
 */

interface Requirement {
  scheme: string;
  network: string;
  asset: string;
  payTo: Address;
  maxAmountRequired: string;
  resource: string;
  description: string;
  maxTimeoutSeconds: number;
}

type Phase =
  | { at: "idle" }
  | { at: "quoting" }
  | { at: "quoted"; req: Requirement }
  | { at: "signing"; req: Requirement }
  | { at: "settling"; req: Requirement }
  | { at: "done"; body: unknown; tx: string | null }
  | { at: "failed"; why: string };

const ERC20_BALANCE = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "a", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Atomic units to a readable figure, without a float in the middle. */
function usd1(atomic: string): string {
  const v = BigInt(atomic);
  const base = 10n ** BigInt(USD1_DECIMALS);
  const whole = v / base;
  const frac = (v % base).toString().padStart(USD1_DECIMALS, "0").slice(0, 4).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** 32 random bytes, from the browser's CSPRNG. */
function nonce(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return `0x${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}` as Hex;
}

/**
 * What went wrong, in a sentence.
 *
 * The seller returns the settlement failure verbatim, which for the commonest
 * case is a hundred and eighty characters of ContractFunctionExecutionError
 * wrapping the four words that matter. Showing that to somebody who just tried
 * to spend a cent is not honesty, it is laziness dressed as it.
 */
function sellerError(body: unknown, status: number): string {
  const b = body as { error?: string; detail?: string } | null;
  const detail = b?.detail ?? "";

  if (/exceeds balance/i.test(detail)) {
    return "This wallet does not hold enough USD1 to cover the call. Nothing was charged.";
  }
  if (/already used|authorization is used/i.test(detail)) {
    return "That authorisation has already been spent. Ask for a fresh price and sign again.";
  }
  if (/invalid signature|does not recover/i.test(detail)) {
    return "The signature did not recover to your address, so the payment was refused.";
  }
  if (/expired|validBefore/i.test(detail)) {
    return "The authorisation expired before it reached the chain. Ask for a price and sign again.";
  }
  if (status === 402) return "The payment was refused. Nothing was charged.";
  return b?.error ?? detail.slice(0, 160) ?? `The seller answered ${status}.`;
}

export default function BuyOneCall({ path, what }: { path: string; what: string }) {
  const { address, ready, available, connect, switchChain } = useWallet();
  const [phase, setPhase] = useState<Phase>({ at: "idle" });
  const [balance, setBalance] = useState<bigint | null>(null);

  /** Step one: ask unpaid, and read the price the server names. */
  const quote = useCallback(async () => {
    setPhase({ at: "quoting" });
    try {
      const res = await fetch(path, { headers: { accept: "application/json" } });
      if (res.status !== 402) {
        setPhase({ at: "done", body: await res.json().catch(() => null), tx: null });
        return;
      }
      const body = (await res.json()) as { accepts?: Requirement[] };
      const req = body.accepts?.[0];
      if (!req) throw new Error("The endpoint refused payment without naming a price.");
      setPhase({ at: "quoted", req });

      if (address) {
        const bal = await marketClient
          .readContract({ address: USD1, abi: ERC20_BALANCE, functionName: "balanceOf", args: [address] })
          .catch(() => null);
        setBalance(bal as bigint | null);
      }
    } catch (e) {
      setPhase({ at: "failed", why: readableError(e) });
    }
  }, [path, address]);

  /** Steps two to five: authorise, sign, and ask again carrying the signature. */
  const pay = useCallback(
    async (req: Requirement) => {
      if (!address) return;
      setPhase({ at: "signing", req });
      try {
        const now = Math.floor(Date.now() / 1000);
        const authorization = {
          from: address,
          to: req.payTo,
          value: req.maxAmountRequired,
          // Sixty seconds back, because a wallet's clock and a chain's clock
          // disagree often enough that a validAfter of "now" gets rejected.
          validAfter: String(now - 60),
          validBefore: String(now + (req.maxTimeoutSeconds || 120)),
          nonce: nonce(),
        };

        const signature = (await window.ethereum!.request({
          method: "eth_signTypedData_v4",
          params: [
            address,
            JSON.stringify({
              types: {
                EIP712Domain: [
                  { name: "name", type: "string" },
                  { name: "version", type: "string" },
                  { name: "chainId", type: "uint256" },
                  { name: "verifyingContract", type: "address" },
                ],
                ...TRANSFER_TYPES,
              },
              primaryType: "TransferWithAuthorization",
              domain: USD1_DOMAIN,
              message: authorization,
            }),
          ],
        })) as Hex;

        setPhase({ at: "settling", req });

        const header = btoa(
          JSON.stringify({
            x402Version: 1,
            scheme: "exact",
            network: req.network,
            payload: { signature, authorization },
          }),
        );

        const res = await fetch(path, {
          method: path.includes("/simulate") ? "POST" : "GET",
          headers: { accept: "application/json", "X-PAYMENT": header },
        });

        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(sellerError(body, res.status));

        let tx: string | null = null;
        const receipt = res.headers.get("x-payment-response");
        if (receipt) {
          try {
            tx = (JSON.parse(atob(receipt)) as { transaction?: string }).transaction ?? null;
          } catch {
            tx = null;
          }
        }
        setPhase({ at: "done", body, tx });
      } catch (e) {
        setPhase({ at: "failed", why: readableError(e) });
      }
    },
    [address, path],
  );

  const req =
    phase.at === "quoted" || phase.at === "signing" || phase.at === "settling" ? phase.req : null;
  const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-8)}`;

  if (phase.at === "idle") {
    return (
      <>
        <p className="m-small" style={{ margin: "0.6rem 0 1rem" }}>
          {what}
        </p>
        <button className="m-btn m-btn--block" onClick={() => void quote()} type="button">
          Ask for a price
        </button>
        <p className="m-note" style={{ marginTop: "0.6rem" }}>
          Nothing is signed until the price is on screen.
        </p>
      </>
    );
  }

  if (phase.at === "quoting") {
    return <p className="m-small">Asking the seller for a price…</p>;
  }

  if (phase.at === "failed") {
    return (
      <>
        <p className="m-error">{phase.why}</p>
        <button
          className="m-btn m-btn--sm"
          style={{ marginTop: "0.8rem" }}
          onClick={() => setPhase({ at: "idle" })}
          type="button"
        >
          Try again
        </button>
      </>
    );
  }

  if (phase.at === "done") {
    return (
      <>
        <p className="m-ok">
          Paid, and the agent answered.
          {phase.tx ? (
            <>
              {" "}
              <a
                className="m-link m-mono"
                href={`${marketChain.blockExplorers?.default.url}/tx/${phase.tx}`}
                target="_blank"
                rel="noreferrer"
              >
                {short(phase.tx)}
              </a>
            </>
          ) : null}
        </p>
        <pre className="m-pre">{JSON.stringify(phase.body, null, 2)}</pre>
        <button
          className="m-btn m-btn--sm"
          style={{ marginTop: "0.8rem" }}
          onClick={() => setPhase({ at: "idle" })}
          type="button"
        >
          Buy another
        </button>
      </>
    );
  }

  /* quoted, signing or settling: the price is on screen and a decision is due */
  return (
    <>
      <dl className="m-kv" style={{ marginBottom: "1rem" }}>
        <div>
          <dt>Price</dt>
          <dd className="m-fig">{usd1(req!.maxAmountRequired)} USD1</dd>
        </div>
        <div>
          <dt>You pay in gas</dt>
          <dd className="m-fig">nothing</dd>
        </div>
        <div>
          <dt>What it buys</dt>
          <dd>{req!.description}</dd>
        </div>
      </dl>

      {!available ? (
        <p className="m-small">
          There is no wallet in this browser. The same call is available over the
          API with a signed payment header.
        </p>
      ) : !address ? (
        <button className="m-btn m-btn--primary m-btn--block" onClick={() => void connect()} type="button">
          Connect a wallet
        </button>
      ) : !ready ? (
        <button className="m-btn m-btn--primary m-btn--block" onClick={() => void switchChain()} type="button">
          Switch to {marketChain.name}
        </button>
      ) : balance !== null && balance < BigInt(req!.maxAmountRequired) ? (
        <p className="m-small">
          This wallet holds {usd1(balance.toString())} USD1 and the call costs{" "}
          {usd1(req!.maxAmountRequired)}. Nothing has been signed.
        </p>
      ) : (
        <button
          className="m-btn m-btn--primary m-btn--block"
          onClick={() => void pay(req!)}
          disabled={phase.at !== "quoted"}
          type="button"
        >
          {phase.at === "signing"
            ? "Waiting for your signature…"
            : phase.at === "settling"
              ? "The seller is settling it…"
              : `Sign to pay ${usd1(req!.maxAmountRequired)} USD1`}
        </button>
      )}

      <p className="m-note" style={{ marginTop: "0.6rem" }}>
        You sign an authorisation. The seller submits the transfer and pays the gas.
      </p>
    </>
  );
}
