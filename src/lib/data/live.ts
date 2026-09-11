/**
 * One call at the top of a judge-facing render.
 *
 * Loads any snapshot newer than the build from the database, then schedules
 * a census slice to run after the response if the reading is stale. Pages
 * stay synchronous below this line.
 */

import { DEFAULT_WARM, warm, type SnapshotName } from "@/lib/data/snapshots";
import { scheduleRefresh } from "@/lib/census/refresh";

/**
 * `names` adds to the defaults; it never replaces them. It used to replace
 * them, and /judges, asking only for the grid window, rendered a census
 * fifteen hours old while a fresher one sat in the database.
 */
export async function live(names: SnapshotName[] = []): Promise<void> {
  await warm([...new Set([...DEFAULT_WARM, ...names])]).catch(() => undefined);
  scheduleRefresh();
}
