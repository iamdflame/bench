# Threat model

What an attacker would try against a contract holding other people's collateral,
and what stops it. Each row names the test that proves the claim.

---

## The one-sentence version

Collateral moves in exactly two situations — the chain said the promise held, or
the chain said it failed — and in no other situation whatsoever.

---

## Attacks on the terms

### "I write a promise nobody can keep, against your money"

The obvious attack on a bonded market: bind an unmeetable assertion to a mandate
id and collect the slash.

**Stopped by the id being the hash of the terms.** There is no id to squat,
because an id only exists once terms exist, and terms only exist once the agent
has signed them. Writing hostile terms produces a different hash, and the
signature does not recover to the agent.

> `test_aStrangerCannotOpenAMandateAgainstAnAgent`

### "I take your signature and change one field"

Raise the threshold so the promise cannot be met. Redirect the principal so the
slash comes to me. Swap the oracle for one I control. Raise the bond.

**Stopped by all of it being inside the signed struct.** Every one of those
fields is in the EIP-712 payload, so changing any of them changes the digest and
the signature no longer recovers.

> `test_raisingTheThresholdAfterSigningInvalidatesTheSignature`
> `test_redirectingTheSlashAfterSigningInvalidatesTheSignature`
> `test_swappingTheOracleAfterSigningInvalidatesTheSignature`
> `test_raisingTheBondAfterSigningInvalidatesTheSignature`

### "I front-run the mandate"

**Not an attack.** Submitting the agent's own signed claim registers the agent's
own terms under the same id, and the racer pays the gas.

> `test_frontRunningWithTheAgentsOwnClaimRegistersTheAgentsOwnTerms`

### "I replay a signature somewhere else"

Another deployment, another chain, or the same mandate twice.

**Stopped by the EIP-712 domain and by `AlreadyOpen`.** The domain binds
`chainId` and `address(this)`, and the separator is rebuilt on read if the chain
forks under us.

> `test_aSignatureDoesNotCarryToAnotherDeployment`
> `test_aSignatureDoesNotCarryToAnotherChain`
> `test_theSameMandateCannotBeOpenedTwice`

### "I present one signature as two"

**Stopped by refusing the upper half of the curve.** Not because the digest
could be forged, but because two byte strings authorising one claim would break
anything built later that keys off the signature.

> `test_aMalleableSignatureIsRefused`

---

## Attacks on the money

### "I settle twice"

**Stopped by `settled`, written before any transfer.**

> `test_aMandateCannotSettleTwice`

### "I flip the oracle and settle again"

Slash first, then make the oracle say the promise held and collect the release
too.

**Stopped the same way.** A closed mandate is closed regardless of what any
oracle says afterwards.

> `test_aSecondSlashCannotBeStagedByFlippingTheOracle`

### "My token calls back into `settle` during the transfer"

The only route into the vault twice: it never calls a principal directly, so the
callback has to come from the asset.

**Stopped by ordering.** `settled`, `verdict` and the `locked` decrement are all
written before the transfer, so the re-entrant call finds the mandate closed. The
test asserts the hook actually fired — otherwise it would prove nothing.

> `test_aTokenThatReEntersDuringTransferCannotDrainTheBond`

### "I withdraw collateral I have already put at risk"

**Stopped by locked and available being separate balances**, with the accounting
identity fuzzed at 512 runs.

> `test_lockedCollateralCannotBeWithdrawn`
> `testFuzz_theVaultHoldsExactlyWhatItSaysItHolds`

### "I bond somebody else's claim, or a bigger bond than was signed for"

**Stopped by `bond` taking only an id.** Everything else is read from the signed
claim. There is no argument to disagree through.

> `test_onlyTheSigningAgentCanBondItsOwnClaim`
> `test_theBondIsTheOneTheAgentSignedFor`

### "I make the slash land somewhere else"

**Stopped by the principal being written at bond time** from the signed claim,
never supplied at settlement. Fuzzed across arbitrary addresses.

> `testFuzz_onlyTheNamedPrincipalIsEverPaid`

---

## Attacks through the oracle

### "My oracle reverts, so the settlement defaults my way"

**There is no default.** A revert, a gas runaway, a short return, or an explicit
`known = false` all produce `Unmeasurable`, and `Unmeasurable` reverts the
settlement. Nothing moves in either direction.

> `test_anOracleThatRevertsTakesNothing`
> `test_anOracleThatCannotSeeTakesNothing`

### "My oracle consumes all the gas"

**Stopped by a 500,000 gas stipend** on a `staticcall`, which also cannot change
state.

### "I settle before the window closes"

> `test_anOpenWindowTakesNothing`

---

## Attacks through the token

| Behaviour | Handling | Test |
|---|---|---|
| Returns no data on success (BSC-USDT) | Empty return accepted | `test_aTokenThatReturnsNothingStillWorks` |
| Takes a fee on transfer | Credited by balance actually received | `test_aFeeOnTransferTokenCreditsWhatArrivedNotWhatWasAsked` |
| Calls back during transfer | State written before transfer | `test_aTokenThatReEntersDuringTransferCannotDrainTheBond` |

A token that lies about balances entirely can still harm the agent that chose to
bond in it. **The token is in the signed claim**, so it is the agent's own
choice, and a principal can decline a claim denominated in a token it does not
trust.

---

## What is deliberately not defended

**A principal that grants a mandate to a bad agent.** The market's job is to
make the record legible, not to prevent a choice. The trial exists so the choice
is informed.

**An oracle both parties agreed to that is simply wrong.** The oracle is named
in the signed claim; neither side picks it afterwards. If both sides agreed to a
bad measurement, the contract honours what they agreed.

**The bond being smaller than the harm.** A bond bounds an agent's downside; it
does not insure the principal's position. The interface must say this plainly
and not imply otherwise.

---

## Not yet done

- **No external audit.** 79 tests and four 512-run fuzz invariants are not an
  audit.
- **Not deployed**, so no address has held real money.
- **No formal verification** of the accounting identity beyond fuzzing.
