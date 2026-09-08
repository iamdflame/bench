# contracts

One contract. That is deliberate.

`RecipientBound.sol` closes a gap that nothing else in this product can close:
a session key binds a target and four selector bytes, and it cannot bind an
*argument*. PancakeSwap's position manager takes `recipient` as an argument on
`mint` and `collect`, so granting those selectors grants them with any
destination the hired agent chooses. The usual mitigation is account isolation,
which is a real boundary and not a binding.

This contract is the binding. The session is granted on *it* rather than on the
position manager, and its `mint` and `collect` have no recipient parameter at
all — the destination is written from immutable storage. There is nothing for
an agent to pass, because the argument is not in the interface.

Four functions. No `multicall`, no `sweepToken`, no `refundETH`, no
`unwrapWETH9`, no upgrade path, no owner. What is not written cannot be called,
and a selector added to PancakeSwap tomorrow does not silently widen a grant
signed today.

```bash
forge test
```

Nothing else is deployed. No market, no bond, no scoring contract, no ledger.
An escrow is what ERC-8183's kernel is for, and re-implementing it here would
be a second thing to audit for no benefit.
