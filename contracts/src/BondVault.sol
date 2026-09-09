// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Verdict, IVerdict} from "./Outcome.sol";
import {ClaimRegistry} from "./ClaimRegistry.sol";

/**
 * @title BondVault
 * @notice An agent's own money, at risk on its own claim.
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 *
 * A registry tells you an agent exists. A probe tells you its endpoint
 * answered. Neither tells you whether it is any good, and both are free to
 * satisfy — which is why 310,436 agents are registered on this chain, 33,813
 * answer, and 509 have ever received a single piece of feedback. Reputation
 * that costs nothing to acquire is worth nothing to read.
 *
 * So a listing here costs something. An agent posts collateral, locks a slice
 * of it against a specific claim about a specific position, and if the chain
 * says the claim failed, that slice goes to the person whose money it was
 * managing. A track record built this way cannot be faked, because faking it
 * costs the bond.
 *
 * ---------------------------------------------------------------------------
 * Why a bond rather than an escrow
 * ---------------------------------------------------------------------------
 *
 * The obvious design is to settle the ERC-8183 escrow on a measured outcome,
 * and `OutcomePolicy` was written to do exactly that. It cannot be used that
 * way: the router's `registerJob` keeps an allowlist and reverts with
 * `PolicyNotWhitelisted()` for anything else. That was measured, not assumed.
 *
 * A bond does not need anybody's permission. The collateral is the agent's, it
 * is held here, and the verdict that moves it is the same `OutcomePolicy`
 * verdict that could not be bound to somebody else's escrow. The blocked work
 * became the foundation rather than being thrown away.
 *
 * ---------------------------------------------------------------------------
 * The asymmetry that matters
 * ---------------------------------------------------------------------------
 *
 * `OutcomePolicy` returns four verdicts and only one of them takes money.
 * `Met` releases, `Failed` slashes, and `Pending` and `Unmeasurable` do
 * nothing at all. That asymmetry is inherited deliberately: an oracle that
 * cannot see must never be able to take an agent's collateral. A measurement
 * gap is a delay here, never a transfer.
 *
 * ---------------------------------------------------------------------------
 * What this contract cannot do
 * ---------------------------------------------------------------------------
 *
 * It cannot move an unlocked balance anywhere but back to the agent who
 * deposited it. It cannot slash more than the amount locked for that one
 * mandate. It cannot settle a mandate twice. It has no owner, no pause, no
 * upgrade path and no function that lets this deployment take a fee out of a
 * bond. The only address that ever receives a slash is the principal named at
 * lock time, and it is written into storage before the work starts.
 */

/// Minimal ERC-20. `transfer` and `transferFrom` are called through helpers
/// that tolerate the tokens on this chain which return nothing at all.
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// What a bond is locked against: one claim, one position, one window.
struct Mandate {
    /// The agent whose collateral is at risk.
    address agent;
    /// The only address that can ever receive a slash of it.
    address principal;
    /// The collateral token. Fixed at lock time so neither side can switch it.
    address token;
    /// How much of the agent's balance is at risk on this claim.
    uint256 bonded;
    /// Set once, when the mandate settles. A settled mandate cannot settle again.
    bool settled;
    /// The verdict that settled it, kept so a page can explain the outcome.
    Verdict verdict;
}

contract BondVault {
    /// The registry holding the signed claim behind every mandate.
    ClaimRegistry public immutable claims;

    /// The verdict source. `claims` in every deployment that holds collateral.
    IVerdict public immutable policy;

    /// Unlocked collateral, by agent and token. Withdrawable at any time.
    mapping(address => mapping(address => uint256)) public available;

    /// Total locked across every open mandate, by agent and token.
    mapping(address => mapping(address => uint256)) public locked;

    /// Every mandate this vault has ever held a bond for.
    mapping(uint256 => Mandate) private _mandates;

    event Deposited(address indexed agent, address indexed token, uint256 amount);
    event Withdrawn(address indexed agent, address indexed token, uint256 amount);
    event Bonded(uint256 indexed mandateId, address indexed agent, address indexed principal, address token, uint256 amount);
    event Released(uint256 indexed mandateId, address indexed agent, uint256 amount, int256 measured, int256 threshold);
    event Slashed(uint256 indexed mandateId, address indexed principal, uint256 amount, int256 measured, int256 threshold);

    error NothingToDeposit();
    error InsufficientAvailable(uint256 requested, uint256 held);
    error MandateExists(uint256 mandateId);
    error NoSuchMandate(uint256 mandateId);
    error AlreadySettled(uint256 mandateId);
    error NotDecided(uint256 mandateId, Verdict verdict);
    error NotTheAgent(address caller, address agent);
    error ZeroPrincipal();
    error TransferFailed();

    /**
     * The registry is the verdict source, not merely a neighbour of it.
     *
     * Both are stored because the vault asks two different questions: what did
     * the agent sign, and what did the chain conclude. Pointing them at one
     * contract is what makes those answers impossible to disagree — a vault
     * wired to a registry for terms and a different policy for verdicts could
     * slash against an assertion nobody signed.
     */
    constructor(ClaimRegistry c) {
        claims = c;
        policy = IVerdict(address(c));
    }

    // -----------------------------------------------------------------------
    // Collateral
    // -----------------------------------------------------------------------

    /**
     * Post collateral.
     *
     * Credited by the balance actually received rather than by the amount
     * argument, because a fee-on-transfer token would otherwise credit an
     * agent for money this contract never got and let it bond against the
     * difference.
     */
    function deposit(address token, uint256 amount) external {
        if (amount == 0) revert NothingToDeposit();

        uint256 before = IERC20(token).balanceOf(address(this));
        _pull(token, msg.sender, amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - before;
        if (received == 0) revert NothingToDeposit();

        available[msg.sender][token] += received;
        emit Deposited(msg.sender, token, received);
    }

    /**
     * Take back collateral that is not at risk.
     *
     * Only ever pays the agent who deposited it. There is no recipient
     * argument, for the same reason `RecipientBound` has none: an argument a
     * caller controls is a destination a caller controls.
     */
    function withdraw(address token, uint256 amount) external {
        uint256 held = available[msg.sender][token];
        if (amount > held) revert InsufficientAvailable(amount, held);

        available[msg.sender][token] = held - amount;
        _push(token, msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount);
    }

    // -----------------------------------------------------------------------
    // Bonding
    // -----------------------------------------------------------------------

    /**
     * Put collateral behind a claim.
     *
     * `mandateId` is the same id the assertion is bound under in
     * `OutcomePolicy`, so the terms being measured and the money at risk
     * cannot drift apart — there is one identifier and both contracts key on
     * it.
     *
     * Callable only by the agent itself. A bond somebody else placed on your
     * behalf is somebody else's promise.
     */
    function bond(uint256 mandateId) external {
        if (_mandates[mandateId].agent != address(0)) revert MandateExists(mandateId);

        /*
           The terms are not arguments. They are read from the claim the agent
           signed, under the id that is the hash of that claim, so there is no
           way to bond against one promise and be judged on another. A caller
           that wants different terms has to get a different signature, which
           produces a different id.
        */
        ClaimRegistry.Claim memory c = claims.claimOf(mandateId);
        if (c.agent != msg.sender) revert NotTheAgent(msg.sender, c.agent);

        address principal = c.principal;
        address token = c.token;
        uint256 amount = c.bond;

        uint256 held = available[msg.sender][token];
        if (amount == 0 || amount > held) revert InsufficientAvailable(amount, held);

        available[msg.sender][token] = held - amount;
        locked[msg.sender][token] += amount;

        _mandates[mandateId] = Mandate({
            agent: msg.sender,
            principal: principal,
            token: token,
            bonded: amount,
            settled: false,
            verdict: Verdict.Pending
        });

        emit Bonded(mandateId, msg.sender, principal, token, amount);
    }

    // -----------------------------------------------------------------------
    // Settlement
    // -----------------------------------------------------------------------

    /**
     * Settle a mandate on the policy's verdict.
     *
     * Permissionless on purpose. Anybody may call it, because the outcome does
     * not depend on who asks — the verdict comes from the policy and the
     * destination was fixed when the bond was placed. A settlement that only
     * the winner can trigger is a settlement the loser can stall.
     *
     * `Pending` and `Unmeasurable` revert rather than defaulting either way.
     * An oracle that cannot see must not be able to take the agent's
     * collateral, and it must not be able to release it either: both would be
     * this contract inventing an answer the chain did not give it.
     */
    function settle(uint256 mandateId) external returns (Verdict verdict, uint256 moved) {
        Mandate storage m = _mandates[mandateId];
        if (m.agent == address(0)) revert NoSuchMandate(mandateId);
        if (m.settled) revert AlreadySettled(mandateId);

        int256 measured;
        int256 threshold;
        (verdict, measured, threshold) = policy.check(mandateId);

        if (verdict != Verdict.Met && verdict != Verdict.Failed) {
            revert NotDecided(mandateId, verdict);
        }

        // Written before any transfer. The bond is cleared from `locked`
        // whichever way the verdict goes, so no path can leave it counted
        // twice, and `settled` closes the mandate before a token contract is
        // ever given control.
        uint256 amount = m.bonded;
        m.settled = true;
        m.verdict = verdict;
        locked[m.agent][m.token] -= amount;

        if (verdict == Verdict.Met) {
            // The claim held. The collateral goes back to being the agent's,
            // withdrawable, and the mandate is part of its record.
            available[m.agent][m.token] += amount;
            emit Released(mandateId, m.agent, amount, measured, threshold);
        } else {
            // The claim failed. The bond goes to the principal — the address
            // written at lock time, never one supplied now.
            _push(m.token, m.principal, amount);
            emit Slashed(mandateId, m.principal, amount, measured, threshold);
        }

        return (verdict, amount);
    }

    // -----------------------------------------------------------------------
    // Reading
    // -----------------------------------------------------------------------

    function mandateOf(uint256 mandateId) external view returns (Mandate memory) {
        return _mandates[mandateId];
    }

    /// Everything an agent has here, at risk or not.
    function totalOf(address agent, address token) external view returns (uint256) {
        return available[agent][token] + locked[agent][token];
    }

    // -----------------------------------------------------------------------
    // Transfers
    // -----------------------------------------------------------------------

    /*
       Several of the tokens this vault will hold on BNB Smart Chain — BSC-USDT
       among them — do not return a boolean from `transfer`, in breach of the
       standard they claim to implement. A bare `IERC20.transfer` call against
       one of those reverts on the ABI decode even when the transfer succeeded.
       These helpers accept an empty return as success and anything else as
       failure.
    */

    function _push(address token, address to, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }

    function _pull(address token, address from, uint256 amount) private {
        (bool ok, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, address(this), amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TransferFailed();
    }
}
