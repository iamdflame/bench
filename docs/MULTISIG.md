# The owner key, and how to stop it being one key

**Status: half done.** The adjudicator is no longer the owner: on 11 September
2026 the role moved to `0x6F29B50ebaF733D980EadfeB3253347d8a12A69C` through the
contract's own two-step handover
([nominate](https://bscscan.com/tx/0x3a6d2620d19edce49aada58509555c31c0e8241a2824845e49daa12cc5e7d302),
[accept](https://bscscan.com/tx/0xf681bf3894dc2af65f34b82c78420445bc610e3838fb33721a85ca138c38eb82)).
The owner is still a single externally owned account. Moving it to a Safe needs a
second signer, which only a person can provide. This document is what to do
about it and what it costs. It is written as instructions rather than intentions because
the gap is real and naming it is not the same as closing it.

## What the owner can and cannot do

`MandateMarketV2 is ReentrancyGuard, Ownable`. Ten functions are `onlyOwner`:

| Function | What it does |
|---|---|
| `resolveChallenge` | Decides a contested epoch, in either direction |
| `resolveSlash` | Decides a contested slash |
| `setPaused` | Stops every value-moving call |
| `setChallengeWindow` · `setMinBond` · `setProposerStake` · `setProtocolFeeBps` · `setMinFineness` | Every market parameter |
| `nominateAdjudicator` | Half of the adjudicator handover |
| `withdrawProtocol` | Sweeps the protocol's own fee balance |

Plus the two it inherits: `transferOwnership` and `renounceOwnership`.

The owner **cannot** mint, cannot withdraw a principal's capital, and cannot
take an agent's bond. Value leaves the contract only by pull payment to the
account it is credited to. So a compromised owner key is not a theft. It is the
ability to resolve disputes wrongly, slash wrongly, and halt the market, which
is enough.

## The live state

| | |
|---|---|
| Market | `0x6052C0ab83a99Fb37aC598c23b8E369fB21C71B2` |
| Owner | `0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90` |
| Adjudicator | `0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90` |

One key holds both roles. The adjudicator proposes settlements; the owner
resolves challenges to them. Today the same key does both sides of that
argument.

## Two hazards specific to this contract

1. **Ownership transfer is one step.** This is plain `Ownable`, not
   `Ownable2Step`. There is no `acceptOwnership`, so an address typed wrong is
   the market ownerless permanently. `contracts/test/MandateMarketV2.t.sol`
   covers the adjudicator's two-step handover and there is no equivalent test
   for the owner's, because there is no two-step to test.
2. **`renounceOwnership` is live.** Inherited, unguarded, and it would leave
   every challenge unresolvable forever.

## Doing it

### 1. Create the Safe

A 2-of-3 Gnosis Safe on BNB Smart Chain, at <https://app.safe.global>. Three
signers on three devices held by at least two people. A 2-of-3 where one person
holds two keys is a 1-of-1 wearing a hat.

### 2. Check the address is a contract

The script does this, and it is the guard that matters:

```solidity
require(size > 0, "NEW_OWNER has no code: this must be a multisig, not an EOA");
```

By hand, before running anything:

```bash
cast code 0xYourSafe --rpc-url https://bsc-dataseed1.binance.org | head -c 20
# anything other than 0x means it is a contract
```

### 3. Transfer

```bash
cd contracts
MARKET_ADDRESS=0x6052C0ab83a99Fb37aC598c23b8E369fB21C71B2 \
NEW_OWNER=0xYourSafe \
PRIVATE_KEY=$PRIVATE_KEY \
forge script script/TransferOwnership.s.sol \
  --rpc-url https://bsc-dataseed1.binance.org --broadcast
```

It prints the owner before and after and reads it back, and reverts if the move
did not take.

### 4. Split the adjudicator from the owner

Separate from the Safe, and cheaper. The adjudicator role has a proper two-step
handover, so it is safe to move now:

```bash
cast send $MARKET "nominateAdjudicator(address)" 0xNewAdjudicator --private-key $OWNER_KEY
cast send $MARKET "acceptAdjudicator()" --private-key $NEW_ADJUDICATOR_KEY
```

One key proposing settlements and resolving challenges to them is the more
embarrassing half of this, and it does not need a Safe to fix.

### 5. Verify

```bash
cast call $MARKET "owner()(address)"        --rpc-url https://bsc-dataseed1.binance.org
cast call $MARKET "adjudicator()(address)"  --rpc-url https://bsc-dataseed1.binance.org
```

Both should have changed, and to different addresses.

## Gas

Roughly 30,000 gas. At BSC's floor that is fractions of a cent. **The cost of
this fix is not money.** It is having three signers who exist, and that is why
it has not been done.

## What a Safe still does not fix

There is no timelock. A 2-of-3 can pause the market or resolve a challenge in
one transaction with no delay and no notice. For an adopting team the next step
after the Safe is a timelock on the parameter setters, leaving `setPaused`
immediate because a pause that waits two days is not a pause.
