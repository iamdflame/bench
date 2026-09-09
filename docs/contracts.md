# Contract reference

Five contracts. None has an owner, a pause, an upgrade path, or a function that
lets this deployment take a fee out of somebody's money.

`npm run contracts:test` — **79 tests, four fuzzed at 512 runs.**

---

## Outcome.sol

The shared vocabulary, and the one place an oracle is ever called.

These types began inside `OutcomePolicy`. They moved because a second contract
needs them, and because the guarded measurement is security-critical code that
must exist **exactly once**. Two copies of a bounded staticcall drift, and the
copy that drifts is the one that hands somebody else's collateral away.

### `Metric`
`TimeInRange` · `HealthFloor` · `NetApyVsBest` · `RealizedPnl`

### `Verdict`
`Pending` · `Met` · `Failed` · `Unmeasurable`

### `Assertion`
What is being measured, against what threshold, over what window, by which
oracle. `threshold` is **signed**, because a job may legitimately assert that
realized PnL will be no worse than −50 bps and an unsigned threshold would make
that unexpressible.

### `library Measure`

```solidity
function verdict(Assertion memory a) internal view returns (Verdict, int256)
```

| Situation | Result |
|---|---|
| `block.timestamp < windowEnd` | `Pending` |
| Oracle reverts | `Unmeasurable` |
| Oracle exceeds the 500,000 gas stipend | `Unmeasurable` |
| Return data shorter than 64 bytes | `Unmeasurable` |
| Oracle answers `known = false` | `Unmeasurable` |
| `value >= threshold` | `Met` |
| otherwise | `Failed` |

**No failure mode produces `Failed`.** That asymmetry is the safety property the
rest of the system rests on.

---

## ClaimRegistry.sol

A bid is a claim the agent signed, and the mandate id is the hash of that claim.

### `open(Claim calldata c, bytes calldata signature) → uint256 mandateId`

Permissionless: the signature is the authorisation. Rejects up front anything
that could never be settled — a zero oracle, subject or principal, an empty
window, a zero bond, a fee above 100%.

### Signature handling

EIP-712, with the domain bound to `chainId` and `address(this)`. The separator
is cached at deployment and **rebuilt on read if the chain forks**, so a
signature valid on one side of a fork is not replayable on the other.

Signatures must be 65 bytes, `v ∈ {27, 28}`, and `s` in the lower half of the
curve order. A malleable signature is refused — not because the digest could be
forged, but because accepting one means two byte strings authorise the same
claim, and anything built later that keys off the signature would be wrong.

### Invariants

| Invariant | Test |
|---|---|
| Only the signing agent's claim opens | `test_aClaimSignedBySomebodyElseIsRejected` |
| A stranger cannot write terms against an agent | `test_aStrangerCannotOpenAMandateAgainstAnAgent` |
| Changing threshold, principal, oracle or bond after signing invalidates it | four `..InvalidatesTheSignature` tests |
| A mandate cannot be opened twice | `test_theSameMandateCannotBeOpenedTwice` |
| Front-running registers the agent's own terms | `test_frontRunningWithTheAgentsOwnClaimRegistersTheAgentsOwnTerms` |
| A signature does not carry to another deployment | `test_aSignatureDoesNotCarryToAnotherDeployment` |
| A signature does not carry to another chain | `test_aSignatureDoesNotCarryToAnotherChain` |
| Malleable, short and out-of-range signatures are refused | three well-formedness tests |
| Distinct terms produce distinct ids | `testFuzz_distinctTermsProduceDistinctMandates` (512 runs) |
| Only the actual signer's claim opens | `testFuzz_onlyTheSignersOwnClaimOpens` (512 runs) |

---

## BondVault.sol

Collateral, locked against a claim, released or slashed on the verdict.

### `deposit(address token, uint256 amount)`
Credited by the balance **actually received**. Guards against fee-on-transfer
tokens crediting money the vault never got.

### `withdraw(address token, uint256 amount)`
Unlocked balance only, and only to the depositor. **No recipient argument.**

### `bond(uint256 mandateId)`
Takes only an id. The principal, token and amount are read from the claim the
agent signed, so there is no argument through which a caller can disagree with
the promise. Callable only by the agent named in that claim.

### `settle(uint256 mandateId) → (Verdict, uint256 moved)`
Permissionless. Reverts on `Pending` and `Unmeasurable`.

State that closes the mandate — `settled`, `verdict`, and the `locked`
decrement — is written **before any token transfer**, so a token with a transfer
hook that re-enters finds the mandate already closed.

### Invariants

| Invariant | Test |
|---|---|
| Available + locked equals what the vault holds | `testFuzz_theVaultHoldsExactlyWhatItSaysItHolds` (512 runs) |
| A slash never exceeds the bond | `testFuzz_aSlashNeverExceedsTheBond` (512 runs) |
| Only the named principal is ever paid | `testFuzz_onlyTheNamedPrincipalIsEverPaid` (512 runs) |
| Locked collateral cannot be withdrawn | `test_lockedCollateralCannotBeWithdrawn` |
| A mandate settles once | `test_aMandateCannotSettleTwice` |
| Flipping the oracle cannot stage a second slash | `test_aSecondSlashCannotBeStagedByFlippingTheOracle` |
| An unmeasurable or pending verdict moves nothing | two `..TakesNothing` tests |
| Only the signing agent can bond its own claim | `test_onlyTheSigningAgentCanBondItsOwnClaim` |
| The bond is the amount signed for | `test_theBondIsTheOneTheAgentSignedFor` |
| A re-entering token cannot drain the bond | `test_aTokenThatReEntersDuringTransferCannotDrainTheBond` |
| A token returning no data still works | `test_aTokenThatReturnsNothingStillWorks` |
| A fee-on-transfer token credits what arrived | `test_aFeeOnTransferTokenCreditsWhatArrivedNotWhatWasAsked` |

### Non-standard tokens

Several tokens on BNB Smart Chain — BSC-USDT among them — do not return a
boolean from `transfer`, in breach of the standard they claim to implement. A
bare `IERC20.transfer` against one reverts on the ABI decode **even when the
transfer succeeded**. Transfers here go through helpers that accept an empty
return as success and anything else as failure.

---

## OutcomePolicy.sol

Settles an ERC-8183 job on a measured outcome rather than on silence.

Altana's standard policy releases an escrow when a deliverable is submitted and
a dispute window elapses. For an agent selling a *financial outcome* that is the
wrong question: a seller can submit a file describing a position it never kept
in range and be paid for it.

**It cannot be bound to a live ERC-8183 job.** The router's `registerJob` keeps
an allowlist and reverts with `PolicyNotWhitelisted()` (`0xc94463e3`). Measured
on chain 97 with a fresh job, not assumed.

It is kept because it is the ERC-8183 path if that allowlist ever opens, and
because `BondVault` needed exactly its verdict logic — which is now shared
rather than duplicated.

`bind` is permissionless and first-come, which is defensible when the id comes
from a router and both parties agreed off-chain, and **not** defensible for a
bond. That is why `ClaimRegistry` exists.

---

## RecipientBound.sol

A session key binds a target and four selector bytes. It cannot bind an
*argument*. PancakeSwap's position manager takes `recipient` as an argument on
`mint` and `collect`, so granting those selectors grants them with any
destination the agent picks — a real boundary, but not a binding.

So the session is not granted on the position manager. It is granted on this
wrapper, whose `mint` and `collect` **have no recipient parameter**: the
destination is written from immutable storage. There is nothing to pass, because
the argument is not in the interface.

Four functions. No `multicall`, no `sweepToken`, no upgrade path, no owner.

---

## Deployment

Nothing is deployed to mainnet yet. When it is, every address will appear here
and on `/data` with its deployment transaction and verified source.

| Contract | Chain 56 | Chain 97 |
|---|---|---|
| `ClaimRegistry` | not deployed | not deployed |
| `BondVault` | not deployed | not deployed |
| `OutcomePolicy` | not deployed | not deployed |
| `RecipientBound` | per (principal, agent) pair | per pair |
