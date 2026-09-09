// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {AssayBond} from "../src/AssayBond.sol";

/**
 * The office's own bond, under attack.
 *
 * The point of this contract is that the referee can lose, so the tests that
 * matter are the ones where it does. Three routes to the office's money:
 * a self-evident contradiction in its own record, an adjudicated challenge it
 * concedes, and — the structural one — a challenge it simply ignores.
 */
contract AssayBondTest is Test {
    AssayBond internal bond;

    address internal office = address(0xA55A4);
    address internal challenger = address(0xC0FFEE);
    address internal agent = address(0xA6E17);
    address internal owner = address(0x0E7E1);

    uint96 internal constant REQUIRED = 0.05 ether;
    uint64 internal constant WINDOW = 3 days;
    uint256 internal constant TOKEN = 304493;

    function setUp() public {
        bond = new AssayBond(office, REQUIRED, WINDOW);
        vm.deal(office, 10 ether);
        vm.deal(challenger, 1 ether);
    }

    function _strike() internal {
        vm.prank(office);
        bond.strike{value: REQUIRED}(TOKEN, agent, owner, 405, 119901707, keccak256("report"));
    }

    // ------------------------------------------------------------ striking --

    function test_StrikeEscrowsTheBond() public {
        _strike();
        assertTrue(bond.stands(TOKEN));
        assertEq(bond.backing(TOKEN), REQUIRED);
        assertEq(address(bond).balance, REQUIRED);
    }

    /// Below 375 nothing is struck, here as everywhere else in this system.
    function test_RefusesToStrikeBelowTheBar() public {
        vm.prank(office);
        vm.expectRevert(abi.encodeWithSelector(AssayBond.BelowHallmarkBar.selector, uint16(374)));
        bond.strike{value: REQUIRED}(TOKEN, agent, owner, 374, 1, bytes32(0));
    }

    /// A mark without a bond behind it is a mark nobody has to stand behind.
    function test_RefusesAWrongBond() public {
        vm.prank(office);
        vm.expectRevert();
        bond.strike{value: REQUIRED - 1}(TOKEN, agent, owner, 405, 1, bytes32(0));
    }

    function test_OnlyTheOfficeMayStrike() public {
        vm.deal(challenger, 1 ether);
        vm.prank(challenger);
        vm.expectRevert();
        bond.strike{value: REQUIRED}(TOKEN, agent, owner, 405, 1, bytes32(0));
    }

    // ------------------------------------------------------- self-evident --

    /**
     * The office's own record contradicts itself, and anyone can collect.
     *
     * No window, no resolver, nobody to trust: the assay asserted a custody
     * separation between two addresses it committed, and they are equal.
     */
    function test_SelfEvidentChallengeTakesTheBondImmediately() public {
        vm.prank(office);
        bond.strike{value: REQUIRED}(TOKEN, agent, agent, 405, 1, keccak256("report"));

        vm.prank(challenger);
        bond.challengeSelfEvident(TOKEN);

        assertFalse(bond.stands(TOKEN));
        assertEq(bond.withdrawable(challenger), REQUIRED);

        uint256 before = challenger.balance;
        vm.prank(challenger);
        bond.withdraw();
        assertEq(challenger.balance, before + REQUIRED);
    }

    function test_SelfEvidentChallengeFailsWhenCustodyIsSeparated() public {
        _strike();
        vm.prank(challenger);
        vm.expectRevert(AssayBond.NotSelfEvident.selector);
        bond.challengeSelfEvident(TOKEN);
        assertTrue(bond.stands(TOKEN));
    }

    // -------------------------------------------------------- adjudicated --

    function test_OfficeMayUpholdAMarkWithinTheWindow() public {
        _strike();
        vm.prank(challenger);
        bond.challenge(TOKEN, AssayBond.Ground.EndpointDead, keccak256("evidence"));

        vm.prank(office);
        bond.resolve(TOKEN, true, "the endpoint answered when we called it");

        assertTrue(bond.stands(TOKEN));
        assertEq(bond.withdrawable(challenger), 0);
    }

    function test_ConcedingAChallengeHandsOverTheBond() public {
        _strike();
        vm.prank(challenger);
        bond.challenge(TOKEN, AssayBond.Ground.CapabilityUnproven, keccak256("evidence"));

        vm.prank(office);
        bond.resolve(TOKEN, false, "the wallet never touched the position manager");

        assertFalse(bond.stands(TOKEN));
        assertEq(bond.withdrawable(challenger), REQUIRED);
    }

    /**
     * The structural guarantee, and the reason this contract is worth writing.
     *
     * The office is an interested party. It cannot be made honest by a
     * contract, but it can be made unable to win by saying nothing — and
     * silence is then the most expensive answer available to it.
     */
    function test_SilenceLosesTheBond() public {
        _strike();
        vm.prank(challenger);
        bond.challenge(TOKEN, AssayBond.Ground.EndpointDead, keccak256("evidence"));

        vm.warp(block.timestamp + WINDOW + 1);

        // Anyone may collect it, not only the challenger — an office that could
        // rely on a challenger going quiet would still be safe by attrition.
        bond.claimUnanswered(TOKEN);

        assertFalse(bond.stands(TOKEN));
        assertEq(bond.withdrawable(challenger), REQUIRED);
    }

    function test_CannotClaimBeforeTheWindowCloses() public {
        _strike();
        vm.prank(challenger);
        bond.challenge(TOKEN, AssayBond.Ground.EndpointDead, keccak256("e"));

        vm.expectRevert();
        bond.claimUnanswered(TOKEN);
    }

    function test_OfficeCannotResolveAfterTheWindow() public {
        _strike();
        vm.prank(challenger);
        bond.challenge(TOKEN, AssayBond.Ground.EndpointDead, keccak256("e"));

        vm.warp(block.timestamp + WINDOW + 1);
        vm.prank(office);
        vm.expectRevert();
        bond.resolve(TOKEN, true, "too late");
    }

    // ------------------------------------------------------------ release --

    /// An office that could pull its bond mid-challenge has no bond at all.
    function test_CannotReleaseWhileAChallengeIsOpen() public {
        _strike();
        vm.prank(challenger);
        bond.challenge(TOKEN, AssayBond.Ground.Other, keccak256("e"));

        vm.prank(office);
        vm.expectRevert(abi.encodeWithSelector(AssayBond.ChallengeOpen.selector, TOKEN));
        bond.release(TOKEN);
    }

    function test_ReleaseReturnsTheBondOnceTheMarkComesDown() public {
        _strike();
        vm.prank(office);
        bond.release(TOKEN);
        assertEq(bond.withdrawable(office), REQUIRED);
        assertFalse(bond.stands(TOKEN));
    }

    function test_CannotChallengeADefacedMark() public {
        _strike();
        vm.prank(challenger);
        bond.challenge(TOKEN, AssayBond.Ground.EndpointDead, keccak256("e"));
        vm.prank(office);
        bond.resolve(TOKEN, false, "conceded");

        vm.prank(challenger);
        vm.expectRevert(abi.encodeWithSelector(AssayBond.AlreadyDefaced.selector, TOKEN));
        bond.challenge(TOKEN, AssayBond.Ground.Other, keccak256("e2"));
    }

    // ------------------------------------------------------------ solvency --

    /**
     * The contract never owes more than it holds.
     *
     * Every path moves the same bond exactly once: to the challenger, or back
     * to the office, never both and never twice.
     */
    function testFuzz_NeverPaysTheSameBondTwice(uint8 path) public {
        _strike();
        uint256 held = address(bond).balance;

        if (path % 3 == 0) {
            vm.prank(challenger);
            bond.challenge(TOKEN, AssayBond.Ground.EndpointDead, keccak256("e"));
            vm.prank(office);
            bond.resolve(TOKEN, false, "conceded");
        } else if (path % 3 == 1) {
            vm.prank(challenger);
            bond.challenge(TOKEN, AssayBond.Ground.EndpointDead, keccak256("e"));
            vm.warp(block.timestamp + WINDOW + 1);
            bond.claimUnanswered(TOKEN);
        } else {
            vm.prank(office);
            bond.release(TOKEN);
        }

        uint256 owed = bond.withdrawable(challenger) + bond.withdrawable(office);
        assertEq(owed, held, "the contract owes exactly what it holds");
        assertEq(bond.backing(TOKEN), 0, "nothing is left backing a settled mark");
    }
}
