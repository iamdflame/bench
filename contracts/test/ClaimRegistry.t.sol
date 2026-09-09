// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ClaimRegistry} from "../src/ClaimRegistry.sol";
import {Metric, Verdict, Assertion, IOutcomeOracle} from "../src/Outcome.sol";

/**
 * The property under test is that terms cannot be written against an agent's
 * collateral without that agent's signature over those exact terms, and that
 * a signature over one set of terms cannot be made to stand for another.
 *
 * That splits into four questions, and the file is organised around them:
 * does the right signature work; does a wrong signer fail; does a tampered
 * field invalidate the signature it was signed under; and can a valid
 * signature be replayed somewhere it was never meant to apply — another chain,
 * another deployment, or the same mandate twice.
 */

contract Oracle is IOutcomeOracle {
    int256 public value;
    bool public known = true;

    function set(int256 v, bool k) external {
        value = v;
        known = k;
    }

    function measure(Assertion calldata) external view returns (int256, bool) {
        return (value, known);
    }

    function method() external pure returns (string memory) {
        return "test";
    }
}

contract ClaimRegistryTest is Test {
    ClaimRegistry registry;
    Oracle oracle;

    uint256 constant AGENT_PK = 0xA9E27;
    uint256 constant IMPOSTER_PK = 0xBAD;
    address agent;
    address imposter;
    address principal = address(0xB2);

    function setUp() public {
        agent = vm.addr(AGENT_PK);
        imposter = vm.addr(IMPOSTER_PK);
        registry = new ClaimRegistry();
        oracle = new Oracle();
    }

    function _claim() internal view returns (ClaimRegistry.Claim memory) {
        return ClaimRegistry.Claim({
            agent: agent,
            principal: principal,
            subject: address(0xDEAD),
            metric: Metric.TimeInRange,
            threshold: 9_000,
            windowStart: 1,
            windowEnd: 2,
            oracle: address(oracle),
            token: address(0xC0FFEE),
            bond: 100e18,
            feeBps: 500,
            salt: bytes32(0)
        });
    }

    function _sign(uint256 pk, ClaimRegistry.Claim memory c) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, registry.hashClaim(c));
        return abi.encodePacked(r, s, v);
    }

    /* ------------------------------------------------------------ it works */

    function test_aSignedClaimOpensUnderTheHashOfItsOwnTerms() public {
        ClaimRegistry.Claim memory c = _claim();
        uint256 id = registry.open(c, _sign(AGENT_PK, c));

        assertEq(id, uint256(registry.hashClaim(c)));
        assertTrue(registry.isOpen(id));
        assertEq(registry.claimOf(id).agent, agent);
        assertEq(registry.claimOf(id).bond, 100e18);
    }

    function test_theAssertionIsDerivedFromTheClaimAndNothingElse() public {
        ClaimRegistry.Claim memory c = _claim();
        uint256 id = registry.open(c, _sign(AGENT_PK, c));

        Assertion memory a = registry.assertionOf(id);
        assertEq(uint8(a.metric), uint8(c.metric));
        assertEq(a.subject, c.subject);
        assertEq(a.threshold, c.threshold);
        assertEq(a.oracle, c.oracle);
        assertEq(a.windowEnd, c.windowEnd);
    }

    function test_anybodyMaySubmitBecauseTheSignatureIsTheAuthorisation() public {
        ClaimRegistry.Claim memory c = _claim();
        bytes memory sig = _sign(AGENT_PK, c);

        vm.prank(address(0xFEE1));
        uint256 id = registry.open(c, sig);

        assertEq(registry.claimOf(id).agent, agent);
    }

    /* ------------------------------------------------- a wrong signer fails */

    function test_aClaimSignedBySomebodyElseIsRejected() public {
        ClaimRegistry.Claim memory c = _claim();
        // Signed before the expectation: `_sign` reads `hashClaim`, and a view
        // call between the two would consume the expectation instead.
        bytes memory sig = _sign(IMPOSTER_PK, c);

        vm.expectRevert(abi.encodeWithSelector(ClaimRegistry.BadSignature.selector, imposter, agent));
        registry.open(c, sig);
    }

    /**
     * The attack this exists to stop: writing terms against an agent that
     * never agreed to them. There is no path to it, because the id is the
     * hash and the hash is signed.
     */
    function test_aStrangerCannotOpenAMandateAgainstAnAgent() public {
        ClaimRegistry.Claim memory hostile = _claim();
        hostile.threshold = type(int256).max; // impossible to meet
        hostile.principal = imposter; // and pay the slash to me
        bytes memory sig = _sign(IMPOSTER_PK, hostile);

        vm.prank(imposter);
        vm.expectRevert(abi.encodeWithSelector(ClaimRegistry.BadSignature.selector, imposter, agent));
        registry.open(hostile, sig);
    }

    /* ------------------------------------ a tampered field breaks its signature */

    function test_raisingTheThresholdAfterSigningInvalidatesTheSignature() public {
        ClaimRegistry.Claim memory c = _claim();
        bytes memory sig = _sign(AGENT_PK, c);

        c.threshold = 9_999; // a harder promise than the agent made
        vm.expectRevert();
        registry.open(c, sig);
    }

    function test_redirectingTheSlashAfterSigningInvalidatesTheSignature() public {
        ClaimRegistry.Claim memory c = _claim();
        bytes memory sig = _sign(AGENT_PK, c);

        c.principal = imposter;
        vm.expectRevert();
        registry.open(c, sig);
    }

    function test_swappingTheOracleAfterSigningInvalidatesTheSignature() public {
        ClaimRegistry.Claim memory c = _claim();
        bytes memory sig = _sign(AGENT_PK, c);

        c.oracle = address(new Oracle()); // an oracle the agent never agreed to
        vm.expectRevert();
        registry.open(c, sig);
    }

    function test_raisingTheBondAfterSigningInvalidatesTheSignature() public {
        ClaimRegistry.Claim memory c = _claim();
        bytes memory sig = _sign(AGENT_PK, c);

        c.bond = 10_000e18;
        vm.expectRevert();
        registry.open(c, sig);
    }

    /* ----------------------------------------------------------- replay */

    function test_theSameMandateCannotBeOpenedTwice() public {
        ClaimRegistry.Claim memory c = _claim();
        bytes memory sig = _sign(AGENT_PK, c);
        uint256 id = registry.open(c, sig);

        vm.expectRevert(abi.encodeWithSelector(ClaimRegistry.AlreadyOpen.selector, id));
        registry.open(c, sig);
    }

    /**
     * Front-running is not an attack here. A claim is only openable with the
     * agent's signature, so the worst a racer can do is register the agent's
     * own terms and pay the gas.
     */
    function test_frontRunningWithTheAgentsOwnClaimRegistersTheAgentsOwnTerms() public {
        ClaimRegistry.Claim memory c = _claim();
        bytes memory sig = _sign(AGENT_PK, c);

        vm.prank(imposter);
        uint256 id = registry.open(c, sig);

        assertEq(registry.claimOf(id).agent, agent);
        assertEq(registry.claimOf(id).principal, principal);
        assertEq(registry.claimOf(id).threshold, 9_000);
    }

    function test_aSaltLetsTheSamePromiseBeMadeTwice() public {
        ClaimRegistry.Claim memory a = _claim();
        ClaimRegistry.Claim memory b = _claim();
        b.salt = bytes32(uint256(1));

        uint256 idA = registry.open(a, _sign(AGENT_PK, a));
        uint256 idB = registry.open(b, _sign(AGENT_PK, b));

        assertTrue(idA != idB);
    }

    function test_aSignatureDoesNotCarryToAnotherDeployment() public {
        ClaimRegistry.Claim memory c = _claim();
        bytes memory sig = _sign(AGENT_PK, c);
        registry.open(c, sig);

        // Same terms, same signature, a different verifying contract.
        ClaimRegistry other = new ClaimRegistry();
        assertTrue(other.domainSeparator() != registry.domainSeparator());
        vm.expectRevert();
        other.open(c, sig);
    }

    function test_aSignatureDoesNotCarryToAnotherChain() public {
        bytes32 here = registry.domainSeparator();
        vm.chainId(block.chainid + 1);
        assertTrue(registry.domainSeparator() != here);
    }

    /* ------------------------------------------------ signature well-formedness */

    function test_aMalleableSignatureIsRefused() public {
        ClaimRegistry.Claim memory c = _claim();
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(AGENT_PK, registry.hashClaim(c));

        // The mirrored signature: same key, same message, other side of the curve.
        uint256 flipped =
            0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141 - uint256(s);
        uint8 flippedV = v == 27 ? 28 : 27;

        vm.expectRevert(ClaimRegistry.MalleableSignature.selector);
        registry.open(c, abi.encodePacked(r, bytes32(flipped), flippedV));
    }

    function test_aSignatureOfTheWrongLengthIsRefused() public {
        ClaimRegistry.Claim memory c = _claim();
        vm.expectRevert(ClaimRegistry.MalleableSignature.selector);
        registry.open(c, hex"1234");
    }

    function test_anOutOfRangeRecoveryByteIsRefused() public {
        ClaimRegistry.Claim memory c = _claim();
        (, bytes32 r, bytes32 s) = vm.sign(AGENT_PK, registry.hashClaim(c));

        vm.expectRevert(ClaimRegistry.MalleableSignature.selector);
        registry.open(c, abi.encodePacked(r, s, uint8(29)));
    }

    /* ------------------------------------------------------------ validation */

    function test_termsThatCannotBeSettledAreRefusedUpFront() public {
        // Each signature is taken before its expectation, because `_sign`
        // reads `hashClaim` and a view call would consume the expectation.
        ClaimRegistry.Claim memory c = _claim();
        c.oracle = address(0);
        bytes memory sig = _sign(AGENT_PK, c);
        vm.expectRevert(ClaimRegistry.NoOracle.selector);
        registry.open(c, sig);

        c = _claim();
        c.subject = address(0);
        sig = _sign(AGENT_PK, c);
        vm.expectRevert(ClaimRegistry.NoSubject.selector);
        registry.open(c, sig);

        c = _claim();
        c.principal = address(0);
        sig = _sign(AGENT_PK, c);
        vm.expectRevert(ClaimRegistry.NoPrincipal.selector);
        registry.open(c, sig);

        c = _claim();
        c.windowEnd = c.windowStart;
        sig = _sign(AGENT_PK, c);
        vm.expectRevert(abi.encodeWithSelector(ClaimRegistry.EmptyWindow.selector, c.windowStart, c.windowEnd));
        registry.open(c, sig);

        c = _claim();
        c.bond = 0;
        sig = _sign(AGENT_PK, c);
        vm.expectRevert(ClaimRegistry.NoBond.selector);
        registry.open(c, sig);

        c = _claim();
        c.feeBps = 10_001;
        sig = _sign(AGENT_PK, c);
        vm.expectRevert(abi.encodeWithSelector(ClaimRegistry.FeeTooLarge.selector, uint16(10_001)));
        registry.open(c, sig);
    }

    function test_readingAMandateThatWasNeverOpenedReverts() public {
        vm.expectRevert(abi.encodeWithSelector(ClaimRegistry.NotOpen.selector, uint256(7)));
        registry.claimOf(7);

        vm.expectRevert(abi.encodeWithSelector(ClaimRegistry.NotOpen.selector, uint256(7)));
        registry.check(7);
    }

    /* --------------------------------------------------------------- verdicts */

    function test_theVerdictComesFromTheSignedTermsAndTheOracle() public {
        ClaimRegistry.Claim memory c = _claim();
        uint256 id = registry.open(c, _sign(AGENT_PK, c));
        vm.warp(10_000);

        oracle.set(9_500, true);
        (Verdict met,, int256 threshold) = registry.check(id);
        assertEq(uint8(met), uint8(Verdict.Met));
        assertEq(threshold, 9_000);

        oracle.set(8_999, true);
        (Verdict failed,,) = registry.check(id);
        assertEq(uint8(failed), uint8(Verdict.Failed));

        oracle.set(0, false);
        (Verdict blind,,) = registry.check(id);
        assertEq(uint8(blind), uint8(Verdict.Unmeasurable));
    }

    function test_aClaimIsPendingUntilItsWindowCloses() public {
        ClaimRegistry.Claim memory c = _claim();
        c.windowEnd = 50_000;
        uint256 id = registry.open(c, _sign(AGENT_PK, c));

        vm.warp(100);
        (Verdict v,,) = registry.check(id);
        assertEq(uint8(v), uint8(Verdict.Pending));
    }

    /* ------------------------------------------------------------- fuzzing */

    /// Whoever actually signed is the only agent a claim can be opened for.
    function testFuzz_onlyTheSignersOwnClaimOpens(uint256 pk) public {
        pk = bound(pk, 1, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364140);
        address signer = vm.addr(pk);

        ClaimRegistry.Claim memory c = _claim();
        c.agent = signer;
        uint256 id = registry.open(c, _sign(pk, c));

        assertEq(registry.claimOf(id).agent, signer);
    }

    /// The id is a pure function of the terms, so distinct terms cannot collide.
    function testFuzz_distinctTermsProduceDistinctMandates(int256 t1, int256 t2) public {
        vm.assume(t1 != t2);

        ClaimRegistry.Claim memory a = _claim();
        a.threshold = t1;
        ClaimRegistry.Claim memory b = _claim();
        b.threshold = t2;

        assertTrue(registry.hashClaim(a) != registry.hashClaim(b));
    }
}
