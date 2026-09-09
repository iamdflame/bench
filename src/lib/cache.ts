/**
 * A short-lived, in-process memo for chain reads.
 *
 * Some of these readings are genuinely expensive — the ladder's rung 4 scans
 * event logs in 4,000-block windows from the deploy block, because free BSC
 * providers refuse anything wider — and the front page was taking eighteen
 * seconds to paint as a result. That is not a rendering problem to be
 * decorated around; it is the page failing.
 *
 * The honest fix is a memo rather than a fabrication: the first request pays
 * the cost, later requests inside the window get that same reading, and a
 * reading that has gone stale is served *while* a fresh one is fetched behind
 * it. Nothing is invented and nothing is smoothed — every figure on the site
 * already carries the block it was read at and how long ago, so a cached
 * answer says so on the page rather than pretending to be live.
 *
 * Process-local by design. It holds no cross-request state a user could
 * influence, and a cold instance simply pays the first read again.
 */

interface Entry<T> {
  value: T;
  at: number;
  refreshing: boolean;
}

/**
 * Cold misses for the same key share one call.
 *
 * Without this, two page loads a second apart both miss, both call, and both
 * join the back of a queue that only drains at twenty-five requests a minute.
 * Coalescing is worth more than the caching here: it is the difference between
 * a queue that grows with traffic and one that does not.
 */
const inflight = new Map<string, Promise<unknown>>();

const store = new Map<string, Entry<unknown>>();

export interface MemoOptions {
  /** How long a reading is served without any refresh at all. */
  freshMs: number;
  /**
   * How long a stale reading may still be served while a new one is fetched.
   *
   * Beyond this the caller waits, because at some point an old number stops
   * being a measurement and starts being a guess.
   */
  staleMs: number;
}

export async function memo<T>(
  key: string,
  options: MemoOptions,
  read: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;

  if (hit) {
    const age = now - hit.at;
    if (age < options.freshMs) return hit.value;

    if (age < options.freshMs + options.staleMs) {
      // Serve what we have and refresh behind it. A failed refresh leaves the
      // previous reading in place rather than replacing it with an error.
      if (!hit.refreshing) {
        hit.refreshing = true;
        void read()
          .then((value) => store.set(key, { value, at: Date.now(), refreshing: false }))
          .catch(() => {
            hit.refreshing = false;
          });
      }
      return hit.value;
    }
  }

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending) return pending;

  const work = read()
    .then((value) => {
      store.set(key, { value, at: Date.now(), refreshing: false });
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, work);
  return work;
}

/** Drops a memo, for tests and for a keeper that knows it changed something. */
export const forget = (key: string) => store.delete(key);

/**
 * Caps a read that has no deadline of its own.
 *
 * Streaming the slow panels stopped them blocking a page, but it did not stop
 * them hanging: an agent page held its connection open for the full ninety
 * seconds a client would wait, because the registry's feedback corpus can take
 * that long to walk and nothing was going to stop it.
 *
 * A capped read that runs out of time resolves to `null`, and the caller says
 * "this could not be read" — which is a different statement from "there is
 * nothing here", and the panels are careful to make that distinction.
 */
export async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
