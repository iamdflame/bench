/**
 * The live listing check, which is also `/list`'s engine and an MCP tool.
 *
 * One implementation, three front doors. An operator who fixes what this
 * reports has fixed what the board sees, because it is the same code the
 * worker runs — a validator that disagrees with the thing it validates for is
 * worse than none at all.
 *
 * It is bounded harder than the read routes because it makes outbound requests
 * on a caller's behalf, and an unbounded "call this URL for me" endpoint is a
 * server-side request forgery service with a nice interface. The SSRF guard in
 * `@bench/shared` is the other half of that, and it is why a private address
 * is refused with a sentence rather than dialled.
 */

import { NextResponse } from "next/server";
import { classify, readRegistration } from "@bench/index";
import { probeEndpoint, parseChallenge, probeQuote } from "@bench/probe";
import { scopeFor, isRefused } from "@bench/rails";
import { REFUSAL_TEXT, checkUrl, jobBySlug, resolveChain } from "@bench/shared";
import type { Address } from "viem";
import { gate, preflight } from "@/lib/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function OPTIONS() {
  return preflight();
}

export async function POST(request: Request) {
  const g = gate(request, { capacity: 6, windowMs: 60_000 }, "check");
  if (!g.allowed) return g.response;

  let body: { subject?: string; chainId?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, refusedBecause: "The request body was not readable JSON." }, { status: 400 });
  }

  const subject = String(body.subject ?? "").trim();
  const { chainId } = resolveChain(body.chainId);
  if (!subject) {
    return NextResponse.json({ ok: false, refusedBecause: "Give a token id or an endpoint URL to check." }, { status: 400 });
  }

  /* ------------------------------------------------------ a token id */
  let endpoint: string | null = null;
  let name: string | null = null;
  let description = "";
  let wallet: Address | null = null;
  let skills: string[] = [];

  if (/^\d+$/.test(subject)) {
    const reg = await readRegistration(chainId, subject).catch(() => null);
    if (!reg || !reg.owner) {
      return NextResponse.json(
        {
          ok: false,
          refusedBecause: `The registry does not resolve token ${subject} on chain ${chainId}. An id that does not exist cannot be listed.`,
        },
        { status: 200 },
      );
    }
    if (!reg.card) {
      return NextResponse.json(
        {
          ok: true,
          subject,
          name: `Agent ${subject}`,
          job: null,
          jobReason: "Its card could not be read, so there is nothing to classify from.",
          status: null,
          latencyMs: null,
          rails: [
            { rail: "call", open: false, reason: reg.cardRefusal ?? REFUSAL_TEXT["card-unparseable"] },
            { rail: "hire", open: false, reason: "Without a readable card there is no endpoint to ask for a quote." },
            { rail: "mandate", open: false, reason: "Without a readable card there is no job to derive authority for." },
          ],
        },
        { status: 200 },
      );
    }
    endpoint = reg.card.endpoint;
    name = reg.card.name;
    description = reg.card.description ?? "";
    wallet = reg.card.agentWallet ?? reg.owner;
    skills = reg.card.skills;
  } else {
    const u = checkUrl(subject);
    if (!u.ok) {
      return NextResponse.json({ ok: false, refusedBecause: u.detail }, { status: 200 });
    }
    endpoint = subject;
    name = new URL(subject).host;
  }

  const c = classify({ name, description, skills });
  const job = c.job.known ? jobBySlug(c.job.value) : null;

  /* ----------------------------------------------------------- rail 1 */
  const probe = await probeEndpoint(endpoint);
  const rails: { rail: string; open: boolean; reason: string | null }[] = [];

  if (probe.status === 402 && probe.sample) {
    const challenge = parseChallenge(probe.sample, chainId);
    if (!challenge) {
      rails.push({ rail: "call", open: false, reason: "It answered 402 with a body we could not read as an x402 challenge." });
    } else if (!challenge.payable) {
      rails.push({ rail: "call", open: false, reason: challenge.unpayableReason });
    } else {
      rails.push({
        rail: "call",
        open: true,
        reason: `It asks ${challenge.best!.amount} units of ${challenge.best!.assetSymbol} on chain ${challenge.best!.chainId}, which settles here.`,
      });
    }
  } else {
    rails.push({
      rail: "call",
      open: false,
      reason: probe.refusal
        ? REFUSAL_TEXT[probe.refusal]
        : `It answered ${probe.status} rather than a payment challenge, so there is no priced call to list.`,
    });
  }

  /* ----------------------------------------------------------- rail 2 */
  if (!job) {
    rails.push({
      rail: "hire",
      open: false,
      reason: `It is not classified into one of the four jobs, so there is no job specification to quote against. ${c.job.known ? "" : c.job.reason}`,
    });
  } else {
    const q = await probeQuote(endpoint, job, { chainId });
    rails.push({
      rail: "hire",
      open: q.accepted,
      reason: q.accepted
        ? `It returned an accepted quote of ${q.price} for ${job.title.toLowerCase()}${q.providerSig ? ", signed" : ", unsigned — the terms cannot be anchored on chain without a provider signature"}.`
        : (q.reason ?? (q.refusal ? REFUSAL_TEXT[q.refusal] : "It did not return an accepted quote.")),
    });
  }

  /* ----------------------------------------------------------- rail 3 */
  if (!job) {
    rails.push({ rail: "mandate", open: false, reason: "Without a job there is no venue to look for on chain." });
  } else if (!wallet) {
    rails.push({ rail: "mandate", open: false, reason: REFUSAL_TEXT["no-wallet"] });
  } else {
    const scope = await scopeFor(chainId, wallet, job.slug);
    rails.push({
      rail: "mandate",
      open: !isRefused(scope),
      reason: isRefused(scope)
        ? `${scope.reason.charAt(0).toUpperCase()}${scope.reason.slice(1)}. ${scope.remedy}`
        : scope.rationale,
    });
  }

  return NextResponse.json({
    ok: true,
    subject,
    name,
    job: job?.title ?? null,
    jobReason: c.job.known ? null : c.job.reason,
    status: probe.status,
    latencyMs: probe.latencyMs,
    rails,
  });
}
