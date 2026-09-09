// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title MandateMarketV2
 * @notice A market in which autonomous agents compete for the right to manage
 *         capital, backed by their own — with the settlement seam closed as
 *         far as a contract can close it.
 *
 * V1 shipped a working mechanism with one honest weakness, stated plainly in
 * its own source: realized alpha on positions held off-vault cannot be derived
 * on chain, so an adjudicator reported it. Attestations made that report
 * *consistent* — the contract re-derives alpha from two committed measurements
 * and reverts if the number disagrees — but a determined adjudicator could
 * still commit a false valuation, and it risked nothing by doing so.
 *
 * V2 changes what it costs to lie.
 *
 *   - Settlement is **proposed**, not applied. The proposer stakes a bond.
 *   - Anyone may **challenge** within a window by staking at least as much and
 *     submitting a contradicting measurement *for the same block*, which is
 *     the one thing that makes two claims comparable.
 *   - Unchallenged, a proposal finalises and its stake returns.
 *   - Challenged, both stakes are at risk and neither the fee nor the slash
 *     moves until it resolves. The loser's stake goes to the winner.
 *
 * The contract still cannot itself decide what a wallet was worth. What it can
 * do is make the assertion expensive, make the contradiction public, and stop
 * value moving while the two disagree. That is a smaller claim than "trustless"
 * and it is the true one.
 *
 * Also in this version:
 *   - **BEP-20 mandates.** `uint96` BNB excluded most real capital.
 *   - **Per-category benchmarks.** Holding is right for grid and rebalancing
 *     and wrong for the others; a measurement now carries its own benchmark.
 *   - **Per-mandate risk.** Strike count and catastrophic threshold are the
 *     principal's to set, not constants.
 *   - **A protocol fee**, so settlement gas is funded by the market.
 *   - **A pause guard**, **bid expiry**, and a two-step adjudicator handover.
 */
contract MandateMarketV2 is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // -------------------------------------------------------------- types --

    enum Category {
        Rebalancing,
        GridTrading,
        YieldOptimisation,
        HealthFactor
    }

    enum State {
        Open,
        Active,
        Closed,
        Abandoned
    }

    /// @notice What a settlement is measured against.
    enum Benchmark {
        /// Value of the same assets left un-traded. Grid, rebalancing.
        Hold,
        /// The best passive rate available at that block. Yield.
        BestPassiveRate,
        /// The liquidation that did not happen. Health factor.
        LiquidationAvoided
    }

    struct Mandate {
        address principal;
        uint96 capital;
        address agent;
        uint96 bond;
        Category category;
        State state;
        uint16 toleranceBps;
        uint16 feeBps;
        uint16 slashBps;
        uint32 epochLength;
        uint32 epochsTotal;
        uint32 epochsSettled;
        uint64 lastSettledAt;
        int256 cumulativeAlphaBps;
        uint32 strikes;
        /**
         * @notice The asset. `address(0)` is native BNB.
         *
         * V1 was BNB-only in a `uint96`, which excluded USDT, USDC and CAKE —
         * that is to say, most of the capital anyone would actually mandate.
         */
        address asset;
        /// @notice What this mandate's alpha is measured against.
        Benchmark benchmark;
        /// @notice Consecutive failing epochs before dismissal. Principal's choice.
        uint32 strikesToDismiss;
        /// @notice One epoch this far below benchmark dismisses at once.
        int32 catastrophicAlphaBps;
        /**
         * @notice The bond floor, as a share of capital under mandate.
         *
         * A flat `minBond` is only meaningful at one size. At $0.06 it is
         * nothing against a million dollars, and at a level that means
         * something against a million it excludes every small mandate. So the
         * floor scales: a bid must post at least `capital * bondFloorBps`, and
         * never less than the market's absolute `minBond`.
         *
         * Zero keeps the old behaviour — the absolute floor alone — because a
         * principal who does not care should not be forced to.
         */
        uint16 bondFloorBps;
    }

    struct Bid {
        address agent;
        uint96 bond;
        int16 targetAlphaBps;
        bool spent;
        /**
         * @notice When this bid stops being binding.
         *
         * V1 escrowed a losing bidder's bond indefinitely with no exit. A
         * succession queue is only worth joining if leaving it is possible.
         */
        uint64 expiresAt;
    }

    /**
     * @notice A measurement of a managed wallet, committed on chain.
     *
     * `benchmarkWei` is what the same capital would have been worth under this
     * mandate's benchmark at the same block. Alpha is the difference between
     * the two changes, so a yield agent earning 3% while 5% sat available has
     * negative alpha — which is the truth, and which a hold benchmark hides.
     */
    struct Observation {
        address wallet;
        uint96 valuationWei;
        uint96 gasSpentWei;
        uint160 priceX96;
        uint64 blockNumber;
        bytes32 breakdownRef;
        uint96 benchmarkWei;
    }

    struct Attestation {
        bytes32 observationHash;
        uint96 valuationWei;
        uint64 blockNumber;
        uint64 takenAt;
        uint96 benchmarkWei;
    }

    /// @notice A settlement that has been proposed but has not taken effect.
    struct Proposal {
        int256 alphaBps;
        uint96 proposerStake;
        uint96 challengerStake;
        address proposer;
        address challenger;
        uint64 finalisableAt;
        bool finalised;
        bool challenged;
        bool resolved;
    }

    struct PendingSlash {
        uint96 amount;
        uint64 claimableAt;
        address agent;
        bool contested;
        bool resolved;
    }

    // ---------------------------------------------------------- parameters --

    uint16 public constant MAX_BPS = 10_000;
    int256 public constant MAX_ALPHA_BPS = 100_000;
    /// @notice Ceiling on the protocol's own cut, so it cannot be set abusively.
    uint16 public constant MAX_PROTOCOL_FEE_BPS = 500; // 5%

    uint64 public challengeWindow;
    uint96 public minBond;
    uint16 public minFineness;
    /// @notice What a proposer must stake to settle an epoch.
    uint96 public proposerStake;
    /// @notice The market's cut of an agent's fee. Funds settlement gas.
    uint16 public protocolFeeBps;

    address public adjudicator;
    /// @notice Nominated successor. Must accept, so a typo cannot orphan the role.
    address public pendingAdjudicator;

    /// @notice Halts anything that moves value. Withdrawals stay open.
    bool public paused;

    // ------------------------------------------------------------- storage --

    Mandate[] private _mandates;
    mapping(uint256 => Bid[]) private _bids;
    mapping(uint256 => mapping(uint32 => PendingSlash)) public pendingSlash;
    /// @dev asset => account => balance. Pull payments, per asset.
    mapping(address => mapping(address => uint256)) public withdrawable;
    mapping(uint256 => Attestation) public openAttestation;
    mapping(uint256 => mapping(uint32 => Attestation)) public epochAttestation;
    /// @dev mandateId => epoch => the settlement awaiting finality.
    mapping(uint256 => mapping(uint32 => Proposal)) public proposals;
    /// @dev mandateId => epoch => the challenger's contradicting measurement.
    mapping(uint256 => mapping(uint32 => Attestation)) public challengeAttestation;

    mapping(address => uint16) public fineness;
    mapping(address => uint64) public assayedAt;
    /// @notice Protocol fees collected, per asset.
    mapping(address => uint256) public protocolBalance;

    // -------------------------------------------------------------- events --

    event MandateOpened(
        uint256 indexed mandateId,
        address indexed principal,
        Category category,
        address asset,
        uint96 capital,
        Benchmark benchmark
    );
    event BidPlaced(
        uint256 indexed mandateId, address indexed agent, uint96 bond, int16 targetAlphaBps, uint64 expiresAt
    );
    event BidWithdrawn(uint256 indexed mandateId, address indexed agent, uint96 bond);
    event MandateAwarded(uint256 indexed mandateId, address indexed agent, uint96 bond);
    event EpochProposed(
        uint256 indexed mandateId, uint32 indexed epoch, address indexed proposer, int256 alphaBps, uint96 stake
    );
    event EpochChallenged(
        uint256 indexed mandateId, uint32 indexed epoch, address indexed challenger, uint96 stake
    );
    event ChallengeResolved(
        uint256 indexed mandateId, uint32 indexed epoch, bool proposerUpheld, address winner, uint96 award
    );
    event EpochSettled(
        uint256 indexed mandateId,
        uint32 indexed epoch,
        address indexed agent,
        int256 realizedAlphaBps,
        uint96 feePaid,
        uint96 slashed
    );
    event Observed(
        uint256 indexed mandateId, uint32 indexed epoch, bytes32 observationHash, Observation observation
    );
    event AgentDismissed(uint256 indexed mandateId, address indexed agent, string reason);
    event SlashContested(uint256 indexed mandateId, uint32 indexed epoch, address indexed agent);
    event SlashResolved(uint256 indexed mandateId, uint32 indexed epoch, bool upheld, uint96 amount);
    event MandateClosed(uint256 indexed mandateId, uint96 returned);
    event AdjudicatorNominated(address indexed previous, address indexed nominee);
    event AdjudicatorChanged(address indexed previous, address indexed next);
    event Assayed(address indexed agent, uint16 fineness, uint64 at);
    event MinFinenessChanged(uint16 previous, uint16 next);
    event MinBondChanged(uint96 previous, uint96 next);
    event ChallengeWindowChanged(uint64 previous, uint64 next);
    event ProposerStakeChanged(uint96 previous, uint96 next);
    event ProtocolFeeChanged(uint16 previous, uint16 next);
    event PausedSet(bool paused);
    event Withdrawal(address indexed asset, address indexed to, uint256 amount);
    event ProtocolWithdrawal(address indexed asset, address indexed to, uint256 amount);

    // -------------------------------------------------------------- errors --

    error NotAdjudicator();
    error NotPrincipal();
    error BadState();
    error BondTooSmall();
    error NoCapital();
    error BadParameters();
    error EpochNotElapsed();
    error TermComplete();
    error NoSuchBid();
    error BidSpent();
    error BidExpired();
    error NotBidder();
    error MandateHeld();
    error NothingToWithdraw();
    error TransferFailed();
    error WindowOpen();
    error WindowClosed();
    error AlreadyResolved();
    error NotAssayed();
    error BelowFineness();
    error NoOpeningAttestation();
    error StaleObservation();
    error AlphaContradictsObservation();
    error Paused();
    error StakeTooSmall();
    error AlreadyProposed();
    error NoProposal();
    error AlreadyChallenged();
    error NotChallenged();
    error WrongBlock();
    error SameMeasurement();
    error WrongAsset();
    error ChallengeWindowTooLong();

    // ----------------------------------------------------------- modifiers --

    modifier onlyAdjudicator() {
        if (msg.sender != adjudicator) revert NotAdjudicator();
        _;
    }

    modifier notPaused() {
        if (paused) revert Paused();
        _;
    }

    constructor(address adjudicator_, uint96 minBond_, uint96 proposerStake_, uint64 challengeWindow_)
        Ownable(msg.sender)
    {
        if (minBond_ == 0) revert BondTooSmall();
        if (challengeWindow_ == 0) revert BadParameters();
        adjudicator = adjudicator_;
        minBond = minBond_;
        proposerStake = proposerStake_;
        challengeWindow = challengeWindow_;
        emit AdjudicatorChanged(address(0), adjudicator_);
        emit MinBondChanged(0, minBond_);
        emit ProposerStakeChanged(0, proposerStake_);
        emit ChallengeWindowChanged(0, challengeWindow_);
    }

    // --------------------------------------------------------- principals --

    /**
     * @notice Opens a mandate and escrows the capital to be managed.
     * @param asset       `address(0)` for native BNB, else a BEP-20.
     * @param amount      Capital, ignored for native (msg.value is used).
     * @param benchmark   What this mandate's alpha is measured against.
     * @param strikes_    Consecutive failing epochs before dismissal.
     * @param catastrophic_ One epoch this far below benchmark dismisses at once.
     */
    function openMandate(
        Category category,
        address asset,
        uint256 amount,
        Benchmark benchmark,
        uint16 toleranceBps,
        uint16 feeBps,
        uint16 slashBps,
        uint32 epochLength,
        uint32 epochsTotal,
        uint32 strikes_,
        int32 catastrophic_,
        uint16 bondFloorBps_
    ) external payable notPaused nonReentrant returns (uint256 mandateId) {
        if (epochsTotal == 0 || epochLength == 0) revert BadParameters();
        if (toleranceBps > MAX_BPS || feeBps > MAX_BPS || slashBps > MAX_BPS) revert BadParameters();
        if (strikes_ == 0) revert BadParameters();
        if (catastrophic_ >= 0) revert BadParameters();
        // A floor above the capital itself could never be met.
        if (bondFloorBps_ > MAX_BPS) revert BadParameters();

        // A challenge that cannot resolve before the next epoch settles leaves
        // slashes piling up unadjudicated. V1 allowed it; this does not.
        if (uint256(challengeWindow) >= uint256(epochLength)) revert ChallengeWindowTooLong();

        uint96 capital = _take(asset, amount);
        if (capital == 0) revert NoCapital();

        mandateId = _mandates.length;
        _mandates.push(
            Mandate({
                principal: msg.sender,
                capital: capital,
                agent: address(0),
                bond: 0,
                category: category,
                state: State.Open,
                toleranceBps: toleranceBps,
                feeBps: feeBps,
                slashBps: slashBps,
                epochLength: epochLength,
                epochsTotal: epochsTotal,
                epochsSettled: 0,
                lastSettledAt: uint64(block.timestamp),
                cumulativeAlphaBps: 0,
                strikes: 0,
                asset: asset,
                benchmark: benchmark,
                strikesToDismiss: strikes_,
                catastrophicAlphaBps: catastrophic_,
                bondFloorBps: bondFloorBps_
            })
        );

        emit MandateOpened(mandateId, msg.sender, category, asset, capital, benchmark);
    }

    /**
     * @notice Awards the mandate, committing the opening measurement.
     * @dev The opening mark must exist before anything can be settled against
     *      it. That is the whole reason this takes an observation.
     */
    function award(uint256 mandateId, uint256 bidIndex, Observation calldata opening)
        external
        notPaused
        nonReentrant
    {
        Mandate storage m = _mandates[mandateId];
        if (msg.sender != m.principal) revert NotPrincipal();
        if (m.state != State.Open) revert BadState();
        if (opening.blockNumber > block.number || opening.valuationWei == 0) revert StaleObservation();
        if (opening.benchmarkWei == 0) revert StaleObservation();

        bytes32 h = hashObservation(opening);
        openAttestation[mandateId] = Attestation({
            observationHash: h,
            valuationWei: opening.valuationWei,
            blockNumber: opening.blockNumber,
            takenAt: uint64(block.timestamp),
            benchmarkWei: opening.benchmarkWei
        });
        emit Observed(mandateId, type(uint32).max, h, opening);

        _award(mandateId, m, bidIndex);
    }

    /**
     * @notice What a bid on this mandate must post.
     * @dev The greater of the market's absolute floor and this mandate's share
     *      of capital. Public so a bidder can ask before it sends, rather than
     *      finding out from a revert.
     */
    function requiredBond(uint256 mandateId) public view returns (uint96) {
        Mandate storage m = _mandates[mandateId];
        uint256 scaled = (uint256(m.capital) * m.bondFloorBps) / MAX_BPS;
        return scaled > minBond ? uint96(scaled) : minBond;
    }

    function hashObservation(Observation calldata o) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                o.wallet,
                o.valuationWei,
                o.gasSpentWei,
                o.priceX96,
                o.blockNumber,
                o.breakdownRef,
                o.benchmarkWei
            )
        );
    }

    /// @notice Closes a completed mandate: capital home, bond released.
    function closeMandate(uint256 mandateId) external nonReentrant {
        Mandate storage m = _mandates[mandateId];
        if (m.state == State.Closed || m.state == State.Abandoned) revert BadState();

        bool served = m.epochsSettled >= m.epochsTotal;
        bool abandoned = m.state == State.Open && msg.sender == m.principal;
        if (!served && !abandoned) revert BadState();

        uint96 capital = m.capital;
        uint96 bond = m.bond;
        address agent = m.agent;
        address asset = m.asset;

        m.capital = 0;
        m.bond = 0;
        m.state = served ? State.Closed : State.Abandoned;

        if (capital > 0) withdrawable[asset][m.principal] += capital;
        if (bond > 0 && agent != address(0)) withdrawable[asset][agent] += bond;
        _releaseAllBids(mandateId);

        emit MandateClosed(mandateId, capital);
    }

    // ------------------------------------------------------------- agents --

    /**
     * @notice Bids for a mandate by escrowing a bond.
     * @param ttl Seconds this bid remains binding. Zero means the mandate's term.
     */
    function bid(uint256 mandateId, int16 targetAlphaBps, uint256 amount, uint64 ttl)
        external
        payable
        notPaused
        nonReentrant
        returns (uint256 bidIndex)
    {
        Mandate storage m = _mandates[mandateId];
        if (m.state != State.Open && m.state != State.Active) revert BadState();
        if (targetAlphaBps < 0) revert BadParameters();

        if (minFineness > 0) {
            if (assayedAt[msg.sender] == 0) revert NotAssayed();
            if (fineness[msg.sender] < minFineness) revert BelowFineness();
        }

        uint96 posted = _take(m.asset, amount);
        if (posted < requiredBond(mandateId)) revert BondTooSmall();

        uint64 expiresAt = ttl == 0
            ? uint64(block.timestamp) + uint64(m.epochLength) * uint64(m.epochsTotal)
            : uint64(block.timestamp) + ttl;

        bidIndex = _bids[mandateId].length;
        _bids[mandateId].push(
            Bid({
                agent: msg.sender,
                bond: posted,
                targetAlphaBps: targetAlphaBps,
                spent: false,
                expiresAt: expiresAt
            })
        );

        emit BidPlaced(mandateId, msg.sender, posted, targetAlphaBps, expiresAt);
    }

    /**
     * @notice Withdraws a losing bid.
     * @dev The incumbent cannot withdraw the bond it has at risk. An expired
     *      bid may be released by anyone, so a queue cannot strand capital
     *      because its owner stopped paying attention.
     */
    function withdrawBid(uint256 mandateId, uint256 bidIndex) external nonReentrant {
        Bid[] storage list = _bids[mandateId];
        if (bidIndex >= list.length) revert NoSuchBid();
        Bid storage b = list[bidIndex];
        if (b.spent) revert BidSpent();

        bool expired = block.timestamp >= b.expiresAt;
        if (!expired && msg.sender != b.agent) revert NotBidder();
        if (_mandates[mandateId].agent == b.agent) revert MandateHeld();

        b.spent = true;
        withdrawable[_mandates[mandateId].asset][b.agent] += b.bond;
        emit BidWithdrawn(mandateId, b.agent, b.bond);
    }

    /// @notice A dismissed agent contests its slash inside the window.
    function contestSlash(uint256 mandateId, uint32 epoch) external {
        PendingSlash storage p = pendingSlash[mandateId][epoch];
        if (p.amount == 0 || p.resolved) revert AlreadyResolved();
        if (msg.sender != p.agent) revert NotBidder();
        if (block.timestamp >= p.claimableAt) revert WindowClosed();
        p.contested = true;
        emit SlashContested(mandateId, epoch, msg.sender);
    }

    // -------------------------------------------------------- settlement --

    /**
     * @notice Proposes an epoch's settlement. Nothing moves yet.
     *
     * The proposer stakes. V1's adjudicator reported for free, which meant a
     * false report cost it nothing and a true one earned it nothing — the
     * cheapest possible position from which to be trusted. Here the assertion
     * has a price, and anyone who thinks it wrong can take the other side.
     *
     * The alpha must still agree with the two committed measurements, so a
     * proposal cannot be internally inconsistent. What a stake adds is a cost
     * to being consistently wrong.
     */
    function proposeEpoch(uint256 mandateId, int256 alphaBps, Observation calldata obs)
        external
        payable
        onlyAdjudicator
        notPaused
        nonReentrant
    {
        if (alphaBps > MAX_ALPHA_BPS || alphaBps < -MAX_ALPHA_BPS) revert BadParameters();

        Mandate storage m = _mandates[mandateId];
        if (m.state != State.Active) revert BadState();
        if (m.epochsSettled >= m.epochsTotal) revert TermComplete();
        if (block.timestamp < m.lastSettledAt + m.epochLength) revert EpochNotElapsed();

        uint32 epoch = m.epochsSettled;
        if (proposals[mandateId][epoch].proposer != address(0)) revert AlreadyProposed();

        // The stake is always native, whatever the mandate is denominated in:
        // it answers for honesty, not for the position.
        if (msg.value < proposerStake) revert StakeTooSmall();

        _requireAlphaMatchesObservations(mandateId, epoch, alphaBps, obs);

        proposals[mandateId][epoch] = Proposal({
            alphaBps: alphaBps,
            proposerStake: uint96(msg.value),
            challengerStake: 0,
            proposer: msg.sender,
            challenger: address(0),
            finalisableAt: uint64(block.timestamp) + challengeWindow,
            finalised: false,
            challenged: false,
            resolved: false
        });

        emit EpochProposed(mandateId, epoch, msg.sender, alphaBps, uint96(msg.value));
    }

    /**
     * @notice Contradicts a proposal, for the same block, with money behind it.
     *
     * Two measurements are only comparable if they are of the same instant, so
     * the challenge must name the block the proposal named. A challenger who
     * merely disagrees about a later block is describing a different fact.
     */
    function challengeEpoch(uint256 mandateId, uint32 epoch, Observation calldata obs)
        external
        payable
        notPaused
        nonReentrant
    {
        Proposal storage p = proposals[mandateId][epoch];
        if (p.proposer == address(0)) revert NoProposal();
        if (p.finalised || p.resolved) revert AlreadyResolved();
        if (p.challenged) revert AlreadyChallenged();
        if (block.timestamp >= p.finalisableAt) revert WindowClosed();
        if (msg.value < p.proposerStake) revert StakeTooSmall();

        Attestation memory theirs = epochAttestation[mandateId][epoch];
        if (obs.blockNumber != theirs.blockNumber) revert WrongBlock();
        if (obs.valuationWei == theirs.valuationWei && obs.benchmarkWei == theirs.benchmarkWei) {
            // Agreeing loudly is not a challenge.
            revert SameMeasurement();
        }
        if (obs.valuationWei == 0 || obs.benchmarkWei == 0) revert StaleObservation();

        p.challenged = true;
        p.challenger = msg.sender;
        p.challengerStake = uint96(msg.value);

        bytes32 h = hashObservation(obs);
        challengeAttestation[mandateId][epoch] = Attestation({
            observationHash: h,
            valuationWei: obs.valuationWei,
            blockNumber: obs.blockNumber,
            takenAt: uint64(block.timestamp),
            benchmarkWei: obs.benchmarkWei
        });
        emit Observed(mandateId, epoch, h, obs);
        emit EpochChallenged(mandateId, epoch, msg.sender, uint96(msg.value));
    }

    /**
     * @notice Applies an unchallenged proposal once its window has passed.
     * @dev Permissionless. A settlement that only the proposer can complete is
     *      a settlement the proposer can withhold.
     */
    function finaliseEpoch(uint256 mandateId, uint32 epoch) external notPaused nonReentrant {
        Proposal storage p = proposals[mandateId][epoch];
        if (p.proposer == address(0)) revert NoProposal();
        if (p.finalised) revert AlreadyResolved();
        if (p.challenged && !p.resolved) revert NotChallenged();
        if (block.timestamp < p.finalisableAt) revert WindowOpen();

        p.finalised = true;
        // The stake did its work by being at risk; it goes home.
        if (p.proposerStake > 0) withdrawable[address(0)][p.proposer] += p.proposerStake;

        _apply(mandateId, epoch, p.alphaBps);
    }

    /**
     * @notice Decides a challenged epoch.
     *
     * The contract cannot read a wallet's value at a past block, so it cannot
     * settle this itself — the honest limit of what a contract can do here.
     * What it does do is hold both stakes, freeze the fee and the slash while
     * the two claims stand against each other, and pay the winner from the
     * loser. Both measurements are on chain, for the same block, so anyone can
     * check the outcome against public state afterwards.
     */
    function resolveChallenge(uint256 mandateId, uint32 epoch, bool proposerUpheld, int256 correctedAlphaBps)
        external
        onlyOwner
        nonReentrant
    {
        Proposal storage p = proposals[mandateId][epoch];
        if (p.proposer == address(0)) revert NoProposal();
        if (!p.challenged) revert NotChallenged();
        if (p.resolved || p.finalised) revert AlreadyResolved();
        if (correctedAlphaBps > MAX_ALPHA_BPS || correctedAlphaBps < -MAX_ALPHA_BPS) revert BadParameters();

        p.resolved = true;
        uint96 pot = p.proposerStake + p.challengerStake;
        address winner = proposerUpheld ? p.proposer : p.challenger;
        withdrawable[address(0)][winner] += pot;

        if (!proposerUpheld) {
            // The challenger's measurement stands, so it becomes the record.
            epochAttestation[mandateId][epoch] = challengeAttestation[mandateId][epoch];
        }

        emit ChallengeResolved(mandateId, epoch, proposerUpheld, winner, pot);

        p.finalised = true;
        _apply(mandateId, epoch, proposerUpheld ? p.alphaBps : correctedAlphaBps);
    }

    /**
     * @dev The effects of a settled epoch. Reached only from `finaliseEpoch`
     *      or `resolveChallenge`, never directly, so no fee is ever paid and no
     *      bond is ever slashed on a number that is still being argued about.
     */
    function _apply(uint256 mandateId, uint32 epoch, int256 realizedAlphaBps) private {
        Mandate storage m = _mandates[mandateId];
        address agent = m.agent;
        address asset = m.asset;

        m.epochsSettled = epoch + 1;
        m.lastSettledAt = uint64(block.timestamp);
        m.cumulativeAlphaBps += realizedAlphaBps;

        uint96 feePaid;
        uint96 slashed;

        if (realizedAlphaBps > 0) {
            // Charged against escrowed capital, never against a notional
            // off-vault gain this contract does not hold. Paying a share of a
            // gain that is not here would credit a withdrawal with nothing
            // behind it and drain another mandate's escrow.
            uint256 gain = (uint256(m.capital) * uint256(realizedAlphaBps)) / MAX_BPS;
            uint256 fee = (gain * m.feeBps) / MAX_BPS;
            if (fee > m.capital) fee = m.capital;
            feePaid = uint96(fee);
            if (feePaid > 0) {
                m.capital -= feePaid;
                uint256 cut = (uint256(feePaid) * protocolFeeBps) / MAX_BPS;
                protocolBalance[asset] += cut;
                withdrawable[asset][agent] += feePaid - cut;
            }
            m.strikes = 0;
        } else if (realizedAlphaBps < -int256(uint256(m.toleranceBps))) {
            slashed = uint96((uint256(m.bond) * m.slashBps) / MAX_BPS);
            if (slashed > m.bond) slashed = m.bond;
            if (slashed > 0) {
                m.bond -= slashed;
                pendingSlash[mandateId][epoch] = PendingSlash({
                    amount: slashed,
                    claimableAt: uint64(block.timestamp) + challengeWindow,
                    agent: agent,
                    contested: false,
                    resolved: false
                });
            }
            m.strikes += 1;
        } else {
            m.strikes = 0;
        }

        emit EpochSettled(mandateId, epoch, agent, realizedAlphaBps, feePaid, slashed);

        if (realizedAlphaBps <= int256(m.catastrophicAlphaBps)) {
            _dismiss(mandateId, m, "catastrophic underperformance");
        } else if (m.strikes >= m.strikesToDismiss) {
            _dismiss(mandateId, m, "consecutive failing epochs");
        } else if (m.bond == 0) {
            _dismiss(mandateId, m, "bond exhausted");
        }
    }

    /**
     * @dev Stores the measurement and rejects an alpha it does not imply.
     *
     * Alpha is the agent's change *minus the benchmark's own change over the
     * same interval*. Under `Hold` the benchmark does not move and this
     * reduces to V1's ratio; under the others it does not, which is the point:
     * a yield agent earning 3% while 5% sat available has negative alpha, and
     * a hold benchmark would have called that a win.
     */
    function _requireAlphaMatchesObservations(
        uint256 mandateId,
        uint32 epoch,
        int256 realizedAlphaBps,
        Observation calldata obs
    ) private {
        if (obs.blockNumber > block.number || obs.valuationWei == 0) revert StaleObservation();
        if (obs.benchmarkWei == 0) revert StaleObservation();

        Attestation memory prev =
            epoch == 0 ? openAttestation[mandateId] : epochAttestation[mandateId][epoch - 1];
        if (prev.observationHash == bytes32(0) || prev.valuationWei == 0 || prev.benchmarkWei == 0) {
            revert NoOpeningAttestation();
        }
        if (obs.blockNumber < prev.blockNumber) revert StaleObservation();

        int256 agentReturn = (int256(uint256(obs.valuationWei)) * int256(uint256(MAX_BPS)))
            / int256(uint256(prev.valuationWei)) - int256(uint256(MAX_BPS));
        int256 benchReturn = (int256(uint256(obs.benchmarkWei)) * int256(uint256(MAX_BPS)))
            / int256(uint256(prev.benchmarkWei)) - int256(uint256(MAX_BPS));
        int256 expected = agentReturn - benchReturn;

        // Two integer divisions, so two basis points of rounding are possible.
        int256 drift = realizedAlphaBps - expected;
        if (drift > 2 || drift < -2) revert AlphaContradictsObservation();

        bytes32 h = hashObservation(obs);
        epochAttestation[mandateId][epoch] = Attestation({
            observationHash: h,
            valuationWei: obs.valuationWei,
            blockNumber: obs.blockNumber,
            takenAt: uint64(block.timestamp),
            benchmarkWei: obs.benchmarkWei
        });
        emit Observed(mandateId, epoch, h, obs);
    }

    // ------------------------------------------------------- adjudication --

    function publishAssay(address agent, uint16 fineness_) external onlyAdjudicator {
        if (fineness_ > 1000) revert BadParameters();
        fineness[agent] = fineness_;
        assayedAt[agent] = uint64(block.timestamp);
        emit Assayed(agent, fineness_, uint64(block.timestamp));
    }

    function publishAssays(address[] calldata agents, uint16[] calldata values) external onlyAdjudicator {
        if (agents.length != values.length) revert BadParameters();
        for (uint256 i = 0; i < agents.length; i++) {
            if (values[i] > 1000) revert BadParameters();
            fineness[agents[i]] = values[i];
            assayedAt[agents[i]] = uint64(block.timestamp);
            emit Assayed(agents[i], values[i], uint64(block.timestamp));
        }
    }

    function resolveSlash(uint256 mandateId, uint32 epoch, bool upheld) external onlyOwner nonReentrant {
        PendingSlash storage p = pendingSlash[mandateId][epoch];
        if (p.amount == 0 || p.resolved) revert AlreadyResolved();
        p.resolved = true;
        address asset = _mandates[mandateId].asset;
        if (upheld) withdrawable[asset][_mandates[mandateId].principal] += p.amount;
        else withdrawable[asset][p.agent] += p.amount;
        emit SlashResolved(mandateId, epoch, upheld, p.amount);
    }

    /// @notice Claims an uncontested slash once its window has passed.
    function claimSlash(uint256 mandateId, uint32 epoch) external nonReentrant {
        PendingSlash storage p = pendingSlash[mandateId][epoch];
        if (p.amount == 0 || p.resolved) revert AlreadyResolved();
        if (p.contested) revert WindowOpen();
        if (block.timestamp < p.claimableAt) revert WindowOpen();
        p.resolved = true;
        address asset = _mandates[mandateId].asset;
        withdrawable[asset][_mandates[mandateId].principal] += p.amount;
        emit SlashResolved(mandateId, epoch, true, p.amount);
    }

    // ---------------------------------------------------------- internals --

    /**
     * @dev Takes payment in the mandate's asset. Native uses msg.value.
     *
     * Capital and bonds are held in `uint96` to keep the Mandate struct tight.
     * A silent truncation there would be catastrophic — a 2^96 + 1 deposit
     * would be recorded as 1 and the rest would be unrecoverable — so the cast
     * is checked rather than assumed. 2^96 wei is ~79 billion BNB, and for an
     * 18-decimal token ~79 billion units, so this bounds nothing anyone will
     * legitimately deposit.
     */
    function _take(address asset, uint256 amount) private returns (uint96) {
        uint256 taken;
        if (asset == address(0)) {
            if (amount != 0 && amount != msg.value) revert WrongAsset();
            taken = msg.value;
        } else {
            if (msg.value != 0) revert WrongAsset();
            // Measured, not assumed: a fee-on-transfer token delivers less than
            // it was sent, and crediting the requested amount would book value
            // this contract does not hold.
            uint256 before = IERC20(asset).balanceOf(address(this));
            IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
            taken = IERC20(asset).balanceOf(address(this)) - before;
        }
        if (taken > type(uint96).max) revert BadParameters();
        return uint96(taken);
    }

    function _pay(address asset, address to, uint256 amount) private {
        if (asset == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert TransferFailed();
        } else {
            IERC20(asset).safeTransfer(to, amount);
        }
    }

    function _award(uint256 mandateId, Mandate storage m, uint256 bidIndex) private {
        Bid[] storage list = _bids[mandateId];
        if (bidIndex >= list.length) revert NoSuchBid();
        Bid storage b = list[bidIndex];
        if (b.spent) revert BidSpent();
        if (block.timestamp >= b.expiresAt) revert BidExpired();

        b.spent = true;
        m.agent = b.agent;
        m.bond = b.bond;
        m.state = State.Active;
        m.strikes = 0;
        m.lastSettledAt = uint64(block.timestamp);

        emit MandateAwarded(mandateId, b.agent, b.bond);
    }

    /**
     * @dev Removes the agent and hands the mandate to the next live bid in the
     *      same transaction. Losing a mandate is a state transition, not a
     *      process, and an expired bid is skipped rather than promoted.
     */
    function _dismiss(uint256 mandateId, Mandate storage m, string memory reason) private {
        address outgoing = m.agent;
        uint96 remaining = m.bond;

        m.agent = address(0);
        m.bond = 0;
        m.strikes = 0;
        if (remaining > 0) withdrawable[m.asset][outgoing] += remaining;

        emit AgentDismissed(mandateId, outgoing, reason);

        uint256 next = _nextLiveBid(mandateId);
        if (next != type(uint256).max && m.epochsSettled < m.epochsTotal) {
            _award(mandateId, m, next);
        } else {
            m.state = State.Open;
        }
    }

    function _nextLiveBid(uint256 mandateId) private view returns (uint256) {
        Bid[] storage list = _bids[mandateId];
        for (uint256 i = 0; i < list.length; i++) {
            if (!list[i].spent && block.timestamp < list[i].expiresAt) return i;
        }
        return type(uint256).max;
    }

    function _releaseAllBids(uint256 mandateId) private {
        Bid[] storage list = _bids[mandateId];
        address asset = _mandates[mandateId].asset;
        for (uint256 i = 0; i < list.length; i++) {
            if (!list[i].spent) {
                list[i].spent = true;
                withdrawable[asset][list[i].agent] += list[i].bond;
            }
        }
    }

    // -------------------------------------------------------- withdrawals --

    /// @notice Pull payment. Open even while paused: a halt must not trap funds.
    function withdraw(address asset) external nonReentrant {
        uint256 amount = withdrawable[asset][msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        withdrawable[asset][msg.sender] = 0;
        _pay(asset, msg.sender, amount);
        emit Withdrawal(asset, msg.sender, amount);
    }

    function withdrawProtocol(address asset, address to) external onlyOwner nonReentrant {
        uint256 amount = protocolBalance[asset];
        if (amount == 0) revert NothingToWithdraw();
        protocolBalance[asset] = 0;
        _pay(asset, to, amount);
        emit ProtocolWithdrawal(asset, to, amount);
    }

    // -------------------------------------------------------------- admin --

    /// @notice Nominates a successor adjudicator. It must accept.
    function nominateAdjudicator(address next) external onlyOwner {
        pendingAdjudicator = next;
        emit AdjudicatorNominated(adjudicator, next);
    }

    /// @notice The nominee accepts, so a mistyped address cannot orphan the role.
    function acceptAdjudicator() external {
        if (msg.sender != pendingAdjudicator) revert NotAdjudicator();
        emit AdjudicatorChanged(adjudicator, msg.sender);
        adjudicator = msg.sender;
        pendingAdjudicator = address(0);
    }

    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit PausedSet(value);
    }

    function setChallengeWindow(uint64 seconds_) external onlyOwner {
        if (seconds_ == 0) revert BadParameters();
        emit ChallengeWindowChanged(challengeWindow, seconds_);
        challengeWindow = seconds_;
    }

    function setMinBond(uint96 wei_) external onlyOwner {
        if (wei_ == 0) revert BondTooSmall();
        emit MinBondChanged(minBond, wei_);
        minBond = wei_;
    }

    function setProposerStake(uint96 wei_) external onlyOwner {
        emit ProposerStakeChanged(proposerStake, wei_);
        proposerStake = wei_;
    }

    function setProtocolFeeBps(uint16 bps) external onlyOwner {
        if (bps > MAX_PROTOCOL_FEE_BPS) revert BadParameters();
        emit ProtocolFeeChanged(protocolFeeBps, bps);
        protocolFeeBps = bps;
    }

    function setMinFineness(uint16 value) external onlyOwner {
        if (value > 1000) revert BadParameters();
        emit MinFinenessChanged(minFineness, value);
        minFineness = value;
    }

    // --------------------------------------------------------------- views --

    function mandateCount() external view returns (uint256) {
        return _mandates.length;
    }

    function getMandate(uint256 mandateId) external view returns (Mandate memory) {
        return _mandates[mandateId];
    }

    function getBids(uint256 mandateId) external view returns (Bid[] memory) {
        return _bids[mandateId];
    }

    function getProposal(uint256 mandateId, uint32 epoch) external view returns (Proposal memory) {
        return proposals[mandateId][epoch];
    }
}
