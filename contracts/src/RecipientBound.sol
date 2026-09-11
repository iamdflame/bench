// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title RecipientBound
 * @notice A session key that physically cannot send your position anywhere but back to you.
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 *
 * A session key grants a target and a selector. That is the whole vocabulary:
 * `to` plus four bytes. It cannot say "and the `recipient` argument must be
 * the person who hired you", because arguments are not part of the grant.
 *
 * PancakeSwap's V3 position manager takes `recipient` as an argument on both
 * `mint` and `collect`. So an allowlist that grants those selectors grants
 * them with *any* recipient, and the only thing standing between a hired agent
 * and your liquidity leaving to an address of its choosing is that the key
 * lives in an isolated account. That is a real boundary. It is not a binding.
 *
 * The operator of the largest agent shop on this chain wrote that down about
 * their own product, in their sponsor evidence:
 *
 *     "Pancake selectors accept arbitrary recipient/position arguments, so
 *      custody boundary relies on account isolation rather than recipient
 *      binding."
 *
 * They are right, and it is the honest thing to have published. This contract
 * is what closes it. The session is granted on *this* address rather than on
 * the position manager, and this address writes `recipient` itself. The agent
 * does not get to pass one. There is no argument to abuse, because the
 * argument is not in the interface.
 *
 * ---------------------------------------------------------------------------
 * What it is, mechanically
 * ---------------------------------------------------------------------------
 *
 * A stateless forwarder, bound at construction to one principal and one agent:
 *
 *   - `principal` receives everything. Every NFT minted, every token collected.
 *     It is immutable, so it cannot be rotated by a compromised agent, and it
 *     is not a parameter, so it cannot be passed.
 *   - `agent` is the only address that may call. It is the session key's
 *     wallet, and it is the address the mandate is held by.
 *   - `expiry` ends authority at a timestamp, on chain, rather than in a
 *     runner's configuration file.
 *
 * It holds nothing between transactions. `mint` pulls exactly the two amounts
 * it was told to from the principal, spends them, and pushes the unspent
 * remainder straight back. A balance left here at the end of a call is a bug,
 * and `_sweepBack` makes it impossible for it to be a silent one.
 *
 * ---------------------------------------------------------------------------
 * What is deliberately absent
 * ---------------------------------------------------------------------------
 *
 * Four functions. No `multicall`, no `sweepToken`, no `refundETH`, no
 * `unwrapWETH9`, no `approve` the agent can reach, no upgrade path, no owner.
 * The position manager exposes all of those, and an allowlist that names it as
 * a target has to enumerate every selector it does *not* want and be right
 * every time. Here the surface is the enumeration: what is not written below
 * cannot be called, and a selector added to PancakeSwap tomorrow does not
 * silently widen a grant that was signed today.
 *
 * ---------------------------------------------------------------------------
 * What the principal must do once
 * ---------------------------------------------------------------------------
 *
 * Approve this contract for the two ERC-20s it will pull, and
 * `setApprovalForAll` on the position manager so it may act on positions the
 * principal owns. Both are ordinary, explicit, revocable approvals made by the
 * principal from their own wallet, and revoking either ends this contract's
 * usefulness immediately without needing this contract's cooperation. That is
 * the second kill switch, and it is not ours to hold.
 */

/* -------------------------------------------------------------------------- */
/*                               External types                               */
/* -------------------------------------------------------------------------- */

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);

    struct IncreaseLiquidityParams {
        uint256 tokenId;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    function increaseLiquidity(IncreaseLiquidityParams calldata params)
        external
        payable
        returns (uint128 liquidity, uint256 amount0, uint256 amount1);

    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    function collect(CollectParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    function ownerOf(uint256 tokenId) external view returns (address);
}

/* -------------------------------------------------------------------------- */
/*                                  Contract                                  */
/* -------------------------------------------------------------------------- */

contract RecipientBound {
    /// @notice The only address that can ever receive anything. Immutable by design.
    address public immutable principal;

    /// @notice The session key's wallet. The only address permitted to call.
    address public immutable agent;

    /// @notice PancakeSwap V3 NonfungiblePositionManager.
    INonfungiblePositionManager public immutable positionManager;

    /// @notice Authority ends here, on chain, not in a runner's config.
    uint64 public immutable expiry;

    /**
     * @notice Total token0+token1 notional this session may ever commit.
     * @dev Denominated per token, summed across calls. A cap in the runner is a
     *      policy; a cap here is a fact. Zero means uncapped, which is refused
     *      at construction rather than allowed as a default.
     */
    uint256 public immutable cap0;
    uint256 public immutable cap1;

    /// @notice Token pair this session is bound to. A third token cannot be reached.
    address public immutable token0;
    address public immutable token1;

    uint256 public spent0;
    uint256 public spent1;

    event Minted(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    event Increased(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    event Decreased(uint256 indexed tokenId, uint256 amount0, uint256 amount1);
    event Collected(uint256 indexed tokenId, uint256 amount0, uint256 amount1);

    error NotAgent();
    error Expired();
    error NotPrincipalPosition();
    error CapExceeded();
    error WrongPair();
    error ZeroCap();
    error ZeroAddress();

    modifier onlyAgent() {
        _onlyAgent();
        _;
    }

    /// @dev Body kept out of the modifier so it is compiled once, not per call site.
    function _onlyAgent() internal view {
        if (msg.sender != agent) revert NotAgent();
        if (block.timestamp > expiry) revert Expired();
    }

    constructor(
        address _principal,
        address _agent,
        address _positionManager,
        address _token0,
        address _token1,
        uint256 _cap0,
        uint256 _cap1,
        uint64 _expiry
    ) {
        if (
            _principal == address(0) || _agent == address(0) || _positionManager == address(0)
                || _token0 == address(0) || _token1 == address(0)
        ) revert ZeroAddress();
        // An uncapped session is not a bounded one. Refused rather than defaulted.
        if (_cap0 == 0 || _cap1 == 0) revert ZeroCap();
        if (_expiry <= block.timestamp) revert Expired();

        principal = _principal;
        agent = _agent;
        positionManager = INonfungiblePositionManager(_positionManager);
        token0 = _token0;
        token1 = _token1;
        cap0 = _cap0;
        cap1 = _cap1;
        expiry = _expiry;
    }

    /* ---------------------------------------------------------------------- */
    /*                            The three calls                             */
    /* ---------------------------------------------------------------------- */

    /**
     * @notice Open a position. The NFT goes to the principal, always.
     * @dev `recipient` is not a parameter. It is written here, from immutable
     *      storage, which is the entire point of this contract.
     */
    function mint(
        uint24 fee,
        int24 tickLower,
        int24 tickUpper,
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min,
        uint256 deadline
    ) external onlyAgent returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1) {
        // The cap is checked against what is committed, before anything moves.
        if (spent0 + amount0Desired > cap0 || spent1 + amount1Desired > cap1) revert CapExceeded();
        spent0 += amount0Desired;
        spent1 += amount1Desired;

        // Pull from the principal, spend, return the remainder. Nothing rests here.
        _pull(token0, amount0Desired);
        _pull(token1, amount1Desired);
        _approve(token0, amount0Desired);
        _approve(token1, amount1Desired);

        (tokenId, liquidity, amount0, amount1) = positionManager.mint(
            INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: fee,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: amount0Desired,
                amount1Desired: amount1Desired,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                // Not a parameter. Not passable. This is the binding.
                recipient: principal,
                deadline: deadline
            })
        );

        _approve(token0, 0);
        _approve(token1, 0);
        _sweepBack(token0);
        _sweepBack(token1);

        emit Minted(tokenId, liquidity, amount0, amount1);
    }

    /**
     * @notice Add to a position the principal already owns.
     * @dev No recipient argument exists on this call: the liquidity credits the
     *      position, and the position is the principal's, which is checked. The
     *      tokens are still pulled from the principal and the remainder pushed
     *      straight back, so nothing rests here between transactions.
     */
    function increaseLiquidity(
        uint256 tokenId,
        uint256 amount0Desired,
        uint256 amount1Desired,
        uint256 amount0Min,
        uint256 amount1Min,
        uint256 deadline
    ) external onlyAgent returns (uint128 liquidity, uint256 amount0, uint256 amount1) {
        _requirePrincipalPosition(tokenId);
        if (spent0 + amount0Desired > cap0 || spent1 + amount1Desired > cap1) revert CapExceeded();
        spent0 += amount0Desired;
        spent1 += amount1Desired;

        _pull(token0, amount0Desired);
        _pull(token1, amount1Desired);
        _approve(token0, amount0Desired);
        _approve(token1, amount1Desired);

        (liquidity, amount0, amount1) = positionManager.increaseLiquidity(
            INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId: tokenId,
                amount0Desired: amount0Desired,
                amount1Desired: amount1Desired,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                deadline: deadline
            })
        );

        _approve(token0, 0);
        _approve(token1, 0);
        _sweepBack(token0);
        _sweepBack(token1);

        emit Increased(tokenId, liquidity, amount0, amount1);
    }

    /**
     * @notice Withdraw liquidity from a position the principal owns.
     * @dev No recipient argument exists on this call: the position manager
     *      credits the withdrawn amounts to the position itself, and they can
     *      only leave through `collect`, which is bound below. The check that
     *      matters here is whose position it is.
     */
    function decreaseLiquidity(
        uint256 tokenId,
        uint128 liquidity,
        uint256 amount0Min,
        uint256 amount1Min,
        uint256 deadline
    ) external onlyAgent returns (uint256 amount0, uint256 amount1) {
        _requirePrincipalPosition(tokenId);
        (amount0, amount1) = positionManager.decreaseLiquidity(
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: tokenId,
                liquidity: liquidity,
                amount0Min: amount0Min,
                amount1Min: amount1Min,
                deadline: deadline
            })
        );
        emit Decreased(tokenId, amount0, amount1);
    }

    /**
     * @notice Collect fees and withdrawn principal. To the principal, always.
     * @dev The second binding, and the one that actually moves money.
     */
    function collect(uint256 tokenId, uint128 amount0Max, uint128 amount1Max)
        external
        onlyAgent
        returns (uint256 amount0, uint256 amount1)
    {
        _requirePrincipalPosition(tokenId);
        (amount0, amount1) = positionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                // Not a parameter. Not passable.
                recipient: principal,
                amount0Max: amount0Max,
                amount1Max: amount1Max
            })
        );
        emit Collected(tokenId, amount0, amount1);
    }

    /* ---------------------------------------------------------------------- */
    /*                                Internals                               */
    /* ---------------------------------------------------------------------- */

    /**
     * @dev A position not owned by the principal is not this session's business.
     *
     * Without this an agent holding a valid session could operate on any
     * position the position manager had approved this contract for, which over
     * time is every principal that ever used one of these. The wrapper is
     * per-principal, so this is belt and braces, and it is cheap.
     */
    function _requirePrincipalPosition(uint256 tokenId) internal view {
        if (positionManager.ownerOf(tokenId) != principal) revert NotPrincipalPosition();
    }

    function _pull(address token, uint256 amount) internal {
        if (amount == 0) return;
        _call(token, abi.encodeCall(IERC20.transferFrom, (principal, address(this), amount)));
    }

    function _approve(address token, uint256 amount) internal {
        _call(token, abi.encodeCall(IERC20.approve, (address(positionManager), amount)));
    }

    /**
     * @dev Anything left over goes home in the same transaction.
     *
     * The position manager returns unspent input when the range does not
     * consume both sides evenly, which is the normal case. If that remainder
     * stayed here it would be custody, and this contract's claim is that it
     * never holds anything. So it is pushed back rather than left for a later
     * sweep, and there is no sweep function to forget to call.
     */
    function _sweepBack(address token) internal {
        uint256 left = IERC20(token).balanceOf(address(this));
        if (left > 0) _call(token, abi.encodeCall(IERC20.transfer, (principal, left)));
    }

    /**
     * @dev Tolerates the non-standard ERC-20s that return nothing.
     *
     * Several long-standing BSC tokens do not return a bool from `transfer`.
     * Requiring one reverts on them; ignoring the return entirely lets a
     * genuine `false` pass silently. Both are checked: the call must succeed,
     * and if it returned data at all that data must decode to true.
     */
    function _call(address token, bytes memory data) internal {
        (bool ok, bytes memory ret) = token.call(data);
        require(ok && (ret.length == 0 || abi.decode(ret, (bool))), "token call failed");
    }
}
