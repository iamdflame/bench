// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/**
 * @title SwapBound
 * @notice A grid session key that can trade your pair and cannot send the proceeds anywhere but back to you.
 *
 * ---------------------------------------------------------------------------
 * Why this exists
 * ---------------------------------------------------------------------------
 *
 * RecipientBound closed the recipient hole on PancakeSwap's position manager.
 * The swap router has the same hole: `exactInputSingle` takes `recipient` as a
 * field of its params, and a session grant is a target and a selector, never
 * an argument. A grid session allowed to call the router directly may swap the
 * principal's tokens and name any address as the one that receives them.
 *
 * So the grid session is granted on this contract instead. `swap` takes a
 * direction, an amount, a minimum out and a deadline. The recipient is the
 * principal, written from immutable storage. The pair and the fee tier are
 * fixed at deployment, the input spent in each direction is capped for the
 * contract's life, and authority ends at `expiry` on chain.
 *
 * Tokens are pulled from the principal for exactly the amount being swapped,
 * the router is approved for exactly that amount and then for zero, and any
 * input the router did not consume is sent straight back. Nothing rests here.
 */

interface IERC20Min {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IV3SwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

contract SwapBound {
    /// @notice Who the proceeds of every swap go to. Immutable.
    address public immutable principal;
    /// @notice Who may call `swap`. With an Altana session this is the principal's own account.
    address public immutable agent;
    IV3SwapRouter public immutable router;
    address public immutable tokenA;
    address public immutable tokenB;
    uint24 public immutable fee;
    /// @notice Lifetime cap on input spent selling tokenA, and selling tokenB.
    uint256 public immutable capA;
    uint256 public immutable capB;
    uint64 public immutable expiry;

    uint256 public spentA;
    uint256 public spentB;

    event Swapped(address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut);

    error NotAgent();
    error Expired();
    error CapExceeded();
    error NoMinimumOut();
    error ZeroAddress();
    error ZeroCap();
    error SamePair();
    error TokenCallFailed();

    modifier onlyAgent() {
        _onlyAgent();
        _;
    }

    function _onlyAgent() internal view {
        if (msg.sender != agent) revert NotAgent();
        if (block.timestamp > expiry) revert Expired();
    }

    constructor(
        address _principal,
        address _agent,
        address _router,
        address _tokenA,
        address _tokenB,
        uint24 _fee,
        uint256 _capA,
        uint256 _capB,
        uint64 _expiry
    ) {
        if (
            _principal == address(0) || _agent == address(0) || _router == address(0) || _tokenA == address(0)
                || _tokenB == address(0)
        ) revert ZeroAddress();
        if (_tokenA == _tokenB) revert SamePair();
        if (_capA == 0 || _capB == 0) revert ZeroCap();
        if (_expiry <= block.timestamp) revert Expired();
        principal = _principal;
        agent = _agent;
        router = IV3SwapRouter(_router);
        tokenA = _tokenA;
        tokenB = _tokenB;
        fee = _fee;
        capA = _capA;
        capB = _capB;
        expiry = _expiry;
    }

    /**
     * @notice Sell `amountIn` of one side of the pair for the other. Proceeds go to the principal.
     * @dev There is no recipient parameter and no token parameter: `sellA` picks the direction
     *      within the fixed pair. A zero minimum out is refused, so a swap cannot be executed
     *      at any price the pool happens to offer.
     */
    function swap(bool sellA, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96, uint256 deadline)
        external
        onlyAgent
        returns (uint256 amountOut)
    {
        if (block.timestamp > deadline) revert Expired();
        if (amountOutMinimum == 0) revert NoMinimumOut();
        (address tokenIn, address tokenOut) = sellA ? (tokenA, tokenB) : (tokenB, tokenA);
        if (sellA) {
            if (spentA + amountIn > capA) revert CapExceeded();
            spentA += amountIn;
        } else {
            if (spentB + amountIn > capB) revert CapExceeded();
            spentB += amountIn;
        }

        _call(tokenIn, abi.encodeCall(IERC20Min.transferFrom, (principal, address(this), amountIn)));
        _call(tokenIn, abi.encodeCall(IERC20Min.approve, (address(router), amountIn)));

        amountOut = router.exactInputSingle(
            IV3SwapRouter.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: fee,
                recipient: principal,
                amountIn: amountIn,
                amountOutMinimum: amountOutMinimum,
                sqrtPriceLimitX96: sqrtPriceLimitX96
            })
        );

        _call(tokenIn, abi.encodeCall(IERC20Min.approve, (address(router), 0)));
        uint256 left = IERC20Min(tokenIn).balanceOf(address(this));
        if (left > 0) _call(tokenIn, abi.encodeCall(IERC20Min.transfer, (principal, left)));

        emit Swapped(tokenIn, tokenOut, amountIn, amountOut);
    }

    /// @dev Tolerates tokens that return nothing (BSC-USD returns a bool; some do not).
    function _call(address token, bytes memory data) private {
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TokenCallFailed();
    }
}
