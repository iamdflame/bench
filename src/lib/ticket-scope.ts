/**
 * What a ticket shows about the session key it is about to authorise.
 *
 * The granted half comes from `CATEGORY_CALLS`, which is the same table
 * `grantMandateSession` builds a real allowlist from — so the ticket cannot
 * drift from what is actually signed.
 *
 * The withheld half is the part that makes the granted half mean anything. A
 * permission list showing only what was allowed reads as generous; beside what
 * was refused, with the reason, it reads as a boundary. Each of these is a call
 * that lives on a contract the session *can* reach, is not in the allowlist,
 * and is refused with a named `UnauthorizedCall` — which `npm run prove-session`
 * demonstrates against the live relay rather than asserting here.
 */

import { CATEGORY_CALLS } from "@/lib/chain/session";
import { CATEGORIES, PROTOCOL_LABEL, type Category } from "@/lib/config";
import type { TicketScope } from "@/components/ui/Ticket";

/**
 * Calls deliberately kept off each office's allowlist.
 *
 * All of them sit on contracts the session already has an entry for, which is
 * the point: the key is bounded per selector, so reaching a contract is not
 * reaching everything on it.
 */
const WITHHELD: Record<Category, { signature: string; to: string; why: string }[]> = {
  "grid-trading": [
    {
      signature: "sweepToken(address,uint256,address)",
      to: "0x13f4ea83d0bd40e75c8222255bc855a974568dd4",
      why: "moves any balance to any recipient; nothing about swapping requires it",
    },
    {
      signature: "refundETH()",
      to: "0x13f4ea83d0bd40e75c8222255bc855a974568dd4",
      why: "returns native balance to the caller, outside the mandate's accounting",
    },
  ],
  rebalancing: [
    {
      signature: "burn(uint256)",
      to: "0x46a15b0b27311cedf172ab29e4f4766fbe7f4364",
      why: "destroys the position token; a rebalance never needs the position to cease existing",
    },
    {
      signature: "safeTransferFrom(address,address,uint256)",
      to: "0x46a15b0b27311cedf172ab29e4f4766fbe7f4364",
      why: "sends the position to another address, which is the whole position leaving",
    },
  ],
  "yield-optimisation": [
    {
      signature: "borrow(uint256)",
      to: "0xa07c5b74c9b40447a954e1466938b865b6bbea36",
      why: "opens a liability; the mandate is to route yield, not to take leverage",
    },
    {
      signature: "withdraw(uint256,address)",
      to: "0x556b9306565093c855aea9ae92a594704c2cd59e",
      why: "unstakes to an arbitrary recipient; harvest returns to the mandate wallet",
    },
  ],
  "health-factor": [
    {
      signature: "redeemUnderlying(uint256)",
      to: "0xa07c5b74c9b40447a954e1466938b865b6bbea36",
      why: "removes collateral, which is the opposite of defending a health factor",
    },
    {
      signature: "exitMarket(address)",
      to: "0xfd36e2c2a6789db23113685031d7f16329158384",
      why: "leaves the market the position is being watched in",
    },
  ],
};

const label = (to: string) => PROTOCOL_LABEL[to.toLowerCase()] ?? to;

/** The allowlist and its complement, per office, in the shape the ticket wants. */
export function ticketScopes(): Record<Category, TicketScope> {
  return Object.fromEntries(
    CATEGORIES.map((c) => [
      c,
      {
        category: c,
        allowed: CATEGORY_CALLS[c].map((call) => ({
          to: call.to,
          target: label(call.to),
          signature: call.signature,
        })),
        withheld: WITHHELD[c].map((w) => ({
          signature: w.signature,
          target: label(w.to),
          why: w.why,
        })),
      },
    ]),
  ) as Record<Category, TicketScope>;
}
