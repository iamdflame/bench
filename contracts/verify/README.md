# Contract verification

Both live contracts are verified on Sourcify with a full match (creation and
runtime bytecode), which anyone can re-check without an account:

| Contract | Address | Sourcify |
|---|---|---|
| MandateMarketV2 | `0x6052C0ab83a99Fb37aC598c23b8E369fB21C71B2` | https://repo.sourcify.dev/56/0x6052C0ab83a99Fb37aC598c23b8E369fB21C71B2 |
| RecipientBound | `0x5863EDAEDe7394470db19395CA05B1439662952E` | https://repo.sourcify.dev/56/0x5863EDAEDe7394470db19395CA05B1439662952E |
| SwapBound | `0x1cf9C5E9339E99e3Bfd45f117ca17E6e1A4E59D1` | https://repo.sourcify.dev/56/0x1cf9C5E9339E99e3Bfd45f117ca17E6e1A4E59D1 |

    curl -s https://sourcify.dev/server/v2/contract/56/0x6052C0ab83a99Fb37aC598c23b8E369fB21C71B2
    curl -s https://sourcify.dev/server/v2/contract/56/0x5863EDAEDe7394470db19395CA05B1439662952E
    curl -s https://sourcify.dev/server/v2/contract/56/0x1cf9C5E9339E99e3Bfd45f117ca17E6e1A4E59D1

Compiler: solc 0.8.28+commit.7893614a, optimizer 200 runs, evm cancun.
MandateMarketV2 and SwapBound were compiled with the IR pipeline (`via_ir = true`,
the default profile). RecipientBound was compiled without it (`profile.recipientbound`
in `foundry.toml`); its runtime bytecode equals the deployed code with the
eight immutables masked.

## BscScan

All three are verified on BscScan too:
[MandateMarketV2](https://bscscan.com/address/0x6052C0ab83a99Fb37aC598c23b8E369fB21C71B2#code) ·
[RecipientBound](https://bscscan.com/address/0x5863EDAEDe7394470db19395CA05B1439662952E#code) ·
[SwapBound](https://bscscan.com/address/0x1cf9C5E9339E99e3Bfd45f117ca17E6e1A4E59D1#code).

MandateMarketV2 and SwapBound were submitted with
`forge verify-contract --chain 56 --verifier etherscan --constructor-args <args> <address> <path:Name>`.
RecipientBound was submitted through Etherscan's v2 API with
`RecipientBound.standard.json` from this directory: Forge's verifier sends
`viaIR: true` whatever the profile says, and RecipientBound was compiled without
the IR pipeline, so its own submission failed with a bytecode mismatch. The
standard JSON inputs stay here so anyone can repeat either verification.

Constructor arguments, ABI-encoded:

- MandateMarketV2 `(adjudicator, minBond, proposerStake, challengeWindow)` =
  `(0x54c06cC2623aAA2Dcc38B17fA07aD2e99b363C90, 40000000000000, 20000000000000, 300)`
- SwapBound `(principal, agent, router, tokenA, tokenB, fee, capA, capB, expiry)` =
  `(0x54c06cC2…, 0x54c06cC2…, 0x13f4EA83…, USDT 0x55d39832…, WBNB 0xbb4CdB9C…, 500, 3e18, 5e15, 1794280573)`.
  Deployed in tx `0xe1b9ce12e82556507c28b7360c3406d17c3b19efbbc599a95a90e069480a1411`.
- RecipientBound `(principal, agent, positionManager, token0, token1, cap0, cap1, expiry)` =
  `(0x54c06cC2…, 0x54c06cC2…, 0x46A15B0b…, 0x55d39832…, 0xbb4CdB9C…, 5e16, 5e16, 1823423782)`
