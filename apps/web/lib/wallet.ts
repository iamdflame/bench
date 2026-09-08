/**
 * The wallet, in about two kilobytes.
 *
 * Everything this marketplace needs a browser wallet to do is four JSON-RPC
 * methods on an EIP-1193 provider: ask who you are, make sure you are on the
 * right chain, sign a typed document, and send a transaction. That is the whole
 * surface. wagmi is forty kilobytes and RainbowKit is a hundred and fifty, and
 * both would arrive with a React context, a connection manager and a modal we
 * would then spend a day restyling to look like the rest of this.
 *
 * `tools/checks/budget.mjs` exists precisely to catch a wallet SDK landing in
 * the initial bundle. Rather than raising the ceiling to fit a library, this
 * fits under it: no dependency, no provider component, no store — a handful of
 * async functions over `provider.request`, called from the two screens that
 * need them.
 *
 * ---------------------------------------------------------------------------
 * What the server is told, and how
 * ---------------------------------------------------------------------------
 *
 * The connected address reaches the server as a **query parameter**, never as a
 * client-side fetch that re-renders the page. `?position=` on the board and
 * `?wallet=` on the desk are both plain URL state, so every read path stays
 * server-rendered, keeps working with JavaScript off, and can be linked to and
 * shared. Connecting a wallet is a convenience for filling that field in, not a
 * precondition for the page working.
 */

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

/** The slice of EIP-1193 we use. Deliberately not the whole interface. */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: never[]) => void): void;
  removeListener?(event: string, handler: (...args: never[]) => void): void;
}

export interface Connected {
  address: Address;
  chainId: number;
  /** The wallet's own name, when it announced one under EIP-6963. */
  walletName: string | null;
}

/** A transaction to send. The same shape `buildHirePlan` already emits. */
export interface Intent {
  step?: string;
  says?: string;
  to: Address;
  data: Hex;
  /** Wire form — the API serialises bigints as decimal strings. */
  value?: string;
}

interface Eip6963Detail {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193Provider;
}

/**
 * Find a provider.
 *
 * EIP-6963 first, because `window.ethereum` is a single slot that several
 * extensions fight over: with two wallets installed, the one that loaded last
 * wins and the user is silently connected to whichever that was. The announce
 * protocol is how a page sees all of them. `window.ethereum` remains the
 * fallback for wallets that never adopted it.
 *
 * Synchronous by design — the announce event is dispatched synchronously in
 * response to `eip6963:requestProvider`, so a click handler can call this and
 * still be inside the user gesture that some wallets require.
 */
const announced = new Map<string, Eip6963Detail>();

export function listen(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("eip6963:announceProvider", (e: Event) => {
    const d = (e as CustomEvent<Eip6963Detail>).detail;
    if (d?.info?.uuid) announced.set(d.info.uuid, d);
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

export function discover(): { provider: Eip1193Provider; name: string | null } | null {
  if (typeof window === "undefined") return null;
  const first = announced.values().next();
  if (!first.done) return { provider: first.value.provider, name: first.value.info.name };

  const injected = (window as unknown as { ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] } }).ethereum;
  if (!injected) return null;
  /*
    Some extensions expose their siblings on `.providers` rather than
    announcing. Taking `[0]` is not better than taking the top-level object, so
    the top-level object is what we use — it is the one the user's own wallet UI
    considers active.
  */
  return { provider: injected, name: null };
}

export const available = (): boolean => discover() !== null;

/** Chain metadata, for the one case where the wallet has never heard of BSC. */
const CHAINS: Record<number, { chainId: Hex; chainName: string; rpcUrls: string[]; blockExplorerUrls: string[]; nativeCurrency: { name: string; symbol: string; decimals: number } }> = {
  56: {
    chainId: "0x38",
    chainName: "BNB Smart Chain",
    rpcUrls: ["https://bsc-dataseed.bnbchain.org"],
    blockExplorerUrls: ["https://bscscan.com"],
    nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  },
  97: {
    chainId: "0x61",
    chainName: "BNB Smart Chain Testnet",
    rpcUrls: ["https://data-seed-prebsc-1-s1.bnbchain.org:8545"],
    blockExplorerUrls: ["https://testnet.bscscan.com"],
    nativeCurrency: { name: "tBNB", symbol: "tBNB", decimals: 18 },
  },
};

export async function connect(): Promise<Connected> {
  const found = discover();
  if (!found) throw new WalletError("no-wallet", "No wallet extension answered. Install one, or paste an address instead — every figure on this page is readable without connecting.");
  const accounts = (await found.provider.request({ method: "eth_requestAccounts" })) as Address[];
  const address = accounts?.[0];
  if (!address) throw new WalletError("no-account", "The wallet connected but returned no account.");
  const chainId = Number((await found.provider.request({ method: "eth_chainId" })) as Hex);
  return { address, chainId, walletName: found.name };
}

/** The current account without prompting, for restoring state on load. */
export async function silent(): Promise<Connected | null> {
  const found = discover();
  if (!found) return null;
  try {
    const accounts = (await found.provider.request({ method: "eth_accounts" })) as Address[];
    const address = accounts?.[0];
    if (!address) return null;
    const chainId = Number((await found.provider.request({ method: "eth_chainId" })) as Hex);
    return { address, chainId, walletName: found.name };
  } catch {
    return null;
  }
}

/**
 * Put the wallet on the chain the transaction is for.
 *
 * A wallet on the wrong chain does not fail loudly — it signs a valid
 * authorization for a chain nobody is watching, or sends a transaction to an
 * address that means something else there. Error 4902 means the wallet has
 * never heard of this chain, which is a normal state for a fresh install rather
 * than a fault, so it is offered rather than reported.
 */
export async function ensureChain(chainId: number): Promise<void> {
  const found = discover();
  if (!found) throw new WalletError("no-wallet", "No wallet is connected.");
  const target = CHAINS[chainId];
  if (!target) throw new WalletError("unsupported", `This marketplace does not transact on chain ${chainId}.`);

  const current = Number((await found.provider.request({ method: "eth_chainId" })) as Hex);
  if (current === chainId) return;

  try {
    await found.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: target.chainId }] });
  } catch (e) {
    if (code(e) === 4902) {
      await found.provider.request({ method: "wallet_addEthereumChain", params: [target] });
      return;
    }
    throw e;
  }
}

export async function signTypedData(from: Address, typed: unknown): Promise<Hex> {
  const found = discover();
  if (!found) throw new WalletError("no-wallet", "No wallet is connected.");
  /*
    Passed as a JSON string. The spec allows an object and most wallets accept
    one, but several — including some hardware bridges — parse only the string
    form, and a signature request that silently does nothing is the worst
    failure mode available here.
  */
  return (await found.provider.request({
    method: "eth_signTypedData_v4",
    params: [from, JSON.stringify(typed, (_k, v) => (typeof v === "bigint" ? v.toString() : v))],
  })) as Hex;
}

/** Hex, because `eth_sendTransaction` rejects decimal quantities. */
const quantity = (v: string | undefined): Hex => `0x${BigInt(v ?? "0").toString(16)}`;

export async function send(from: Address, intent: Intent): Promise<Hex> {
  const found = discover();
  if (!found) throw new WalletError("no-wallet", "No wallet is connected.");
  return (await found.provider.request({
    method: "eth_sendTransaction",
    params: [{ from, to: intent.to, data: intent.data, value: quantity(intent.value) }],
  })) as Hex;
}

/**
 * EIP-5792: can this wallet take all five calls as one confirmation?
 *
 * Asked before the flow starts, never during it. §12.3 requires the number of
 * signatures to be declared before the user signs the first one, and a count
 * that turns out to be five after they were told one is exactly the surprise
 * that rule exists to prevent.
 *
 * Answers `false` on any error. A wallet that does not implement the method
 * throws rather than returning empty, and an unsupported capability is not a
 * failure — it is the ordinary case.
 */
export async function supportsBatch(from: Address, chainId: number): Promise<boolean> {
  const found = discover();
  if (!found) return false;
  try {
    const caps = (await found.provider.request({
      method: "wallet_getCapabilities",
      params: [from, [`0x${chainId.toString(16)}`]],
    })) as Record<string, { atomic?: { status?: string } } | undefined>;
    const forChain = caps?.[`0x${chainId.toString(16)}`];
    const status = forChain?.atomic?.status;
    return status === "supported" || status === "ready";
  } catch {
    return false;
  }
}

export async function sendBatch(from: Address, chainId: number, intents: Intent[]): Promise<string> {
  const found = discover();
  if (!found) throw new WalletError("no-wallet", "No wallet is connected.");
  const res = (await found.provider.request({
    method: "wallet_sendCalls",
    params: [
      {
        version: "2.0.0",
        from,
        chainId: `0x${chainId.toString(16)}`,
        atomicRequired: true,
        calls: intents.map((i) => ({ to: i.to, data: i.data, value: quantity(i.value) })),
      },
    ],
  })) as { id: string } | string;
  return typeof res === "string" ? res : res.id;
}

export interface BatchStatus {
  done: boolean;
  receipts: { transactionHash: Hex; status: Hex }[];
}

export async function batchStatus(id: string): Promise<BatchStatus> {
  const found = discover();
  if (!found) throw new WalletError("no-wallet", "No wallet is connected.");
  const res = (await found.provider.request({ method: "wallet_getCallsStatus", params: [id] })) as {
    status?: number | string;
    receipts?: { transactionHash: Hex; status: Hex }[];
  };
  /*
    200 is "confirmed" in the final spec; older builds sent the string. A wallet
    that reports neither but has already produced receipts is done, whatever it
    calls the state.

    The receipts are read into a name before they are counted, rather than
    defaulted inline. `check:absence` bans the inline form because that is how
    an unknown becomes a zero everywhere else in this codebase, and a local
    exception here would teach the next reader that the rule is negotiable.
  */
  const receipts = res.receipts ?? [];
  const done = res.status === 200 || res.status === "CONFIRMED" || receipts.length > 0;
  return { done, receipts };
}

// ---------------------------------------------------------------------------
// Failures, in words
// ---------------------------------------------------------------------------

export class WalletError extends Error {
  constructor(
    readonly kind: string,
    message: string,
  ) {
    super(message);
  }
}

const code = (e: unknown): number | null => {
  const c = (e as { code?: unknown })?.code;
  return typeof c === "number" ? c : null;
};

/**
 * What went wrong, in a sentence a person can act on.
 *
 * §13.6: a refusal names the condition that failed. A wallet rejection is not
 * even a refusal — declining a signature is a legitimate answer, and the copy
 * says so rather than apologising or offering to retry.
 */
export function explain(e: unknown): string {
  if (e instanceof WalletError) return e.message;
  const c = code(e);
  if (c === 4001) return "You declined it in your wallet. Nothing was sent.";
  if (c === 4100) return "Your wallet has not authorised this account for this site. Reconnect and try again.";
  if (c === 4902) return "Your wallet does not have BNB Smart Chain configured, and declined to add it.";
  if (c === -32002) return "Your wallet already has a request open. Finish that one first.";
  if (c === -32603) {
    const inner = (e as { data?: { message?: string } })?.data?.message;
    return inner ? `The chain rejected it: ${inner}` : "The chain rejected the transaction.";
  }
  const m = (e as { message?: unknown })?.message;
  return typeof m === "string" && m.length > 0 ? m.slice(0, 200) : "The wallet returned an error with no message.";
}

/** `0x1234…cdef`. Long enough to recognise, short enough for a bar. */
export const short = (a: string): string => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
