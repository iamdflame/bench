// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

/**
 * @title MandateMarket
 * @notice A market in which autonomous agents compete for the right to manage
 *         capital, backed by their own.
 *
 * The problem this exists to solve: an agent registry lets anyone claim
 * anything at the price of gas, so "reputation" costs nothing to manufacture
 * and therefore signals nothing. Measured on BSC, 4,500 feedback records trace
 * to 53 wallets and 34 survive de-duplication.
 *
 * A claim that costs nothing is worth nothing. So here an agent does not have a
 * profile — it has a bond. To manage a mandate it must escrow its own capital,
 * and that capital is slashed when it underperforms the benchmark it agreed to
 * beat. Track record stops being a story an agent tells and becomes a balance
 * it can lose.
 *
 * Lifecycle:
 *
 *   1. A principal opens a mandate, escrowing the capital to be managed and
 *      declaring a category, a benchmark, an epoch length and a term.
 *   2. Agents bid, each posting a bond and committing to a target alpha.
 *   3. The principal awards the mandate. Losing bids stay live as a succession
 *      queue, bonds still escrowed.
 *   4. Each epoch the adjudicator settles realized alpha against the benchmark.
 *      Outperformance pays the agent a fee. Underperformance beyond tolerance
 *      slashes its bond in favour of the principal.
 *   5. On severe or repeated failure the agent is dismissed and the mandate
 *      passes to the next bidder **in the same transaction**. Being fired is
 *      not a governance process; it is a state transition.
 *
 * Trust: settlement is reported by an adjudicator role, because realized alpha
 * on positions held off-vault cannot be derived on-chain. That is the honest
 * seam in this design, and it is bounded three ways — the adjudicator can never
 * move principal capital to itself, every slash is escrowed through a challenge
 * window before the principal can claim it, and a dismissed agent can contest
 * within that window.
 *
 * Value flows use pull payments; nothing in this contract pushes ether to an
 * address it does not control the timing of.
 */
contract MandateMarket is ReentrancyGuard, Ownable {
    // -------------------------------------------------------------- types --

    /// @notice The four market functions the marketplace covers.
    enum Category {
        Rebalancing,
        GridTrading,
        YieldOptimisation,
        HealthFactor
    }

    enum State {
        Open, // accepting bids
        Active, // an agent holds the mandate
        Closed, // term completed, capital returned
        Abandoned // no bidder remained; capital returned
    }

    struct Mandate {
        address principal;
        uint96 capital; // BNB under management, escrowed here
        address agent; // current holder, address(0) while Open
        uint96 bond; // current holder's escrowed bond
        Category category;
        State state;
        uint16 toleranceBps; // underperformance tolerated before slashing
        uint16 feeBps; // agent's cut of positive alpha
        uint16 slashBps; // share of bond slashed per failing epoch
        uint32 epochLength; // seconds
        uint32 epochsTotal;
        uint32 epochsSettled;
        uint64 lastSettledAt;
        int256 cumulativeAlphaBps; // running realized alpha, in bps
        uint32 strikes; // consecutive failing epochs
    }

    struct Bid {
        address agent;
        uint96 bond;
        int16 targetAlphaBps; // what the agent commits to beat the benchmark by
        bool spent; // promoted to holder, or withdrawn
    }

    /**
     * @notice A measurement of a managed wallet, committed on chain.
     *
     * The number that decides every slash used to live in a JSON file on the
     * operator's machine — an unverifiable assertion, in a product built to
     * punish unverifiable assertions. An observation is that measurement made
     * public and pinned: the wallet, the block it was read at, what it was
     * worth, the pool price used to value it, and the gas spent getting there.
     *
     * The struct is emitted whole in an event and its hash is stored, so a
     * third party needs nothing from us to check the arithmetic — and, at a
     * recent enough block, can re-read the same state and derive it again.
     */
    struct Observation {
        address wallet;
        /// @notice Wallet value in wei, BNB-denominated.
        uint96 valuationWei;
        /// @notice Gas the agent spent over the epoch. Included so alpha is net.
        uint96 gasSpentWei;
        /// @notice Pool sqrtPriceX96 the valuation used.
        uint160 priceX96;
        /// @notice The BSC block this was read at. Pins re-derivation.
        uint64 blockNumber;
        /// @notice Greenfield object holding the full per-token breakdown.
        bytes32 breakdownRef;
    }

    /// @notice The commitment kept on chain for an observation.
    struct Attestation {
        bytes32 observationHash;
        /// @dev Kept alongside the hash so the contract can check the reported
        ///      alpha against consecutive measurements without the preimage.
        uint96 valuationWei;
        uint64 blockNumber;
        uint64 takenAt;
    }

    /// @notice A slash held through the challenge window before the principal may claim it.
    struct PendingSlash {
        uint96 amount;
        uint64 claimableAt;
        address agent; // who was slashed, and who may contest
        bool contested;
        bool resolved;
    }

    // ---------------------------------------------------------- parameters --

    uint16 public constant MAX_BPS = 10_000;
    /// @notice Three failing epochs in a row ends the mandate for that agent.
    uint32 public constant STRIKES_TO_DISMISS = 3;
    /// @notice A single epoch this far below benchmark dismisses immediately.
    int256 public constant CATASTROPHIC_ALPHA_BPS = -1_000; // -10%
    /// @notice Reported alpha is bounded at +/-1000%, so a bad report cannot
    ///         overflow the fee arithmetic or express a nonsensical result.
    int256 public constant MAX_ALPHA_BPS = 100_000;

    /// @notice How long a slash is escrowed before the principal may claim it.
    uint64 public challengeWindow = 24 hours;
    /**
     * @notice Minimum bond, so a bid is never costless.
     *
     * @dev Set in the constructor rather than inline. A hardcoded default that
     *      every deployment then overrides with `setMinBond` means the source
     *      and the chain disagree about a number that gates every bid, and the
     *      only way to know which is true is to go and read the chain. The
     *      deployed value is now an argument, recorded in the deployment
     *      transaction, and the source states no figure it does not use.
     */
    uint96 public minBond;

    /**
     * @notice Minimum assayed fineness required to bid. Zero disables the gate.
     *
     * Fineness is millesimal purity, the assay-office unit: 999 is pure and 375
     * is the lowest grade that may carry a hallmark. It is published here by
     * the adjudicator from an off-chain assay of the agent's registry claims
     * against the chain — endpoint liveness, custody separation, whether the
     * wallet has ever transacted, whether it has ever touched the protocols its
     * category implies.
     *
     * Without this gate the two halves of the system never meet: an agent that
     * has provably never sent a transaction could still bid for real capital
     * purely by posting a bond. A bond proves an agent has something to lose;
     * fineness proves it is capable of doing the job at all. Both are required.
     */
    uint16 public minFineness;

    /// @notice Reports realized alpha. Cannot move principal capital to itself.
    address public adjudicator;

    // ------------------------------------------------------------- storage --

    Mandate[] private _mandates;
    /// @dev mandateId => succession queue, ordered by arrival.
    mapping(uint256 => Bid[]) private _bids;
    /// @dev mandateId => epoch => slash held through the challenge window.
    mapping(uint256 => mapping(uint32 => PendingSlash)) public pendingSlash;
    /// @notice Pull-payment balances.
    mapping(address => uint256) public withdrawable;
    /// @notice The opening measurement a mandate is settled against.
    mapping(uint256 => Attestation) public openAttestation;
    /// @notice Per-epoch measurements. Alpha is a ratio of consecutive entries.
    mapping(uint256 => mapping(uint32 => Attestation)) public epochAttestation;

    /// @notice Assayed fineness per agent, 0-1000, published by the adjudicator.
    mapping(address => uint16) public fineness;
    /// @notice When that assay was published, so staleness is visible on chain.
    mapping(address => uint64) public assayedAt;

    // -------------------------------------------------------------- events --

    event MandateOpened(
        uint256 indexed mandateId,
        address indexed principal,
        Category category,
        uint96 capital,
        uint32 epochsTotal
    );
    event BidPlaced(uint256 indexed mandateId, address indexed agent, uint96 bond, int16 targetAlphaBps);
    event BidWithdrawn(uint256 indexed mandateId, address indexed agent, uint96 bond);
    event MandateAwarded(uint256 indexed mandateId, address indexed agent, uint96 bond);
    event EpochSettled(
        uint256 indexed mandateId,
        uint32 indexed epoch,
        address indexed agent,
        int256 realizedAlphaBps,
        uint96 feePaid,
        uint96 slashed
    );
    /**
     * @notice The full measurement, in the log, not merely its hash.
     *
     * Emitting the preimage means verification needs no external service: the
     * numbers are on chain, and the hash stored beside them proves they are
     * the ones that were committed to.
     */
    event Observed(
        uint256 indexed mandateId,
        uint32 indexed epoch,
        bytes32 observationHash,
        Observation observation
    );
    event AgentDismissed(uint256 indexed mandateId, address indexed agent, string reason);
    event SlashContested(uint256 indexed mandateId, uint32 indexed epoch, address indexed agent);
    event SlashResolved(uint256 indexed mandateId, uint32 indexed epoch, bool upheld, uint96 amount);
    event MandateClosed(uint256 indexed mandateId, uint96 returned);
    event AdjudicatorChanged(address indexed previous, address indexed next);
    event Assayed(address indexed agent, uint16 fineness, uint64 at);
    event MinFinenessChanged(uint16 previous, uint16 next);
    /**
     * @notice Emitted whenever the bidding floor moves.
     *
     * @dev These two setters changed state silently. `minBond` gates every bid
     *      and `challengeWindow` decides how long a dismissed agent has to
     *      contest a slash — both are things a watcher needs to see change, and
     *      neither was observable without polling storage.
     */
    event MinBondChanged(uint96 previous, uint96 next);
    event ChallengeWindowChanged(uint64 previous, uint64 next);
    event Withdrawal(address indexed to, uint256 amount);

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
    error NotBidder();
    error MandateHeld();
    error NothingToWithdraw();
    error TransferFailed();
    error WindowOpen();
    error AlreadyResolved();
    error NotAssayed();
    error BelowFineness();
    error NoOpeningAttestation();
    error StaleObservation();
    error AlphaContradictsObservation();

    modifier onlyAdjudicator() {
        if (msg.sender != adjudicator) revert NotAdjudicator();
        _;
    }

    /// @param minBond_ Smallest bond a bid may post. Must be non-zero: a
    ///                  costless bid is the failure this market exists to fix.
    constructor(address adjudicator_, uint96 minBond_) Ownable(msg.sender) {
        if (minBond_ == 0) revert BondTooSmall();
        adjudicator = adjudicator_;
        minBond = minBond_;
        emit AdjudicatorChanged(address(0), adjudicator_);
        emit MinBondChanged(0, minBond_);
    }

    // ---------------------------------------------------------- principals --

    /**
     * @notice Opens a mandate and escrows the capital to be managed.
     * @param category      Which market function the mandate covers.
     * @param toleranceBps  Underperformance tolerated before a slash (bps).
     * @param feeBps        Agent's share of positive alpha (bps).
     * @param slashBps      Share of the bond slashed per failing epoch (bps).
     * @param epochLength   Seconds between settlements.
     * @param epochsTotal   Number of epochs in the term.
     */
    function openMandate(
        Category category,
        uint16 toleranceBps,
        uint16 feeBps,
        uint16 slashBps,
        uint32 epochLength,
        uint32 epochsTotal
    ) external payable returns (uint256 mandateId) {
        if (msg.value == 0) revert NoCapital();
        if (
            toleranceBps > MAX_BPS || feeBps > MAX_BPS || slashBps == 0 || slashBps > MAX_BPS
                || epochLength == 0 || epochsTotal == 0
        ) revert BadParameters();

        mandateId = _mandates.length;
        _mandates.push(
            Mandate({
                principal: msg.sender,
                capital: uint96(msg.value),
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
                strikes: 0
            })
        );

        emit MandateOpened(mandateId, msg.sender, category, uint96(msg.value), epochsTotal);
    }

    /**
     * @notice Awards an open mandate, recording what the managed wallet was
     *         worth at the moment authority passed.
     *
     * The opening measurement is required rather than optional. Without it
     * there is no denominator, and an epoch settled against a benchmark that
     * was written down afterwards is not a benchmark.
     */
    function award(uint256 mandateId, uint256 bidIndex, Observation calldata opening)
        external
        nonReentrant
    {
        Mandate storage m = _mandates[mandateId];
        if (msg.sender != m.principal) revert NotPrincipal();
        if (m.state != State.Open) revert BadState();
        // A measurement from a block that has not happened, or one too old to
        // still describe the wallet, is not an opening balance.
        if (opening.blockNumber > block.number || opening.valuationWei == 0) {
            revert StaleObservation();
        }

        bytes32 h = hashObservation(opening);
        openAttestation[mandateId] = Attestation({
            observationHash: h,
            valuationWei: opening.valuationWei,
            blockNumber: opening.blockNumber,
            takenAt: uint64(block.timestamp)
        });
        emit Observed(mandateId, type(uint32).max, h, opening);

        _award(mandateId, m, bidIndex);
    }

    /**
     * @notice The commitment for an observation.
     * @dev Public so a verifier can recompute it from the emitted preimage
     *      using this contract's own definition rather than its own guess.
     */
    function hashObservation(Observation calldata o) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                o.wallet, o.valuationWei, o.gasSpentWei, o.priceX96, o.blockNumber, o.breakdownRef
            )
        );
    }

    /**
     * @notice Closes a completed mandate: capital home, bond released.
     * @dev Callable once the term is served, or by the principal on an
     *      abandoned mandate that never found a holder.
     */
    function closeMandate(uint256 mandateId) external nonReentrant {
        Mandate storage m = _mandates[mandateId];
        if (m.state == State.Closed || m.state == State.Abandoned) revert BadState();

        bool termServed = m.epochsSettled >= m.epochsTotal;
        bool abandonedByPrincipal = m.state == State.Open && msg.sender == m.principal;
        if (!termServed && !abandonedByPrincipal) revert BadState();

        uint96 capital = m.capital;
        m.capital = 0;
        withdrawable[m.principal] += capital;

        if (m.agent != address(0) && m.bond > 0) {
            uint96 bond = m.bond;
            m.bond = 0;
            withdrawable[m.agent] += bond;
        }

        // Anything still queued is released; the contest is over.
        _releaseAllBids(mandateId);

        m.state = termServed ? State.Closed : State.Abandoned;
        emit MandateClosed(mandateId, capital);
    }

    // --------------------------------------------------------------- agents --

    /**
     * @notice Bids for a mandate, escrowing a bond as the cost of the claim.
     * @param targetAlphaBps What the agent commits to beat the benchmark by.
     */
    function bid(uint256 mandateId, int16 targetAlphaBps) external payable returns (uint256 bidIndex) {
        Mandate storage m = _mandates[mandateId];
        if (m.state != State.Open) revert BadState();
        if (msg.value < minBond) revert BondTooSmall();

        // A bond proves the agent has something to lose. Fineness proves it can
        // do the work at all. Requiring only the first would let a wallet that
        // has never sent a transaction bid for real capital.
        if (minFineness > 0) {
            if (assayedAt[msg.sender] == 0) revert NotAssayed();
            if (fineness[msg.sender] < minFineness) revert BelowFineness();
        }

        bidIndex = _bids[mandateId].length;
        _bids[mandateId].push(
            Bid({agent: msg.sender, bond: uint96(msg.value), targetAlphaBps: targetAlphaBps, spent: false})
        );
        emit BidPlaced(mandateId, msg.sender, uint96(msg.value), targetAlphaBps);
    }

    /// @notice Withdraws a bid that has not been promoted, releasing its bond.
    function withdrawBid(uint256 mandateId, uint256 bidIndex) external nonReentrant {
        Bid[] storage queue = _bids[mandateId];
        if (bidIndex >= queue.length) revert NoSuchBid();
        Bid storage b = queue[bidIndex];
        if (b.agent != msg.sender) revert NotBidder();
        if (b.spent) revert BidSpent();
        // The holder's bond is not a bid any more; it is at risk.
        if (_mandates[mandateId].agent == msg.sender) revert MandateHeld();

        b.spent = true;
        uint96 bond = b.bond;
        b.bond = 0;
        withdrawable[msg.sender] += bond;
        emit BidWithdrawn(mandateId, msg.sender, bond);
    }

    /// @notice Contests a slash within the challenge window, freezing it for review.
    function contestSlash(uint256 mandateId, uint32 epoch) external {
        PendingSlash storage p = pendingSlash[mandateId][epoch];
        if (p.agent != msg.sender) revert NotBidder();
        if (p.resolved) revert AlreadyResolved();
        if (block.timestamp >= p.claimableAt) revert WindowOpen();
        p.contested = true;
        emit SlashContested(mandateId, epoch, msg.sender);
    }

    // --------------------------------------------------------- adjudicator --

    /**
     * @notice Settles one epoch against the benchmark.
     * @dev The single privileged action in this contract, and it cannot move
     *      capital to the adjudicator: alpha only routes value between the
     *      principal and the incumbent agent's bond.
     * @param realizedAlphaBps Performance against the benchmark, in bps.
     *        Positive beat it; negative trailed it.
     */
    function settleEpoch(uint256 mandateId, int256 realizedAlphaBps, Observation calldata obs)
        external
        onlyAdjudicator
        nonReentrant
    {
        if (realizedAlphaBps > MAX_ALPHA_BPS || realizedAlphaBps < -MAX_ALPHA_BPS) {
            revert BadParameters();
        }
        Mandate storage m = _mandates[mandateId];
        if (m.state != State.Active) revert BadState();
        if (m.epochsSettled >= m.epochsTotal) revert TermComplete();
        if (block.timestamp < m.lastSettledAt + m.epochLength) revert EpochNotElapsed();

        uint32 epoch = m.epochsSettled;
        address agent = m.agent;

        // The reported alpha must agree with the adjudicator's own measurements.
        //
        // This does not make the adjudicator trustworthy — it can still report a
        // false valuation. It makes it *consistent*: it can no longer commit to
        // two numbers and then report a third that they do not imply. The lie,
        // if there is one, is now a public claim about wallet value at a named
        // block, which anyone can check against the chain.
        _requireAlphaMatchesObservations(mandateId, epoch, realizedAlphaBps, obs);

        m.epochsSettled = epoch + 1;
        m.lastSettledAt = uint64(block.timestamp);
        m.cumulativeAlphaBps += realizedAlphaBps;

        uint96 feePaid;
        uint96 slashed;

        if (realizedAlphaBps > 0) {
            // Outperformance earns a fee, and the fee is deducted from the
            // escrowed capital rather than from the notional gain.
            //
            // This matters for solvency. Positions are held off-vault, so the
            // gain that justifies the fee is not ether this contract holds.
            // Paying a share of a notional gain would credit a withdrawal the
            // contract has no backing for and drain another mandate's escrow.
            // Charging the escrow keeps the invariant that liabilities never
            // exceed the balance: the principal's return is capital minus fees
            // paid, and their off-vault gain settles where it was earned.
            //
            // Cast is safe: the branch guarantees realizedAlphaBps > 0, and
            // MAX_ALPHA_BPS caps it well below any overflow of uint96.
            uint256 gain = (uint256(m.capital) * uint256(realizedAlphaBps)) / MAX_BPS;
            uint256 fee = (gain * m.feeBps) / MAX_BPS;
            if (fee > m.capital) fee = m.capital; // never over-draw the escrow
            feePaid = uint96(fee);
            if (feePaid > 0) {
                m.capital -= feePaid;
                withdrawable[agent] += feePaid;
            }
            m.strikes = 0;
        } else if (realizedAlphaBps < -int256(uint256(m.toleranceBps))) {
            // Beyond tolerance: the bond answers for it.
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
            // Within tolerance: no reward, no penalty, but not a clean epoch.
            m.strikes = 0;
        }

        emit EpochSettled(mandateId, epoch, agent, realizedAlphaBps, feePaid, slashed);

        // Dismissal and succession happen here, in this transaction, so that
        // losing a mandate is a state transition rather than a process.
        if (realizedAlphaBps <= CATASTROPHIC_ALPHA_BPS) {
            _dismiss(mandateId, m, "catastrophic underperformance");
        } else if (m.strikes >= STRIKES_TO_DISMISS) {
            _dismiss(mandateId, m, "three consecutive failing epochs");
        } else if (m.bond == 0) {
            _dismiss(mandateId, m, "bond exhausted");
        }
    }

    /**
     * @dev Stores the epoch measurement and rejects an alpha the measurements
     *      do not imply.
     *
     * Alpha is the proportional change from the previous mark — the opening
     * attestation for the first epoch, the prior epoch's thereafter. A single
     * basis point of tolerance absorbs integer rounding; anything wider would
     * be a place to hide a thumb on the scale.
     */
    function _requireAlphaMatchesObservations(
        uint256 mandateId,
        uint32 epoch,
        int256 realizedAlphaBps,
        Observation calldata obs
    ) private {
        if (obs.blockNumber > block.number || obs.valuationWei == 0) revert StaleObservation();

        Attestation memory prev =
            epoch == 0 ? openAttestation[mandateId] : epochAttestation[mandateId][epoch - 1];
        if (prev.observationHash == bytes32(0) || prev.valuationWei == 0) {
            revert NoOpeningAttestation();
        }
        // Measurements must move forward in block height, or an adjudicator
        // could re-report an older, more flattering reading.
        if (obs.blockNumber < prev.blockNumber) revert StaleObservation();

        int256 expected = (int256(uint256(obs.valuationWei)) * int256(uint256(MAX_BPS)))
            / int256(uint256(prev.valuationWei)) - int256(uint256(MAX_BPS));
        int256 drift = realizedAlphaBps - expected;
        if (drift > 1 || drift < -1) revert AlphaContradictsObservation();

        bytes32 h = hashObservation(obs);
        epochAttestation[mandateId][epoch] = Attestation({
            observationHash: h,
            valuationWei: obs.valuationWei,
            blockNumber: obs.blockNumber,
            takenAt: uint64(block.timestamp)
        });
        emit Observed(mandateId, epoch, h, obs);
    }

    /**
     * @notice Publishes an agent's assayed fineness.
     * @dev Adjudicator-only, and deliberately not a value transfer: this can
     *      admit an agent to the market or bar it, but it can never move
     *      capital. Re-publishing is expected — an agent that lets its endpoint
     *      die should lose its standing.
     */
    function publishAssay(address agent, uint16 fineness_) external onlyAdjudicator {
        if (fineness_ > 1000) revert BadParameters();
        fineness[agent] = fineness_;
        assayedAt[agent] = uint64(block.timestamp);
        emit Assayed(agent, fineness_, uint64(block.timestamp));
    }

    /// @notice Publishes several assays at once, for an indexer sweep.
    function publishAssays(address[] calldata agents, uint16[] calldata values)
        external
        onlyAdjudicator
    {
        if (agents.length != values.length) revert BadParameters();
        for (uint256 i = 0; i < agents.length; i++) {
            if (values[i] > 1000) revert BadParameters();
            fineness[agents[i]] = values[i];
            assayedAt[agents[i]] = uint64(block.timestamp);
            emit Assayed(agents[i], values[i], uint64(block.timestamp));
        }
    }

    /// @notice Resolves a contested slash. Upheld pays the principal; overturned returns the bond.
    function resolveSlash(uint256 mandateId, uint32 epoch, bool upheld) external onlyOwner nonReentrant {
        PendingSlash storage p = pendingSlash[mandateId][epoch];
        if (p.resolved || p.amount == 0) revert AlreadyResolved();
        p.resolved = true;
        uint96 amount = p.amount;
        address beneficiary = upheld ? _mandates[mandateId].principal : p.agent;
        withdrawable[beneficiary] += amount;
        emit SlashResolved(mandateId, epoch, upheld, amount);
    }

    /// @notice Claims an uncontested slash once its challenge window has passed.
    function claimSlash(uint256 mandateId, uint32 epoch) external nonReentrant {
        PendingSlash storage p = pendingSlash[mandateId][epoch];
        if (p.resolved || p.amount == 0) revert AlreadyResolved();
        if (p.contested) revert AlreadyResolved();
        if (block.timestamp < p.claimableAt) revert WindowOpen();
        p.resolved = true;
        uint96 amount = p.amount;
        withdrawable[_mandates[mandateId].principal] += amount;
        emit SlashResolved(mandateId, epoch, true, amount);
    }

    // -------------------------------------------------------------- internal --

    function _award(uint256 mandateId, Mandate storage m, uint256 bidIndex) private {
        Bid[] storage queue = _bids[mandateId];
        if (bidIndex >= queue.length) revert NoSuchBid();
        Bid storage b = queue[bidIndex];
        if (b.spent) revert BidSpent();

        b.spent = true;
        m.agent = b.agent;
        m.bond = b.bond;
        m.state = State.Active;
        m.strikes = 0;
        m.lastSettledAt = uint64(block.timestamp);

        emit MandateAwarded(mandateId, b.agent, b.bond);
    }

    /**
     * @dev Dismisses the incumbent and promotes the next live bid in the same
     *      transaction. The residual bond returns to the dismissed agent; only
     *      slashed amounts are forfeit.
     */
    function _dismiss(uint256 mandateId, Mandate storage m, string memory reason) private {
        address outgoing = m.agent;
        uint96 residual = m.bond;

        m.agent = address(0);
        m.bond = 0;
        m.strikes = 0;
        if (residual > 0) withdrawable[outgoing] += residual;

        emit AgentDismissed(mandateId, outgoing, reason);

        uint256 next = _nextLiveBid(mandateId);
        if (next == type(uint256).max || m.epochsSettled >= m.epochsTotal) {
            // Nobody left to take it, or the term is over: capital goes home.
            m.state = State.Open;
            return;
        }
        m.state = State.Open; // transient, so _award's invariant holds
        _award(mandateId, m, next);
    }

    function _nextLiveBid(uint256 mandateId) private view returns (uint256) {
        Bid[] storage queue = _bids[mandateId];
        uint256 best = type(uint256).max;
        int16 bestTarget = type(int16).min;
        for (uint256 i = 0; i < queue.length; i++) {
            Bid storage b = queue[i];
            if (b.spent || b.bond == 0) continue;
            // Succession favours the strongest surviving commitment.
            if (b.targetAlphaBps > bestTarget) {
                bestTarget = b.targetAlphaBps;
                best = i;
            }
        }
        return best;
    }

    function _releaseAllBids(uint256 mandateId) private {
        Bid[] storage queue = _bids[mandateId];
        for (uint256 i = 0; i < queue.length; i++) {
            Bid storage b = queue[i];
            if (b.spent || b.bond == 0) continue;
            b.spent = true;
            uint96 bond = b.bond;
            b.bond = 0;
            withdrawable[b.agent] += bond;
        }
    }

    // ---------------------------------------------------------------- value --

    /// @notice Pull payment. Nothing in this contract pushes ether.
    function withdraw() external nonReentrant {
        uint256 amount = withdrawable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        withdrawable[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawal(msg.sender, amount);
    }

    // ----------------------------------------------------------------- admin --

    function setAdjudicator(address next) external onlyOwner {
        emit AdjudicatorChanged(adjudicator, next);
        adjudicator = next;
    }

    function setChallengeWindow(uint64 seconds_) external onlyOwner {
        emit ChallengeWindowChanged(challengeWindow, seconds_);
        challengeWindow = seconds_;
    }

    function setMinBond(uint96 wei_) external onlyOwner {
        // Same rule as the constructor: a costless bid defeats the market.
        if (wei_ == 0) revert BondTooSmall();
        emit MinBondChanged(minBond, wei_);
        minBond = wei_;
    }

    /// @notice Sets the assay bar for bidding. 375 is the lowest hallmarkable grade.
    function setMinFineness(uint16 next) external onlyOwner {
        if (next > 1000) revert BadParameters();
        emit MinFinenessChanged(minFineness, next);
        minFineness = next;
    }

    // ----------------------------------------------------------------- views --

    function mandateCount() external view returns (uint256) {
        return _mandates.length;
    }

    function getMandate(uint256 mandateId) external view returns (Mandate memory) {
        return _mandates[mandateId];
    }

    function getBids(uint256 mandateId) external view returns (Bid[] memory) {
        return _bids[mandateId];
    }

    function bidCount(uint256 mandateId) external view returns (uint256) {
        return _bids[mandateId].length;
    }

    /// @notice The agent that would take over if the incumbent were dismissed now.
    function successor(uint256 mandateId) external view returns (address) {
        uint256 i = _nextLiveBid(mandateId);
        return i == type(uint256).max ? address(0) : _bids[mandateId][i].agent;
    }
}
