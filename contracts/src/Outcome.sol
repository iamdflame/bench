// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title Outcome
 * @notice The shared vocabulary of a settled claim, and the one piece of code
 *         that is allowed to ask an oracle anything.
 *
 * These types were originally declared inside `OutcomePolicy`. They moved here
 * because a second contract now needs them — `ClaimRegistry`, which binds an
 * assertion the agent has *signed* rather than one anybody may write — and
 * because the guarded measurement below is security-critical code that must
 * exist exactly once. Two copies of a bounded staticcall drift, and the copy
 * that drifts is the one that hands somebody else's collateral away.
 */

/// The four things worth settling on, in the order the plan stages them.
enum Metric {
    /// Fraction of the window a V3 position's price sat inside its band, in bps.
    TimeInRange,
    /// The lowest health factor a lending account reached, scaled 1e18.
    HealthFloor,
    /// Net APY captured against the best passive rate available, in bps.
    NetApyVsBest,
    /// Realized profit and loss over the window, in the subject's quote token.
    RealizedPnl
}

/// What the policy concluded. `Pending` and `Unmeasurable` both withhold judgement.
enum Verdict {
    /// The window has not closed. Nothing to say yet.
    Pending,
    /// The assertion held. The escrow releases to the seller.
    Met,
    /// The assertion failed. The escrow returns to the buyer.
    Failed,
    /// The oracle could not see. Falls back to the optimistic path.
    Unmeasurable
}

/**
 * What the buyer and seller agreed, fixed at hire time.
 *
 * `threshold` is signed because two of the metrics can legitimately be
 * negative — a job may assert that realized PnL will be no worse than −50 bps,
 * and an unsigned threshold would make that assertion unexpressible.
 */
struct Assertion {
    Metric metric;
    /// The position or account being measured. Never the agent's own address.
    address subject;
    /// What the agent claimed it would achieve. Compared with `>=`.
    int256 threshold;
    uint64 windowStart;
    uint64 windowEnd;
    /// The measurement contract. Named at hire time so neither side picks it later.
    address oracle;
}

/**
 * A measurement contract.
 *
 * `known` is the whole interface. An oracle that cannot see must say so rather
 * than return zero — the difference between "the position was never in range"
 * and "we could not read the position" is the difference between taking
 * somebody's money and admitting a gap.
 */
interface IOutcomeOracle {
    function measure(Assertion calldata a) external view returns (int256 value, bool known);

    /// A human-readable name for the method, so a verdict can be explained.
    function method() external view returns (string memory);
}

/**
 * Anything that can produce a verdict for an id.
 *
 * `BondVault` depends on this rather than on a concrete contract, because two
 * things legitimately produce verdicts: `OutcomePolicy`, whose assertions are
 * bound by whoever gets there first and which exists for the ERC-8183 path;
 * and `ClaimRegistry`, whose assertions are bound only against an agent's own
 * signature. A vault holding collateral must be pointed at the second, and the
 * interface is what lets that be a deployment decision rather than a rewrite.
 */
interface IVerdict {
    function check(uint256 id) external view returns (Verdict verdict, int256 measured, int256 threshold);
}

/**
 * The only place an oracle is called.
 *
 * An oracle is somebody else's code and it is being asked a question whose
 * answer moves money, so it is called with a bounded gas stipend, through a
 * staticcall that cannot change state, and with every failure mode collapsed
 * to `Unmeasurable` rather than to `Failed`. A buggy measurement contract must
 * not be able to take a party's money, and the asymmetry is intentional:
 * refusing costs a delay, guessing costs somebody the stake.
 */
library Measure {
    /// Enough for a real reader, far short of enough to be a denial of service.
    uint256 internal constant GAS_STIPEND = 500_000;

    function verdict(Assertion memory a) internal view returns (Verdict, int256) {
        if (block.timestamp < a.windowEnd) return (Verdict.Pending, 0);

        (bool ok, bytes memory raw) =
            a.oracle.staticcall{gas: GAS_STIPEND}(abi.encodeWithSelector(IOutcomeOracle.measure.selector, a));

        // A revert, a runaway, or a return too short to decode are all the same
        // answer: we could not see. None of them is evidence of failure.
        if (!ok || raw.length < 64) return (Verdict.Unmeasurable, 0);

        (int256 value, bool known) = abi.decode(raw, (int256, bool));
        if (!known) return (Verdict.Unmeasurable, 0);

        return (value >= a.threshold ? Verdict.Met : Verdict.Failed, value);
    }
}
