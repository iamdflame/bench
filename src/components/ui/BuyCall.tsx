"use client";

import { useCallback, useState } from "react";
import type { Address, Hex } from "viem";
import { useWallet, readableError } from "@/lib/chain/wallet";
import { USD1, USD1_DECIMALS, USD1_DOMAIN, TRANSFER_TYPES } from "@/lib/x402";
import { marketChain, marketClient } from "@/lib/chain/market";

/**
 * Buying one call, in the browser, with no BNB.
 *
 * The x402 rail has worked since it was built, and until now the only way to
 * use it was a `curl` line printed on the agent's page. That is a rail for
 * people who write shell scripts, and the brief asks for a venue where someone
 * can put an agent to work. A marketplace whose only checkout is a terminal
 * command is a marketplace for four people.
 *
 * So the whole handshake happens here, in the order the protocol specifies:
 *
 *   1. ask for the resource, unpaid, and read the 402 it answers with
 *   2. build the authorisation the challenge asks for
 *   3. sign it as EIP-712 typed data, a signature, not a transaction
 *   4. ask again, carrying the signature
 *   5. the seller submits the transfer and returns the goods
 *
 * **The buyer never sends a transaction.** EIP-3009 is what makes that true:
 * the signature authorises a transfer that somebody else pays gas to submit,
 * so a wallet holding USD1 and no BNB at all can buy. That is the single most
 * useful property of this rail and it is why the button below says what it
 * says.
 *
 * Nothing is signed before the price is known. The challenge is fetched first
 * and rendered, so what a person approves in their wallet is a number they
 * have already read on the page.
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
  extra?: { name?: string; version?: string; transferMethod?: string };
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
 * to spend a cent is not honesty, it is laziness dressed as it, the raw text
 * is still one line down in the detail, and this is the sentence.
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

export default function BuyCall({
  tokenId,
  path,
  label,
  what,
}: {
  tokenId: string;
  /** The x402 resource, relative. */
  path: string;
  label: string;
  /** One line on what the money buys. */
  what: string;
}) {
  const { address, ready, available, connect, switchChain, chainId } = useWallet();
  const [phase, setPhase] = useState<Phase>({ at: "idle" });
  const [balance, setBalance] = useState<bigint | null>(null);

  /** Step 1: ask unpaid, and read the price the server names. */
  const quote = useCallback(async () => {
    setPhase({ at: "quoting" });
    try {
      const res = await fetch(path, { headers: { accept: "application/json" } });
      if (res.status !== 402) {
        // Not a refusal, the resource was free, or something else answered.
        setPhase({ at: "done", body: await res.json().catch(() => null), tx: null });
        return;
      }
      const body = (await res.json()) as { accepts?: Requirement[] };
      const req = body.accepts?.[0];
      if (!req) throw new Error("The endpoint refused payment without naming a price.");
      setPhase({ at: "quoted", req });

      if (address) {
        const bal = await marketClient
          .readContract({
            address: USD1,
            abi: ERC20_BALANCE,
            functionName: "balanceOf",
            args: [address],
          })
          .catch(() => null);
        setBalance(bal as bigint | null);
      }
    } catch (e) {
      setPhase({ at: "failed", why: readableError(e) });
    }
  }, [path, address]);

  /** Steps 2–5: authorise, sign, and ask again carrying the signature. */
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
        if (!res.ok) {
          throw new Error(sellerError(body, res.status));
        }

        // The settlement transaction, when the seller reports one.
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

  const req = phase.at === "quoted" || phase.at === "signing" || phase.at === "settling" ? phase.req : null;
  const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-8)}`;

  return (
    <div className="buycall">
      {phase.at === "idle" ? (
        <>
          <p className="small buycall__what">{what}</p>
          <button className="btn btn--primary" onClick={quote} type="button">
            {label}
          </button>
          <p className="mark-label buycall__note">
            Nothing is signed until the price is on screen.
          </p>
        </>
      ) : null}

      {phase.at === "quoting" ? <p className="small">Asking the seller for a price…</p> : null}

      {req ? (
        <div className="buycall__quote">
          <dl className="buycall__terms">
            <div>
              <dt className="mark-label">Price</dt>
              <dd className="num">{usd1(req.maxAmountRequired)} USD1</dd>
            </div>
            <div>
              <dt className="mark-label">You pay in gas</dt>
              <dd className="num">nothing</dd>
            </div>
            <div>
              <dt className="mark-label">Buys</dt>
              <dd className="small">{req.description}</dd>
            </div>
          </dl>

          {!available ? (
            <p className="small">
              No wallet in this browser. The same call is available over the API with a
              signed payment header.
            </p>
          ) : !address ? (
            <button className="btn btn--primary" onClick={() => void connect()} type="button">
              Connect a wallet →
            </button>
          ) : !ready ? (
            <button className="btn btn--primary" onClick={() => void switchChain()} type="button">
              Switch to {marketChain.name} →
            </button>
          ) : balance !== null && balance < BigInt(req.maxAmountRequired) ? (
            <p className="small buycall__short">
              This wallet holds {usd1(balance.toString())} USD1 and the call costs{" "}
              {usd1(req.maxAmountRequired)}. Nothing has been signed.
            </p>
          ) : (
            <button
              className="btn btn--primary"
              onClick={() => void pay(req)}
              disabled={phase.at !== "quoted"}
              type="button"
            >
              {phase.at === "signing"
                ? "Waiting for your signature…"
                : phase.at === "settling"
                  ? "The seller is settling it…"
                  : `Sign to pay ${usd1(req.maxAmountRequired)} USD1 →`}
            </button>
          )}

          <p className="mark-label buycall__note">
            You sign an authorisation; the seller submits the transfer and pays the gas.
            {chainId && chainId !== marketChain.id ? " Wrong network." : ""}
          </p>
        </div>
      ) : null}

      {phase.at === "done" ? (
        <div className="buycall__done">
          <p className="mark-label">
            Paid and answered
            {phase.tx ? (
              <>
                {" · "}
                <a
                  className="link-underline num"
                  href={`${marketChain.blockExplorers?.default.url}/tx/${phase.tx}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {short(phase.tx)}
                </a>
              </>
            ) : null}
          </p>
          <pre className="buycall__body">{JSON.stringify(phase.body, null, 2)}</pre>
        </div>
      ) : null}

      {phase.at === "failed" ? (
        <div className="buycall__failed">
          <p className="small">{phase.why}</p>
          <button className="btn btn--sm" onClick={() => setPhase({ at: "idle" })} type="button">
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
