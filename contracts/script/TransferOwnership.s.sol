// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MandateMarketV2} from "../src/MandateMarketV2.sol";

/**
 * Hands the market's owner role to a multisig.
 *
 *   NEW_OWNER=0xSafe... forge script script/TransferOwnership.s.sol \
 *     --rpc-url $RPC --broadcast
 *
 * The owner can pause the market, resolve challenges, set every parameter and
 * nominate the adjudicator. It cannot mint, cannot withdraw a principal's
 * capital and cannot take an agent's bond, so a compromised owner key is not a
 * theft; it is the ability to settle disputes wrongly. That is still the
 * sharpest single point of failure in this design and it is one externally
 * owned account today.
 *
 * **This contract uses plain `Ownable`, not `Ownable2Step`.** The transfer is
 * one shot with no acceptance step, so an address typed wrong is the market
 * ownerless forever, and `renounceOwnership` is live and unguarded. Everything
 * below exists because of that.
 *
 * The guards:
 *
 *   - the new owner must have code, so an EOA typo cannot pass for a Safe
 *   - it must not be the zero address or the current owner
 *   - the script prints the before and after and reads the owner back
 *
 * What it deliberately does not do is move the adjudicator. That role has its
 * own two-step nominate and accept, and collapsing both handovers into one
 * transaction is how you end up with neither.
 */
contract TransferOwnership is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address market = vm.envOr("MARKET_ADDRESS", address(0));
        address newOwner = vm.envAddress("NEW_OWNER");

        require(market != address(0), "set MARKET_ADDRESS");
        require(newOwner != address(0), "NEW_OWNER is the zero address");

        MandateMarketV2 m = MandateMarketV2(payable(market));
        address current = m.owner();

        require(newOwner != current, "NEW_OWNER is already the owner");

        // A Safe is a contract. An address with no code is a typo, a burner, or
        // somebody's idea of a multisig that is not one, and this transfer
        // cannot be undone.
        uint256 size;
        assembly {
            size := extcodesize(newOwner)
        }
        require(size > 0, "NEW_OWNER has no code: this must be a multisig, not an EOA");

        console.log("market      :", market);
        console.log("owner now   :", current);
        console.log("owner after :", newOwner);
        console.log("adjudicator :", m.adjudicator(), "(unchanged)");

        vm.startBroadcast(pk);
        m.transferOwnership(newOwner);
        vm.stopBroadcast();

        address after_ = m.owner();
        require(after_ == newOwner, "ownership did not move");
        console.log("confirmed   :", after_);
    }
}
