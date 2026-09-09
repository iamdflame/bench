// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title OutcomePolicy
 * @notice Settles an ERC-8183 job on a measured outcome instead of on silence.
 *
 * ---------------------------------------------------------------------------
 * The problem
 * ---------------------------------------------------------------------------
 *
 * Altana's standard policy releases an escrow when a deliverable is submitted
 * and a dispute window elapses without objection. The question it answers is
 * "did the seller submit something". For an agent selling a *financial
 * outcome* that is the wrong question: a seller can submit a file describing a
 * position it never kept in range and be paid for it, and the buyer's only
 * recourse is to notice within the window and argue.
 *
 * This policy asks the other question. The buyer and seller agree an assertion
 * at hire time — "time in range at least 90% over these seven days" — and the
 * chain decides. Neither party clicks anything.
 *
 * ---------------------------------------------------------------------------
 * READ THIS BEFORE ASSUMING IT CAN BE USED
 * ---------------------------------------------------------------------------
 *
 * **This contract cannot be bound to a live ERC-8183 job today.** The router's
 * `registerJob(jobId, policy)` does not accept an arbitrary policy: it keeps an
 * allowlist, and anything not on it reverts with `PolicyNotWhitelisted()`
 * (0xc94463e3).
 *
 * That was measured rather than assumed. A fresh job was created on chain 97 so
 * that job state could not be a confound, and `registerJob` was simulated three
 * times against it with only the policy address changed: the live policy
 * succeeded, the SDK's own stale policy contract — a deployed policy of
 * identical size that answers `disputeWindow()` correctly — reverted, and an
 * unrelated contract reverted identically.
 *
 * So settlement policy on ERC-8183 is pluggable by Altana, not by a
 * marketplace. This contract is therefore a **reference implementation offered
 * upstream**, which is the fourth step of the plan's own staging and, given the
 * allowlist, the only route to the second. It is written to be read and argued
 * with by the people who control that list.
 *
 * One consequence for honesty: the router-facing hook set is **not verified
 * here**. The published interface is `disputeWindow()` and `dispute(uint256)`;
 * the live policy's dispatcher carries forty-nine further selectors whose names
 * are not published, and the allowlist makes them impossible to exercise. What
 * follows implements the documented surface and the outcome surface. It does
 * not claim to be drop-in, because that claim could not be tested.
 *
 * ---------------------------------------------------------------------------
 * Refusing is a verdict
 * ---------------------------------------------------------------------------
 *
 * The most important line in this contract is the one that does nothing.
 *
 * If the oracle cannot measure the window — an RPC gap, a position closed early,
 * a subject that never existed — the verdict is `Unmeasurable`, and the job
 * falls back to the optimistic path rather than settling either way. An
 * outcome policy that guesses when it cannot see is worse than no outcome
 * policy at all: it converts an honest "we do not know" into a transfer of
 * somebody's money, and it does it silently.
 */

import {Metric, Verdict, Assertion, IOutcomeOracle, IVerdict, Measure} from "./Outcome.sol";

contract OutcomePolicy is IVerdict {
    /// Emitted when an assertion is bound to a job. The terms, on chain, before the work.
    event AssertionBound(uint256 indexed jobId, Metric metric, address subject, int256 threshold, address oracle);

    /// Emitted when a verdict is reached, carrying what was measured.
    event Settled(uint256 indexed jobId, Verdict verdict, int256 measured, int256 threshold);

    error AlreadyBound(uint256 jobId);
    error NotBound(uint256 jobId);
    error EmptyWindow(uint64 start, uint64 end);
    error NoOracle();
    error NoSubject();

    mapping(uint256 => Assertion) private _assertions;
    mapping(uint256 => bool) private _bound;

    /**
     * The window a buyer has to object, matching the optimistic policy's.
     *
     * Kept identical on purpose. This policy changes *what* decides a job, not
     * how long anyone has to argue about it, and a policy that quietly
     * shortened the objection window would be taking something from the buyer
     * in exchange for the measurement.
     */
    uint64 public constant DISPUTE_WINDOW = 604_800;

    function disputeWindow() external pure returns (uint64) {
        return DISPUTE_WINDOW;
    }

    /**
     * Bind the terms to a job. Once, and never again.
     *
     * Immutability is the point. An assertion that can be edited after the work
     * starts is not an agreement, it is a negotiation with a stopwatch — and
     * whichever side can edit it last wins every time.
     */
    function bind(uint256 jobId, Assertion calldata a) external {
        if (_bound[jobId]) revert AlreadyBound(jobId);
        if (a.oracle == address(0)) revert NoOracle();
        if (a.subject == address(0)) revert NoSubject();
        if (a.windowEnd <= a.windowStart) revert EmptyWindow(a.windowStart, a.windowEnd);

        _assertions[jobId] = a;
        _bound[jobId] = true;
        emit AssertionBound(jobId, a.metric, a.subject, a.threshold, a.oracle);
    }

    function assertionOf(uint256 jobId) external view returns (Assertion memory) {
        if (!_bound[jobId]) revert NotBound(jobId);
        return _assertions[jobId];
    }

    /**
     * The verdict, and the evidence behind it.
     *
     * `view`, and deliberately so: a settlement decision that could mutate
     * state while computing itself is a settlement decision that can be made to
     * disagree with itself between the simulation a party checked and the
     * transaction that lands.
     *
     * The oracle is called with a bounded gas stipend and its revert is caught.
     * An oracle that reverts, runs away, or returns nothing decodable yields
     * `Unmeasurable` — never `Failed`. A buggy measurement contract must not be
     * able to take the seller's money, and the asymmetry is intentional: the
     * fallback path still exists, so refusing costs a delay, whereas guessing
     * costs somebody the escrow.
     */
    function check(uint256 jobId) public view returns (Verdict verdict, int256 measured, int256 threshold) {
        if (!_bound[jobId]) revert NotBound(jobId);
        Assertion memory a = _assertions[jobId];
        (verdict, measured) = Measure.verdict(a);
        return (verdict, measured, a.threshold);
    }

    /**
     * The router-facing shape from the plan: a verdict byte and a proof blob.
     *
     * Kept alongside `check` rather than instead of it, because a caller that
     * wants to show a person *why* should not have to decode a blob to do it.
     */
    function checkPacked(uint256 jobId) external view returns (uint8, bytes memory) {
        (Verdict v, int256 measured, int256 threshold) = check(jobId);
        return (uint8(v), abi.encode(measured, threshold, _assertions[jobId].oracle));
    }

    /**
     * Whether this job settles here at all.
     *
     * False for `Pending` and `Unmeasurable`, which is what makes the fallback
     * legible to whatever binds this: the answer to "should the optimistic path
     * take over" is exactly `!decided`.
     */
    function decided(uint256 jobId) external view returns (bool) {
        (Verdict v, , ) = check(jobId);
        return v == Verdict.Met || v == Verdict.Failed;
    }
}
