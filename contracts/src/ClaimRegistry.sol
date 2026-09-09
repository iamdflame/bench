// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Metric, Verdict, Assertion, IVerdict, Measure} from "./Outcome.sol";

/**
 * @title ClaimRegistry
 * @notice A bid is a claim the agent signed, and the id of the mandate is the
 *         hash of that claim.
 *
 * ---------------------------------------------------------------------------
 * The hole this closes
 * ---------------------------------------------------------------------------
 *
 * `OutcomePolicy.bind` is permissionless and first-come. That is defensible
 * for an ERC-8183 job, where the id comes from a router and both parties have
 * already agreed off-chain. It is not defensible for a bond: anybody could
 * bind a deliberately unmeetable assertion to a mandate id and either block it
 * for ever or, worse, stand behind it while somebody's collateral was taken.
 *
 * The fix is not an access list. It is that **the mandate id is the hash of
 * the terms**. There is no id to squat, because an id only exists once terms
 * exist, and terms only exist once the agent has signed them. An attacker who
 * front-runs with the agent's own signed claim performs the same registration
 * we would have performed and pays the gas for it.
 *
 * ---------------------------------------------------------------------------
 * What an agent is signing
 * ---------------------------------------------------------------------------
 *
 * Everything that decides whether its money is taken: the position being
 * measured, the metric, the threshold it is promising, the window, the oracle
 * that will read it, and the exact collateral at risk. All of it, in one
 * EIP-712 struct, so a wallet can render the promise in full rather than
 * asking somebody to approve a hash.
 *
 * The oracle is in the signed payload deliberately. A claim that let the
 * counterparty choose the measurement afterwards would be a claim about
 * nothing.
 */
contract ClaimRegistry is IVerdict {
    /**
     * The terms of one bid.
     *
     * `salt` exists so an agent can make the same promise about the same
     * position twice — two identical claims would otherwise collide on their
     * hash, and the second would be rejected as already open.
     */
    struct Claim {
        /// Whose collateral is at risk, and whose signature is required.
        address agent;
        /// The only address a slash can ever reach.
        address principal;
        /// The position or account being measured.
        address subject;
        Metric metric;
        /// What the agent promises. Compared with `>=`.
        int256 threshold;
        uint64 windowStart;
        uint64 windowEnd;
        /// Who measures it, named before the work rather than after.
        address oracle;
        /// The collateral token and the amount of it at risk.
        address token;
        uint256 bond;
        /// The agent's fee if the claim holds, in basis points of the bond.
        uint16 feeBps;
        bytes32 salt;
    }

    bytes32 public constant CLAIM_TYPEHASH = keccak256(
        "Claim(address agent,address principal,address subject,uint8 metric,int256 threshold,uint64 windowStart,uint64 windowEnd,address oracle,address token,uint256 bond,uint16 feeBps,bytes32 salt)"
    );

    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");

    /// Fixed at deployment. Rebuilt on read if the chain forks under us.
    uint256 private immutable _deployChainId;
    bytes32 private immutable _deployDomainSeparator;

    mapping(uint256 => Claim) private _claims;
    mapping(uint256 => bool) private _open;

    /**
     * A mandate opened, and enough of it to index on.
     *
     * Deliberately not the whole claim. The id *is* the hash of the terms, so
     * every field is recoverable from `claimOf` or from this call's own
     * calldata, and a twelve-field event costs gas on every bid to duplicate
     * something already on chain.
     */
    event Opened(
        uint256 indexed mandateId,
        address indexed agent,
        address indexed principal,
        address token,
        uint256 bond,
        int256 threshold,
        uint64 windowEnd
    );

    error AlreadyOpen(uint256 mandateId);
    error NotOpen(uint256 mandateId);
    error BadSignature(address recovered, address agent);
    error MalleableSignature();
    error NoOracle();
    error NoSubject();
    error NoPrincipal();
    error EmptyWindow(uint64 start, uint64 end);
    error NoBond();
    error FeeTooLarge(uint16 feeBps);

    /// A fee larger than the bond it is paid against would be a strange promise.
    uint16 public constant MAX_FEE_BPS = 10_000;

    constructor() {
        _deployChainId = block.chainid;
        _deployDomainSeparator = _buildDomainSeparator();
    }

    // -----------------------------------------------------------------------
    // Opening
    // -----------------------------------------------------------------------

    /**
     * Record a signed claim and the mandate it creates.
     *
     * Permissionless, because the signature is the authorisation. Whoever
     * submits it — the principal, the agent, a relayer — the terms recorded
     * are the terms the agent signed, and the id they are recorded under is
     * derived from those terms rather than chosen by the caller.
     */
    function open(Claim calldata c, bytes calldata signature) external returns (uint256 mandateId) {
        if (c.oracle == address(0)) revert NoOracle();
        if (c.subject == address(0)) revert NoSubject();
        if (c.principal == address(0)) revert NoPrincipal();
        if (c.windowEnd <= c.windowStart) revert EmptyWindow(c.windowStart, c.windowEnd);
        if (c.bond == 0) revert NoBond();
        if (c.feeBps > MAX_FEE_BPS) revert FeeTooLarge(c.feeBps);

        bytes32 digest = hashClaim(c);
        address signer = _recover(digest, signature);
        if (signer != c.agent) revert BadSignature(signer, c.agent);

        mandateId = uint256(digest);
        if (_open[mandateId]) revert AlreadyOpen(mandateId);

        _claims[mandateId] = c;
        _open[mandateId] = true;

        emit Opened(mandateId, c.agent, c.principal, c.token, c.bond, c.threshold, c.windowEnd);
    }

    // -----------------------------------------------------------------------
    // Reading
    // -----------------------------------------------------------------------

    function claimOf(uint256 mandateId) external view returns (Claim memory) {
        if (!_open[mandateId]) revert NotOpen(mandateId);
        return _claims[mandateId];
    }

    function isOpen(uint256 mandateId) external view returns (bool) {
        return _open[mandateId];
    }

    /**
     * The verdict on a mandate, from the claim its own agent signed.
     *
     * Same guarded measurement as every other verdict in this system, because
     * it is literally the same library.
     */
    function check(uint256 mandateId)
        external
        view
        returns (Verdict verdict, int256 measured, int256 threshold)
    {
        if (!_open[mandateId]) revert NotOpen(mandateId);
        Claim memory c = _claims[mandateId];
        Assertion memory a = _assertionOf(c);
        (verdict, measured) = Measure.verdict(a);
        return (verdict, measured, c.threshold);
    }

    /// The assertion a claim implies, so a reader can check the derivation.
    function assertionOf(uint256 mandateId) external view returns (Assertion memory) {
        if (!_open[mandateId]) revert NotOpen(mandateId);
        return _assertionOf(_claims[mandateId]);
    }

    function _assertionOf(Claim memory c) private pure returns (Assertion memory) {
        return Assertion({
            metric: c.metric,
            subject: c.subject,
            threshold: c.threshold,
            windowStart: c.windowStart,
            windowEnd: c.windowEnd,
            oracle: c.oracle
        });
    }

    // -----------------------------------------------------------------------
    // EIP-712
    // -----------------------------------------------------------------------

    function domainSeparator() public view returns (bytes32) {
        // A chain that forks changes `chainid`, and a signature valid on one
        // side must not be replayable on the other.
        return block.chainid == _deployChainId ? _deployDomainSeparator : _buildDomainSeparator();
    }

    function hashClaim(Claim calldata c) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                CLAIM_TYPEHASH,
                c.agent,
                c.principal,
                c.subject,
                uint8(c.metric),
                c.threshold,
                c.windowStart,
                c.windowEnd,
                c.oracle,
                c.token,
                c.bond,
                c.feeBps,
                c.salt
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash));
    }

    function _buildDomainSeparator() private view returns (bytes32) {
        return keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes("Crucible")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    /**
     * Recover a signer, refusing the half of the curve that would let one
     * signature be presented as two.
     *
     * A malleable signature is not a security hole here by itself — the digest
     * is what keys the mandate, not the signature — but accepting one means
     * two distinct byte strings authorise the same claim, and anything built
     * on top that keys off the signature would be wrong. Refusing is cheaper
     * than reasoning about who might do that later.
     */
    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address) {
        if (signature.length != 65) revert MalleableSignature();

        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        // secp256k1's order, halved. Anything above it is the mirrored signature.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            revert MalleableSignature();
        }
        if (v != 27 && v != 28) revert MalleableSignature();

        address signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert BadSignature(address(0), address(0));
        return signer;
    }
}
