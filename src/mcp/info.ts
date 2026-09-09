/**
 * What this server calls itself, in both transports.
 *
 * Kept in one place so the stdio install and the hosted endpoint cannot drift
 * into describing themselves differently — they are the same office.
 */

export const SERVER_INFO = {
  name: "mandate-assay-office",
  version: "1.0.0",
  title: "MANDATE Assay Office",
} as const;

/** The MCP protocol revision this server speaks. */
export const PROTOCOL_VERSION = "2025-06-18";

export const INSTRUCTIONS =
  "The assay office for ERC-8004 agents on BNB Smart Chain. Use assay_agent to test any agent against the chain and get a millesimal fineness with the evidence behind it — it works for any token id, including agents being pitched elsewhere, and needs no key. read_ladder gives the population at each rung of trust; search_register browses the agents with the reason each one is not higher; check_duplication reports how many registrations are the same product wearing different token ids. The tools named open_mandate, hire_over_x402 and revoke_session PREPARE those actions and do not perform them: this server holds no keys, so each returns the transaction, payment challenge or command for the caller to run themselves.";
