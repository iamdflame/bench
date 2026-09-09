// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {ClaimRegistry} from "../src/ClaimRegistry.sol";
import {BondVault} from "../src/BondVault.sol";
import {OutcomePolicy} from "../src/OutcomePolicy.sol";

/**
 * Deploy the market.
 *
 * Order matters and is not incidental: `BondVault` takes the registry in its
 * constructor and stores it immutably, so the registry has to exist first.
 * That ordering is the reason the vault has no setter and therefore no owner —
 * the collaborator it trusts is fixed at construction and can never be
 * repointed at a registry that would sign off on different terms.
 *
 * `OutcomePolicy` is deployed alongside rather than wired in. It is the
 * ERC-8183 path, kept for the day that router's allowlist opens, and nothing
 * holding collateral depends on it.
 *
 *   forge script script/Deploy.s.sol --rpc-url $RPC --broadcast --verify
 */
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);

        console.log("chain    ", block.chainid);
        console.log("deployer ", deployer);
        console.log("balance  ", deployer.balance);

        vm.startBroadcast(pk);

        ClaimRegistry registry = new ClaimRegistry();
        BondVault vault = new BondVault(registry);
        OutcomePolicy policy = new OutcomePolicy();

        vm.stopBroadcast();

        console.log("");
        console.log("ClaimRegistry ", address(registry));
        console.log("BondVault     ", address(vault));
        console.log("OutcomePolicy ", address(policy));

        // The wiring, read back from chain rather than assumed from the script.
        require(address(vault.claims()) == address(registry), "vault is not wired to the registry");
        require(address(vault.policy()) == address(registry), "vault takes verdicts from elsewhere");
        console.log("");
        console.log("wiring verified: the vault's claims and verdicts are the same contract");
    }
}
