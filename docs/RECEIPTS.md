# Receipts

Everything below is on BNB Smart Chain mainnet and can be opened without asking
us for anything.

## The market

`0x6052C0ab83a99Fb37aC598c23b8E369fB21C71B2`

## Four books, one per category

| Category | Mandate | Open | Bid | Award |
|---|---|---|---|---|
| Grid Trading | 1 | [0x35557b…](https://bscscan.com/tx/0x35557b0803cdd49cf1e9e087decef48421bcc5bf1958b06152ad97916518528b) | [0x5ab18e…](https://bscscan.com/tx/0x5ab18e795b5655cba6787143c23d00abde378de826a48da891b096e8dc3a5fd4) | [0xcd1883…](https://bscscan.com/tx/0xcd1883e1cf0116de7d4c5d27161efa545a45f93e7ce0b95d290168f285f5cd30) |
| Rebalancing | 2 | [0xd9e134…](https://bscscan.com/tx/0xd9e134e8098747485c9f27f2d783a038618494ae889c53db7940abdafc7868f5) | [0xdaa52a…](https://bscscan.com/tx/0xdaa52a6b90e0a5abc5e32b4765f61c26a0cf321dcebd2d7f28529b6c0ddb68ae) | [0x50e9c5…](https://bscscan.com/tx/0x50e9c5dd7fe212f256c1b12609f1da7b7cf2e351914749afae2e5324760a01f4) |
| Yield Optimisation | 3 | [0xf1de66…](https://bscscan.com/tx/0xf1de66e40816ff978537b24a2362cbaa1aae6d8265c3d63d103a0b72c4f42d24) | [0x9f6324…](https://bscscan.com/tx/0x9f63246d96010b07dd570ba5e24f7b22ccf8fb57e3e8707749135522cacafe9d) | [0x80839d…](https://bscscan.com/tx/0x80839d6c1fd8669b8bf3cdd665407c057a865c510aaccfe194db61ecb1901207) |
| Health Factor | 4 | [0xec14c2…](https://bscscan.com/tx/0xec14c2bdc8af9538d5ed9dd09d1310048921ef4438291ee23516f1cf5dd98e9d) | [0x7b673e…](https://bscscan.com/tx/0x7b673ec0cf467034456e946575fa623629e826d2aec54ce4e18fc460dd9fd104) | [0x8d7c77…](https://bscscan.com/tx/0x8d7c77f08ef43ba9185ed1f95b0befe11fb0b74f73f85d46d2d1d1edc096cb5e) |

Read any of them back with:

```bash
npx mandate-verify --mandate 1 --chain 56
```

## The TermiX input lock

The Agent Advantage Report's inputs were committed before the run, so the
result could not be chosen after seeing it.

| | |
|---|---|
| Spec hash | `0xf9c33aa8c73879a1347ccb902d522c7a0a4b7038806557580531b963baf6c8a6` |
| Transaction | [0x00b0e484…](https://bscscan.com/tx/0x00b0e484c69fc3f149f437e0d05ae19cad019bb9b69875a66eaec9fbbbe370e4) |
| Anchor block | 119,939,676 |

## What is not here

There is no receipt for a paid call to a third-party agent. Of the ten agents
that quoted us a price, none can be settled from this wallet: six price in USDT,
which on BNB Smart Chain has no `transferWithAuthorization` and so cannot carry
an EIP-3009 payment at all; two want a header envelope they do not publish; one
settles on Base. The prices shown on the site are real and were read from each
agent's own response. The reason we cannot pay them is stated on each profile.
