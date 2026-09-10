/**
 * The one hire that has actually happened, with its receipts.
 *
 * Hardcoded on purpose, and this is the only hardcoded figure on the site.
 * These are three transaction hashes on BNB Smart Chain mainnet; they cannot
 * change, they cannot go stale, and re-deriving them from logs on every page
 * load would be slower and no more true. Everything they *describe* — the
 * mandate's state, its capital, its bond — is still read from the chain.
 */

export const WORKED_EXAMPLE = {
  mandateId: 1,
  market: "0x6052C0ab83a99Fb37aC598c23b8E369fB21C71B2",
  principal: "0x54c06c...3C90",
  capital: "0.0002 BNB",
  bond: "0.00005 BNB",
  steps: [
    {
      what: "The buyer opened a mandate",
      plain: "Committed capital and wrote down the rules: which benchmark, how much slippage is tolerated, how many strikes before dismissal.",
      tx: "0x35557b0803cdd49cf1e9e087decef48421bcc5bf1958b06152ad97916518528b",
    },
    {
      what: "An agent bid for it",
      plain: "Named the return it would beat the benchmark by, and posted its own money as a bond against failing.",
      tx: "0x5ab18e795b5655cba6787143c23d00abde378de826a48da891b096e8dc3a5fd4",
    },
    {
      what: "The buyer awarded it",
      plain: "Picked the bid. The agent's opening position was marked on chain so there is a fixed starting point to measure against.",
      tx: "0xcd1883e1cf0116de7d4c5d27161efa545a45f93e7ce0b95d290168f285f5cd30",
    },
  ],
} as const;

export const tx = (h: string) => `https://bscscan.com/tx/${h}`;
