// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {OutcomePolicy, Assertion, Metric, Verdict, IOutcomeOracle} from "../src/OutcomePolicy.sol";

/**
 * The claim under test is that this contract will not settle a job it cannot
 * measure — so most of what follows is a badly behaved oracle and an assertion
 * that the money stays where it is.
 *
 * That asymmetry is deliberate. A policy that pays out when its measurement
 * works is the easy half; a policy that refuses when its measurement is broken,
 * absent, malicious or out of gas is the half that decides whether anyone
 * should let it near an escrow.
 */

/// Answers honestly.
contract GoodOracle is IOutcomeOracle {
    int256 public value;
    bool public known = true;

    constructor(int256 v) {
        value = v;
    }

    function set(int256 v, bool k) external {
        value = v;
        known = k;
    }

    function measure(Assertion calldata) external view returns (int256, bool) {
        return (value, known);
    }

    function method() external pure returns (string memory) {
        return "stub";
    }
}

/// Reverts on every call.
contract RevertingOracle {
    function measure(Assertion calldata) external pure returns (int256, bool) {
        revert("no");
    }
}

/// Returns something undecodable.
contract GarbageOracle {
    fallback() external {
        assembly {
            mstore(0, 1)
            return(0, 32) // 32 bytes where 64 are needed
        }
    }
}

/// Burns everything it is given, to prove the stipend bounds it.
contract GreedyOracle {
    function measure(Assertion calldata) external view returns (int256, bool) {
        uint256 i;
        while (gasleft() > 1000) i++;
        return (int256(i), true);
    }

    function method() external pure returns (string memory) {
        return "greedy";
    }
}

contract OutcomePolicyTest is Test {
    OutcomePolicy policy;
    GoodOracle good;

    address constant SUBJECT = address(0xBEEF);
    uint64 constant START = 1_000;
    uint64 constant END = 2_000;

    function setUp() public {
        policy = new OutcomePolicy();
        good = new GoodOracle(9_500);
        vm.warp(END + 1);
    }

    function _assertion(address oracle, int256 threshold) internal pure returns (Assertion memory) {
        return Assertion({
            metric: Metric.TimeInRange,
            subject: SUBJECT,
            threshold: threshold,
            windowStart: START,
            windowEnd: END,
            oracle: oracle
        });
    }

    // ---------------------------------------------------------------- binding

    function test_bindsOnceAndNeverAgain() public {
        policy.bind(1, _assertion(address(good), 9_000));
        vm.expectRevert(abi.encodeWithSelector(OutcomePolicy.AlreadyBound.selector, uint256(1)));
        policy.bind(1, _assertion(address(good), 1));
    }

    function test_refusesAnEmptyWindow() public {
        Assertion memory a = _assertion(address(good), 1);
        a.windowEnd = a.windowStart;
        vm.expectRevert(abi.encodeWithSelector(OutcomePolicy.EmptyWindow.selector, START, START));
        policy.bind(1, a);
    }

    function test_refusesAnAbsentOracleOrSubject() public {
        vm.expectRevert(OutcomePolicy.NoOracle.selector);
        policy.bind(1, _assertion(address(0), 1));

        Assertion memory a = _assertion(address(good), 1);
        a.subject = address(0);
        vm.expectRevert(OutcomePolicy.NoSubject.selector);
        policy.bind(2, a);
    }

    function test_checkingAnUnboundJobReverts() public {
        vm.expectRevert(abi.encodeWithSelector(OutcomePolicy.NotBound.selector, uint256(7)));
        policy.check(7);
    }

    // --------------------------------------------------------------- verdicts

    function test_metWhenTheMeasurementClearsTheThreshold() public {
        policy.bind(1, _assertion(address(good), 9_000));
        (Verdict v, int256 measured, int256 threshold) = policy.check(1);
        assertEq(uint8(v), uint8(Verdict.Met));
        assertEq(measured, 9_500);
        assertEq(threshold, 9_000);
        assertTrue(policy.decided(1));
    }

    function test_failedWhenItDoesNot() public {
        policy.bind(1, _assertion(address(good), 9_900));
        (Verdict v, , ) = policy.check(1);
        assertEq(uint8(v), uint8(Verdict.Failed));
        assertTrue(policy.decided(1));
    }

    function test_exactlyOnTheThresholdIsMet() public {
        policy.bind(1, _assertion(address(good), 9_500));
        (Verdict v, , ) = policy.check(1);
        assertEq(uint8(v), uint8(Verdict.Met), "the comparison is >=, and a promise met exactly is met");
    }

    function test_pendingBeforeTheWindowCloses() public {
        policy.bind(1, _assertion(address(good), 9_000));
        vm.warp(END - 1);
        (Verdict v, , ) = policy.check(1);
        assertEq(uint8(v), uint8(Verdict.Pending));
        assertFalse(policy.decided(1), "a job still running has not been decided");
    }

    // ------------------------------------------- refusing, which is the point

    function test_anOracleThatCannotSeeYieldsUnmeasurable() public {
        good.set(0, false);
        policy.bind(1, _assertion(address(good), 9_000));
        (Verdict v, , ) = policy.check(1);
        assertEq(uint8(v), uint8(Verdict.Unmeasurable), "not knowing is not the same as failing");
        assertFalse(policy.decided(1), "an unmeasurable job falls back rather than settling");
    }

    function test_aRevertingOracleCannotTakeTheSellersMoney() public {
        policy.bind(1, _assertion(address(new RevertingOracle()), 9_000));
        (Verdict v, , ) = policy.check(1);
        assertEq(uint8(v), uint8(Verdict.Unmeasurable), "a broken oracle must not read as a failed job");
    }

    function test_anUndecodableAnswerIsRefused() public {
        policy.bind(1, _assertion(address(new GarbageOracle()), 9_000));
        (Verdict v, , ) = policy.check(1);
        assertEq(uint8(v), uint8(Verdict.Unmeasurable));
    }

    function test_anOracleWithNoCodeIsRefused() public {
        policy.bind(1, _assertion(address(0xDEAD), 9_000));
        (Verdict v, , ) = policy.check(1);
        assertEq(uint8(v), uint8(Verdict.Unmeasurable), "an address with no code answers nothing");
    }

    function test_aGreedyOracleCannotStallTheCaller() public {
        policy.bind(1, _assertion(address(new GreedyOracle()), 9_000));
        uint256 before = gasleft();
        policy.check(1);
        uint256 used = before - gasleft();
        assertLt(used, 700_000, "the stipend bounds what an oracle can burn");
    }

    // -------------------------------------------------------------- invariant

    /**
     * However absurd the numbers, a decided job is one where the measurement
     * and the threshold actually agree with the verdict. This is the property
     * that makes the contract worth binding to money.
     */
    function testFuzz_verdictAlwaysFollowsTheComparison(int128 measured, int128 threshold) public {
        GoodOracle o = new GoodOracle(int256(measured));
        policy.bind(1, _assertion(address(o), int256(threshold)));
        (Verdict v, int256 m, int256 t) = policy.check(1);
        assertEq(uint8(v), uint8(m >= t ? Verdict.Met : Verdict.Failed));
        assertEq(m, int256(measured));
        assertEq(t, int256(threshold));
    }

    function test_theDisputeWindowMatchesTheOptimisticOne() public view {
        assertEq(policy.disputeWindow(), 604_800, "changing what decides a job must not change the time to argue");
    }
}
