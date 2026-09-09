// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

/**
 * @title ShadowLedger
 * @notice A measured track record for agents with nothing at risk.
 *
 * The market has a cold-start problem it cannot solve from inside itself.
 * Rung 6 — an agent with settled, attested epochs — is the only rung that
 * means much, and reaching it requires a principal willing to hand real
 * capital to an agent that has no record, because it has never held capital.
 * Nobody goes first.
 *
 * A shadow mandate is the way through. The agent declares a wallet and a
 * category, and the adjudicator measures it on the same schedule and under the
 * **same attestation discipline as a real mandate**: every measurement is
 * committed on chain before its outcome is known, alpha is re-derived from two
 * consecutive marks, and a reported number that contradicts them is rejected.
 *
 * The only thing missing is the money. That is the point, and it is stated
 * everywhere this data is shown: a shadow record is evidence of skill, not
 * evidence of skin. An agent with fifty shadow epochs and no bond has proven
 * one of the two things a principal needs to know.
 *
 * Deliberately not a fork of the market. There is no capital here, no bond, no
 * fee, no slash and no dismissal — so there is nothing to steal, and the
 * contract is small enough to read in one sitting.
 */
contract ShadowLedger is Ownable {
    // -------------------------------------------------------------- types --

    enum Category {
        Rebalancing,
        GridTrading,
        YieldOptimisation,
        HealthFactor
    }

    enum Benchmark {
        Hold,
        BestPassiveRate,
        LiquidationAvoided
    }

    /// @dev Identical in shape to the market's, so one measurement pipeline
    ///      serves both and a shadow record is checked exactly as a real one is.
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

    struct Shadow {
        address agent;
        /// @notice The wallet being measured. Often, but not always, the agent.
        address wallet;
        Category category;
        Benchmark benchmark;
        uint32 epochLength;
        uint32 epochsRecorded;
        uint64 lastRecordedAt;
        uint64 startedAt;
        int256 cumulativeAlphaBps;
        /// @notice Epochs that came in below benchmark. Published, not hidden.
        uint32 negativeEpochs;
        bool closed;
    }

    // ---------------------------------------------------------- parameters --

    uint16 public constant MAX_BPS = 10_000;
    int256 public constant MAX_ALPHA_BPS = 100_000;

    address public adjudicator;

    // ------------------------------------------------------------- storage --

    Shadow[] private _shadows;
    mapping(uint256 => Attestation) public openAttestation;
    mapping(uint256 => mapping(uint32 => Attestation)) public epochAttestation;
    /// @dev agent => the shadow records it has opened, for a career view.
    mapping(address => uint256[]) private _byAgent;

    // -------------------------------------------------------------- events --

    event ShadowOpened(
        uint256 indexed shadowId,
        address indexed agent,
        address indexed wallet,
        Category category,
        Benchmark benchmark
    );
    event ShadowRecorded(uint256 indexed shadowId, uint32 indexed epoch, int256 alphaBps);
    event Observed(
        uint256 indexed shadowId, uint32 indexed epoch, bytes32 observationHash, Observation observation
    );
    event ShadowClosed(uint256 indexed shadowId, uint32 epochs, int256 cumulativeAlphaBps);
    event AdjudicatorChanged(address indexed previous, address indexed next);

    // -------------------------------------------------------------- errors --

    error NotAdjudicator();
    error NotAgent();
    error BadParameters();
    error Closed();
    error EpochNotElapsed();
    error StaleObservation();
    error NoOpeningAttestation();
    error AlphaContradictsObservation();

    modifier onlyAdjudicator() {
        if (msg.sender != adjudicator) revert NotAdjudicator();
        _;
    }

    constructor(address adjudicator_) Ownable(msg.sender) {
        adjudicator = adjudicator_;
        emit AdjudicatorChanged(address(0), adjudicator_);
    }

    // ------------------------------------------------------------ lifecycle --

    /**
     * @notice Starts measuring a wallet, with an opening mark.
     * @dev Permissionless. Anyone may ask to be measured — refusing to measure
     *      an agent would make this a curated list, which is the thing the
     *      whole product objects to.
     */
    function open(
        address wallet,
        Category category,
        Benchmark benchmark,
        uint32 epochLength,
        Observation calldata opening
    ) external returns (uint256 shadowId) {
        if (epochLength == 0 || wallet == address(0)) revert BadParameters();
        if (opening.valuationWei == 0 || opening.benchmarkWei == 0) revert StaleObservation();
        if (opening.blockNumber > block.number) revert StaleObservation();

        shadowId = _shadows.length;
        _shadows.push(
            Shadow({
                agent: msg.sender,
                wallet: wallet,
                category: category,
                benchmark: benchmark,
                epochLength: epochLength,
                epochsRecorded: 0,
                lastRecordedAt: uint64(block.timestamp),
                startedAt: uint64(block.timestamp),
                cumulativeAlphaBps: 0,
                negativeEpochs: 0,
                closed: false
            })
        );
        _byAgent[msg.sender].push(shadowId);

        bytes32 h = hashObservation(opening);
        openAttestation[shadowId] = Attestation({
            observationHash: h,
            valuationWei: opening.valuationWei,
            blockNumber: opening.blockNumber,
            takenAt: uint64(block.timestamp),
            benchmarkWei: opening.benchmarkWei
        });
        emit Observed(shadowId, type(uint32).max, h, opening);
        emit ShadowOpened(shadowId, msg.sender, wallet, category, benchmark);
    }

    /**
     * @notice Records one measured epoch.
     * @dev The same arithmetic the market enforces. A shadow record that could
     *      be written loosely would be worth exactly as much as the registry
     *      reputation this project exists to disbelieve.
     */
    function record(uint256 shadowId, int256 alphaBps, Observation calldata obs)
        external
        onlyAdjudicator
    {
        if (alphaBps > MAX_ALPHA_BPS || alphaBps < -MAX_ALPHA_BPS) revert BadParameters();
        Shadow storage s = _shadows[shadowId];
        if (s.closed) revert Closed();
        if (block.timestamp < s.lastRecordedAt + s.epochLength) revert EpochNotElapsed();

        uint32 epoch = s.epochsRecorded;
        _requireAlphaMatchesObservations(shadowId, epoch, alphaBps, obs);

        s.epochsRecorded = epoch + 1;
        s.lastRecordedAt = uint64(block.timestamp);
        s.cumulativeAlphaBps += alphaBps;
        if (alphaBps < 0) s.negativeEpochs += 1;

        emit ShadowRecorded(shadowId, epoch, alphaBps);
    }

    /// @notice Ends a record. The agent may stop; the adjudicator may not force it.
    function close(uint256 shadowId) external {
        Shadow storage s = _shadows[shadowId];
        if (msg.sender != s.agent) revert NotAgent();
        if (s.closed) revert Closed();
        s.closed = true;
        emit ShadowClosed(shadowId, s.epochsRecorded, s.cumulativeAlphaBps);
    }

    function setAdjudicator(address next) external onlyOwner {
        emit AdjudicatorChanged(adjudicator, next);
        adjudicator = next;
    }

    // ---------------------------------------------------------- internals --

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

    function _requireAlphaMatchesObservations(
        uint256 shadowId,
        uint32 epoch,
        int256 alphaBps,
        Observation calldata obs
    ) private {
        if (obs.blockNumber > block.number || obs.valuationWei == 0) revert StaleObservation();
        if (obs.benchmarkWei == 0) revert StaleObservation();

        Attestation memory prev =
            epoch == 0 ? openAttestation[shadowId] : epochAttestation[shadowId][epoch - 1];
        if (prev.observationHash == bytes32(0) || prev.valuationWei == 0 || prev.benchmarkWei == 0) {
            revert NoOpeningAttestation();
        }
        if (obs.blockNumber < prev.blockNumber) revert StaleObservation();

        int256 agentReturn = (int256(uint256(obs.valuationWei)) * int256(uint256(MAX_BPS)))
            / int256(uint256(prev.valuationWei)) - int256(uint256(MAX_BPS));
        int256 benchReturn = (int256(uint256(obs.benchmarkWei)) * int256(uint256(MAX_BPS)))
            / int256(uint256(prev.benchmarkWei)) - int256(uint256(MAX_BPS));
        int256 drift = alphaBps - (agentReturn - benchReturn);
        if (drift > 2 || drift < -2) revert AlphaContradictsObservation();

        bytes32 h = hashObservation(obs);
        epochAttestation[shadowId][epoch] = Attestation({
            observationHash: h,
            valuationWei: obs.valuationWei,
            blockNumber: obs.blockNumber,
            takenAt: uint64(block.timestamp),
            benchmarkWei: obs.benchmarkWei
        });
        emit Observed(shadowId, epoch, h, obs);
    }

    // --------------------------------------------------------------- views --

    function shadowCount() external view returns (uint256) {
        return _shadows.length;
    }

    function getShadow(uint256 shadowId) external view returns (Shadow memory) {
        return _shadows[shadowId];
    }

    function shadowsOf(address agent) external view returns (uint256[] memory) {
        return _byAgent[agent];
    }
}
