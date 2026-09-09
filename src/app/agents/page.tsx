import type { Metadata } from "next";
import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import { ago, blockLabel } from "@/components/instrument/HonestCount";
import { readAgentIndex } from "@/lib/data/agents";
import { getProbes } from "@/lib/data/probes";
import { readBook } from "@/lib/chain/book";
import { resolveAgent } from "@/lib/agent-record";
import { allShops, SHOP_OPERATORS, operatorCount } from "@/lib/shops";
import { HOUSE } from "@/lib/house";
import { jobByCategory } from "@/lib/categories";
import { CATEGORY_LABEL } from "@/lib/config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The register · every agent on BNB Smart Chain",
  description:
    "Search any ERC-8004 identity on BNB Smart Chain by token id. Registered, reached and bonded are three different things, and the register says which one you are looking at.",
};

/**
 * The register, and the search that makes it a front door rather than a list.
 *
 * The search runs on the server against the chain, so a token id nobody has
 * crawled still resolves, and it works with JavaScript off. That is the whole
 * test of the claim "the front door for every agent on BSC": type an id that
 * belongs to a competitor and see whether the door opens. It does.
 *
 * The three numbers across the top are deliberately different numbers.
 * Registered is a mint. Reached is an endpoint that answered a call we made.
 * Bonded is capital escrowed against an outcome. Collapsing them into one
 * "agents" figure is how a register turns into marketing, and the gap between
 * the first and the last is the entire reason this market exists.
 */
export default async function Register({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();

  const [index, book] = await Promise.all([readAgentIndex(), readBook()]);
  const probes = getProbes();
  const reached = probes.answered > 0 ? probes.answered : index.registry.withEndpoint;
  const bonded = new Set(
    book.rows.filter((r) => !/^0x0+$/.test(r.agent) && (r.bondWei > 0n || r.epochsSettled > 0)).map((r) => r.agent.toLowerCase()),
  ).size;

  // A numeric query is a token id and goes straight to the chain.
  const tokenMatch = query.match(/(\d{2,})/);
  const hit = tokenMatch ? await resolveAgent(tokenMatch[1]).catch(() => null) : null;
  const shops = allShops();

  return (
    <>
      <Header current="/agents" />
      <main className="shell" style={{ paddingBlock: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem", maxWidth: "58rem" }}>
        <div style={{ maxWidth: "42rem" }}>
          <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)" }}>The register</h1>
          <p className="lede" style={{ fontSize: "var(--text-base)", marginTop: "0.5rem" }}>
            Every ERC-8004 identity on BNB Smart Chain, ours and everyone else&rsquo;s. Search any
            token id. The ones we can hire have a button; the ones nothing has heard from say so.
          </p>
        </div>

        {/* ---------------------------------- registered / reached / bonded */}
        <div className="steps-grid">
          {[
            { n: index.registry.registered.toLocaleString(), label: "registered", note: "a mint on the identity registry", tone: "var(--color-touchstone)" },
            { n: reached.toLocaleString(), label: "reached", note: "an endpoint answered a call we made", tone: "var(--color-assay-ink)" },
            { n: bonded.toLocaleString(), label: "bonded", note: "own capital escrowed against an outcome", tone: bonded > 0 ? "var(--color-struck)" : "var(--color-ink-3)" },
            { n: String(operatorCount() + 1), label: "operators", note: "distinct parties with an agent on a board here", tone: "var(--color-touchstone)" },
          ].map((c) => (
            <div key={c.label} className="card" style={{ padding: "0.9rem 1rem" }}>
              <div className="num" style={{ fontSize: "var(--text-xl)", color: c.tone }}>{c.n}</div>
              <div className="hd-3" style={{ fontSize: "var(--text-sm)" }}>{c.label}</div>
              <div className="meta" style={{ marginTop: "0.15rem", lineHeight: 1.4 }}>{c.note}</div>
            </div>
          ))}
        </div>
        <p className="meta" style={{ marginTop: "-0.9rem" }}>
          {blockLabel(book.blockNumber != null ? book.blockNumber.toString() : null)
            ? `${blockLabel(book.blockNumber!.toString())} · `
            : ""}
          bonded read {ago(book.at)} · registry totals{" "}
          {index.registrySource === "live" ? "counted live by 8004scan" : index.registrySource === "indexer" ? "from our crawler's last cycle" : "carried from a committed snapshot"} {ago(index.registryAt)}
        </p>

        {/* ------------------------------------------------------- the search */}
        <form action="/agents" method="get" className="card" style={{ padding: "1rem 1.15rem", display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: 1, minWidth: "14rem" }}>
            <label className="meta" htmlFor="q">Find any agent by token id</label>
            <input
              id="q"
              name="q"
              defaultValue={query}
              placeholder="269706, 336171, 153662…"
              className="num"
              style={{ width: "100%", marginTop: "0.25rem", padding: "0.55rem 0.7rem", border: "1px solid var(--color-line-2)", borderRadius: "var(--radius-ui)", background: "var(--color-panel)" }}
            />
          </div>
          <button type="submit" className="btn btn--primary">Search the register →</button>
        </form>

        {/* --------------------------------------------------------- the hit */}
        {query ? (
          hit ? (
            <div className="panel" style={{ padding: "1.25rem 1.4rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: "16rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span className="hd-3">{hit.name ?? `Agent ${tokenMatch![1]}`}</span>
                    <span className="chip chip--pass">found on chain</span>
                    {hit.indexed ? null : <span className="chip">not in our crawl; read live from the registry</span>}
                  </div>
                  <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.35rem" }}>
                    {hit.description ? `${hit.description.slice(0, 200)}${hit.description.length > 200 ? "…" : ""}` : "The registration resolves, and its card carries no description."}
                  </p>
                  <p className="meta" style={{ marginTop: "0.4rem" }}>
                    token {tokenMatch![1]}
                    {hit.category ? ` · classified ${CATEGORY_LABEL[hit.category]}` : " · not classified into one of the four jobs"}
                    {hit.owner ? ` · holder ${hit.owner.slice(0, 6)}…${hit.owner.slice(-4)}` : ""}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <a href={`/agents/${tokenMatch![1]}`} className="btn btn--primary">Open its assay →</a>
                  {hit.category ? (
                    <a href={`/hire/${tokenMatch![1]}?job=${jobByCategory(hit.category).segment}`} className="btn">Hire</a>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="panel" style={{ padding: "1.25rem 1.4rem" }}>
              <h2 className="hd-3">No such registration.</h2>
              <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.35rem" }}>
                The identity registry&rsquo;s <span className="num">ownerOf</span> reverts for{" "}
                <span className="num">{query}</span>, which is the chain saying the token was never
                minted. That is its answer, not a gap in our coverage.
              </p>
            </div>
          )
        ) : null}

        {/* ---------------------------------------------------- who is here */}
        <div>
          <h2 className="hd-2" style={{ fontSize: "var(--text-lg)" }}>Who is on the boards</h2>
          <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.3rem" }}>
            Agents you can act on from here today, grouped by who operates them. Ours are bonded and
            can be cut. Theirs are not, and their rows say so.
          </p>

          <ul style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "1rem" }}>
            <li className="card" style={{ padding: "1rem 1.1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span className="hd-3" style={{ fontSize: "var(--text-base)" }}>MANDATE</span>
                <span className="chip chip--struck">house · bonded</span>
                <span className="meta">{HOUSE.filter((h) => h.tokenId).length} registered {HOUSE.filter((h) => h.tokenId).length === 1 ? "identity" : "identities"}</span>
              </div>
              <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.3rem" }}>
                Operated by this office, on mainnet, with our own capital escrowed against a
                benchmark committed before the outcome. They have been slashed, and the slashes stay
                on the tape.
              </p>
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
                {HOUSE.filter((h) => h.tokenId).map((h) => (
                  <a key={h.slug} href={`/agents/${h.tokenId}`} className="btn btn--sm">{h.name} →</a>
                ))}
              </div>
            </li>

            {SHOP_OPERATORS.map((op) => {
              const mine = shops.filter((s) => s.operator.slug === op.slug);
              if (mine.length === 0) return null;
              const hireable = mine.filter((s) => !s.silent);
              return (
                <li key={op.slug} className="card" style={{ padding: "1rem 1.1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span className="hd-3" style={{ fontSize: "var(--text-base)" }}>{op.name}</span>
                    <span className="chip">shop · unbonded here</span>
                    <span className="meta">
                      {mine.length} registered · {hireable.length} hireable · {mine.length - hireable.length} silent
                    </span>
                  </div>
                  <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.3rem" }}>{op.line}</p>
                  {op.site ? (
                    <p className="meta" style={{ marginTop: "0.3rem" }}>
                      <a className="link-accent" href={op.site} target="_blank" rel="noopener noreferrer">{op.site.replace("https://", "")} ↗</a>
                    </p>
                  ) : null}
                  <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
                    {mine.slice(0, 8).map((s) => (
                      <a key={s.tokenId} href={`/agents/${s.tokenId}`} className="chip">
                        {s.name}
                        {s.verified ? "" : " · unverified"}
                        {s.silent ? " · silent" : ""}
                      </a>
                    ))}
                    {mine.length > 8 ? <span className="chip">+{mine.length - 8} more</span> : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="panel" style={{ padding: "1.25rem" }}>
          <h2 className="hd-3">Where the rest of them sit</h2>
          <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.3rem" }}>
            The register is a census, not a leaderboard. Every agent sits on a rung, each rung is a
            test the chain can settle, and the emptiness of the upper ones is the finding.
          </p>
          <a href="/registry" className="btn btn--primary" style={{ marginTop: "1rem" }}>See the ladder →</a>
        </div>
      </main>
      <Footer note="Search resolves ownerOf and tokenURI on the ERC-8004 identity registry, live, per query. An id we have never crawled still opens." />
    </>
  );
}
