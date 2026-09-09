// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Assertion, IOutcomeOracle} from "./Outcome.sol";

/**
 * @title FixedOracle
 * @notice An oracle that answers whatever it is told to answer.
 *
 * This exists so the *contracts* can be proven on a live chain without a
 * measurement pipeline in the way. `prove-bond` deploys one, names it in a
 * signed claim, and drives it through Met, Failed and Unmeasurable to watch
 * real collateral move — or not move — on BNB Smart Chain.
 *
 * It is deliberately not a measurement of anything. The real engines are
 * proven by the replay suite, where `check:no-lookahead` corrupts the future
 * and fails if any earlier decision moved. Mixing the two would mean a failure
 * in either could be blamed on the other.
 *
 * Anybody may set it, and that is the point: a claim naming this oracle is a
 * claim naming an oracle its counterparty can move, which is exactly why the
 * oracle is part of the signed payload. A principal who accepts a claim
 * pointing here has agreed to that.
 */
contract FixedOracle is IOutcomeOracle {
    int256 public value;
    bool public known;

    event Set(int256 value, bool known);

    constructor(int256 v, bool k) {
        value = v;
        known = k;
    }

    function set(int256 v, bool k) external {
        value = v;
        known = k;
        emit Set(v, k);
    }

    function measure(Assertion calldata) external view returns (int256, bool) {
        return (value, known);
    }

    function method() external pure returns (string memory) {
        return "fixed: answers what it was set to, and says so";
    }
}
