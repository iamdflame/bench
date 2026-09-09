// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol";

interface IMandateMarket {
    function bid(uint256 mandateId, int16 targetAlphaBps, uint256 amount, uint64 ttl)
        external
        payable
        returns (uint256);
    function withdrawBid(uint256 mandateId, uint256 bidIndex) external;
    function withdraw(address asset) external;
    function withdrawable(address asset, address account) external view returns (uint256);
}

/**
 * @title Underwriter
 * @notice A market in agent credit: third parties post the bond an agent
 *         cannot, and take a share of what it earns.
 *
 * The bond is the market's whole point and also its hardest constraint. An
 * agent that is good at managing capital is not necessarily an agent that
 * *has* capital, and requiring both collapses the supply side to whoever is
 * already rich. Shadow records fix half of that — they prove skill without
 * money — and this fixes the other half.
 *
 * A backer deposits into a pool for a named agent. The pool bids on a mandate
 * and, from the market's point of view, **is** the agent: it holds the bond, it
 * is what gets slashed, and it is what the fee is paid to. The operator runs
 * the strategy through its session key as before; the money is somebody else's.
 *
 * What a backer is actually doing is pricing an agent's risk with their own
 * capital, in public. That willingness is itself a signal — a far better one
 * than a self-reported score, because it costs something to be wrong about.
 *
 * Deliberately requires no change to the market. It bids like any other
 * bidder, which means it works against the deployed contract and any future
 * one with the same interface. A design that needed the market to know about
 * underwriting would be a design the market had to be upgraded to allow.
 */
contract Underwriter is ReentrancyGuard {
    // -------------------------------------------------------------- types --

    struct Pool {
        /// @notice Who runs the strategy. Receives the operator's share.
        address operator;
        /// @notice The agent this pool exists to back, for the record.
        address agent;
        /// @notice The market it bids into.
        address market;
        /// @notice Operator's share of fees earned, in basis points.
        uint16 operatorBps;
        /// @notice Total backed, before any is committed.
        uint128 deposited;
        /// @notice Currently escrowed in a bid or a live mandate.
        uint128 committed;
        /// @notice Returned capital plus fees, awaiting distribution.
        uint128 returned;
        bool closed;
    }

    uint16 public constant MAX_BPS = 10_000;
    /// @notice An operator may not take more than half of what backers fund.
    uint16 public constant MAX_OPERATOR_BPS = 5_000;

    Pool[] private _pools;
    /// @dev poolId => backer => amount deposited.
    mapping(uint256 => mapping(address => uint256)) public stakeOf;
    /// @dev poolId => backer => already claimed from `returned`.
    mapping(uint256 => mapping(address => uint256)) public claimed;
    /// @dev poolId => cumulative `returned` at the time of each claim.
    mapping(uint256 => uint256) public distributed;

    event PoolOpened(
        uint256 indexed poolId, address indexed operator, address indexed agent, address market, uint16 operatorBps
    );
    event Backed(uint256 indexed poolId, address indexed backer, uint256 amount);
    event Committed(uint256 indexed poolId, uint256 indexed mandateId, uint256 bidIndex, uint256 amount);
    event Collected(uint256 indexed poolId, uint256 amount);
    event Claimed(uint256 indexed poolId, address indexed backer, uint256 amount);
    event PoolClosed(uint256 indexed poolId);

    error NotOperator();
    error BadParameters();
    error PoolIsClosed();
    error NothingToClaim();
    error InsufficientFree();
    error TransferFailed();

    /**
     * @notice Opens a pool to back one agent.
     * @param operatorBps The operator's cut of returns, capped at half.
     */
    function openPool(address agent, address market, uint16 operatorBps)
        external
        returns (uint256 poolId)
    {
        if (agent == address(0) || market == address(0)) revert BadParameters();
        if (operatorBps > MAX_OPERATOR_BPS) revert BadParameters();

        poolId = _pools.length;
        _pools.push(
            Pool({
                operator: msg.sender,
                agent: agent,
                market: market,
                operatorBps: operatorBps,
                deposited: 0,
                committed: 0,
                returned: 0,
                closed: false
            })
        );
        emit PoolOpened(poolId, msg.sender, agent, market, operatorBps);
    }

    /// @notice Backs an agent with capital you are prepared to lose.
    function back(uint256 poolId) external payable nonReentrant {
        Pool storage p = _pools[poolId];
        if (p.closed) revert PoolIsClosed();
        if (msg.value == 0) revert BadParameters();
        p.deposited += uint128(msg.value);
        stakeOf[poolId][msg.sender] += msg.value;
        emit Backed(poolId, msg.sender, msg.value);
    }

    /**
     * @notice Posts the pool's capital as a bond on a mandate.
     * @dev The pool becomes the bidder, so the market slashes *this contract*
     *      when the agent underperforms. That is the entire mechanism: the
     *      backers' money is what is at risk, which is what makes their
     *      willingness to post it informative.
     */
    function commit(uint256 poolId, uint256 mandateId, int16 targetAlphaBps, uint256 amount, uint64 ttl)
        external
        nonReentrant
        returns (uint256 bidIndex)
    {
        Pool storage p = _pools[poolId];
        if (msg.sender != p.operator) revert NotOperator();
        if (p.closed) revert PoolIsClosed();
        if (amount == 0 || amount > _free(p)) revert InsufficientFree();

        p.committed += uint128(amount);
        bidIndex = IMandateMarket(p.market).bid{value: amount}(mandateId, targetAlphaBps, 0, ttl);
        emit Committed(poolId, mandateId, bidIndex, amount);
    }

    /**
     * @notice Releases a bid the pool no longer wants escrowed.
     *
     * A losing bid sits in the succession queue with the pool's capital inside
     * it; an expired one sits there permanently. Either way the backers' money
     * is stuck until somebody asks for it back, so anyone may ask — the market
     * enforces who is actually allowed to withdraw which bid, and refuses if
     * the pool still holds the mandate.
     */
    function releaseBid(uint256 mandateId, uint256 bidIndex, address market) external nonReentrant {
        IMandateMarket(market).withdrawBid(mandateId, bidIndex);
    }

    /**
     * @notice Pulls whatever the market owes this pool back into it.
     * @dev Permissionless. Anyone may trigger a collection, because a
     *      distribution only the operator can start is one it can withhold.
     */
    function collect(uint256 poolId) external nonReentrant {
        Pool storage p = _pools[poolId];
        uint256 before = address(this).balance;
        // Native only for now; a token pool would take the asset as a
        // parameter and hold per-asset balances.
        if (IMandateMarket(p.market).withdrawable(address(0), address(this)) > 0) {
            IMandateMarket(p.market).withdraw(address(0));
        }
        uint256 gained = address(this).balance - before;
        if (gained == 0) revert NothingToClaim();

        // What comes back retires the commitment first; anything beyond it is
        // profit, and a shortfall is the slash the backers signed up for.
        uint128 retire = gained > p.committed ? p.committed : uint128(gained);
        p.committed -= retire;
        p.returned += uint128(gained);
        emit Collected(poolId, gained);
    }

    /**
     * @notice Claims a backer's share of what has come back.
     *
     * Pro rata on deposits, less the operator's cut. A backer who put in a
     * tenth of the pool takes a tenth of the returns and a tenth of the losses;
     * there is no seniority here and no promise of principal.
     */
    function claim(uint256 poolId) external nonReentrant {
        Pool storage p = _pools[poolId];
        uint256 stake = stakeOf[poolId][msg.sender];
        if (stake == 0 || p.deposited == 0) revert NothingToClaim();

        uint256 backersShare = (uint256(p.returned) * (MAX_BPS - p.operatorBps)) / MAX_BPS;
        uint256 entitled = (backersShare * stake) / p.deposited;
        uint256 already = claimed[poolId][msg.sender];
        if (entitled <= already) revert NothingToClaim();

        uint256 owed = entitled - already;
        claimed[poolId][msg.sender] = entitled;
        _pay(msg.sender, owed);
        emit Claimed(poolId, msg.sender, owed);
    }

    /// @notice The operator's cut, claimable once returns exist.
    function claimOperator(uint256 poolId) external nonReentrant {
        Pool storage p = _pools[poolId];
        if (msg.sender != p.operator) revert NotOperator();
        uint256 entitled = (uint256(p.returned) * p.operatorBps) / MAX_BPS;
        uint256 already = claimed[poolId][address(this)];
        if (entitled <= already) revert NothingToClaim();
        uint256 owed = entitled - already;
        claimed[poolId][address(this)] = entitled;
        _pay(msg.sender, owed);
        emit Claimed(poolId, msg.sender, owed);
    }

    /// @notice Stops new backing. Existing claims stay open.
    function close(uint256 poolId) external {
        Pool storage p = _pools[poolId];
        if (msg.sender != p.operator) revert NotOperator();
        p.closed = true;
        emit PoolClosed(poolId);
    }

    function _free(Pool storage p) private view returns (uint256) {
        // Deposits not yet committed and not yet returned to backers.
        uint256 held = address(this).balance;
        uint256 committed = p.committed;
        return held > committed ? held - committed : 0;
    }

    function _pay(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /// @dev The market pays by pull, but a direct transfer must not revert.
    receive() external payable {}

    function poolCount() external view returns (uint256) {
        return _pools.length;
    }

    function getPool(uint256 poolId) external view returns (Pool memory) {
        return _pools[poolId];
    }
}
