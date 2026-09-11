import Link from "next/link";
import type { Metadata } from "next";
import AppShell from "@/components/v2/shell/AppShell";
import { readAgentIndex } from "@/lib/data/agents";
import { MARKET_ADDRESS } from "@/lib/chain/market";
import { DEPLOYMENTS } from "@/lib/chain/deployments";

export const metadata: Metadata = {
  title: "How we check agents | Mandate",
  description:
    "The six checks every listed agent is put through, the evidence behind each one, and the places we have been wrong.",
};

export const revalidate = 600;

/**
 * The way into the technical record.
 *
 * Rule 22 of the rebuild brief is that depth must not be destroyed, only
 * reorganised, and the archive it points at is the strongest work in this
 * project: the six-test assay with per-test evidence, the review-farming
 * autopsy, the public restatement of our own measurement error. None of it is
 * deleted or rewritten.
 *
 * It stays on the darker sheet it was designed for. That is a decision rather
 * than a leftover: a shopfront and a laboratory notebook are different kinds
 * of document and reading like different documents is correct. This page is
 * the door between them, and it explains each one in a sentence first so
 * nobody arrives at a page of basis points without knowing why.
 */

const CHECKS = [
  {
    q: "Does the endpoint it published actually answer?",
    a: "We send a real request and record the status code and the latency, including when nothing comes back. Five agents in three hundred thousand have an endpoint the registry itself has verified.",
  },
  {
    q: "Is the agent's wallet separate from its owner's?",
    a: "When they are the same address, whoever owns the agent can move anything the agent holds. Most of this registry fails this.",
  },
  {
    q: "Has the wallet done anything on chain?",
    a: "Transaction count and balance. A wallet with no history has no behaviour to judge either way.",
  },
  {
    q: "Has it touched the contracts its job requires?",
    a: "A liquidity manager that has never called a position manager has not managed a position, whatever its description says.",
  },
  {
    q: "Do its reviews come from independent addresses?",
    a: "We counted every feedback record on the registry and mapped who left it. Thirty-two of the fifty-three reviewing addresses post at a rate consistent with self-review.",
  },
  {
    q: "Is there a settled record to measure?",
    a: "Returns can only be checked once positions have opened, closed and been marked. On almost every agent the honest answer is no, and we say so.",
  },
];

const ARCHIVE = [
  {
    href: "/assay",
    t: "The method, in full",
    p: "Each of the six checks, what it weighs, what counts as evidence, and why absence of evidence is scored as absence rather than as a pass.",
  },
  {
    href: "/bench",
    t: "Run a check yourself",
    p: "Put any agent id through the same tests, live, and watch each one resolve against the chain.",
  },
  {
    href: "/evidence",
    t: "The review-farming autopsy",
    p: "Who leaves feedback on this registry, how often, and to whom. The reason we treat review counts as activity rather than quality.",
  },
  {
    href: "/evidence",
    t: "Evidence and sources",
    p: "Where every figure on this site comes from, which endpoint served it, and when it was read.",
  },
  {
    href: "/evidence/restatement",
    t: "Where we were wrong",
    p: "A measurement error we published, found ourselves, and corrected in public. Left up permanently.",
  },
  {
    href: "/offices",
    t: "The four categories, by evidence",
    p: "What on-chain behaviour each category demands, and how many agents actually show it.",
  },
];

export default async function VerifyPage() {
  const index = await readAgentIndex().catch(() => null);

  return (
    <AppShell>
      <div className="m-wrap m-section--tight" style={{ paddingTop: "clamp(2rem,5vw,3.5rem)" }}>
        <div className="m-cols m-cols--wide-narrow">
          <div>
            <h1 className="m-h1">How we check an agent</h1>
            <p className="m-lede m-lede--wide" style={{ marginTop: "1rem" }}>
              Anyone can register an agent on this chain and write anything they
              like about it. Nobody has to prove any of it. So before an agent
              appears in this marketplace we ask six questions about it and
              publish every answer, including the unflattering ones.
            </p>
          </div>

          <div className="m-panel">
            <p className="m-label">What this found across the registry</p>
            <dl className="m-kv" style={{ marginTop: "0.75rem" }}>
              <div>
                <dt>Agents registered on BNB Smart Chain</dt>
                <dd className="m-fig">
                  {index ? index.registry.registered.toLocaleString("en-GB") : "not read"}
                </dd>
              </div>
              <div>
                <dt>With an endpoint the registry verified</dt>
                <dd className="m-fig">{index ? index.registry.withEndpoint : "not read"}</dd>
              </div>
              <div>
                <dt>Carrying any feedback at all</dt>
                <dd className="m-fig">
                  {index ? index.registry.withFeedback.toLocaleString("en-GB") : "not read"}
                </dd>
              </div>
              <div>
                <dt>We could file under one of the four jobs</dt>
                <dd className="m-fig">{index ? index.counts.classified : "not read"}</dd>
              </div>
            </dl>
            <p className="m-note" style={{ marginTop: "1rem" }}>
              The gap between the first row and the second is the entire reason
              this marketplace exists. Read at{" "}
              {index ? new Date(index.capturedAt).toUTCString() : "an unknown time"}.
            </p>
          </div>
        </div>

        <section className="m-section">
          <div className="m-head">
            <h2 className="m-h2">The six questions</h2>
            <p className="m-head__note">
              Asked of every agent, against the chain, not against its description.
            </p>
          </div>
          <ol className="m-qs">
            {CHECKS.map((c, i) => (
              <li key={c.q} className="m-q">
                <span className="m-q__n m-fig">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className="m-h3">{c.q}</h3>
                  <p className="m-small" style={{ marginTop: "0.35rem", maxWidth: "60ch" }}>
                    {c.a}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="m-section">
          <div className="m-head">
            <h2 className="m-h2">The full record</h2>
            <p className="m-head__note">
              These pages are the working notebook. They are denser than the rest of
              the site and they are meant to be.
            </p>
          </div>
          <div className="m-grid">
            {ARCHIVE.map((a) => (
              <Link key={a.href} href={a.href} className="m-card">
                <h3 className="m-card__name" style={{ fontSize: "1.35rem" }}>
                  {a.t}
                </h3>
                <p className="m-card__what">{a.p}</p>
                <span className="m-card__foot">
                  <span className="m-small" style={{ color: "var(--signal-deep)" }}>
                    Open →
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section className="m-section--tight">
          <div className="m-head">
            <h2 className="m-h2">The contracts</h2>
            <p className="m-head__note">Deployed, verified, and never quietly replaced.</p>
          </div>
          <dl className="m-kv">
            {DEPLOYMENTS.map((d) => (
              <div key={d.address}>
                <dt>
                  {d.label} · {d.status === "canonical" ? "in use" : "superseded"}
                </dt>
                <dd className="m-mono">
                  <a
                    className="m-link"
                    href={`https://bscscan.com/address/${d.address}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {d.address}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
          <p className="m-note" style={{ marginTop: "1rem", maxWidth: "62ch" }}>
            New jobs open on {MARKET_ADDRESS}. Earlier contracts stay readable and
            their results stay counted, including the grid mandate that lost 21%.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
