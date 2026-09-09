// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AssayBond
 * @notice The assay office puts its own capital behind every mark it strikes.
 *
 * This market's whole argument is that a claim costs nothing, so an agent must
 * bond before anyone believes it. That argument has a hole in the middle of it:
 * **the assay is itself a claim**, and striking a hallmark costs the office
 * nothing at all. The referee was the one party in the system with no skin in
 * the game.
 *
 * So the office escrows a bond behind every hallmark at or above 375, and
 * anyone may take that bond by showing the mark was wrong. A rating with money
 * behind it is no longer an opinion; it is a position, and it can be taken.
 *
 * ---------------------------------------------------------------------------
 * What this contract can and cannot settle, stated plainly
 * ---------------------------------------------------------------------------
 *
 * A contract cannot call an HTTP endpoint, and it cannot read another account's
 * transaction history. So the six assay dimensions do not all resolve the same
 * way, and pretending otherwise would be exactly the kind of unearned claim
 * this contract exists to punish.
 *
 *   SELF-SETTLING. The office commits the addresses it assayed. If it recorded
 *   a custody separation between an agent wallet and an owner that are in fact
 *   the same address, the record contradicts itself and this contract can see
 *   that without help. `challengeSelfEvident` pays out immediately, with no
 *   window and no resolver. Nobody has to be trusted.
 *
 *   ADJUDICATED, WITH THE OFFICE ON THE HOOK FOR SILENCE. Everything else —
 *   a dead endpoint, a wallet that never touched the protocol its category
 *   implies — needs evidence from outside the chain. Those go through a window.
 *   The office may uphold the mark, but **if it does not answer before the
 *   window closes the challenger wins by default**. Ignoring a challenge is
 *   the most expensive thing the office can do, which is the only structural
 *   guarantee available when the resolver is an interested party.
 *
 * The office's resolution is not trusted, it is merely fast. Every challenge
 * records the reason and the evidence digest, so a resolution that contradicts
 * a re-derivation anyone can run is permanently visible on chain. The contract
 * cannot stop a dishonest office; it can make dishonesty legible and make
 * silence lose.
 */
contract AssayBond is Ownable, ReentrancyGuard {
    // -------------------------------------------------------------- types --

    /// @notice The lowest grade that may legally carry a hallmark.
    uint16 public constant MIN_FINENESS = 375;

    enum Ground {
        /// The recorded agent wallet and owner are the same address, so the
        /// custody separation the assay asserted is contradicted by the
        /// office's own committed data. Settles itself.
        CustodyNotSeparated,
        /// The endpoint the assay reached does not answer.
        EndpointDead,
        /// The wallet never touched the protocols its category implies.
        CapabilityUnproven,
        /// Anything else, argued in the open with an evidence digest.
        Other
    }

    struct Hallmark {
        uint256 tokenId;
        address agent;
        address owner;
        uint16 fineness;
        uint64 assayedAtBlock;
        uint64 struckAt;
        /// @dev Digest of the full assay report, so the mark commits to the
        ///      reasoning and not merely to the score.
        bytes32 assayHash;
        uint96 bond;
        bool defaced;
        bool withdrawn;
    }

    struct Challenge {
        address challenger;
        Ground ground;
        bytes32 evidenceHash;
        uint64 openedAt;
        uint64 resolveBy;
        bool resolved;
        bool upheld;
    }

    // ------------------------------------------------------------ storage --

    /// @notice Bond required behind a hallmark, in wei.
    uint96 public bondRequired;

    /// @notice How long the office has to answer a challenge before it loses.
    uint64 public challengeWindow;

    /// @dev Keyed by the ERC-8004 token id the mark was struck for.
    mapping(uint256 => Hallmark) public hallmarks;
    mapping(uint256 => Challenge) public challenges;

    /// @notice Pull-payment balances. Nothing is pushed to an address here.
    mapping(address => uint256) public withdrawable;

    // ------------------------------------------------------------- events --

    event Struck(
        uint256 indexed tokenId,
        address indexed agent,
        uint16 fineness,
        uint96 bond,
        bytes32 assayHash,
        uint64 assayedAtBlock
    );
    event Challenged(
        uint256 indexed tokenId, address indexed challenger, Ground ground, bytes32 evidenceHash, uint64 resolveBy
    );
    event Defaced(uint256 indexed tokenId, address indexed challenger, Ground ground, uint96 bond, string why);
    event Upheld(uint256 indexed tokenId, address indexed challenger, string why);
    event Released(uint256 indexed tokenId, uint96 bond);
    event Withdrawn(address indexed to, uint256 amount);
    event BondRequiredSet(uint96 previous, uint96 next);
    event ChallengeWindowSet(uint64 previous, uint64 next);

    // ------------------------------------------------------------- errors --

    error BelowHallmarkBar(uint16 fineness);
    error AlreadyStruck(uint256 tokenId);
    error NotStruck(uint256 tokenId);
    error AlreadyDefaced(uint256 tokenId);
    error WrongBond(uint96 sent, uint96 required);
    error ChallengeOpen(uint256 tokenId);
    error NoChallenge(uint256 tokenId);
    error WindowOpen(uint64 until);
    error WindowClosed(uint64 at);
    error NotSelfEvident();
    error NothingToWithdraw();
    error TransferFailed();

    // -------------------------------------------------------- constructor --

    constructor(address owner_, uint96 bondRequired_, uint64 challengeWindow_) Ownable(owner_) {
        bondRequired = bondRequired_;
        challengeWindow = challengeWindow_;
    }

    // --------------------------------------------------------- the office --

    /**
     * @notice Strikes a hallmark and escrows the bond behind it.
     * @dev Below 375 nothing is struck at all, here as everywhere else in this
     *      system. A mark that cannot be challenged is a mark nobody has to
     *      stand behind, so the bond is not optional and not refundable while
     *      the mark stands.
     */
    function strike(
        uint256 tokenId,
        address agent,
        address owner_,
        uint16 fineness,
        uint64 assayedAtBlock,
        bytes32 assayHash
    ) external payable onlyOwner {
        if (fineness < MIN_FINENESS) revert BelowHallmarkBar(fineness);
        if (hallmarks[tokenId].struckAt != 0) revert AlreadyStruck(tokenId);
        // Compared before it is stored, so the value that lands in the uint96
        // is `bondRequired` itself rather than a cast of msg.value. This
        // codebase has already shipped one uint96 truncation; a cast that is
        // merely safe today still makes a reader prove it.
        if (msg.value != uint256(bondRequired)) revert WrongBond(bondRequired, bondRequired);

        hallmarks[tokenId] = Hallmark({
            tokenId: tokenId,
            agent: agent,
            owner: owner_,
            fineness: fineness,
            assayedAtBlock: assayedAtBlock,
            struckAt: uint64(block.timestamp),
            assayHash: assayHash,
            bond: bondRequired,
            defaced: false,
            withdrawn: false
        });

        emit Struck(tokenId, agent, fineness, bondRequired, assayHash, assayedAtBlock);
    }

    /**
     * @notice Takes a standing mark down and returns the bond to the office.
     * @dev Only while no challenge is open. An office that could withdraw its
     *      bond the moment somebody challenged would have no bond at all.
     */
    function release(uint256 tokenId) external onlyOwner nonReentrant {
        Hallmark storage h = hallmarks[tokenId];
        if (h.struckAt == 0) revert NotStruck(tokenId);
        if (h.defaced) revert AlreadyDefaced(tokenId);
        Challenge storage c = challenges[tokenId];
        if (c.openedAt != 0 && !c.resolved) revert ChallengeOpen(tokenId);
        if (h.withdrawn) revert NothingToWithdraw();

        h.withdrawn = true;
        uint96 bond = h.bond;
        h.bond = 0;
        withdrawable[owner()] += bond;
        emit Released(tokenId, bond);
    }

    // ------------------------------------------------------- the challenge --

    /**
     * @notice Takes the bond immediately, on a ground this contract can check.
     *
     * The office committed both the agent wallet and the owner address when it
     * struck the mark. If they are the same address then the custody
     * separation the assay asserted is contradicted by the office's own
     * record — no endpoint, no history, no interpretation required. There is
     * nothing to adjudicate and nobody to trust, so the bond moves in the same
     * transaction.
     */
    function challengeSelfEvident(uint256 tokenId) external nonReentrant {
        Hallmark storage h = hallmarks[tokenId];
        if (h.struckAt == 0) revert NotStruck(tokenId);
        if (h.defaced) revert AlreadyDefaced(tokenId);
        if (h.withdrawn) revert NothingToWithdraw();
        if (h.agent != h.owner) revert NotSelfEvident();

        h.defaced = true;
        uint96 bond = h.bond;
        h.bond = 0;
        withdrawable[msg.sender] += bond;

        challenges[tokenId] = Challenge({
            challenger: msg.sender,
            ground: Ground.CustodyNotSeparated,
            evidenceHash: bytes32(0),
            openedAt: uint64(block.timestamp),
            resolveBy: uint64(block.timestamp),
            resolved: true,
            upheld: false
        });

        emit Defaced(
            tokenId,
            msg.sender,
            Ground.CustodyNotSeparated,
            bond,
            "the assayed agent wallet and owner are the same address"
        );
    }

    /**
     * @notice Opens a challenge the office must answer.
     * @param evidenceHash Digest of the evidence, published off chain. The
     *        contract cannot read it; recording it means the argument cannot
     *        be changed after the fact by either side.
     */
    function challenge(uint256 tokenId, Ground ground, bytes32 evidenceHash) external {
        Hallmark storage h = hallmarks[tokenId];
        if (h.struckAt == 0) revert NotStruck(tokenId);
        if (h.defaced) revert AlreadyDefaced(tokenId);
        if (h.withdrawn) revert NothingToWithdraw();
        Challenge storage existing = challenges[tokenId];
        if (existing.openedAt != 0 && !existing.resolved) revert ChallengeOpen(tokenId);

        uint64 resolveBy = uint64(block.timestamp) + challengeWindow;
        challenges[tokenId] = Challenge({
            challenger: msg.sender,
            ground: ground,
            evidenceHash: evidenceHash,
            openedAt: uint64(block.timestamp),
            resolveBy: resolveBy,
            resolved: false,
            upheld: false
        });

        emit Challenged(tokenId, msg.sender, ground, evidenceHash, resolveBy);
    }

    /**
     * @notice The office answers a challenge, before its window closes.
     * @dev `upheld` keeps the mark and the bond. Anything else defaces the mark
     *      and hands the bond to the challenger. The office is an interested
     *      party and this contract knows it: the reason string and the evidence
     *      digest are both on chain, so a resolution that contradicts a
     *      re-derivation anyone can run is permanently visible.
     */
    function resolve(uint256 tokenId, bool upheld, string calldata why) external onlyOwner nonReentrant {
        Hallmark storage h = hallmarks[tokenId];
        Challenge storage c = challenges[tokenId];
        if (c.openedAt == 0 || c.resolved) revert NoChallenge(tokenId);
        if (block.timestamp > c.resolveBy) revert WindowClosed(c.resolveBy);

        c.resolved = true;
        c.upheld = upheld;

        if (upheld) {
            emit Upheld(tokenId, c.challenger, why);
            return;
        }

        h.defaced = true;
        uint96 bond = h.bond;
        h.bond = 0;
        withdrawable[c.challenger] += bond;
        emit Defaced(tokenId, c.challenger, c.ground, bond, why);
    }

    /**
     * @notice Takes the bond because the office did not answer in time.
     *
     * The structural guarantee. An office that can win by ignoring a challenge
     * is an office with no bond at all, so silence is the most expensive
     * response available to it. Anyone may call this, not only the challenger.
     */
    function claimUnanswered(uint256 tokenId) external nonReentrant {
        Hallmark storage h = hallmarks[tokenId];
        Challenge storage c = challenges[tokenId];
        if (c.openedAt == 0 || c.resolved) revert NoChallenge(tokenId);
        if (block.timestamp <= c.resolveBy) revert WindowOpen(c.resolveBy);
        if (h.defaced) revert AlreadyDefaced(tokenId);

        c.resolved = true;
        c.upheld = false;
        h.defaced = true;
        uint96 bond = h.bond;
        h.bond = 0;
        withdrawable[c.challenger] += bond;

        emit Defaced(tokenId, c.challenger, c.ground, bond, "the office did not answer before the window closed");
    }

    // ------------------------------------------------------------- payout --

    function withdraw() external nonReentrant {
        uint256 amount = withdrawable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        withdrawable[msg.sender] = 0;
        (bool sent,) = msg.sender.call{value: amount}("");
        if (!sent) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }

    // ------------------------------------------------------------- admin --

    function setBondRequired(uint96 next) external onlyOwner {
        emit BondRequiredSet(bondRequired, next);
        bondRequired = next;
    }

    function setChallengeWindow(uint64 next) external onlyOwner {
        emit ChallengeWindowSet(challengeWindow, next);
        challengeWindow = next;
    }

    // -------------------------------------------------------------- views --

    /// @notice Whether a mark currently stands, for the site to render.
    function stands(uint256 tokenId) external view returns (bool) {
        Hallmark storage h = hallmarks[tokenId];
        return h.struckAt != 0 && !h.defaced && !h.withdrawn;
    }

    /// @notice What is currently at stake behind a mark.
    function backing(uint256 tokenId) external view returns (uint96) {
        return hallmarks[tokenId].bond;
    }
}
