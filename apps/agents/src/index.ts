/**
 * @bench/agents — the eight reference agents.
 *
 * Two per job: a primary and a conservative variant of the same trade-off.
 * They exist to guarantee every category board has depth, to give a buyer
 * something to hire when third-party supply for a job is thin, and to prove
 * the rails work end to end against something we control.
 *
 * They are reference implementations against a published listing spec, not
 * the product. Nothing about them is exempt from the probe: if one goes quiet
 * its rails close on the same cycle as anyone else's, and the ranking function
 * has no term for who operates a row.
 */

export * from "./assess";
