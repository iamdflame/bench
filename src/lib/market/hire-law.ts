/**
 * The hire law: no honourable path, no button.
 *
 * Every card and profile used to end in a Hire button, whatever stood behind
 * it. For an agent we do not operate, that button opened a job in our own
 * market which only our keeper ever bid on, so "Hire Ranger" hired us. For an
 * agent that had not answered in days, it offered a hire nobody would pick up.
 * A rival could screenshot either and be right.
 *
 * This is the one place that decides, for every surface, whether a hire can
 * be honoured and by which rail:
 *
 *   x402      the agent quoted a price in its own 402 that this marketplace can
 *             pay (BNB Smart Chain, a token we pay in, a transfer method we sign)
 *   mandate   the agent bids in this market, so opening a job here reaches it:
 *             our reference agents, labelled as ours, and any agent that has bid
 *
 * and it requires a recent answer. When no rail exists the verdict carries the
 * reason, in a sentence a person can act on, and the surface shows that
 * instead of a button. Surfaces do not decide this themselves.
 */

import type { Listing } from "@/lib/market/listing";
import { isOurs } from "@/lib/market/judge";
import { outcomes, paidCallsFromFile, type Outcome } from "@/lib/market/paid-calls";

/** A hire is only offered on an answer from the last day. */
export const FRESH_HOURS = 24;
/** "Answering now" means an answer inside this window. */
export const LIVE_MINUTES = 15;
/** How long a failed payment keeps an agent off the shelf. */
export const FAILURE_DAYS = 7;

let cached: { at: number; map: Map<string, Outcome> } | null = null;

/** What happened when we last paid each agent, from the committed record. */
function history(): Map<string, Outcome> {
  if (!cached || Date.now() - cached.at > 60_000) {
    cached = { at: Date.now(), map: outcomes(paidCallsFromFile()) };
  }
  return cached.map;
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
}

export type Rail =
  | {
      kind: "x402";
      /** The price as a person reads it, e.g. "0.02 USD1". */
      price: string;
      method: "eip3009" | "permit2" | null;
      endpoint: string;
    }
  | { kind: "mandate" };

export interface HireVerdict {
  /** A hire this site can honour exists for this agent right now. */
  ok: boolean;
  rails: Rail[];
  /** Why not, when not. */
  reason: string | null;
  /** Minutes since we last saw it answer, or null when it never has. */
  answeredMinutesAgo: number | null;
  answeringNow: boolean;
  /** Operated by Mandate, and labelled so everywhere. */
  ours: boolean;
}

function ago(minutes: number): string {
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))} min ago`;
  const h = minutes / 60;
  return h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;
}

export function hirePath(
  l: Pick<Listing, "tokenId" | "owner" | "probe" | "liveness" | "quote" | "priceLabel">,
  opts: { now?: number; bidders?: ReadonlySet<string>; outcomes?: Map<string, Outcome> } = {},
): HireVerdict {
  const now = opts.now ?? Date.now();
  const ours = isOurs(l);
  const at = l.probe?.at ? Date.parse(l.probe.at) : NaN;
  const minutes = l.probe?.answered && Number.isFinite(at) ? Math.max(0, (now - at) / 60_000) : null;
  const base = { answeredMinutesAgo: minutes, answeringNow: minutes !== null && minutes <= LIVE_MINUTES, ours };
  const refuse = (reason: string): HireVerdict => ({ ok: false, rails: [], reason, ...base });

  if (l.liveness === "no-endpoint") return refuse("Its registry card names nothing to call, so there is nothing to hire.");
  if (l.liveness === "untested" || !l.probe) return refuse("We have not called it yet, so we cannot say it will pick up.");
  if (!l.probe.answered) return refuse("It did not answer when we last called it.");
  if (minutes === null) return refuse("We have no time for its last answer, so we cannot say it is still there.");
  if (minutes > FRESH_HOURS * 60) {
    return refuse(`It last answered ${ago(minutes)}. A hire is only offered on an answer from the last day.`);
  }

  /*
    What happened the last time we paid it outranks what it says it charges.
    An agent that settled our payment and answered with an error, or refused a
    correct payment, is not hireable however good its quote looks, until it
    delivers once again.
  */
  const seen = (opts.outcomes ?? history()).get(l.tokenId);
  if (seen && !seen.delivered && (seen.paidNotDelivered || seen.refused) && seen.lastAt) {
    const days = (now - Date.parse(seen.lastAt)) / 86_400_000;
    if (days < FAILURE_DAYS) {
      const what = seen.paidNotDelivered
        ? `We paid it on ${shortDate(seen.lastAt)} and it answered with an error instead of the work`
        : `We offered it a correctly signed payment on ${shortDate(seen.lastAt)} and it refused`;
      return refuse(`${what}: ${(seen.lastWhy ?? "no reason given").slice(0, 220)}`);
    }
  }

  const rails: Rail[] = [];
  if (l.quote?.payable) {
    rails.push({ kind: "x402", price: l.priceLabel ?? l.quote.amount, method: l.quote.transferMethod ?? null, endpoint: l.quote.endpoint });
  }
  if (ours || (l.owner && opts.bidders?.has(l.owner.toLowerCase()))) rails.push({ kind: "mandate" });

  if (!rails.length) {
    return refuse(
      l.quote
        ? `It quoted a price we cannot pay: ${l.quote.unpayable}.`
        : "It has not quoted a price, and it does not bid on jobs in this market, so a hire here would not reach it.",
    );
  }
  return { ok: true, rails, reason: null, ...base };
}

/** The first rail a surface should lead with: paying the agent itself beats a job it must bid on. */
export function primaryRail(v: HireVerdict): Rail | null {
  return v.rails.find((r) => r.kind === "x402") ?? v.rails[0] ?? null;
}

/** Where the primary action goes, for a card or a profile. */
export function hireHref(tokenId: string, v: HireVerdict, about?: string): string | null {
  const r = primaryRail(v);
  if (!r) return null;
  if (r.kind === "x402") return `/agents/${tokenId}#call`;
  return about ? `/hire/${tokenId}?about=${encodeURIComponent(about)}` : `/hire/${tokenId}`;
}
