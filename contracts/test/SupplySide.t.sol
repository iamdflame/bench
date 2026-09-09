// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ShadowLedger} from "../src/ShadowLedger.sol";
import {Underwriter} from "../src/Underwriter.sol";
import {MandateMarketV2} from "../src/MandateMarketV2.sol";

contract ShadowLedgerTest is Test {
    ShadowLedger internal ledger;
    address internal adjudicator = makeAddr("adjudicator");
    address internal agent = makeAddr("agent");
    address internal wallet = makeAddr("wallet");
    uint32 internal constant EPOCH = 1 hours;
    uint96 internal constant BASE = 10 ether;

    function setUp() public {
        ledger = new ShadowLedger(adjudicator);
    }

    function _obs(uint96 v, uint96 b) internal view returns (ShadowLedger.Observation memory) {
        return ShadowLedger.Observation({
            wallet: wallet,
            valuationWei: v,
            gasSpentWei: 0,
            priceX96: 1,
            blockNumber: uint64(block.number),
            breakdownRef: bytes32(0),
            benchmarkWei: b
        });
    }

    function _open() internal returns (uint256 id) {
        vm.prank(agent);
        id = ledger.open(
            wallet, ShadowLedger.Category.GridTrading, ShadowLedger.Benchmark.Hold, EPOCH, _obs(BASE, BASE)
        );
    }

    function test_AnyoneMayAskToBeMeasured() public {
        // A curated list is the thing this product objects to, so opening a
        // shadow record is permissionless.
        uint256 id = _open();
        assertEq(ledger.getShadow(id).agent, agent);
        assertEq(ledger.shadowsOf(agent).length, 1);
    }

    function test_RecordsAccumulateWithoutAnyCapital() public {
        uint256 id = _open();
        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(adjudicator);
        ledger.record(id, 1_000, _obs(11 ether, BASE)); // +10%

        ShadowLedger.Shadow memory s = ledger.getShadow(id);
        assertEq(s.epochsRecorded, 1);
        assertEq(s.cumulativeAlphaBps, 1_000);
        assertEq(address(ledger).balance, 0, "a shadow ledger should never hold value");
    }

    function test_ContradictedAlphaIsRejectedJustAsInTheMarket() public {
        uint256 id = _open();
        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(adjudicator);
        // A record that could be written loosely would be worth what the
        // registry reputation is worth, which is nothing.
        vm.expectRevert(ShadowLedger.AlphaContradictsObservation.selector);
        ledger.record(id, 5_000, _obs(11 ether, BASE));
    }

    function test_LossesAreCountedNotHidden() public {
        uint256 id = _open();
        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(adjudicator);
        ledger.record(id, -500, _obs(uint96(BASE * 95 / 100), BASE));
        assertEq(ledger.getShadow(id).negativeEpochs, 1, "a losing epoch went unrecorded");
    }

    function test_OnlyTheAgentMayStop() public {
        uint256 id = _open();
        vm.prank(adjudicator);
        vm.expectRevert(ShadowLedger.NotAgent.selector);
        ledger.close(id);
        vm.prank(agent);
        ledger.close(id);
        assertTrue(ledger.getShadow(id).closed);
    }

    function test_RecordingBeforeTheEpochElapsesIsRefused() public {
        uint256 id = _open();
        vm.prank(adjudicator);
        vm.expectRevert(ShadowLedger.EpochNotElapsed.selector);
        ledger.record(id, 0, _obs(BASE, BASE));
    }
}

contract UnderwriterTest is Test {
    Underwriter internal under;
    MandateMarketV2 internal market;

    address internal adjudicator = makeAddr("adjudicator");
    address internal principal = makeAddr("principal");
    address internal operator = makeAddr("operator");
    address internal agent = makeAddr("agent");
    address internal backerA = makeAddr("backerA");
    address internal backerB = makeAddr("backerB");

    uint96 internal constant MIN_BOND = 0.01 ether;
    uint96 internal constant STAKE = 0.05 ether;
    uint64 internal constant WINDOW = 10 minutes;
    uint32 internal constant EPOCH = 1 hours;

    function setUp() public {
        market = new MandateMarketV2(adjudicator, MIN_BOND, STAKE, WINDOW);
        under = new Underwriter();
        vm.deal(principal, 100 ether);
        vm.deal(operator, 10 ether);
        vm.deal(backerA, 10 ether);
        vm.deal(backerB, 10 ether);
        vm.deal(adjudicator, 10 ether);
    }

    function _pool() internal returns (uint256 id) {
        vm.prank(operator);
        id = under.openPool(agent, address(market), 2_000); // 20% to the operator
    }

    function _openMandate() internal returns (uint256 id) {
        vm.prank(principal);
        id = market.openMandate{value: 10 ether}(
            MandateMarketV2.Category.GridTrading,
            address(0),
            0,
            MandateMarketV2.Benchmark.Hold,
            200,
            2_000,
            2_500,
            EPOCH,
            10,
            3,
            -1_000,
            0
        );
    }

    function test_BackersFundAnAgentThatCouldNotBondItself() public {
        uint256 pool = _pool();
        vm.prank(backerA);
        under.back{value: 3 ether}(pool);
        vm.prank(backerB);
        under.back{value: 1 ether}(pool);

        assertEq(under.getPool(pool).deposited, 4 ether);
        assertEq(under.stakeOf(pool, backerA), 3 ether);
        // The agent itself put in nothing. That is the entire point.
        assertEq(under.stakeOf(pool, agent), 0);
    }

    function test_ThePoolIsWhatTheMarketSeesAsTheBidder() public {
        uint256 pool = _pool();
        vm.prank(backerA);
        under.back{value: 3 ether}(pool);
        uint256 mandate = _openMandate();

        vm.prank(operator);
        under.commit(pool, mandate, 200, 1 ether, 0);

        MandateMarketV2.Bid[] memory bids = market.getBids(mandate);
        assertEq(bids.length, 1);
        // The market slashes this contract, not the agent — which is what
        // makes a backer's willingness to fund it informative.
        assertEq(bids[0].agent, address(under), "the pool is not the bidder");
        assertEq(bids[0].bond, 1 ether);
    }

    function test_OnlyTheOperatorMayCommitCapital() public {
        uint256 pool = _pool();
        vm.prank(backerA);
        under.back{value: 3 ether}(pool);
        uint256 mandate = _openMandate();
        vm.prank(backerA);
        vm.expectRevert(Underwriter.NotOperator.selector);
        under.commit(pool, mandate, 200, 1 ether, 0);
    }

    function test_CannotCommitMoreThanIsFree() public {
        uint256 pool = _pool();
        vm.prank(backerA);
        under.back{value: 1 ether}(pool);
        uint256 mandate = _openMandate();
        vm.prank(operator);
        vm.expectRevert(Underwriter.InsufficientFree.selector);
        under.commit(pool, mandate, 200, 2 ether, 0);
    }

    function test_ReturnsSplitProRataAfterTheOperatorsCut() public {
        uint256 pool = _pool();
        vm.prank(backerA);
        under.back{value: 3 ether}(pool); // 75%
        vm.prank(backerB);
        under.back{value: 1 ether}(pool); // 25%
        uint256 mandate = _openMandate();

        vm.prank(operator);
        under.commit(pool, mandate, 200, 1 ether, 0);

        // The mandate never starts; the bid lapses and the bond comes back.
        vm.warp(block.timestamp + EPOCH * 11);
        under.releaseBid(mandate, 0, address(market));
        under.collect(pool);

        assertEq(under.getPool(pool).returned, 1 ether, "capital did not come back");

        // 20% to the operator, 80% split 3:1.
        uint256 aBefore = backerA.balance;
        vm.prank(backerA);
        under.claim(pool);
        assertApproxEqAbs(backerA.balance - aBefore, 0.6 ether, 1e9, "backer A's share is wrong");

        uint256 opBefore = operator.balance;
        vm.prank(operator);
        under.claimOperator(pool);
        assertApproxEqAbs(operator.balance - opBefore, 0.2 ether, 1e9, "operator's cut is wrong");
    }

    function test_OperatorCutIsCapped() public {
        vm.prank(operator);
        vm.expectRevert(Underwriter.BadParameters.selector);
        under.openPool(agent, address(market), 5_001);
    }

    function test_ClaimingTwiceYieldsNothing() public {
        uint256 pool = _pool();
        vm.prank(backerA);
        under.back{value: 1 ether}(pool);
        uint256 mandate = _openMandate();
        vm.prank(operator);
        under.commit(pool, mandate, 200, 1 ether, 0);
        vm.warp(block.timestamp + EPOCH * 11);
        under.releaseBid(mandate, 0, address(market));
        under.collect(pool);

        vm.prank(backerA);
        under.claim(pool);
        vm.prank(backerA);
        vm.expectRevert(Underwriter.NothingToClaim.selector);
        under.claim(pool);
    }
}
