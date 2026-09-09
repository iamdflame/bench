// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {MandateMarketV2} from "../src/MandateMarketV2.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

/// @dev A minimal BEP-20, so token mandates are exercised rather than assumed.
contract MockToken is IERC20 {
    string public name = "Mock";
    string public symbol = "MOCK";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}

contract MandateMarketV2Test is Test {
    MandateMarketV2 internal market;
    MockToken internal token;

    address internal adjudicator = makeAddr("adjudicator");
    address internal principal = makeAddr("principal");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");
    address internal watcher = makeAddr("watcher");

    uint32 internal constant EPOCH = 1 hours;
    uint32 internal constant EPOCHS = 10;
    uint16 internal constant TOLERANCE = 200;
    uint16 internal constant FEE = 2_000;
    uint16 internal constant SLASH = 2_500;
    uint96 internal constant MIN_BOND = 0.01 ether;
    uint96 internal constant STAKE = 0.05 ether;
    uint64 internal constant WINDOW = 10 minutes;
    uint96 internal constant OPEN_VALUE = 10 ether;
    uint32 internal constant STRIKES = 3;
    int32 internal constant CATASTROPHIC = -1_000;

    function setUp() public {
        market = new MandateMarketV2(adjudicator, MIN_BOND, STAKE, WINDOW);
        token = new MockToken();
        for (uint256 i = 0; i < 5; i++) {
            address a = [principal, alice, bob, carol, watcher][i];
            vm.deal(a, 100 ether);
            token.mint(a, 100 ether);
        }
        vm.deal(adjudicator, 100 ether);
    }

    // ------------------------------------------------------------ helpers --

    function _open(uint256 capital) internal returns (uint256 id) {
        return _open(capital, MandateMarketV2.Benchmark.Hold);
    }

    function _open(uint256 capital, MandateMarketV2.Benchmark b) internal returns (uint256 id) {
        vm.prank(principal);
        id = market.openMandate{value: capital}(
            MandateMarketV2.Category.Rebalancing,
            address(0),
            0,
            b,
            TOLERANCE,
            FEE,
            SLASH,
            EPOCH,
            EPOCHS,
            STRIKES,
            CATASTROPHIC,
            0 // no proportional bond floor; the absolute minBond alone
        );
    }

    function _openToken(uint256 capital) internal returns (uint256 id) {
        vm.startPrank(principal);
        token.approve(address(market), type(uint256).max);
        id = market.openMandate(
            MandateMarketV2.Category.YieldOptimisation,
            address(token),
            capital,
            MandateMarketV2.Benchmark.Hold,
            TOLERANCE,
            FEE,
            SLASH,
            EPOCH,
            EPOCHS,
            STRIKES,
            CATASTROPHIC,
            0 // no proportional bond floor; the absolute minBond alone
        );
        vm.stopPrank();
    }

    function _bid(uint256 id, address agent, uint256 bond) internal returns (uint256) {
        vm.prank(agent);
        return market.bid{value: bond}(id, 200, 0, 0);
    }

    function _bidToken(uint256 id, address agent, uint256 bond) internal returns (uint256) {
        vm.startPrank(agent);
        token.approve(address(market), type(uint256).max);
        uint256 i = market.bid(id, 200, bond, 0);
        vm.stopPrank();
        return i;
    }

    function _obs(uint96 value, uint96 bench) internal view returns (MandateMarketV2.Observation memory) {
        return MandateMarketV2.Observation({
            wallet: alice,
            valuationWei: value,
            gasSpentWei: 0,
            priceX96: 1,
            blockNumber: uint64(block.number),
            breakdownRef: bytes32(0),
            benchmarkWei: bench
        });
    }

    function _award(uint256 id, uint256 bidIndex) internal {
        vm.prank(principal);
        market.award(id, bidIndex, _obs(OPEN_VALUE, OPEN_VALUE));
    }

    /// @dev Proposes, waits out the window, finalises. The ordinary path.
    function _settle(uint256 id, uint96 value, uint96 bench) internal {
        MandateMarketV2.Mandate memory m = market.getMandate(id);
        uint32 epoch = m.epochsSettled;
        MandateMarketV2.Attestation memory prev =
            epoch == 0 ? _openAtt(id) : _epochAtt(id, epoch - 1);

        int256 agentR = (int256(uint256(value)) * 10_000) / int256(uint256(prev.valuationWei)) - 10_000;
        int256 benchR = (int256(uint256(bench)) * 10_000) / int256(uint256(prev.benchmarkWei)) - 10_000;

        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(adjudicator);
        market.proposeEpoch{value: STAKE}(id, agentR - benchR, _obs(value, bench));
        vm.warp(block.timestamp + WINDOW + 1);
        market.finaliseEpoch(id, epoch);
    }

    function _openAtt(uint256 id) internal view returns (MandateMarketV2.Attestation memory a) {
        (bytes32 h, uint96 v, uint64 b, uint64 t, uint96 bw) = market.openAttestation(id);
        a = MandateMarketV2.Attestation(h, v, b, t, bw);
    }

    function _epochAtt(uint256 id, uint32 e) internal view returns (MandateMarketV2.Attestation memory a) {
        (bytes32 h, uint96 v, uint64 b, uint64 t, uint96 bw) = market.epochAttestation(id, e);
        a = MandateMarketV2.Attestation(h, v, b, t, bw);
    }

    // ------------------------------------------ optimistic settlement (R1.3) --

    function test_ProposalDoesNotMoveValueUntilFinalised() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether);
        _award(id, 0);

        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(adjudicator);
        market.proposeEpoch{value: STAKE}(id, 1_000, _obs(11 ether, OPEN_VALUE));

        // Nothing has happened yet: no fee, no epoch counted.
        MandateMarketV2.Mandate memory m = market.getMandate(id);
        assertEq(m.epochsSettled, 0, "epoch counted before finality");
        assertEq(market.withdrawable(address(0), alice), 0, "fee paid before finality");
        assertEq(m.capital, 10 ether, "capital touched before finality");
    }

    function test_UnchallengedProposalFinalisesAndReturnsStake() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether);
        _award(id, 0);

        uint256 before = market.withdrawable(address(0), adjudicator);
        _settle(id, 11 ether, OPEN_VALUE); // +10%

        MandateMarketV2.Mandate memory m = market.getMandate(id);
        assertEq(m.epochsSettled, 1);
        assertGt(market.withdrawable(address(0), alice), 0, "agent earned no fee");
        assertEq(
            market.withdrawable(address(0), adjudicator) - before, STAKE, "stake not returned"
        );
    }

    function test_ProposalWithoutStakeIsRefused() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether);
        _award(id, 0);
        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(adjudicator);
        vm.expectRevert(MandateMarketV2.StakeTooSmall.selector);
        market.proposeEpoch{value: STAKE - 1}(id, 1_000, _obs(11 ether, OPEN_VALUE));
    }

    function test_FinalisingEarlyIsRefused() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether);
        _award(id, 0);
        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(adjudicator);
        market.proposeEpoch{value: STAKE}(id, 1_000, _obs(11 ether, OPEN_VALUE));
        vm.expectRevert(MandateMarketV2.WindowOpen.selector);
        market.finaliseEpoch(id, 0);
    }

    function test_AnyoneMayFinalise() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether);
        _award(id, 0);
        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(adjudicator);
        market.proposeEpoch{value: STAKE}(id, 1_000, _obs(11 ether, OPEN_VALUE));
        vm.warp(block.timestamp + WINDOW + 1);
        // A settlement only the proposer can complete is one it can withhold.
        vm.prank(carol);
        market.finaliseEpoch(id, 0);
        assertEq(market.getMandate(id).epochsSettled, 1);
    }

    function test_ChallengeFreezesTheEpoch() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether);
        _award(id, 0);
        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(adjudicator);
        market.proposeEpoch{value: STAKE}(id, 1_000, _obs(11 ether, OPEN_VALUE));

        vm.prank(watcher);
        market.challengeEpoch{value: STAKE}(id, 0, _obs(9 ether, OPEN_VALUE));

        vm.warp(block.timestamp + WINDOW + 1);
        vm.expectRevert(MandateMarketV2.NotChallenged.selector);
        market.finaliseEpoch(id, 0);

        assertEq(market.getMandate(id).epochsSettled, 0, "settled while contested");
        assertEq(market.withdrawable(address(0), alice), 0, "fee paid while contested");
    }

    function test_ChallengeMustNameTheSameBlock() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether);
        _award(id, 0);
        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(adjudicator);
        market.proposeEpoch{value: STAKE}(id, 1_000, _obs(11 ether, OPEN_VALUE));

        MandateMarketV2.Observation memory other = _obs(9 ether, OPEN_VALUE);
        other.blockNumber = uint64(block.number) - 1;
        vm.prank(watcher);
        vm.expectRevert(MandateMarketV2.WrongBlock.selector);
        market.challengeEpoch{value: STAKE}(id, 0, other);
    }

    function test_AgreeingIsNotAChallenge() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether);
        _award(id, 0);
        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(adjudicator);
        market.proposeEpoch{value: STAKE}(id, 1_000, _obs(11 ether, OPEN_VALUE));
        vm.prank(watcher);
        vm.expectRevert(MandateMarketV2.SameMeasurement.selector);
        market.challengeEpoch{value: STAKE}(id, 0, _obs(11 ether, OPEN_VALUE));
    }

    function test_ChallengerMustMatchTheStake() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether);
        _award(id, 0);
        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(adjudicator);
        market.proposeEpoch{value: STAKE}(id, 1_000, _obs(11 ether, OPEN_VALUE));
        vm.prank(watcher);
        vm.expectRevert(MandateMarketV2.StakeTooSmall.selector);
        market.challengeEpoch{value: STAKE - 1}(id, 0, _obs(9 ether, OPEN_VALUE));
    }

    function test_ChallengerWinsAndTakesThePot() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether);
        _award(id, 0);
        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(adjudicator);
        market.proposeEpoch{value: STAKE}(id, 1_000, _obs(11 ether, OPEN_VALUE));
        vm.prank(watcher);
        market.challengeEpoch{value: STAKE}(id, 0, _obs(9 ether, OPEN_VALUE));

        // The challenger's measurement stands: -10% rather than +10%.
        market.resolveChallenge(id, 0, false, -1_000);

        assertEq(market.withdrawable(address(0), watcher), STAKE * 2, "pot not paid to the winner");
        assertEq(market.withdrawable(address(0), adjudicator), 0, "loser kept its stake");
        // And the record now carries the challenger's number.
        assertEq(_epochAtt(id, 0).valuationWei, 9 ether, "record not corrected");
    }

    function test_ProposerUpheldKeepsBothStakes() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether);
        _award(id, 0);
        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(adjudicator);
        market.proposeEpoch{value: STAKE}(id, 1_000, _obs(11 ether, OPEN_VALUE));
        vm.prank(watcher);
        market.challengeEpoch{value: STAKE}(id, 0, _obs(9 ether, OPEN_VALUE));

        market.resolveChallenge(id, 0, true, 0);
        assertEq(market.withdrawable(address(0), adjudicator), STAKE * 2);
        assertEq(market.withdrawable(address(0), watcher), 0);
        assertEq(market.getMandate(id).epochsSettled, 1, "not settled after resolution");
    }

    // ------------------------------------------- per-category benchmarks --

    function test_HoldBenchmarkReducesToTheV1Ratio() public {
        uint256 id = _open(10 ether, MandateMarketV2.Benchmark.Hold);
        _bid(id, alice, 1 ether);
        _award(id, 0);
        _settle(id, 11 ether, OPEN_VALUE); // benchmark unchanged
        assertEq(market.getMandate(id).cumulativeAlphaBps, 1_000, "hold alpha is not the raw return");
    }

    /**
     * The whole point of a per-category benchmark: an agent that made money
     * while the benchmark made more has negative alpha, and a hold benchmark
     * would have called it a win.
     */
    function test_BeatenByTheBenchmarkIsNegativeAlpha() public {
        uint256 id = _open(10 ether, MandateMarketV2.Benchmark.BestPassiveRate);
        _bid(id, alice, 1 ether);
        _award(id, 0);

        // Agent +3%, the passive rate +5%.
        _settle(id, uint96(OPEN_VALUE * 103 / 100), uint96(OPEN_VALUE * 105 / 100));
        assertEq(market.getMandate(id).cumulativeAlphaBps, -200, "earning less than the benchmark read as a win");
    }

    function test_AlphaContradictingTheMeasurementsIsRefused() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether);
        _award(id, 0);
        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(adjudicator);
        vm.expectRevert(MandateMarketV2.AlphaContradictsObservation.selector);
        market.proposeEpoch{value: STAKE}(id, 5_000, _obs(11 ether, OPEN_VALUE)); // claims +50%, marks say +10%
    }

    // --------------------------------------------------- BEP-20 mandates --

    function test_TokenMandateEscrowsAndReturnsTheToken() public {
        uint256 id = _openToken(10 ether);
        assertEq(token.balanceOf(address(market)), 10 ether, "capital not escrowed");

        _bidToken(id, alice, 1 ether);
        assertEq(token.balanceOf(address(market)), 11 ether, "bond not escrowed");

        vm.prank(principal);
        market.award(id, 0, _obs(OPEN_VALUE, OPEN_VALUE));
        _settle(id, 11 ether, OPEN_VALUE);

        // The fee is paid in the mandate's asset, not in BNB.
        assertGt(market.withdrawable(address(token), alice), 0, "agent paid in the wrong asset");
        assertEq(market.withdrawable(address(0), alice), 0, "agent paid in BNB");

        uint256 before = token.balanceOf(alice);
        vm.prank(alice);
        market.withdraw(address(token));
        assertGt(token.balanceOf(alice) - before, 0, "token never left the contract");
    }

    function test_NativeValueOnATokenMandateIsRefused() public {
        uint256 id = _openToken(10 ether);
        vm.prank(alice);
        vm.expectRevert(MandateMarketV2.WrongAsset.selector);
        market.bid{value: 1 ether}(id, 200, 1 ether, 0);
    }

    // ------------------------------------------------ per-mandate risk --

    function test_StrikeCountIsThePrincipalsToSet() public {
        vm.prank(principal);
        uint256 id = market.openMandate{value: 10 ether}(
            MandateMarketV2.Category.GridTrading,
            address(0),
            0,
            MandateMarketV2.Benchmark.Hold,
            TOLERANCE,
            FEE,
            SLASH,
            EPOCH,
            EPOCHS,
            1, // one strike and you are out
            CATASTROPHIC,
            0
        );
        _bid(id, alice, 1 ether);
        _award(id, 0);

        // A single failing epoch, well short of catastrophic.
        _settle(id, uint96(OPEN_VALUE * 95 / 100), OPEN_VALUE); // -5%
        assertEq(market.getMandate(id).agent, address(0), "one strike did not dismiss");
    }

    function test_CatastrophicThresholdIsPerMandate() public {
        vm.prank(principal);
        uint256 id = market.openMandate{value: 10 ether}(
            MandateMarketV2.Category.GridTrading,
            address(0),
            0,
            MandateMarketV2.Benchmark.Hold,
            TOLERANCE,
            FEE,
            SLASH,
            EPOCH,
            EPOCHS,
            STRIKES,
            -300, // -3% is catastrophic here
            0
        );
        _bid(id, alice, 1 ether);
        _award(id, 0);
        _settle(id, uint96(OPEN_VALUE * 96 / 100), OPEN_VALUE); // -4%
        assertEq(market.getMandate(id).agent, address(0), "per-mandate threshold ignored");
    }

    // ------------------------------------------------------ protocol fee --

    function test_ProtocolTakesItsCutOfTheAgentsFee() public {
        market.setProtocolFeeBps(500); // 5% of the agent's fee — the ceiling
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether);
        _award(id, 0);
        _settle(id, 11 ether, OPEN_VALUE);

        uint256 agentFee = market.withdrawable(address(0), alice);
        uint256 protocol = market.protocolBalance(address(0));
        assertGt(protocol, 0, "protocol earned nothing");
        // 5% to the protocol, 95% to the agent.
        assertApproxEqAbs(protocol * 19, agentFee, 20, "split is wrong");
    }

    function test_ProtocolFeeIsCapped() public {
        // Read the ceiling first: expectRevert attaches to the *next* call, and
        // inlining the getter made that the getter rather than the setter.
        uint16 ceiling = market.MAX_PROTOCOL_FEE_BPS();
        vm.expectRevert(MandateMarketV2.BadParameters.selector);
        market.setProtocolFeeBps(ceiling + 1);
    }

    // ------------------------------------------------------- pause guard --

    function test_PauseStopsValueMovingButNotWithdrawals() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether);
        _award(id, 0);
        _settle(id, 11 ether, OPEN_VALUE);

        market.setPaused(true);

        vm.prank(principal);
        vm.expectRevert(MandateMarketV2.Paused.selector);
        market.openMandate{value: 1 ether}(
            MandateMarketV2.Category.Rebalancing, address(0), 0,
            MandateMarketV2.Benchmark.Hold, TOLERANCE, FEE, SLASH, EPOCH, EPOCHS, STRIKES, CATASTROPHIC, 0
        );

        // A halt must never trap funds already owed.
        uint256 before = alice.balance;
        vm.prank(alice);
        market.withdraw(address(0));
        assertGt(alice.balance, before, "pause trapped a withdrawal");
    }

    // -------------------------------------------------------- bid expiry --

    function test_ExpiredBidCanBeReleasedByAnyone() public {
        uint256 id = _open(10 ether);
        vm.prank(alice);
        market.bid{value: 1 ether}(id, 200, 0, 1 hours);

        vm.warp(block.timestamp + 2 hours);
        // V1 escrowed a losing bond indefinitely; a queue nobody can leave is
        // a queue nobody should join.
        vm.prank(carol);
        market.withdrawBid(id, 0);
        assertEq(market.withdrawable(address(0), alice), 1 ether, "bond not released");
    }

    function test_ExpiredBidIsNotPromotedOnDismissal() public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether);
        vm.prank(bob);
        // Shorter than one epoch, so it has certainly lapsed by the time the
        // first settlement lands.
        market.bid{value: 1 ether}(id, 200, 0, 30 minutes);
        _award(id, 0);

        // Bob's bid lapses before Alice fails.
        _settle(id, uint96(OPEN_VALUE * 80 / 100), OPEN_VALUE); // catastrophic

        MandateMarketV2.Mandate memory m = market.getMandate(id);
        assertEq(m.agent, address(0), "an expired bid was promoted");
        assertEq(uint8(m.state), uint8(MandateMarketV2.State.Open));
    }

    // ------------------------------------------------- parameter guards --

    function test_ChallengeWindowMustFitInsideAnEpoch() public {
        market.setChallengeWindow(2 hours);
        vm.prank(principal);
        vm.expectRevert(MandateMarketV2.ChallengeWindowTooLong.selector);
        market.openMandate{value: 1 ether}(
            MandateMarketV2.Category.Rebalancing, address(0), 0,
            MandateMarketV2.Benchmark.Hold, TOLERANCE, FEE, SLASH,
            1 hours, EPOCHS, STRIKES, CATASTROPHIC, 0
        );
    }

    function test_AdjudicatorHandoverNeedsAcceptance() public {
        market.nominateAdjudicator(bob);
        assertEq(market.adjudicator(), adjudicator, "role moved before acceptance");
        vm.prank(carol);
        vm.expectRevert(MandateMarketV2.NotAdjudicator.selector);
        market.acceptAdjudicator();
        vm.prank(bob);
        market.acceptAdjudicator();
        assertEq(market.adjudicator(), bob);
    }

    // -------------------------------------------------------- bond tiers --

    /**
     * A flat floor is only meaningful at one size. At $0.06 it is nothing
     * against a large mandate, and at a level meaningful there it excludes
     * every small one.
     */
    function test_BondFloorScalesWithCapital() public {
        vm.prank(principal);
        uint256 id = market.openMandate{value: 10 ether}(
            MandateMarketV2.Category.GridTrading, address(0), 0,
            MandateMarketV2.Benchmark.Hold, TOLERANCE, FEE, SLASH, EPOCH, EPOCHS,
            STRIKES, CATASTROPHIC,
            1_000 // the bond must be at least a tenth of the capital
        );
        assertEq(market.requiredBond(id), 1 ether, "floor did not scale");

        // The absolute minimum is nowhere near enough on a mandate this size.
        vm.prank(alice);
        vm.expectRevert(MandateMarketV2.BondTooSmall.selector);
        market.bid{value: MIN_BOND}(id, 200, 0, 0);

        vm.prank(alice);
        market.bid{value: 1 ether}(id, 200, 0, 0);
        assertEq(market.getBids(id)[0].bond, 1 ether);
    }

    function test_ZeroFloorKeepsTheAbsoluteMinimum() public {
        // A principal who does not care should not be forced to.
        uint256 id = _open(10 ether);
        assertEq(market.requiredBond(id), MIN_BOND, "zero floor changed the minimum");
        vm.prank(alice);
        market.bid{value: MIN_BOND}(id, 200, 0, 0);
        assertEq(market.getBids(id).length, 1);
    }

    function test_FloorNeverFallsBelowTheAbsoluteMinimum() public {
        vm.prank(principal);
        uint256 id = market.openMandate{value: 0.02 ether}(
            MandateMarketV2.Category.GridTrading, address(0), 0,
            MandateMarketV2.Benchmark.Hold, TOLERANCE, FEE, SLASH, EPOCH, EPOCHS,
            STRIKES, CATASTROPHIC,
            100 // 1% of 0.02 is 0.0002, well under minBond
        );
        assertEq(market.requiredBond(id), MIN_BOND, "the scaled floor undercut the absolute one");
    }

    function test_AFloorAboveTheCapitalIsRefused() public {
        vm.prank(principal);
        vm.expectRevert(MandateMarketV2.BadParameters.selector);
        market.openMandate{value: 1 ether}(
            MandateMarketV2.Category.GridTrading, address(0), 0,
            MandateMarketV2.Benchmark.Hold, TOLERANCE, FEE, SLASH, EPOCH, EPOCHS,
            STRIKES, CATASTROPHIC,
            10_001
        );
    }

    // ------------------------------------------------------------- fuzz --

    /**
     * Solvency, carried over from V1 and extended.
     *
     * Whatever sequence of alphas is proposed and finalised, the contract's
     * balance must cover everything it owes. Fees are charged against escrow
     * precisely so this holds.
     */
    function testFuzz_LiabilitiesNeverExceedBalance(int256[8] calldata alphas) public {
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether);
        _bid(id, bob, 1 ether);
        _award(id, 0);

        for (uint256 i = 0; i < alphas.length; i++) {
            MandateMarketV2.Mandate memory m = market.getMandate(id);
            if (m.state != MandateMarketV2.State.Active) break;
            if (m.epochsSettled >= m.epochsTotal) break;

            // Alpha is a ratio of non-negative valuations, so it cannot fall
            // below total loss. Bound the input to what is reachable.
            int256 a = alphas[i] % 5_000;
            uint96 prevV = m.epochsSettled == 0
                ? _openAtt(id).valuationWei
                : _epochAtt(id, m.epochsSettled - 1).valuationWei;
            int256 nextV = (int256(uint256(prevV)) * (10_000 + a)) / 10_000;
            if (nextV <= 0) break;

            vm.warp(block.timestamp + EPOCH + 1);
            vm.prank(adjudicator);
            try market.proposeEpoch{value: STAKE}(
                id, ((nextV * 10_000) / int256(uint256(prevV))) - 10_000, _obs(uint96(uint256(nextV)), OPEN_VALUE)
            ) {
                vm.warp(block.timestamp + WINDOW + 1);
                market.finaliseEpoch(id, m.epochsSettled);
            } catch {
                break;
            }
        }

        MandateMarketV2.Mandate memory f = market.getMandate(id);
        uint256 owed = uint256(f.capital) + uint256(f.bond)
            + market.withdrawable(address(0), alice) + market.withdrawable(address(0), bob)
            + market.withdrawable(address(0), principal) + market.withdrawable(address(0), adjudicator)
            + market.protocolBalance(address(0));
        MandateMarketV2.Bid[] memory bids = market.getBids(id);
        for (uint256 i = 0; i < bids.length; i++) if (!bids[i].spent) owed += bids[i].bond;

        assertLe(owed, address(market).balance, "liabilities exceed the balance");
    }

    /**
     * A resolved challenge must never create value.
     *
     * Whoever wins, the pot paid out is exactly the two stakes — the contract
     * cannot mint a third one, and cannot pay both sides.
     */
    function testFuzz_ChallengeResolutionNeverMintsValue(bool proposerWins, uint96 extra) public {
        extra = uint96(bound(extra, 0, 5 ether));
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether);
        _award(id, 0);

        vm.warp(block.timestamp + EPOCH + 1);
        vm.prank(adjudicator);
        market.proposeEpoch{value: STAKE}(id, 1_000, _obs(11 ether, OPEN_VALUE));
        vm.prank(watcher);
        market.challengeEpoch{value: STAKE + extra}(id, 0, _obs(9 ether, OPEN_VALUE));

        uint256 pot = uint256(STAKE) + uint256(STAKE) + uint256(extra);
        market.resolveChallenge(id, 0, proposerWins, proposerWins ? int256(1_000) : int256(-1_000));

        uint256 paid = market.withdrawable(address(0), adjudicator) + market.withdrawable(address(0), watcher);
        assertEq(paid, pot, "the pot paid out is not the two stakes");
    }

    /// @dev Attestations may never move backwards in block height.
    function testFuzz_AttestationsAreMonotonic(uint64 back) public {
        back = uint64(bound(back, 1, 1_000));
        vm.roll(block.number + 2_000);
        uint256 id = _open(10 ether);
        _bid(id, alice, 1 ether);
        _award(id, 0);

        vm.warp(block.timestamp + EPOCH + 1);
        MandateMarketV2.Observation memory stale = _obs(11 ether, OPEN_VALUE);
        stale.blockNumber = uint64(block.number) - back;
        // The opening mark was taken at the current block, so anything earlier
        // would let a proposer re-report a more flattering reading.
        vm.prank(adjudicator);
        vm.expectRevert(MandateMarketV2.StaleObservation.selector);
        market.proposeEpoch{value: STAKE}(id, 1_000, stale);
    }
}
