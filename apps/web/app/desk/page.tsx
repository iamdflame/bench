import type { Metadata } from "next";
import Link from "next/link";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { KEYSTORE, addressUrl, txUrl } from "@bench/shared";
import Nav from "@/components/board/Nav";
import Footer from "@/components/board/Footer";
import { getBoard } from "@/lib/board";
import { Reclaim, Revoke } from "@/components/board/DeskActions";
import { buildReclaim, readEngagements as readSessions } from "@bench/rails";

/**
 * Your engagements.
 *
 * Three kinds of thing land here, and they are genuinely different, so they
 * are not flattened into one list of "activity":
 *
 *   a call     is finished the moment it returns. It leaves a receipt and no
 *              standing permission, so there is nothing to revoke and the row
 *              says so rather than showing a disabled button.
 *   a job      is money in escrow waiting on a deliverable. Its controls are
 *              the ones that actually exist: view it, or reclaim it after the
 *              deadline.
 *   a session  is standing authority. Its controls are pause and revoke, and
 *              revoke is one transaction whose effect is immediate.
 *
 * An empty desk is a real state and is written as direction rather than as an
 * apology.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your desk",
  description: "Every engagement you have opened: what it may do, what it has done, and how to end it.",
};

interface Engagement {
  id: string;
  rail: "call" | "hire" | "mandate";
  title: string;
  target: string;
  at: string;
  txHash?: string;
  amountText?: string;
  status: string;
  detail: string;
  /** Set on a hire, so Reclaim has something to call. */
  jobId?: string;
  /** Unix seconds. The kernel reverts a reclaim before this. */
  reclaimableAt?: number;
  /** Set on a session this deployment granted, so Revoke has something to end. */
  engagementId?: number;
}

/**
 * Read from the proof record.
 *
 * This deployment does not hold a visitor's key, so it cannot show a
 * visitor's engagements — it shows the ones it has itself made, which are the
 * ones it can honestly account for.
 *
 * Two sources, merged, and the second one had never been read by anything.
 * `proofs.json` is written by the `prove-*` scripts and is what this page has
 * always shown. `engagements.json` is written by `grantEngagement` every time a
 * session is granted, and carries the fields that make a session actionable:
 * its id, its allowlist, its expiry, and whether it has already been revoked.
 * Without it the desk could describe a session but could not end one, which is
 * how `Revoke` came to be a disabled span.
 */
function readEngagements(): Engagement[] {
  for (const p of [join(process.cwd(), "data", "proofs.json"), join(process.cwd(), "apps/web/data", "proofs.json")]) {
    if (!existsSync(p)) continue;
    try {
      const doc = JSON.parse(readFileSync(p, "utf8")) as {
        proofs: {
          id: string;
          rail: Engagement["rail"];
          title: string;
          target: string;
          at: string;
          txHash: string;
          amountText: string;
          what: string;
        }[];
      };
      /*
        A proof row is matched to a live session by its key. The proof records
        what happened; the engagement record is the thing that can still be
        acted on, and only it knows the id revocation is keyed on.
      */
      /*
        Session rows come from the engagement record rather than the proof
        record, and replace the mandate proofs rather than sitting beside them.

        A proof says a session was granted; the engagement record is the session
        — it knows the id revocation is keyed on, the expiry, and whether it has
        already ended. Matching the two was attempted by transaction hash and
        cannot work: the grant hash is never persisted. So the actionable record
        wins for its own rail, and the proof rows carry the other two.
      */
      const sessions = liveSessions();
      const fromProofs = doc.proofs
        .filter((p2) => !(p2.rail === "mandate" && sessions.length > 0))
        .map((p2) => ({
          id: p2.id,
          rail: p2.rail,
          title: p2.title,
          target: p2.target,
          at: p2.at,
          txHash: p2.txHash,
          amountText: p2.amountText,
          status: p2.rail === "call" ? "settled" : "open",
          detail: p2.what,
        }));
      return [...sessions, ...fromProofs];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * The sessions this deployment has actually granted, as desk rows.
 *
 * Read defensively: the file is written by a CLI on a different machine from
 * the one serving this page, so its absence is ordinary rather than an error,
 * and an unreadable one must not take the desk down with it.
 *
 * An orphaned session — the record written, the key never authorised — is shown
 * as orphaned rather than as revocable. There is nothing on chain to end, and
 * offering a button that would send a transaction against a key that was never
 * granted is worse than saying what happened.
 */
function liveSessions(): Engagement[] {
  let records: ReturnType<typeof readSessions>;
  try {
    records = readSessions();
  } catch {
    return [];
  }
  return records.map((e) => {
    const expired = e.expiry * 1000 < Date.now();
    return {
      id: `session-${e.id}`,
      rail: "mandate" as const,
      title: `${e.agentName} — a session over ${e.account.slice(0, 10)}…`,
      target: e.sessionKey,
      at: e.grantedAt,
      ...(e.registrationTx ? { txHash: e.registrationTx } : {}),
      amountText: `${e.capWei === "0" ? "no spend" : e.capWei} cap`,
      status: e.revokedAt ? "revoked" : e.orphanedAt ? "orphaned" : expired ? "expired" : "live",
      detail: [
        `It may call ${e.allowlist.length} ${e.allowlist.length === 1 ? "method" : "methods"}, and deliberately not ${e.withheld.length} more.`,
        e.rationale,
        e.registered
          ? "Registered in the KeyStore, so a third party can verify its authority and its revocation without asking us."
          : "Not registered in the KeyStore, so its authority is enforced on chain but not independently verifiable.",
      ].join(" "),
      /* Only a live session can be ended. The rest have already ended. */
      ...(e.revokedAt || e.orphanedAt ? {} : { engagementId: e.id }),
    };
  });
}

export default async function DeskPage() {
  const engagements = readEngagements();
  const grade = getBoard().grade ?? null;

  return (
    <>
      <Nav path="/desk" />
      <main className="shell" style={{ paddingBlock: 28 }}>
        <section style={{ maxWidth: "72ch" }}>
          <h1 className="h1">The desk</h1>
          <p className="lede" style={{ marginTop: 10 }}>
            Everything that has been put to work, what it was allowed to do, and how to end it.
          </p>
        </section>

        {engagements.length === 0 ? (
          <div className="panel" style={{ marginTop: 22, padding: 24, maxWidth: "70ch" }}>
            <h2 className="h3">Nothing is working yet.</h2>
            <p className="prose" style={{ marginTop: 10 }}>
              When you put an agent to work it appears here with everything it may do, everything it has
              done, and — where it holds standing authority — a button that ends that authority on chain in
              one transaction.
            </p>
            <Link href="/" className="btn btn--hire" style={{ marginTop: 18 }}>
              Pick a job
            </Link>
          </div>
        ) : (
          <section style={{ marginTop: 22 }}>
            <ul className="stack" style={{ gap: 12 }}>
              {engagements.map((e) => (
                <li key={e.id} className="panel" style={{ padding: 18 }}>
                  <div className="between wrap">
                    <div className="row" style={{ gap: 10 }}>
                      <span className={`chip chip--${e.rail}`}>{e.rail}</span>
                      <span style={{ fontWeight: 500 }}>{e.title}</span>
                    </div>
                    <span className="row" style={{ gap: 8 }}>
                      {/*
                        A revoked engagement keeps its row and loses its colour.
                        Removing it would hide what was done; leaving it lit
                        would imply authority that no longer exists.
                      */}
                      <span className="rails" role="img" aria-label={`${e.rail} rail, ${e.status}`}>
                        <span
                          className="rail"
                          {...(e.status === "revoked" ? { "data-revoked": "" } : { "data-on": e.rail })}
                        />
                      </span>
                      <span className="provenance">{e.status}</span>
                    </span>
                  </div>

                  <p className="prose" style={{ marginTop: 10 }}>
                    {e.detail}
                  </p>

                  <p className="provenance" style={{ marginTop: 10 }}>
                    <span className="num">{e.target}</span>
                    {e.amountText ? ` · ${e.amountText}` : ""} ·{" "}
                    {new Date(e.at).toISOString().replace("T", " ").slice(0, 16)} UTC
                    {e.txHash ? (
                      <>
                        {" · "}
                        <a className="nav__link" style={{ textDecoration: "underline" }} href={txUrl(56, e.txHash)}>
                          {e.txHash.slice(0, 14)}…
                        </a>
                      </>
                    ) : null}
                  </p>

                  <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
                    {e.rail === "call" ? (
                      <p className="refusal" style={{ margin: 0 }}>
                        A call grants nothing standing, so there is nothing to revoke. It took exactly the
                        quoted amount, once, from an authorization whose nonce cannot be spent twice.
                      </p>
                    ) : null}
                    {/*
                      Both, or neither. A reclaim needs the job id to call and
                      the deadline to know whether calling it would revert, and
                      defaulting the deadline to zero would render "reclaim now"
                      over a kernel that is going to refuse. `check:absence`
                      failed this line for exactly that, correctly.
                    */}
                    {e.rail === "hire" && e.jobId && e.reclaimableAt !== undefined ? (
                      <Reclaim
                        chainId={56}
                        reclaimableAt={e.reclaimableAt}
                        intent={{
                          to: buildReclaim(56, BigInt(e.jobId)).to,
                          data: buildReclaim(56, BigInt(e.jobId)).data,
                          value: "0",
                        }}
                      />
                    ) : e.rail === "hire" ? (
                      <p className="provenance" style={{ margin: 0, maxWidth: "64ch" }}>
                        Reclaim is a call from your own wallet against the kernel, and it needs this job&rsquo;s
                        id and its deadline. Neither is in this record, so the button is not offered rather
                        than offered and broken.
                      </p>
                    ) : null}
                    {e.rail === "mandate" ? (
                      <>
                        {e.status === "revoked" ? (
                          <p className="provenance" style={{ margin: 0, maxWidth: "64ch" }}>
                            <span className="chip chip--refused">revoked</span> This authority ended on chain
                            and does not come back. The row stays because what was done still happened.
                          </p>
                        ) : e.engagementId !== undefined ? (
                          <Revoke id={e.engagementId} />
                        ) : null}
                        <a
                          className="provenance nav__link"
                          style={{ textDecoration: "underline" }}
                          href={addressUrl(56, KEYSTORE[56])}
                        >
                          verify this session in the KeyStore
                        </a>
                      </>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ------------------------------------------- §12.4: grading itself */}
        <section style={{ marginTop: 30, maxWidth: "76ch" }} aria-labelledby="grade-h">
          <h2 id="grade-h" className="h3">
            How wrong we have been
          </h2>
          {grade && !grade.refusedBecause && grade.rows.length > 0 ? (
            <>
              <p className="prose" style={{ marginTop: 10 }}>
                The replay published on <a className="nav__link" style={{ textDecoration: "underline" }} href="/data">/data</a>{" "}
                covers trades that had already happened, which proves the arithmetic and says nothing about
                tomorrow. So the same strategies were replayed again over the window that came after it —{" "}
                {grade.actualWindow.hours}h and {grade.actualWindow.swaps.toLocaleString("en-US")} swaps that
                nothing in the published table had seen.{" "}
                <strong>
                  {grade.directionsHeld} of {grade.rows.length} kept the sign they were projected with.
                </strong>
              </p>
              <dl className="terms" style={{ marginTop: 12 }}>
                {grade.rows.map((r) => (
                  <div key={r.strategy} style={{ display: "contents" }}>
                    <dt className="num">
                      {Number(r.error) > 0 ? "+" : ""}
                      {Number(r.error).toFixed(2)}
                    </dt>
                    <dd>
                      {r.name} — we said {Number(r.projected).toFixed(2)}, it did{" "}
                      {Number(r.actual).toFixed(2)}
                      {r.directionHeld ? "" : ", and the sign flipped"}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p className="unmeasured" style={{ marginTop: 10 }}>
              no forecast error to publish yet
              <span className="unmeasured__why">
                {grade?.refusedBecause ??
                  "A projection has to be graded against a window it never saw, and not enough chain has passed since the last one was published."}
              </span>
            </p>
          )}
          <p className="prose" style={{ marginTop: 12 }}>
            Per-engagement grading needs a projection recorded <em>at hire time</em>, and none of the
            engagements above carries one — they predate the record. Nothing backfills them, and nothing
            should: a projection written afterwards, by code that can already see how the window turned out,
            is a postdiction wearing a forecast&rsquo;s clothes. The field exists now, so the next hire made
            against a position will carry one.
          </p>
        </section>

        <section style={{ marginTop: 30, maxWidth: "74ch" }}>
          <h2 className="h3">What the desk cannot show you yet</h2>
          <p className="prose" style={{ marginTop: 10 }}>
            This deployment holds no visitor&rsquo;s key, so it cannot list engagements it did not make. What
            is above is what this marketplace has itself put to work, which is the only set it can account
            for honestly. Reading a connected wallet&rsquo;s own jobs and sessions from chain is a wallet
            connection away and is not pretended at here.
          </p>
        </section>
      </main>
      <Footer />
    </>
  );
}
