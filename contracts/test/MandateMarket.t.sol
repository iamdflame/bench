// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MandateMarket} from "../src/MandateMarket.sol";

contract MandateMarketTest is Test {
    MandateMarket internal market;

    address internal owner = address(this);
    address internal adjudicator = makeAddr("adjudicator");
    address internal principal = makeAddr("principal");
    address internal alice = makeAddr("alice"); // incumbent agent
    address internal bob = makeAddr("bob"); // successor
    address internal carol = makeAddr("carol");

    uint32 internal constant EPOCH = 1 hours;
    uint32 internal constant EPOCHS = 10;
    uint16 internal constant TOLERANCE = 200; // 2%
    uint16 internal constant FEE = 2_000; // 20% of alpha
    uint16 internal constant SLASH = 2_500; // 25% of bond per failing epoch

    /// @dev The floor the suite deploys against, passed explicitly so the
    ///      tests exercise the same path a deployment takes.
    uint96 internal constant MIN_BOND = 0.01 ether;

    function setUp() public {
        market = new MandateMarket(adjudicator, MIN_BOND);
        vm.deal(principal, 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    // ------------------------------------------------------------ helpers --

    function _open(uint256 capital) internal returns (uint256 id) {
        vm.prank(principal);
        id = market.openMandate{value: capital}(
            MandateMarket.Category.Rebalancing, TOLERANCE, FEE, SLASH, EPOCH, EPOCHS
        );
    }

    function _bid(uint256 id, address agent, uint256 bond, int16 target) internal returns (uint256) {
        vm.prank(agent);
        return market.bid{value: bond}(id, target);
    }

    /// @dev A nominal managed-wallet value; alpha is a ratio, so the base is arbitrary.
    uint96 internal constant OPEN_VALUE = 10 ether;

    function _obs(uint96 valuationWei) internal view returns (MandateMarket.Observation memory) {
        return MandateMarket.Observation({
            wallet: alice,
            valuationWei: valuationWei,
            gasSpentWei: 0,
            priceX96: 1,
            blockNumber: uint64(block.number),
            breakdownRef: bytes32(0)
        });
    }

    function _awardTo(uint256 id, uint256 bidIndex) internal {
        vm.prank(principal);
        market.award(id, bidIndex, _obs(OPEN_VALUE));
    }

    /**
     * @dev Settles at a chosen alpha by constructing the measurement that
     *      implies it. The contract rejects an alpha its own observations do
     *      not produce, so a test cannot assert an outcome without also
     *      stating the wallet value that would cause it.
     */
    function _settle(uint256 id, int256 alphaBps) internal {
        vm.warp(block.timestamp + EPOCH);
        vm.roll(block.number + 1);
        uint96 prev = _lastValuation(id);
        uint96 next = uint96(
            uint256(int256(uint256(prev)) * (10_000 + alphaBps) / 10_000)
        );
        vm.prank(adjudicator);
        market.settleEpoch(id, alphaBps, _obs(next));
    }

    function _lastValuation(uint256 id) internal view returns (uint96) {
        MandateMarket.Mandate memory m = market.getMandate(id);
        if (m.epochsSettled == 0) {
            (, uint96 v,,) = market.openAttestation(id);
            return v;
        }
        (, uint96 v,,) = market.epochAttestation(id, m.epochsSettled - 1);
        return v;
    }

    /**
     * @dev The invariant that matters: the contract must always hold at least
     *      what it owes. Liabilities are escrowed capital, escrowed bonds
     *      (incumbent and queued), slashes still inside the challenge window,
     *      and pull-payment balances.
     */
    function _assertSolvent(uint256 mandateCount, address[] memory parties) internal view {
        uint256 liabilities;
        for (uint256 i = 0; i < mandateCount; i++) {
            MandateMarket.Mandate memory m = market.getMandate(i);
            liabilities += m.capital + m.bond;
            MandateMarket.Bid[] memory bids = market.getBids(i);
            for (uint256 j = 0; j < bids.length; j++) {
                if (!bids[j].spent) liabilities += bids[j].bond;
            }
            for (uint32 e = 0; e < EPOCHS; e++) {
                (uint96 amount,,,, bool resolved) = market.pendingSlash(i, e);
                if (amount > 0 && !resolved) liabilities += amount;
            }
        }
        for (uint256 i = 0; i < parties.length; i++) {
            liabilities += market.withdrawable(parties[i]);
        }
        assertGe(address(market).balance, liabilities, "insolvent: owes more than it holds");
    }

    function _parties() internal view returns (address[] memory p) {
        p = new address[](5);
        p[0] = principal;
        p[1] = alice;
        p[2] = bob;
        p[3] = carol;
        p[4] = adjudicator;
    }

    // -------------------------------------------------------- lifecycle --

    function test_OpenAwardAndSettlePositiveEpoch() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);

        _awardTo(id, 0);

        MandateMarket.Mandate memory m = market.getMandate(id);
        assertEq(m.agent, alice);
        assertEq(m.bond, 1 ether);
        assertEq(uint8(m.state), uint8(MandateMarket.State.Active));

        // +5% alpha on 10 ether = 0.5 ether gain; 20% fee = 0.1 ether.
        _settle(id, 500);

        m = market.getMandate(id);
        assertEq(market.withdrawable(alice), 0.1 ether, "fee");
        assertEq(m.capital, 10 ether - 0.1 ether, "fee charged to escrow, not minted");
        assertEq(m.cumulativeAlphaBps, 500);
        _assertSolvent(1, _parties());
    }

    function test_WithinToleranceNeitherRewardsNorPunishes() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        _awardTo(id, 0);

        _settle(id, -150); // inside the 2% tolerance

        MandateMarket.Mandate memory m = market.getMandate(id);
        assertEq(m.bond, 1 ether, "no slash inside tolerance");
        assertEq(market.withdrawable(alice), 0, "no fee for trailing");
        _assertSolvent(1, _parties());
    }

    function test_UnderperformanceSlashesTheBond() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        _awardTo(id, 0);

        _settle(id, -500); // beyond tolerance, not catastrophic

        MandateMarket.Mandate memory m = market.getMandate(id);
        assertEq(m.bond, 0.75 ether, "25% of bond slashed");
        assertEq(m.strikes, 1);

        (uint96 amount,, address who, bool contested, bool resolved) = market.pendingSlash(id, 0);
        assertEq(amount, 0.25 ether);
        assertEq(who, alice);
        assertFalse(contested);
        assertFalse(resolved);
        _assertSolvent(1, _parties());
    }

    // ------------------------------------------------- dismissal, live --

    /// @notice The demo moment: fired and replaced inside one transaction.
    function test_CatastrophicEpochDismissesAndPromotesSuccessorSameTx() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        _bid(id, bob, 2 ether, 450); // stronger commitment, waiting

        _awardTo(id, 0);
        assertEq(market.successor(id), bob);

        vm.warp(block.timestamp + EPOCH);
        vm.prank(adjudicator);

        vm.expectEmit(true, true, false, false);
        emit MandateMarket.AgentDismissed(id, alice, "catastrophic underperformance");
        vm.expectEmit(true, true, false, true);
        emit MandateMarket.MandateAwarded(id, bob, 2 ether);

        market.settleEpoch(id, -1_500, _obs(uint96(uint256(OPEN_VALUE) * 8_500 / 10_000))); // -15%

        MandateMarket.Mandate memory m = market.getMandate(id);
        assertEq(m.agent, bob, "successor holds the mandate");
        assertEq(m.bond, 2 ether, "successor's bond is now at risk");
        assertEq(uint8(m.state), uint8(MandateMarket.State.Active));
        assertEq(m.strikes, 0, "successor starts clean");

        // Alice keeps the residual of her bond; only the slash is forfeit.
        assertEq(market.withdrawable(alice), 0.75 ether);
        _assertSolvent(1, _parties());
    }

    function test_ThreeConsecutiveFailuresDismiss() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 4 ether, 300);
        _awardTo(id, 0);

        _settle(id, -400);
        _settle(id, -400);
        assertEq(market.getMandate(id).agent, alice, "still holding after two");

        _settle(id, -400);
        assertEq(market.getMandate(id).agent, address(0), "dismissed on the third");
        _assertSolvent(1, _parties());
    }

    function test_PositiveEpochResetsStrikes() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 4 ether, 300);
        _awardTo(id, 0);

        _settle(id, -400);
        _settle(id, -400);
        _settle(id, 300); // recovery
        assertEq(market.getMandate(id).strikes, 0);
        _settle(id, -400);
        assertEq(market.getMandate(id).agent, alice, "one strike, not three");
        _assertSolvent(1, _parties());
    }

    function test_NoSuccessorLeavesMandateOpen() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        _awardTo(id, 0);

        vm.warp(block.timestamp + EPOCH);
        vm.prank(adjudicator);
        market.settleEpoch(id, -2_000, _obs(uint96(uint256(OPEN_VALUE) * 8_000 / 10_000)));

        MandateMarket.Mandate memory m = market.getMandate(id);
        assertEq(m.agent, address(0));
        assertEq(uint8(m.state), uint8(MandateMarket.State.Open), "reopened for bidding");
        _assertSolvent(1, _parties());
    }

    // ----------------------------------------------------- slash disputes --

    function test_UncontestedSlashClaimableAfterWindow() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        _awardTo(id, 0);
        _settle(id, -500);

        vm.expectRevert(MandateMarket.WindowOpen.selector);
        market.claimSlash(id, 0);

        vm.warp(block.timestamp + 25 hours);
        market.claimSlash(id, 0);
        assertEq(market.withdrawable(principal), 0.25 ether);
        _assertSolvent(1, _parties());
    }

    function test_ContestedSlashCannotBeClaimedAndOwnerResolves() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        _awardTo(id, 0);
        _settle(id, -500);

        vm.prank(alice);
        market.contestSlash(id, 0);

        vm.warp(block.timestamp + 25 hours);
        vm.expectRevert(MandateMarket.AlreadyResolved.selector);
        market.claimSlash(id, 0);

        // Overturned: the bond comes back to the agent.
        market.resolveSlash(id, 0, false);
        assertEq(market.withdrawable(alice), 0.25 ether);
        _assertSolvent(1, _parties());
    }

    function test_OnlySlashedAgentMayContest() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        _awardTo(id, 0);
        _settle(id, -500);

        vm.prank(bob);
        vm.expectRevert(MandateMarket.NotBidder.selector);
        market.contestSlash(id, 0);
    }

    // ------------------------------------------------------ access control --

    function test_OnlyAdjudicatorSettles() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        _awardTo(id, 0);

        vm.warp(block.timestamp + EPOCH);
        vm.prank(alice);
        vm.expectRevert(MandateMarket.NotAdjudicator.selector);
        market.settleEpoch(id, 5_000, _obs(uint96(uint256(OPEN_VALUE) * 15_000 / 10_000))); // an agent cannot pay itself
    }

    function test_OnlyPrincipalAwards() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        vm.prank(alice);
        vm.expectRevert(MandateMarket.NotPrincipal.selector);
        market.award(id, 0, _obs(OPEN_VALUE));
    }

    function test_AdjudicatorCannotDrainToItself() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        _awardTo(id, 0);
        _settle(id, 5_000); // maximum flattery
        assertEq(market.withdrawable(adjudicator), 0, "adjudicator earns nothing, ever");
        _assertSolvent(1, _parties());
    }

    function test_AlphaIsBounded() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        _awardTo(id, 0);

        vm.warp(block.timestamp + EPOCH);
        vm.prank(adjudicator);
        vm.expectRevert(MandateMarket.BadParameters.selector);
        market.settleEpoch(id, 200_000, _obs(OPEN_VALUE));
    }

    function test_EpochCannotBeSettledEarly() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        _awardTo(id, 0);

        vm.prank(adjudicator);
        vm.expectRevert(MandateMarket.EpochNotElapsed.selector);
        market.settleEpoch(id, 100, _obs(OPEN_VALUE));
    }

    // ----------------------------------------------------------- bids --

    function test_IncumbentCannotWithdrawItsBond() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        _awardTo(id, 0);

        vm.prank(alice);
        vm.expectRevert(MandateMarket.BidSpent.selector);
        market.withdrawBid(id, 0);
    }

    function test_LosingBidderMayWithdraw() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        _bid(id, bob, 2 ether, 100);
        _awardTo(id, 0);

        vm.prank(bob);
        market.withdrawBid(id, 1);
        assertEq(market.withdrawable(bob), 2 ether);
        assertEq(market.successor(id), address(0), "queue is empty once withdrawn");
        _assertSolvent(1, _parties());
    }

    function test_BondBelowMinimumRejected() public {
        uint256 id = _open(10 ether);
        vm.prank(alice);
        vm.expectRevert(MandateMarket.BondTooSmall.selector);
        market.bid{value: 0.001 ether}(id, 300);
    }

    // --------------------------------------------------------- settlement --

    function test_CloseReturnsCapitalAndReleasesBond() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        _bid(id, carol, 1 ether, 100);
        _awardTo(id, 0);

        for (uint256 i = 0; i < EPOCHS; i++) _settle(id, 0);

        market.closeMandate(id);
        assertEq(market.withdrawable(principal), 10 ether, "capital home");
        assertEq(market.withdrawable(alice), 1 ether, "bond released");
        assertEq(market.withdrawable(carol), 1 ether, "queued bond released");
        _assertSolvent(1, _parties());
    }

    function test_WithdrawIsPullAndClearsBalance() public {
        uint256 id = _open(1 ether);
        vm.prank(principal);
        market.closeMandate(id); // abandoned, never awarded

        uint256 before = principal.balance;
        vm.prank(principal);
        market.withdraw();
        assertEq(principal.balance, before + 1 ether);
        assertEq(market.withdrawable(principal), 0);

        vm.prank(principal);
        vm.expectRevert(MandateMarket.NothingToWithdraw.selector);
        market.withdraw();
    }

    // -------------------------------------------------- attestations --

    function test_AwardRequiresAnOpeningObservation() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        vm.prank(principal);
        vm.expectRevert(MandateMarket.StaleObservation.selector);
        market.award(id, 0, _obs(0)); // a zero valuation is not an opening balance
    }

    function test_OpeningObservationIsCommitted() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        _awardTo(id, 0);

        (bytes32 h, uint96 v, uint64 blk,) = market.openAttestation(id);
        assertEq(v, OPEN_VALUE);
        assertEq(blk, uint64(block.number));
        assertEq(h, market.hashObservation(_obs(OPEN_VALUE)), "hash is reproducible from the preimage");
    }

    /// @notice The adjudicator cannot report an alpha its own measurements deny.
    function test_AlphaMustAgreeWithTheObservations() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        _awardTo(id, 0);

        vm.warp(block.timestamp + EPOCH);
        vm.roll(block.number + 1);
        vm.prank(adjudicator);
        // Claims +5% while measuring a wallet that did not move.
        vm.expectRevert(MandateMarket.AlphaContradictsObservation.selector);
        market.settleEpoch(id, 500, _obs(OPEN_VALUE));
    }

    function test_AlphaBelowTotalLossIsUnreachable() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        _awardTo(id, 0);

        vm.warp(block.timestamp + EPOCH);
        vm.roll(block.number + 1);
        vm.prank(adjudicator);
        // -150% cannot be produced by any pair of non-negative valuations.
        vm.expectRevert(MandateMarket.AlphaContradictsObservation.selector);
        market.settleEpoch(id, -15_000, _obs(1));
    }

    function test_ObservationsMustMoveForwardInBlockHeight() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        vm.roll(block.number + 50);
        _awardTo(id, 0);

        vm.warp(block.timestamp + EPOCH);
        MandateMarket.Observation memory stale = _obs(OPEN_VALUE);
        stale.blockNumber = uint64(block.number - 40); // before the opening mark
        vm.prank(adjudicator);
        vm.expectRevert(MandateMarket.StaleObservation.selector);
        market.settleEpoch(id, 0, stale);
    }

    function test_EpochObservationIsStoredAndChains() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 4 ether, 300);
        _awardTo(id, 0);

        _settle(id, 500);
        (, uint96 v0,,) = market.epochAttestation(id, 0);
        assertEq(v0, uint96(uint256(OPEN_VALUE) * 10_500 / 10_000));

        // The next epoch is measured against the previous mark, not the open.
        _settle(id, -300);
        (, uint96 v1,,) = market.epochAttestation(id, 1);
        assertEq(v1, uint96(uint256(v0) * 9_700 / 10_000));
    }

    // ---------------------------------------------------- the assay gate --

    function test_GateIsOffByDefault() public {
        assertEq(market.minFineness(), 0);
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300); // never assayed, still admitted
        assertEq(market.bidCount(id), 1);
    }

    function test_UnassayedAgentCannotBidOnceGateIsOn() public {
        market.setMinFineness(375);
        uint256 id = _open(10 ether);
        vm.prank(alice);
        vm.expectRevert(MandateMarket.NotAssayed.selector);
        market.bid{value: 1 ether}(id, 300);
    }

    function test_BaseMetalAgentIsBarred() public {
        market.setMinFineness(375);
        vm.prank(adjudicator);
        market.publishAssay(alice, 133); // the BORT case: never transacted

        uint256 id = _open(10 ether);
        vm.prank(alice);
        vm.expectRevert(MandateMarket.BelowFineness.selector);
        market.bid{value: 1 ether}(id, 300);
    }

    function test_HallmarkedAgentMayBid() public {
        market.setMinFineness(375);
        vm.prank(adjudicator);
        market.publishAssay(alice, 585);

        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        assertEq(market.bidCount(id), 1);
        assertEq(market.fineness(alice), 585);
        assertGt(market.assayedAt(alice), 0);
    }

    function test_StandingCanBeRevoked() public {
        market.setMinFineness(375);
        vm.prank(adjudicator);
        market.publishAssay(alice, 585);
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);

        // Its endpoint dies; the next sweep demotes it.
        vm.prank(adjudicator);
        market.publishAssay(alice, 120);

        uint256 other = _open(5 ether);
        vm.prank(alice);
        vm.expectRevert(MandateMarket.BelowFineness.selector);
        market.bid{value: 1 ether}(other, 300);
    }

    function test_OnlyAdjudicatorPublishesAssays() public {
        vm.prank(alice);
        vm.expectRevert(MandateMarket.NotAdjudicator.selector);
        market.publishAssay(alice, 999); // an agent cannot grade itself
    }

    function test_FinenessIsBounded() public {
        vm.prank(adjudicator);
        vm.expectRevert(MandateMarket.BadParameters.selector);
        market.publishAssay(alice, 1001);
    }

    function test_BatchPublishRequiresMatchingLengths() public {
        address[] memory agents = new address[](2);
        uint16[] memory values = new uint16[](1);
        agents[0] = alice;
        agents[1] = bob;
        values[0] = 500;
        vm.prank(adjudicator);
        vm.expectRevert(MandateMarket.BadParameters.selector);
        market.publishAssays(agents, values);
    }

    function test_BatchPublishAdmitsSeveral() public {
        address[] memory agents = new address[](2);
        uint16[] memory values = new uint16[](2);
        agents[0] = alice;
        agents[1] = bob;
        values[0] = 585;
        values[1] = 750;
        vm.prank(adjudicator);
        market.publishAssays(agents, values);

        market.setMinFineness(375);
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether, 300);
        _bid(id, bob, 1 ether, 200);
        assertEq(market.bidCount(id), 2);
    }

    function test_AdjudicatorStillCannotMoveCapitalViaAssays() public {
        vm.prank(adjudicator);
        market.publishAssay(adjudicator, 1000);
        assertEq(market.withdrawable(adjudicator), 0);
    }

    // --------------------------------------------------------------- fuzz --

    /// @notice Solvency must hold for any sequence of reported alpha.
    function testFuzz_SolventUnderAnyAlphaSequence(int256 a1, int256 a2, int256 a3) public {
        // Alpha is now a ratio of two non-negative valuations, so it cannot go
        // below -10,000 bps: a wallet cannot lose more than everything. The
        // contract's +/-100,000 bound is the outer guard against overflow; the
        // consistency check is what enforces what is physically reachable.
        int256 floorBps = -9_000;
        a1 = bound(a1, floorBps, market.MAX_ALPHA_BPS());
        a2 = bound(a2, floorBps, market.MAX_ALPHA_BPS());
        a3 = bound(a3, floorBps, market.MAX_ALPHA_BPS());

        uint256 id = _open(10 ether);
        _bid(id, alice, 2 ether, 300);
        _bid(id, bob, 2 ether, 200);
        _awardTo(id, 0);

        int256[3] memory alphas = [a1, a2, a3];
        for (uint256 i = 0; i < 3; i++) {
            MandateMarket.Mandate memory m = market.getMandate(id);
            if (m.state != MandateMarket.State.Active) break;
            if (m.epochsSettled >= m.epochsTotal) break;
            _settle(id, alphas[i]);
            _assertSolvent(1, _parties());
        }
        _assertSolvent(1, _parties());
    }

    // -------------------------------------------------- minBond as an argument --

    function test_ConstructorSetsMinBond() public {
        MandateMarket m = new MandateMarket(adjudicator, 0.05 ether);
        assertEq(m.minBond(), 0.05 ether);
    }

    /// @dev A costless bid defeats the entire mechanism, so zero is rejected
    ///      at deployment rather than left to be discovered by a free bid.
    function test_ConstructorRejectsZeroMinBond() public {
        vm.expectRevert(MandateMarket.BondTooSmall.selector);
        new MandateMarket(adjudicator, 0);
    }

    function test_SetMinBondRejectsZero() public {
        vm.expectRevert(MandateMarket.BondTooSmall.selector);
        market.setMinBond(0);
    }

    /// @dev Both setters used to change state silently. A watcher cannot see a
    ///      bidding floor move by polling nothing.
    function test_MinBondChangeIsObservable() public {
        vm.expectEmit(false, false, false, true);
        emit MandateMarket.MinBondChanged(MIN_BOND, 0.02 ether);
        market.setMinBond(0.02 ether);
        assertEq(market.minBond(), 0.02 ether);
    }

    function test_ChallengeWindowChangeIsObservable() public {
        uint64 previous = market.challengeWindow();
        vm.expectEmit(false, false, false, true);
        emit MandateMarket.ChallengeWindowChanged(previous, 1 hours);
        market.setChallengeWindow(1 hours);
        assertEq(market.challengeWindow(), 1 hours);
    }
}
