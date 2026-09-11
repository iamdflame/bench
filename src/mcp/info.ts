/**
 * What this server calls itself, in both transports.
 *
 * Kept in one place so the stdio install and the hosted endpoint cannot drift
 * into describing themselves differently, they are the same office.
 */

export const SERVER_INFO = {
  name: "mandate-assay-office",
  version: "1.0.0",
  title: "MANDATE Assay Office",
} as const;

/** The MCP protocol revision this server speaks. */
export const PROTOCOL_VERSION = "2025-06-18";

export const INSTRUCTIONS =
  "The assay office for ERC-8004 agents on BNB Smart Chain. Use assay_agent to test any agent against the chain and get a millesimal fineness with the evidence behind it; it works for any token id, including agents being pitched elsewhere, and needs no key. read_ladder gives the population at each rung of trust; search_register browses the agents with the reason each one is not higher; check_duplication reports how many registrations are the same product wearing different token ids. read_receipt reads any ERC-8183 job, mandate or transaction. Over this hosted endpoint the write tools (open_mandate, hire_over_x402, hire_erc8183, revoke_session) do not act: each returns the exact transaction or the live payment terms. Run the stdio server with MCP_SIGNER_KEY set in your own environment and the same tools act from that key.";
