/**
 * Memoisation with an honest clock.
 *
 * Every read in this product is expensive — a chain call, a registry page, a
 * probe — and every one of them is rendered with the moment it was taken. Those
 * two facts have to be the same fact, or the page says "read 4 seconds ago"
 * about a value that has been cached for an hour.
 *
 * So the cache stores the value *and* when it was produced, and hands both
 * back. A caller cannot obtain a cached value without also obtaining its age.
 * That is the whole design: there is no `get()` that returns the bare value.
 */

export interface Aged<T> {
  value: T;
  /** When the underlying work completed. ISO. */
  at: string;
  /** Milliseconds since. Computed at read time, not at write time. */
  ageMs: number;
  /** True when this call did the work rather than reading a stored answer. */
  fresh: boolean;
}

interface Entry<T> {
  at: number;
  value: T;
  inflight: Promise<T> | null;
}

const store = new Map<string, Entry<unknown>>();

/**
 * Run `work` at most once per `ttlMs` per key, and never twice concurrently.
 *
 * The in-flight promise is shared, which matters more than the TTL: without it
 * a cold page with six components each asking for the book fires six identical
 * chain reads, and the provider rate-limits us for our own impatience.
 */
export async function memo<T>(key: string, ttlMs: number, work: () => Promise<T>): Promise<Aged<T>> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;

  if (hit && now - hit.at < ttlMs && hit.inflight === null) {
    return { value: hit.value, at: new Date(hit.at).toISOString(), ageMs: now - hit.at, fresh: false };
  }
  if (hit?.inflight) {
    const value = await hit.inflight;
    return { value, at: new Date(hit.at).toISOString(), ageMs: Date.now() - hit.at, fresh: false };
  }

  const inflight = work();
  store.set(key, { at: now, value: hit?.value as T, inflight });
  try {
    const value = await inflight;
    const done = Date.now();
    store.set(key, { at: done, value, inflight: null });
    return { value, at: new Date(done).toISOString(), ageMs: 0, fresh: true };
  } catch (e) {
    // A failed refresh must not evict a good answer. The stale value is
    // returned with its true age, which the renderer will show as stale — that
    // is strictly better than an empty board, and it is not a lie because the
    // age travels with it.
    if (hit && hit.value !== undefined) {
      store.set(key, { at: hit.at, value: hit.value, inflight: null });
      return { value: hit.value, at: new Date(hit.at).toISOString(), ageMs: Date.now() - hit.at, fresh: false };
    }
    store.delete(key);
    throw e;
  }
}

/** Drop everything. Used by tests and by the worker between cycles. */
export const clearMemo = () => store.clear();

/**
 * A deadline that returns a fallback instead of hanging the page.
 *
 * The fallback is a value the caller chose, and callers in this codebase
 * choose an *unknown* rather than a zero — which is why this returns
 * `T | F` rather than `T | null` and makes the caller name the alternative.
 */
export async function withTimeout<T, F>(p: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<F>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Human age, for the line under every figure. Never "just now" for 4 minutes. */
export function ago(iso: string | number | Date): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "at an unknown time";
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 5) return "just now";
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
