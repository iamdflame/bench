# Threat model

What an attacker gets for each key this system uses, written against the
allowlists in `src/lib/chain/session.ts` and the contracts behind them. The
same table is on `/desk`.

## The argument in one line

A session grant is a target and a selector. It never constrains arguments.
So no session here is granted a call that takes an address the caller
chooses: PancakeSwap's `mint`, `collect` and `exactInputSingle` all take a
`recipient`, and sessions are granted on RecipientBound and SwapBound instead,
which write the principal as the recipient from immutable storage. This is
enforced by `src/lib/__tests__/allowlist.test.ts`, which parses every granted
signature and fails on any address argument or approve-shaped selector, and
by the Forge suites for both contracts, which fuzz the recipient.

## Per key

| Key | Can | Cannot |
|---|---|---|
| Rebalancing session (Range-1) | Withdraw the principal's positions, collect to the principal, re-mint up to RecipientBound's remaining lifetime caps (0.05 USDT, 0.05 WBNB). Spend up to 0.002 BNB a day of the account's gas. | Send tokens or NFTs to any other address. Call the position manager directly. Approve. Act after expiry (on chain, in both the session and the contract) or after revoke. |
| Grid session (Grid-1) | Swap USDT and WBNB in the one 0.05% pool, up to SwapBound's lifetime caps (3 USDT and 0.005 WBNB sold) and the session's daily spend (1 USDT, 0.003 WBNB). Choose the minimum out, which must be above zero. | Receive the proceeds. Trade any other pair or pool. Approve. Act after expiry or revoke. |
| Yield session | Supply or redeem the principal's USDT (vUSDT) or BNB (vBNB) on Venus. | Send funds elsewhere, borrow, supply on another account's behalf (`mintBehalf` is not granted). |
| Health-factor session | Repay the principal's own Venus debt, add collateral, enter a market. | Borrow, redeem collateral, repay for someone else (`repayBorrowBehalf` is not granted). |
| Passkey admin | Everything on its own wallet. | Nothing on the demo account; it is a different wallet. |
| Operator token | Revoke sessions from `/desk`, which stops agents working. | Grant a key or move funds. |
| Adjudicator key | Propose an epoch result, publish assays. A false proposal can be challenged by anyone with the observation inside the 300 second window. | Withdraw escrow, change parameters, take the owner's role. It is a different key from the owner. |
| Owner key (still an EOA) | Pause, change parameters, resolve slashes, withdraw protocol fees, nominate a new adjudicator. | Move principal out of a mandate except by the settlement rules. |

## What is not covered

- **Bad trades inside the caps.** A stolen grid key cannot take the proceeds,
  but it can trade at a poor price with a minimum out of one wei. The loss is
  bounded by SwapBound's lifetime caps and the session's daily spend. That is
  the honest description of a leash: it limits the damage, it does not make a
  key harmless.
- **The owner is an EOA.** A Safe transfer is prepared
  (`contracts/script/TransferOwnership.s.sol`, `docs/MULTISIG.md`) and not run,
  because it needs a second signer. `Ownable` here is one-step, so a mistyped
  transfer is permanent; the script checks the address before sending.
- **Native BNB and EIP-7702 accounts.** The demo account cannot receive native
  BNB from contracts that pay with Solidity's `transfer` (2,300 gas; the account
  needs about 26,300 to receive). vBNB redeems and WBNB unwraps revert for it.
  Nothing is lost, the call fails, but it is why the yield path prefers vUSDT.
- **The relay.** Session execution goes through Altana's relay. If the relay is
  down, agents stop; they do not gain any authority.

## Keys that existed and should not have

Two valid keys on the demo account were found on 11 September 2026 that
nothing in this repository could account for: one granted by a failed run of
our own recenter script (the store threw before the signer was written) and
one 60-day session granted on 10 September. Both were revoked
(`0xf9af3b24…caf2`, `0x32c883ae…47ed`) and are listed on `/desk` under keys
that have ended. `/desk` now lists every valid key the KeyStore holds for the
account and flags any this site does not hold.
