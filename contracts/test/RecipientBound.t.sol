// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {RecipientBound, INonfungiblePositionManager, IERC20} from "../src/RecipientBound.sol";

/**
 * The claim under test is a negative one: there is no way for a hired agent to
 * send this position anywhere but back to the principal. A negative is proved
 * by trying, so most of what follows are attempts that must revert.
 *
 * The position manager is stubbed rather than forked because what is being
 * tested is which arguments this contract writes, not what PancakeSwap does
 * with them. The stub records the recipient it was handed, and the assertions
 * read that field.
 */
contract StubPositionManager {
    address public lastMintRecipient;
    address public lastCollectRecipient;
    uint256 public lastDecreaseTokenId;
    mapping(uint256 => address) public owners;
    uint256 public nextId = 1;

    /// Amounts the stub pretends to consume, so the sweep-back path is exercised.
    uint256 public consume0;
    uint256 public consume1;

    function setOwner(uint256 tokenId, address owner) external {
        owners[tokenId] = owner;
    }

    function setConsume(uint256 c0, uint256 c1) external {
        consume0 = c0;
        consume1 = c1;
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        return owners[tokenId];
    }

    function mint(INonfungiblePositionManager.MintParams calldata p)
        external
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        lastMintRecipient = p.recipient;
        tokenId = nextId++;
        owners[tokenId] = p.recipient;
        amount0 = consume0 == 0 ? p.amount0Desired : consume0;
        amount1 = consume1 == 0 ? p.amount1Desired : consume1;
        IERC20(p.token0).transferFrom(msg.sender, address(this), amount0);
        IERC20(p.token1).transferFrom(msg.sender, address(this), amount1);
        liquidity = uint128(amount0 + amount1);
    }

    function decreaseLiquidity(INonfungiblePositionManager.DecreaseLiquidityParams calldata p)
        external
        returns (uint256, uint256)
    {
        lastDecreaseTokenId = p.tokenId;
        return (p.liquidity, p.liquidity);
    }

    function collect(INonfungiblePositionManager.CollectParams calldata p)
        external
        returns (uint256, uint256)
    {
        lastCollectRecipient = p.recipient;
        return (p.amount0Max, p.amount1Max);
    }
}

contract StubToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        if (a != type(uint256).max) allowance[from][msg.sender] = a - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract RecipientBoundTest is Test {
    RecipientBound internal leash;
    StubPositionManager internal pm;
    StubToken internal t0;
    StubToken internal t1;

    address internal principal = address(0xA11CE);
    address internal agent = address(0xB0B);
    address internal attacker = address(0xBAD);

    uint256 internal constant CAP = 100 ether;
    uint64 internal expiry;

    function setUp() public {
        pm = new StubPositionManager();
        t0 = new StubToken();
        t1 = new StubToken();
        expiry = uint64(block.timestamp + 7 days);

        leash = new RecipientBound(
            principal, agent, address(pm), address(t0), address(t1), CAP, CAP, expiry
        );

        t0.mint(principal, 1000 ether);
        t1.mint(principal, 1000 ether);
        vm.startPrank(principal);
        t0.approve(address(leash), type(uint256).max);
        t1.approve(address(leash), type(uint256).max);
        vm.stopPrank();
    }

    /* ------------------------------------------------------------ bindings */

    /// The whole point: the NFT goes to the principal, and the agent had no say.
    function test_mint_sends_position_to_principal() public {
        vm.prank(agent);
        (uint256 tokenId,,,) = leash.mint(2500, -100, 100, 1 ether, 1 ether, 0, 0, block.timestamp + 1);
        assertEq(pm.lastMintRecipient(), principal, "recipient must be the principal");
        assertEq(pm.owners(tokenId), principal, "position must be owned by the principal");
    }

    /// Collect is the call that actually moves money. Same binding.
    function test_collect_sends_to_principal() public {
        pm.setOwner(7, principal);
        vm.prank(agent);
        leash.collect(7, 1 ether, 1 ether);
        assertEq(pm.lastCollectRecipient(), principal, "collect must credit the principal");
    }

    /// There is no overload, no argument, no alternative entry point.
    function test_no_recipient_argument_exists_on_the_abi() public pure {
        // mint's selector is fixed by its signature; a recipient parameter would
        // change it. This is the interface assertion, compiled rather than
        // asserted in prose.
        bytes4 mintSelector = bytes4(keccak256("mint(uint24,int24,int24,uint256,uint256,uint256,uint256,uint256)"));
        assertEq(mintSelector, RecipientBound.mint.selector);
        bytes4 collectSelector = bytes4(keccak256("collect(uint256,uint128,uint128)"));
        assertEq(collectSelector, RecipientBound.collect.selector);
    }

    /* ------------------------------------------------------------- refusals */

    function test_only_the_agent_may_call() public {
        vm.prank(attacker);
        vm.expectRevert(RecipientBound.NotAgent.selector);
        leash.mint(2500, -100, 100, 1 ether, 1 ether, 0, 0, block.timestamp + 1);
    }

    /// Even the principal does not act through this contract. It is the agent's leash.
    function test_principal_is_not_the_agent() public {
        vm.prank(principal);
        vm.expectRevert(RecipientBound.NotAgent.selector);
        leash.collect(1, 1, 1);
    }

    function test_expiry_ends_authority_on_chain() public {
        vm.warp(expiry + 1);
        vm.prank(agent);
        vm.expectRevert(RecipientBound.Expired.selector);
        leash.mint(2500, -100, 100, 1 ether, 1 ether, 0, 0, block.timestamp + 1);
    }

    /// A position the principal does not own is not this session's business.
    function test_cannot_touch_a_position_the_principal_does_not_own() public {
        pm.setOwner(9, attacker);
        vm.prank(agent);
        vm.expectRevert(RecipientBound.NotPrincipalPosition.selector);
        leash.collect(9, 1 ether, 1 ether);

        vm.prank(agent);
        vm.expectRevert(RecipientBound.NotPrincipalPosition.selector);
        leash.decreaseLiquidity(9, 1, 0, 0, block.timestamp + 1);
    }

    /* ----------------------------------------------------------------- cap */

    function test_cap_is_on_chain_not_in_a_runner() public {
        vm.prank(agent);
        leash.mint(2500, -100, 100, 60 ether, 60 ether, 0, 0, block.timestamp + 1);

        vm.prank(agent);
        vm.expectRevert(RecipientBound.CapExceeded.selector);
        leash.mint(2500, -100, 100, 60 ether, 60 ether, 0, 0, block.timestamp + 1);
    }

    function testFuzz_cap_is_never_exceeded(uint128 a, uint128 b) public {
        vm.assume(a > 0 && b > 0);
        vm.startPrank(agent);
        if (uint256(a) > CAP || uint256(b) > CAP) {
            vm.expectRevert(RecipientBound.CapExceeded.selector);
            leash.mint(2500, -100, 100, a, b, 0, 0, block.timestamp + 1);
        } else {
            leash.mint(2500, -100, 100, a, b, 0, 0, block.timestamp + 1);
            assertLe(leash.spent0(), CAP);
            assertLe(leash.spent1(), CAP);
        }
        vm.stopPrank();
    }

    /* --------------------------------------------------------------- custody */

    /// Nothing rests here between transactions. The remainder goes straight home.
    function test_holds_nothing_after_a_partial_mint() public {
        pm.setConsume(0.4 ether, 0.9 ether);
        uint256 before0 = t0.balanceOf(principal);

        vm.prank(agent);
        leash.mint(2500, -100, 100, 1 ether, 1 ether, 0, 0, block.timestamp + 1);

        assertEq(t0.balanceOf(address(leash)), 0, "wrapper must hold no token0");
        assertEq(t1.balanceOf(address(leash)), 0, "wrapper must hold no token1");
        // 1 ether pulled, 0.4 consumed, 0.6 returned.
        assertEq(t0.balanceOf(principal), before0 - 0.4 ether, "unspent input returns to the principal");
    }

    /// The approval to the position manager does not outlive the call.
    function test_leaves_no_standing_approval() public {
        vm.prank(agent);
        leash.mint(2500, -100, 100, 1 ether, 1 ether, 0, 0, block.timestamp + 1);
        assertEq(t0.allowance(address(leash), address(pm)), 0, "approval must be reset");
        assertEq(t1.allowance(address(leash), address(pm)), 0, "approval must be reset");
    }

    /* ------------------------------------------------------- construction */

    function test_refuses_an_uncapped_session() public {
        vm.expectRevert(RecipientBound.ZeroCap.selector);
        new RecipientBound(principal, agent, address(pm), address(t0), address(t1), 0, CAP, expiry);
    }

    function test_refuses_an_already_expired_session() public {
        vm.expectRevert(RecipientBound.Expired.selector);
        new RecipientBound(
            principal, agent, address(pm), address(t0), address(t1), CAP, CAP, uint64(block.timestamp)
        );
    }

    function test_refuses_a_zero_principal() public {
        vm.expectRevert(RecipientBound.ZeroAddress.selector);
        new RecipientBound(address(0), agent, address(pm), address(t0), address(t1), CAP, CAP, expiry);
    }

    /// The principal is immutable: there is no setter for a compromised key to find.
    function test_principal_cannot_be_rotated() public view {
        assertEq(leash.principal(), principal);
        // The absence of a setter is the assertion. If one is ever added, this
        // file is where the reviewer is meant to notice it is missing here.
    }
}
