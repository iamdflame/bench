// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {SwapBound, IV3SwapRouter} from "../src/SwapBound.sol";

contract MockToken {
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
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

/// Consumes `consumeBps` of the input, pays out 2x the consumed input to `recipient`.
contract MockRouter {
    address public lastRecipient;
    uint256 public consumeBps = 10_000;

    function setConsume(uint256 bps) external {
        consumeBps = bps;
    }

    function exactInputSingle(IV3SwapRouter.ExactInputSingleParams calldata p) external payable returns (uint256 out) {
        lastRecipient = p.recipient;
        uint256 used = (p.amountIn * consumeBps) / 10_000;
        MockToken(p.tokenIn).transferFrom(msg.sender, address(this), used);
        out = used * 2;
        require(out >= p.amountOutMinimum, "slippage");
        MockToken(p.tokenOut).mint(p.recipient, out);
    }
}

contract SwapBoundTest is Test {
    MockToken a;
    MockToken b;
    MockRouter router;
    SwapBound leash;
    address principal = address(0xA11CE);
    address agent = address(0xB0B);
    address thief = address(0xBAD);

    function setUp() public {
        a = new MockToken();
        b = new MockToken();
        router = new MockRouter();
        leash = new SwapBound(principal, agent, address(router), address(a), address(b), 500, 10 ether, 10 ether, uint64(block.timestamp + 30 days));
        a.mint(principal, 100 ether);
        b.mint(principal, 100 ether);
        vm.startPrank(principal);
        a.approve(address(leash), type(uint256).max);
        b.approve(address(leash), type(uint256).max);
        vm.stopPrank();
    }

    function test_proceeds_go_to_principal() public {
        vm.prank(agent);
        uint256 out = leash.swap(true, 1 ether, 1, 0, block.timestamp);
        assertEq(router.lastRecipient(), principal);
        assertEq(b.balanceOf(principal), 100 ether + out);
    }

    function testFuzz_recipient_is_principal_for_any_input(bool sellA, uint96 amount, uint160 limit) public {
        uint256 amt = bound(uint256(amount), 1, 10 ether);
        vm.prank(agent);
        leash.swap(sellA, amt, 1, limit, block.timestamp);
        assertEq(router.lastRecipient(), principal);
        assertEq(a.balanceOf(thief) + b.balanceOf(thief), 0);
    }

    function test_no_recipient_or_token_argument_on_the_abi() public pure {
        bytes4 sel = bytes4(keccak256("swap(bool,uint256,uint256,uint160,uint256)"));
        assertEq(sel, SwapBound.swap.selector);
    }

    function test_only_agent() public {
        vm.prank(thief);
        vm.expectRevert(SwapBound.NotAgent.selector);
        leash.swap(true, 1 ether, 1, 0, block.timestamp);
    }

    function test_expiry_ends_authority() public {
        vm.warp(block.timestamp + 31 days);
        vm.prank(agent);
        vm.expectRevert(SwapBound.Expired.selector);
        leash.swap(true, 1 ether, 1, 0, block.timestamp);
    }

    function test_stale_deadline_refused() public {
        vm.warp(block.timestamp + 100);
        vm.prank(agent);
        vm.expectRevert(SwapBound.Expired.selector);
        leash.swap(true, 1 ether, 1, 0, block.timestamp - 1);
    }

    function test_zero_minimum_out_refused() public {
        vm.prank(agent);
        vm.expectRevert(SwapBound.NoMinimumOut.selector);
        leash.swap(true, 1 ether, 0, 0, block.timestamp);
    }

    function testFuzz_cap_is_never_exceeded(uint96 x, uint96 y) public {
        uint256 first = bound(uint256(x), 1, 10 ether);
        uint256 second = bound(uint256(y), 1, 10 ether);
        vm.startPrank(agent);
        leash.swap(true, first, 1, 0, block.timestamp);
        if (first + second > 10 ether) {
            vm.expectRevert(SwapBound.CapExceeded.selector);
        }
        leash.swap(true, second, 1, 0, block.timestamp);
        vm.stopPrank();
        assertLe(leash.spentA(), 10 ether);
    }

    function test_holds_nothing_and_no_standing_approval_after_partial_fill() public {
        router.setConsume(6_000);
        vm.prank(agent);
        leash.swap(true, 1 ether, 1, 0, block.timestamp);
        assertEq(a.balanceOf(address(leash)), 0, "unconsumed input goes back");
        assertEq(a.allowance(address(leash), address(router)), 0, "router approval reset");
        assertEq(a.balanceOf(principal), 100 ether - 0.6 ether);
    }

    function test_refuses_bad_construction() public {
        vm.expectRevert(SwapBound.ZeroCap.selector);
        new SwapBound(principal, agent, address(router), address(a), address(b), 500, 0, 1, uint64(block.timestamp + 1));
        vm.expectRevert(SwapBound.SamePair.selector);
        new SwapBound(principal, agent, address(router), address(a), address(a), 500, 1, 1, uint64(block.timestamp + 1));
        vm.expectRevert(SwapBound.Expired.selector);
        new SwapBound(principal, agent, address(router), address(a), address(b), 500, 1, 1, uint64(block.timestamp));
        vm.expectRevert(SwapBound.ZeroAddress.selector);
        new SwapBound(address(0), agent, address(router), address(a), address(b), 500, 1, 1, uint64(block.timestamp + 1));
    }
}
