import type { Metadata } from "next";
import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import Reproduce from "@/components/instrument/Reproduce";

export const metadata: Metadata = {
  title: "API · the assay as public infrastructure",
  description:
    "A free, unauthenticated, rate-limited API over the assay engine. Assay any ERC-8004 agent on BNB Smart Chain, read the trust ladder, browse the register. Open to everyone.",
};

const HOST = "https://mandate-coral.vercel.app";

const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/v1/assay/56/{tokenId}",
    limit: "10 / minute",
    what: "Six tests against BNB Smart Chain, with every finding and its evidence. Several seconds of real work, which is why the limit is tightest here.",
    example: `curl ${HOST}/api/v1/assay/56/2410`,
  },
  {
    method: "GET",
    path: "/api/v1/registry/funnel",
    limit: "60 / minute",
    what: "The trust ladder: every rung, the test that settles it, its population, and the command that re-derives it. A rung that cannot be measured returns null.",
    example: `curl ${HOST}/api/v1/registry/funnel`,
  },
  {
    method: "GET",
    path: "/api/v1/agents?rung=&category=&limit=&offset=",
    limit: "30 / minute",
    what: "The register, filterable. Carries coverage, so a small answer can always be told apart from a small registry.",
    example: `curl "${HOST}/api/v1/agents?rung=2&limit=5"`,
  },
  {
    method: "GET",
    path: "/api/v1/allowlist/{job}",
    limit: "60 / minute",
    what: "The exact authority a hire grants: the calls it may make, the calls it may not and why each is withheld, where the money can go and what enforces that. The same document the ticket renders, so the page and the signature cannot drift apart. Use `all` for every job.",
    example: `curl ${HOST}/api/v1/allowlist/rebalancing`,
  },
  {
    method: "POST",
    path: "/api/activate",
    limit: "authority-bearing",
    what: "The hire itself. Derives the scope from what the chain has shown the agent doing, then grants a scoped, capped, expiring ERC-8183 session key registered in the Altana KeyStore. Returns the transaction when it executes, the exact refusal when the scope cannot be derived, and the command when this deployment holds no principal key. It never returns a success it did not perform.",
    example: `curl -X POST ${HOST}/api/activate -H 'content-type: application/json' \\\n  -d '{"tokenId":"269706","job":"rebalancing","capBnb":0.02,"ttlDays":7}'`,
  },
];

const GUARANTEES: [string, string, string][] = [
  ["observed", "Every response carries its boundary", "The block it was read at and when, on every payload. A number without its observation boundary is a claim, and this API does not serve claims."],
  ["null", "Unmeasurable is null, never a guess", "Rung 3 needs a per-agent log scan no free provider will serve at registry scale. Its population is null and its method says why."],
  ["coverage", "A small answer is not a small registry", "`read` is how many agents have been fetched and parsed; `unread` is the rest. You can always tell the two apart."],
  ["reproduce", "Every assay ships its own check", "A shell line that re-runs the same six tests from a clean checkout of the source, against the same chain."],
];

export default function ApiPage() {
  return (
    <>
      <Header current="/api" />
      <main className="shell" style={{ paddingBlock: "2rem", display: "flex", flexDirection: "column", gap: "2rem", maxWidth: "56rem" }}>
        <div style={{ maxWidth: "44rem" }}>
          <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)" }}>The assay is open to everyone.</h1>
          <p className="lede" style={{ fontSize: "var(--text-base)", marginTop: "0.5rem" }}>
            Free, unauthenticated, rate limited. No key, no account, no permission from us, including
            the other projects in this field. An assay office whose findings only its own front end
            could read would be a trade association, and a measurement nobody else can obtain is
            indistinguishable from one nobody else can falsify.
          </p>
        </div>

        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.85rem" }}>
            <h2 className="hd-2" style={{ fontSize: "var(--text-lg)" }}>Three endpoints</h2>
            <span className="meta">CORS open · JSON · no auth</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {ENDPOINTS.map((e) => (
              <article className="card" key={e.path} style={{ padding: "1rem 1.15rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "baseline", flexWrap: "wrap" }}>
                  <h3 className="num" style={{ fontSize: "var(--text-sm)" }}>
                    <span className="chip" style={{ marginRight: "0.5rem" }}>{e.method}</span>{e.path}
                  </h3>
                  <span className="meta">{e.limit}</span>
                </div>
                <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.5rem" }}>{e.what}</p>
                <pre className="num" style={{ marginTop: "0.6rem", padding: "0.5rem 0.7rem", background: "var(--color-paper-2)", border: "1px solid var(--color-line)", borderRadius: "var(--radius-chip)", fontSize: "var(--text-xs)", overflowX: "auto" }}>{e.example}</pre>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2 className="hd-2" style={{ fontSize: "var(--text-lg)", marginBottom: "0.85rem" }}>What every answer guarantees</h2>
          <div className="scope-grid" style={{ gap: "0.6rem" }}>
            {GUARANTEES.map(([k, name, note]) => (
              <div key={k} className="card" style={{ padding: "0.9rem 1.05rem" }}>
                <span className="num chip chip--live" style={{ marginBottom: "0.4rem" }}>{k}</span>
                <div className="hd-3" style={{ fontSize: "var(--text-sm)", marginTop: "0.4rem" }}>{name}</div>
                <p className="meta" style={{ marginTop: "0.25rem", lineHeight: 1.45 }}>{note}</p>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="hd-2" style={{ fontSize: "var(--text-lg)", marginBottom: "0.85rem" }}>A client, if you want one</h2>
          <pre style={{ padding: "1rem 1.15rem", background: "var(--color-touchstone)", color: "#e9edf3", borderRadius: "var(--radius-ui)", fontSize: "var(--text-xs)", overflowX: "auto", fontFamily: "var(--font-mono)" }}>{`npm i mandate-client

import { Mandate } from "mandate-client";
const mandate = new Mandate();

const assay = await mandate.assay(2410);
console.log(assay.fineness, assay.hallmarked, assay.observed.blockNumber);

const page = await mandate.agents({ rung: 2, limit: 20 });
console.log(\`\${page.coverage.read} of \${page.coverage.registered} read\`);`}</pre>
        </section>

        <div className="card" style={{ padding: "1.25rem" }}>
          <h2 className="hd-3">An invitation, meant literally</h2>
          <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.4rem" }}>
            Building a marketplace, a directory, a router or a wallet on BNB Smart Chain? This is
            yours to use. Show fineness on your own listings, use the ladder as your own filter, cite
            the assay and disagree with it in public. Every finding carries the command that
            re-derives it, so disagreeing is cheap and settling it is cheaper. Nothing to sign.
          </p>
        </div>

        <Reproduce
          title="Try it now"
          commands={ENDPOINTS.map((e) => ({ label: `${e.method} ${e.path}`, cmd: e.example }))}
        />
      </main>
      <Footer note="Rate limits are returned on every response as x-ratelimit-* headers. Exceeding one returns 429 with retry-after in seconds." />
    </>
  );
}
