// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MandateMarketV2} from "../src/MandateMarketV2.sol";

/**
 * Deploys MandateMarketV2.
 *
 *   forge script script/DeployV2.s.sol --rpc-url $RPC --broadcast
 *
 * Every parameter is an argument rather than a default the deployment then
 * overrides — the divergence between a contract's source and its chain state
 * is exactly what V1's `minBond` taught.
 */
contract DeployV2 is Script {
    function run() external returns (MandateMarketV2 market) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address adjudicator = vm.envOr("ADJUDICATOR", vm.addr(pk));
        uint96 minBond = uint96(vm.envOr("MIN_BOND_WEI", uint256(0.00004 ether)));
        uint96 proposerStake = uint96(vm.envOr("PROPOSER_STAKE_WEI", uint256(0.00002 ether)));
        uint64 challengeWindow = uint64(vm.envOr("CHALLENGE_WINDOW", uint256(300)));

        vm.startBroadcast(pk);
        market = new MandateMarketV2(adjudicator, minBond, proposerStake, challengeWindow);
        vm.stopBroadcast();

        console.log("MandateMarketV2 :", address(market));
        console.log("adjudicator     :", adjudicator);
        console.log("owner           :", vm.addr(pk));
        console.log("minBond wei     :", minBond);
        console.log("proposerStake   :", proposerStake);
        console.log("challengeWindow :", challengeWindow);
    }
}
