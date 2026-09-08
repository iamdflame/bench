/**
 * Rail 3, scoped.
 *
 * The scope is derived here and the grant is not made here, and the split is
 * the point. Deriving the scope is a read: it scans the chain for what this
 * wallet has been shown doing and intersects that with the job's canonical
 * calls, so `granted ⊆ proven` holds by construction. Making the grant is a
 * signature from the principal's own account, which this marketplace does not
 * hold and should not.
 *
 * What comes back is therefore the leash itself — every clause the session
 * would carry, every selector it deliberately withholds and why, and the
 * evidence each granted call was derived from. That is the document a person
 * is entitled to read before granting standing authority over a position, and
 * on this rail it is generated from the grant rather than written as copy, so
 * the two cannot drift.
 *
 * A refusal here is a feature. An agent that has never touched the venue gets
 * nothing and is told exactly that, and an *incomplete* scan is refused as
 * firmly as an empty one: a provider timing out must never become a silent
 * denial wearing the costume of a policy decision.
 */

import { NextResponse } from "next/server";
import { formatEther, type Address } from "viem";
import { KEYSTORE, addressUrl, recipientBound, resolveChain } from "@bench/shared";
import { isRefused, leashFor, scopeFor } from "@bench/rails";
import { findRow } from "@/lib/board";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/*
  The capability scan reads hundreds of thousands of blocks of logs before it
  will grant anything. That is the point, and it is not fast: a default
  function timeout cuts it off mid-scan, and an incomplete scan is refused
  rather than silently narrowed, so the request would fail for want of looking.
*/
export const maxDuration = 60;

const MAX_CAP_BNB = 1;
const MAX_TTL_DAYS = 90;

export async function POST(request: Request) {
  let body: { chainId?: number; id?: string; capBnb?: number; ttlDays?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, refusedBecause: "The request body was not readable JSON." }, { status: 400 });
  }

  const { chainId } = resolveChain(body.chainId);
  const capBnb = Number.isFinite(body.capBnb) ? Number(body.capBnb) : 0.05;
  const ttlDays = Number.isFinite(body.ttlDays) ? Number(body.ttlDays) : 30;

  if (capBnb <= 0 || capBnb > MAX_CAP_BNB) {
    return NextResponse.json(
      { ok: false, refusedBecause: `A cap between 0 and ${MAX_CAP_BNB} BNB is required. An uncapped session is not a bounded one.` },
      { status: 400 },
    );
  }
  if (ttlDays <= 0 || ttlDays > MAX_TTL_DAYS) {
    return NextResponse.json(
      { ok: false, refusedBecause: `An expiry between 1 and ${MAX_TTL_DAYS} days is required.` },
      { status: 400 },
    );
  }

  const hit = findRow(chainId, String(body.id ?? ""));
  if (!hit?.agent) {
    return NextResponse.json(
      {
        ok: false,
        executed: false,
        refusedBecause:
          "Rail 3 grants a session key to an account. This listing has no on-chain agent identity, so there is no account to scope one over.",
      },
      { status: 200 },
    );
  }

  const agent = hit.agent;
  if (!agent.job.known) {
    return NextResponse.json(
      { ok: false, executed: false, refusedBecause: `It is not classified into one of the four jobs, so there is no venue to look for. ${agent.job.reason}` },
      { status: 200 },
    );
  }
  const wallet = (agent.agentWallet ?? agent.owner) as Address | null;
  if (!wallet) {
    return NextResponse.json(
      { ok: false, executed: false, refusedBecause: "The registry does not resolve this token to a wallet, so there is nobody to grant authority to." },
      { status: 200 },
    );
  }

  const scope = await scopeFor(chainId, wallet, agent.job.value);

  if (isRefused(scope)) {
    return NextResponse.json(
      {
        ok: false,
        executed: false,
        refusedBecause: `No session was scoped because ${scope.reason}.`,
        remedy: scope.remedy,
        scanned: scope.scan
          ? { window: scope.scan.windowText, complete: scope.scan.complete, nonce: scope.scan.nonce }
          : null,
      },
      { status: 200 },
    );
  }

  const expiry = Math.floor(Date.now() / 1000) + Math.round(ttlDays * 86_400);
  const capWei = BigInt(Math.round(capBnb * 1e18));
  const leash = leashFor(scope, {
    capText: `${formatEther(capWei)} BNB per day`,
    expiryText: `${new Date(expiry * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`,
  });
  const wrapper = recipientBound(chainId);

  return NextResponse.json({
    ok: true,
    executed: false,
    leash: {
      job: leash.job,
      may: leash.may,
      mayNot: leash.mayNot,
      cap: leash.cap,
      expiry: leash.expiry,
      enforcedBy: leash.enforcedBy,
      rationale: leash.rationale,
    },
    derivedFrom: {
      window: scope.scan.windowText,
      venues: scope.scan.provenLabels,
      evidence: scope.scan.evidence.map((e) => ({
        label: e.label,
        tx: `https://bscscan.com/tx/${e.txHash}`,
        block: e.block,
      })),
      complete: scope.scan.complete,
    },
    wrapper: wrapper
      ? { address: wrapper, url: addressUrl(chainId, wrapper), binds: "mint and collect, whose interfaces carry no recipient parameter" }
      : null,
    keystore: addressUrl(chainId, KEYSTORE[chainId]),
    note:
      "Nothing has been granted. This is the exact authority a session would carry, derived from what the chain shows this wallet doing. The grant itself is a signature from the principal's own account, which this marketplace does not hold.",
  });
}
