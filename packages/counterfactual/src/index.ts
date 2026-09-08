/**
 * @bench/counterfactual — what an agent would have done to *your* position.
 *
 * Every other listing in this field shows an agent's self-reported or aggregate
 * history. This replays a strategy against the real price series of one real
 * position and reports the difference in dollars, including when that
 * difference is negative.
 *
 * The series comes from the pool's own `Swap` events, so the fees are computed
 * from trades that happened rather than from an APR somebody typed in; gas and
 * slippage are charged at the moment they occur; and a strategy is handed one
 * observation at a time so it cannot read the future.
 */

export * from "./types";
export { readHistory, blocksForDays, V3_SWAP, V3_SWAP_TOPIC } from "./history";
export { accrue, inRange, valueAt, liquidityFor, dilutionWarning } from "./simulate";
export { costModel, readCostModel, chargeRecentre, RECENTRE_GAS, COLLECT_GAS, type CostModel } from "./cost";
export { replay, timeInRange, recentres, type ReplayResult, type Event } from "./replay";
export {
  rangeKeeperI,
  rangeKeeperII,
  tightBandKeeper,
  holdPosition,
  REFERENCE_STRATEGIES,
} from "./strategies";
