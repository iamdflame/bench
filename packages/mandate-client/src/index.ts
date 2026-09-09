/**
 * A client for the MANDATE public assay API.
 *
 * Free, unauthenticated, rate limited. No key, no account, no permission —
 * including for the projects competing with the one that runs it. An assay
 * office whose findings only its own front end could read would be a trade
 * association, and the argument this makes is stronger the more people can
 * check it.
 *
 *   import { Mandate } from "mandate-client";
 *   const m = new Mandate();
 *   const assay = await m.assay(2410);
 *   console.log(assay.fineness, assay.hallmarked);
 */

export const DEFAULT_HOST = "https://mandate-coral.vercel.app";
export const BSC = 56;

/** Every response carries the state it was read from. */
export interface Observed {
  chainId: number;
  blockNumber: string | null;
  at: string;
}

export interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
  observed: Observed;
  docs: string;
}

export interface AssayResult {
  id: string;
  title: string;
  verdict: "pass" | "fail" | "inconclusive";
  claim: string;
  finding: string;
  score: number;
  weight: number;
  evidence: { kind: string; label: string; value: string; url?: string }[];
}

export interface Assay {
  chainId: number;
  tokenId: string;
  agentId: string;
  name: string | null;
  ownerAddress: string | null;
  agentWallet: string | null;
  /** Millesimal, 0–1000. 375 is the lowest hallmarkable grade. */
  fineness: number;
  hallmark: { mark: string; name: string; note: string };
  hallmarked: boolean;
  category: string | null;
  categoryConfidence: number;
  registryScore: number | null;
  results: AssayResult[];
  ms: number;
  /** The command that reproduces this from a clean checkout. */
  reproduce: string;
}

export interface Rung {
  rung: number;
  name: string;
  test: string;
  /** Null where the population cannot be measured. Never a guess. */
  population: number | null;
  isFloor: boolean;
  method: string;
  verify: string | null;
  discontinuity: string | null;
}

export interface Funnel {
  minFineness: number;
  source: string;
  capturedAt: string;
  rungs: Rung[];
}

export interface RegisterAgent {
  tokenId: string;
  name: string | null;
  owner: string | null;
  category: string | null;
  confidence: number;
  endpointVerified: boolean;
  rung: number;
  rungName: string;
  rungReason: string;
  fineness: number | null;
  hallmarked: boolean;
  bondWei: string | null;
  alphaBps: number | null;
  lastSeen: string;
}

export interface Register {
  /** How much of the registry has actually been read. */
  coverage: { registered: number; read: number; unread: number };
  filter: { rung: number | null; category: string | null; limit: number; offset: number };
  total: number;
  agents: RegisterAgent[];
}

/** Thrown with the server's own reason rather than a generic failure. */
export class MandateError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "MandateError";
  }
}

export interface MandateOptions {
  host?: string;
  chainId?: number;
  fetch?: typeof fetch;
  /** Milliseconds before a request is abandoned. */
  timeoutMs?: number;
}

export class Mandate {
  private readonly host: string;
  private readonly chainId: number;
  private readonly doFetch: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: MandateOptions = {}) {
    this.host = (options.host ?? DEFAULT_HOST).replace(/\/+$/, "");
    this.chainId = options.chainId ?? BSC;
    this.doFetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }

  private async get<T>(path: string): Promise<{ data: T; observed: Observed }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.doFetch(`${this.host}${path}`, { signal: controller.signal });
      const body = (await res.json()) as Envelope<T>;
      if (!res.ok || !body.ok || body.data === undefined) {
        const retry = Number(res.headers.get("retry-after") ?? "0") || undefined;
        throw new MandateError(res.status, body.error ?? `request failed (${res.status})`, retry);
      }
      return { data: body.data, observed: body.observed };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Six tests against the chain. Several seconds of real work; limited to 10/min. */
  async assay(tokenId: string | number, chainId = this.chainId): Promise<Assay & { observed: Observed }> {
    const { data, observed } = await this.get<Assay>(`/api/v1/assay/${chainId}/${tokenId}`);
    return { ...data, observed };
  }

  /** The trust ladder: every rung, its test, and its population. */
  async funnel(): Promise<Funnel & { observed: Observed }> {
    const { data, observed } = await this.get<Funnel>("/api/v1/registry/funnel");
    return { ...data, observed };
  }

  /** The register, filterable. `coverage` says how much of it has been read. */
  async agents(
    filter: { rung?: number; category?: string; limit?: number; offset?: number } = {},
  ): Promise<Register & { observed: Observed }> {
    const q = new URLSearchParams();
    if (filter.rung !== undefined) q.set("rung", String(filter.rung));
    if (filter.category) q.set("category", filter.category);
    if (filter.limit !== undefined) q.set("limit", String(filter.limit));
    if (filter.offset !== undefined) q.set("offset", String(filter.offset));
    const suffix = q.toString() ? `?${q}` : "";
    const { data, observed } = await this.get<Register>(`/api/v1/agents${suffix}`);
    return { ...data, observed };
  }
}

export default Mandate;
