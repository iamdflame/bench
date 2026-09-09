// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {ShadowLedger} from "../src/ShadowLedger.sol";
import {Underwriter} from "../src/Underwriter.sol";

/// Deploys the supply side: measured records without capital, and capital
/// without an agent of its own.
contract DeploySupply is Script {
    function run() external returns (ShadowLedger ledger, Underwriter under) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address adjudicator = vm.envOr("ADJUDICATOR", vm.addr(pk));

        vm.startBroadcast(pk);
        ledger = new ShadowLedger(adjudicator);
        under = new Underwriter();
        vm.stopBroadcast();

        console.log("ShadowLedger :", address(ledger));
        console.log("Underwriter  :", address(under));
        console.log("adjudicator  :", adjudicator);
    }
}
