// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {BondVault, Mandate, IERC20} from "../src/BondVault.sol";
import {OutcomePolicy, Assertion, Metric, Verdict, IOutcomeOracle} from "../src/OutcomePolicy.sol";

/**
 * The claim under test is that an agent's collateral moves in exactly two
 * situations — the chain said the claim held, or the chain said it failed —
 * and in no other situation whatsoever.
 *
 * So most of what follows is an attempt to move it in some other situation:
 * an oracle that cannot see, an oracle that reverts, a window that has not
 * closed, a settlement called twice, a token that lies about its transfer, a
 * principal that re-enters on receipt, and an agent trying to withdraw money
 * it has already put at risk. The tests that prove the happy path are the
 * short ones at the top; the rest of the file is the part that decides whether
 * anyone should put money in here.
 */

/* ------------------------------------------------------------------ tokens */

/// An ordinary, well-behaved ERC-20.
contract Token {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 v) external {
        balanceOf[to] += v;
    }

    function approve(address s, uint256 v) external returns (bool) {
        allowance[msg.sender][s] = v;
        return true;
    }

    function transfer(address to, uint256 v) external virtual returns (bool) {
        balanceOf[msg.sender] -= v;
        balanceOf[to] += v;
        return true;
    }

    function transferFrom(address f, address t, uint256 v) external virtual returns (bool) {
        allowance[f][msg.sender] -= v;
        balanceOf[f] -= v;
        balanceOf[t] += v;
        return true;
    }
}

/// BSC-USDT's shape: succeeds, returns nothing, breaks a naive integration.
contract NoReturnToken is Token {
    function transfer(address to, uint256 v) external override returns (bool) {
        balanceOf[msg.sender] -= v;
        balanceOf[to] += v;
        assembly {
            return(0, 0)
        }
    }

    function transferFrom(address f, address t, uint256 v) external override returns (bool) {
        allowance[f][msg.sender] -= v;
        balanceOf[f] -= v;
        balanceOf[t] += v;
        assembly {
            return(0, 0)
        }
    }
}

/// Takes a cut on the way in. Credited by what arrived, not what was asked for.
contract FeeToken is Token {
    function transferFrom(address f, address t, uint256 v) external override returns (bool) {
        uint256 fee = v / 10;
        allowance[f][msg.sender] -= v;
        balanceOf[f] -= v;
        balanceOf[t] += v - fee;
        return true;
    }
}


/**
 * A token with a transfer hook, which is the only way into this contract
 * twice: the vault never calls a principal directly, so the callback has to
 * come from the asset itself.
 */
contract ReentrantToken is Token {
    BondVault public vault;
    uint256 public target;
    bool public tried;
    bool public secondCallReverted;

    function arm(BondVault v, uint256 mandateId) external {
        vault = v;
        target = mandateId;
    }

    function transfer(address to, uint256 v) external override returns (bool) {
        balanceOf[msg.sender] -= v;
        balanceOf[to] += v;
        if (address(vault) != address(0) && !tried) {
            tried = true;
            try vault.settle(target) {
                secondCallReverted = false;
            } catch {
                secondCallReverted = true;
            }
        }
        return true;
    }
}

/* ----------------------------------------------------------------- oracles */

contract Oracle is IOutcomeOracle {
    int256 public value;
    bool public known = true;

    function set(int256 v, bool k) external {
        value = v;
        known = k;
    }

    function measure(Assertion calldata) external view returns (int256, bool) {
        return (value, known);
    }

    function method() external pure returns (string memory) {
        return "test";
    }
}

contract RevertingOracle is IOutcomeOracle {
    function measure(Assertion calldata) external pure returns (int256, bool) {
        revert("no");
    }

    function method() external pure returns (string memory) {
        return "reverts";
    }
}

/* ------------------------------------------------------------------- tests */

contract BondVaultTest is Test {
    BondVault vault;
    OutcomePolicy policy;
    Token token;
    Oracle oracle;

    address agent = address(0xA1);
    address principal = address(0xB2);
    address stranger = address(0xC3);

    uint256 constant MANDATE = 1;
    uint256 constant BOND = 100e18;

    function setUp() public {
        policy = new OutcomePolicy();
        vault = new BondVault(policy);
        token = new Token();
        oracle = new Oracle();

        token.mint(agent, 1_000e18);
        vm.prank(agent);
        token.approve(address(vault), type(uint256).max);
    }

    /// Bind an assertion whose window has already closed, so a verdict exists.
    function _bindClosed(uint256 id, int256 threshold) internal {
        vm.warp(10_000);
        policy.bind(
            id,
            Assertion({
                metric: Metric.TimeInRange,
                subject: address(0xDEAD),
                threshold: threshold,
                windowStart: 1,
                windowEnd: 2,
                oracle: address(oracle)
            })
        );
    }

    function _bondedAgent() internal {
        vm.startPrank(agent);
        vault.deposit(address(token), 500e18);
        vault.bond(MANDATE, principal, address(token), BOND);
        vm.stopPrank();
    }

    /* ------------------------------------------------------- the happy paths */

    function test_metClaimReturnsTheBondToTheAgent() public {
        _bondedAgent();
        _bindClosed(MANDATE, 9_000);
        oracle.set(9_500, true);

        (Verdict v,) = vault.settle(MANDATE);

        assertEq(uint8(v), uint8(Verdict.Met));
        assertEq(vault.available(agent, address(token)), 500e18);
        assertEq(vault.locked(agent, address(token)), 0);
        assertEq(token.balanceOf(principal), 0);
    }

    function test_failedClaimSendsTheBondToThePrincipal() public {
        _bondedAgent();
        _bindClosed(MANDATE, 9_000);
        oracle.set(8_000, true);

        (Verdict v,) = vault.settle(MANDATE);

        assertEq(uint8(v), uint8(Verdict.Failed));
        assertEq(token.balanceOf(principal), BOND);
        assertEq(vault.locked(agent, address(token)), 0);
        assertEq(vault.available(agent, address(token)), 400e18);
    }

    /* ------------------------------- money must not move on a missing verdict */

    function test_anOracleThatCannotSeeTakesNothing() public {
        _bondedAgent();
        _bindClosed(MANDATE, 9_000);
        oracle.set(0, false);

        vm.expectRevert(
            abi.encodeWithSelector(BondVault.NotDecided.selector, MANDATE, Verdict.Unmeasurable)
        );
        vault.settle(MANDATE);

        assertEq(vault.locked(agent, address(token)), BOND);
        assertEq(token.balanceOf(principal), 0);
    }

    function test_anOracleThatRevertsTakesNothing() public {
        _bondedAgent();
        vm.warp(10_000);
        policy.bind(
            MANDATE,
            Assertion({
                metric: Metric.TimeInRange,
                subject: address(0xDEAD),
                threshold: 9_000,
                windowStart: 1,
                windowEnd: 2,
                oracle: address(new RevertingOracle())
            })
        );

        vm.expectRevert(
            abi.encodeWithSelector(BondVault.NotDecided.selector, MANDATE, Verdict.Unmeasurable)
        );
        vault.settle(MANDATE);

        assertEq(vault.locked(agent, address(token)), BOND);
    }

    function test_anOpenWindowTakesNothing() public {
        _bondedAgent();
        vm.warp(100);
        policy.bind(
            MANDATE,
            Assertion({
                metric: Metric.TimeInRange,
                subject: address(0xDEAD),
                threshold: 9_000,
                windowStart: 1,
                windowEnd: 1_000,
                oracle: address(oracle)
            })
        );

        vm.expectRevert(abi.encodeWithSelector(BondVault.NotDecided.selector, MANDATE, Verdict.Pending));
        vault.settle(MANDATE);

        assertEq(vault.locked(agent, address(token)), BOND);
    }

    /* ------------------------------------------------- a bond moves only once */

    function test_aMandateCannotSettleTwice() public {
        _bondedAgent();
        _bindClosed(MANDATE, 9_000);
        oracle.set(8_000, true);

        vault.settle(MANDATE);

        vm.expectRevert(abi.encodeWithSelector(BondVault.AlreadySettled.selector, MANDATE));
        vault.settle(MANDATE);

        assertEq(token.balanceOf(principal), BOND);
    }

    function test_aSecondSlashCannotBeStagedByFlippingTheOracle() public {
        _bondedAgent();
        _bindClosed(MANDATE, 9_000);
        oracle.set(8_000, true);
        vault.settle(MANDATE);

        // The oracle now says the claim held. The mandate is closed regardless.
        oracle.set(9_900, true);
        vm.expectRevert(abi.encodeWithSelector(BondVault.AlreadySettled.selector, MANDATE));
        vault.settle(MANDATE);

        assertEq(token.balanceOf(principal), BOND);
        assertEq(vault.available(agent, address(token)), 400e18);
    }

    /* ------------------------------------------ locked money is not withdrawable */

    function test_lockedCollateralCannotBeWithdrawn() public {
        _bondedAgent();

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(BondVault.InsufficientAvailable.selector, 401e18, 400e18));
        vault.withdraw(address(token), 401e18);
    }

    function test_unlockedCollateralCanBeWithdrawnAndOnlyByItsOwner() public {
        _bondedAgent();

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(BondVault.InsufficientAvailable.selector, 1, 0));
        vault.withdraw(address(token), 1);

        vm.prank(agent);
        vault.withdraw(address(token), 400e18);
        assertEq(token.balanceOf(agent), 900e18);
    }

    function test_anAgentCannotBondMoreThanItHolds() public {
        vm.startPrank(agent);
        vault.deposit(address(token), 10e18);
        vm.expectRevert(abi.encodeWithSelector(BondVault.InsufficientAvailable.selector, 11e18, 10e18));
        vault.bond(MANDATE, principal, address(token), 11e18);
        vm.stopPrank();
    }

    function test_aMandateIdCannotBeReused() public {
        _bondedAgent();
        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(BondVault.MandateExists.selector, MANDATE));
        vault.bond(MANDATE, principal, address(token), 1e18);
    }

    /* ------------------------------------------------------- awkward tokens */

    function test_aTokenThatReturnsNothingStillWorks() public {
        NoReturnToken odd = new NoReturnToken();
        odd.mint(agent, 100e18);
        vm.startPrank(agent);
        odd.approve(address(vault), type(uint256).max);
        vault.deposit(address(odd), 100e18);
        vault.bond(MANDATE, principal, address(odd), 100e18);
        vm.stopPrank();

        _bindClosed(MANDATE, 9_000);
        oracle.set(1, true);
        vault.settle(MANDATE);

        assertEq(odd.balanceOf(principal), 100e18);
    }

    function test_aFeeOnTransferTokenCreditsWhatArrivedNotWhatWasAsked() public {
        FeeToken fee = new FeeToken();
        fee.mint(agent, 100e18);
        vm.startPrank(agent);
        fee.approve(address(vault), type(uint256).max);
        vault.deposit(address(fee), 100e18);
        vm.stopPrank();

        // Ten per cent stayed behind, so ninety is what can be bonded.
        assertEq(vault.available(agent, address(fee)), 90e18);
        assertEq(fee.balanceOf(address(vault)), 90e18);

        vm.prank(agent);
        vm.expectRevert(abi.encodeWithSelector(BondVault.InsufficientAvailable.selector, 100e18, 90e18));
        vault.bond(MANDATE, principal, address(fee), 100e18);
    }

    /* ------------------------------------------------------------ invariants */

    /**
     * The accounting identity: whatever the vault holds for an agent is
     * exactly what it says is available plus what it says is locked. Fuzzed
     * across deposit, bond, settle and withdraw in every order the sequence
     * allows.
     */
    function testFuzz_theVaultHoldsExactlyWhatItSaysItHolds(
        uint128 depositAmount,
        uint128 bondAmount,
        bool claimHeld,
        bool withdrawRest
    ) public {
        depositAmount = uint128(bound(depositAmount, 1, 1_000e18));
        bondAmount = uint128(bound(bondAmount, 1, depositAmount));

        token.mint(agent, depositAmount);
        vm.startPrank(agent);
        token.approve(address(vault), type(uint256).max);
        vault.deposit(address(token), depositAmount);
        vault.bond(MANDATE, principal, address(token), bondAmount);
        vm.stopPrank();

        assertEq(
            vault.available(agent, address(token)) + vault.locked(agent, address(token)),
            depositAmount
        );

        _bindClosed(MANDATE, 9_000);
        oracle.set(claimHeld ? int256(9_500) : int256(1_000), true);
        vault.settle(MANDATE);

        // A slash leaves the vault; a release stays. Either way the books tie.
        uint256 expectedHeld = claimHeld ? depositAmount : depositAmount - bondAmount;
        assertEq(vault.locked(agent, address(token)), 0);
        assertEq(vault.available(agent, address(token)), expectedHeld);
        assertGe(token.balanceOf(address(vault)), expectedHeld);

        if (withdrawRest) {
            vm.prank(agent);
            vault.withdraw(address(token), expectedHeld);
            assertEq(vault.available(agent, address(token)), 0);
        }
    }

    /// A slash can never exceed what was bonded, whatever the oracle reports.
    function testFuzz_aSlashNeverExceedsTheBond(int256 measured, uint128 bondAmount) public {
        bondAmount = uint128(bound(bondAmount, 1, 500e18));

        vm.startPrank(agent);
        vault.deposit(address(token), 500e18);
        vault.bond(MANDATE, principal, address(token), bondAmount);
        vm.stopPrank();

        _bindClosed(MANDATE, 9_000);
        oracle.set(measured, true);
        (, uint256 moved) = vault.settle(MANDATE);

        assertLe(moved, bondAmount);
        assertLe(token.balanceOf(principal), bondAmount);
    }

    /// Only the principal named at lock time is ever paid a slash.
    function testFuzz_onlyTheNamedPrincipalIsEverPaid(address who) public {
        vm.assume(who != principal && who != address(vault) && who != address(0));
        _bondedAgent();
        _bindClosed(MANDATE, 9_000);
        oracle.set(0, true);

        uint256 before = token.balanceOf(who);
        vault.settle(MANDATE);

        assertEq(token.balanceOf(who), before);
        assertEq(token.balanceOf(principal), BOND);
    }


    /* ---------------------------------------------------------- reentrancy */

    /**
     * The vault never calls a principal, so the only way back in is a token
     * that calls out during its own transfer. The state that closes the
     * mandate is written before that transfer happens, so the second entry
     * finds the mandate already settled and reverts — and the bond leaves
     * exactly once.
     */
    function test_aTokenThatReEntersDuringTransferCannotDrainTheBond() public {
        ReentrantToken evil = new ReentrantToken();
        evil.mint(agent, 300e18);

        vm.startPrank(agent);
        evil.approve(address(vault), type(uint256).max);
        vault.deposit(address(evil), 300e18);
        vault.bond(MANDATE, principal, address(evil), 200e18);
        vm.stopPrank();

        evil.arm(vault, MANDATE);
        _bindClosed(MANDATE, 9_000);
        oracle.set(0, true);

        vault.settle(MANDATE);

        assertTrue(evil.tried(), "the hook never fired, so this proved nothing");
        assertTrue(evil.secondCallReverted(), "the vault let a second settlement in");
        assertEq(evil.balanceOf(principal), 200e18);
        assertEq(vault.locked(agent, address(evil)), 0);
        assertEq(vault.available(agent, address(evil)), 100e18);
    }

    /* ------------------------------------------------------------- settling */

    function test_anybodyMaySettleBecauseTheOutcomeDoesNotDependOnWhoAsks() public {
        _bondedAgent();
        _bindClosed(MANDATE, 9_000);
        oracle.set(1_000, true);

        vm.prank(stranger);
        vault.settle(MANDATE);

        assertEq(token.balanceOf(principal), BOND);
    }

    function test_settlingAMandateThatWasNeverBondedReverts() public {
        vm.expectRevert(abi.encodeWithSelector(BondVault.NoSuchMandate.selector, 99));
        vault.settle(99);
    }

    function test_theMandateRecordsTheVerdictThatSettledIt() public {
        _bondedAgent();
        _bindClosed(MANDATE, 9_000);
        oracle.set(500, true);
        vault.settle(MANDATE);

        Mandate memory m = vault.mandateOf(MANDATE);
        assertEq(uint8(m.verdict), uint8(Verdict.Failed));
        assertTrue(m.settled);
        assertEq(m.principal, principal);
        assertEq(m.bonded, BOND);
    }
}
