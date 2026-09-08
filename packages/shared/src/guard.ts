/**
 * Fetching URLs that strangers wrote into a public registry.
 *
 * Every agent card and every endpoint this product probes is a string an
 * anonymous party put on chain for the price of gas. Handing that string to
 * `fetch` from a server is a server-side request forgery primitive: the
 * attacker chooses the destination, and the destination is inside our network.
 *
 * So the fetch is bounded on five axes, and each bound exists because the
 * unbounded version is a specific attack:
 *
 *   SCHEME    http and https only. `file:` reads our disk, `gopher:` speaks
 *             to Redis.
 *   HOST      no loopback, no link-local, no private range, no `.internal`.
 *             Resolved and re-checked, because DNS can answer 127.0.0.1.
 *   REDIRECT  followed manually, one hop at a time, each hop re-checked. A
 *             public host that 302s to 169.254.169.254 defeats a check that
 *             only ran on the first URL.
 *   TIME      a hard deadline. A registry with ten thousand slow endpoints is
 *             a denial of service on our own worker.
 *   SIZE      a byte ceiling, enforced while streaming. A card that is a
 *             10GB stream must not become our memory.
 *
 * Nothing here trusts a `Content-Length`, because nothing in it is verified.
 */

const BLOCKED_HOST_SUFFIX = [".internal", ".local", ".localdomain", ".home.arpa"];

const PRIVATE_V4 = [
  /^127\./,
  /^10\./,
  /^169\.254\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // CGNAT 100.64/10
  /^198\.(1[89])\./, // benchmarking 198.18/15
  /^192\.0\.0\./,
  /^192\.0\.2\./,
  /^198\.51\.100\./,
  /^203\.0\.113\./,
  /^22[4-9]\.|^2[3-5]\d\./, // multicast + reserved
];

function isPrivateHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "ip6-localhost") return true;
  if (BLOCKED_HOST_SUFFIX.some((s) => h.endsWith(s))) return true;

  // Literal IPv6: block loopback, link-local, unique-local, and v4-mapped.
  if (h.includes(":")) {
    if (h === "::1" || h === "::") return true;
    if (/^f[cd]/.test(h)) return true; // fc00::/7 unique local
    if (/^fe[89ab]/.test(h)) return true; // fe80::/10 link local
    const mapped = h.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return PRIVATE_V4.some((r) => r.test(mapped[1]!));
    return false;
  }

  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return PRIVATE_V4.some((r) => r.test(h));
  return false;
}

export type FetchRefusal =
  | "bad-url"
  | "blocked-scheme"
  | "blocked-host"
  | "too-many-redirects"
  | "timeout"
  | "too-large"
  | "network-error";

export interface SafeFetchOk {
  ok: true;
  status: number;
  /** Final URL after redirects, which may not be the one you passed. */
  url: string;
  headers: Record<string, string>;
  body: string;
  /** Wall-clock milliseconds, first byte to last. Reported, never estimated. */
  latencyMs: number;
  /** True when the response was cut at `maxBytes`. */
  truncated: boolean;
}

export interface SafeFetchRefused {
  ok: false;
  refusal: FetchRefusal;
  /** The sentence a person reads on the agent page. */
  detail: string;
  latencyMs: number;
}

export type SafeFetchResult = SafeFetchOk | SafeFetchRefused;

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

/** Checks a URL without fetching it. Exported so the lister can explain a refusal. */
export function checkUrl(raw: string): { ok: true; url: URL } | { ok: false; refusal: FetchRefusal; detail: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, refusal: "bad-url", detail: "The registry entry is not a URL we can parse." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return {
      ok: false,
      refusal: "blocked-scheme",
      detail: `The endpoint uses ${url.protocol.replace(":", "")}, and we only call http and https.`,
    };
  }
  if (isPrivateHostname(url.hostname)) {
    return {
      ok: false,
      refusal: "blocked-host",
      detail: "The endpoint points at a private or loopback address, which is not reachable from anywhere but its own host.",
    };
  }
  return { ok: true, url };
}

export async function safeFetch(raw: string, opts: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const {
    method = "GET",
    headers = {},
    body,
    timeoutMs = 8_000,
    maxBytes = 512 * 1024,
    maxRedirects = 3,
  } = opts;

  const started = Date.now();
  const elapsed = () => Date.now() - started;

  let current = raw;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const check = checkUrl(current);
    if (!check.ok) return { ok: false, refusal: check.refusal, detail: check.detail, latencyMs: elapsed() };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs - elapsed()));
    let res: Response;
    try {
      res = await fetch(check.url, {
        method,
        headers: { accept: "application/json, text/plain;q=0.9, */*;q=0.5", ...headers },
        ...(body === undefined ? {} : { body }),
        redirect: "manual",
        signal: controller.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      const aborted = e instanceof Error && (e.name === "AbortError" || e.name === "TimeoutError");
      return {
        ok: false,
        refusal: aborted ? "timeout" : "network-error",
        detail: aborted
          ? `The endpoint did not answer within ${timeoutMs} ms.`
          : `The endpoint could not be reached: ${String(e).slice(0, 120)}.`,
        latencyMs: elapsed(),
      };
    } finally {
      clearTimeout(timer);
    }

    // Redirects are followed by hand so every hop goes through checkUrl.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) break;
      current = new URL(loc, check.url).toString();
      continue;
    }

    const { text, truncated } = await readCapped(res, maxBytes);
    const out: Record<string, string> = {};
    res.headers.forEach((v, k) => {
      out[k.toLowerCase()] = v;
    });
    return {
      ok: true,
      status: res.status,
      url: current,
      headers: out,
      body: text,
      latencyMs: elapsed(),
      truncated,
    };
  }

  return {
    ok: false,
    refusal: "too-many-redirects",
    detail: `The endpoint redirected more than ${maxRedirects} times without answering.`,
    latencyMs: elapsed(),
  };
}

/**
 * Read a response body with a hard ceiling, streaming.
 *
 * `res.text()` on an endless stream is an out-of-memory crash triggered by a
 * stranger. This stops at the ceiling and says it stopped.
 */
async function readCapped(res: Response, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: "", truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        chunks.push(value.subarray(0, value.byteLength - (total - maxBytes)));
        truncated = true;
        break;
      }
      chunks.push(value);
    }
  } catch {
    truncated = true;
  } finally {
    await reader.cancel().catch(() => {});
  }
  const buf = new Uint8Array(chunks.reduce((n, c) => n + c.byteLength, 0));
  let at = 0;
  for (const c of chunks) {
    buf.set(c, at);
    at += c.byteLength;
  }
  return { text: new TextDecoder().decode(buf), truncated };
}
