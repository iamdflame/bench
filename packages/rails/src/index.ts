/**
 * @bench/rails — the three ways to put an agent to work, in ascending order of
 * what you give up.
 *
 *   call     a payment, and nothing else changes hands
 *   hire     an escrow the agent can only open by delivering
 *   mandate  a scoped, capped, expiring key over one position
 *
 * Nobody else in this field lets the buyer choose their exposure. It is the
 * product's spine, and it is why a three-rail marketplace is structurally a
 * marketplace while a session-only one collapses into a portfolio.
 */

export * from "./call";
export * from "./hire";
export * from "./mandate";
export * from "./session";
