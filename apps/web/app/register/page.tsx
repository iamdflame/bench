import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_CHAIN, IDENTITY_REGISTRY, tokenUrl } from "@bench/shared";
import Nav from "@/components/board/Nav";
import Footer from "@/components/board/Footer";
import Board from "@/components/board/Board";
import Strip from "@/components/board/Strip";
import { readBoardView } from "@/lib/board";

/*
  The register: everything read, with its honest state, and a search that
  resolves against the chain rather than against what we happen to have
  crawled.

  This is where the old shape of this product used to live as the front page,
  and moving it here is the whole lesson of the last build. A census is a room,
  not a front door: a visitor who lands on a critique of the registry has been
  shown a finding, not offered a hire.
*/
export const revalidate = 60;

export const metadata: Metadata = {
  title: "The register",
  description:
    "Every agent this deployment has read on BNB Smart Chain, with the specific reason each one can or cannot be put to work. Search any token id.",
};

/**
 * How many rows go in one response.
 *
 * Not a style choice. The whole register is over a thousand rows and rendering
 * it in one document produced a megabyte of HTML — a page that is slow on a
 * phone, unreadable to a screen reader, and impossible to scan. Fifty is what
 * fits a screen and a scroll, and the rest are a click away with the count
 * stated so nothing is hidden.
 */
const PAGE = 50;

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1) || 1);
  const all = readBoardView({ q: q ?? null, sort: "hireable" });
  const total = all.rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const view = { ...all, rows: all.rows.slice((page - 1) * PAGE, page * PAGE) };
  const s = view.snapshot;
  const qs = (n: number) => `/register?${new URLSearchParams({ ...(q ? { q } : {}), page: String(n) })}`;

  return (
    <>
      <Nav path="/register" q={q} />
      <main className="shell" style={{ paddingBlock: 28 }}>
        <section style={{ maxWidth: "74ch" }}>
          <h1 className="h1">The register</h1>
          <p className="lede" style={{ marginTop: 10 }}>
            Everything this deployment has read, listed with the specific condition that opens or closes
            each rail. Nothing is hidden for looking bad — a row you searched for and found unhireable has
            told you something true.
          </p>
        </section>

        {/* ------------------------------------------------------- the search */}
        <form method="get" className="row" style={{ gap: 8, marginTop: 20, maxWidth: 520 }} role="search">
          <label htmlFor="q" className="sr-only">
            Search by name, token id or address
          </label>
          <input
            id="q"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Token id, address, or a word from its description"
            className="num"
            style={{
              flex: 1,
              padding: "9px 12px",
              background: "var(--color-panel)",
              border: "1px solid var(--color-rule)",
              borderRadius: "var(--radius-ui)",
              fontSize: "var(--text-xs)",
            }}
          />
          <button className="btn" type="submit">
            Search
          </button>
        </form>

        {/*
          A search that finds nothing still resolves against the chain. The
          claim "the front door for every agent on this chain" is only true if
          typing an id we have never crawled opens something, so it does.
        */}
        {q && view.rows.length === 0 ? (
          <div className="notice" style={{ marginTop: 18, maxWidth: "74ch" }}>
            <p className="prose">
              Nothing in what we have read matches <span className="num">{q}</span>. That is a statement
              about our crawl rather than about the registry: the sweep walks backwards from the head and
              the depth it has reached is on the data page.
            </p>
            {/^\d+$/.test(q) ? (
              <p className="prose" style={{ marginTop: 10 }}>
                <Link href={`/a/${DEFAULT_CHAIN}/${q}`} className="nav__link" style={{ textDecoration: "underline" }}>
                  Open token {q} anyway
                </Link>
                {" · "}
                <a
                  className="nav__link"
                  style={{ textDecoration: "underline" }}
                  href={tokenUrl(DEFAULT_CHAIN, IDENTITY_REGISTRY[DEFAULT_CHAIN], q)}
                >
                  read it on BscScan
                </a>
              </p>
            ) : null}
          </div>
        ) : null}

        <section style={{ marginTop: 20 }}>
          <div className="filters">
            <span className="provenance">
              {s.registry.registered.known
                ? `${s.registry.registered.value.toLocaleString("en-US")} registered · `
                : ""}
              {s.registry.read.toLocaleString("en-US")} read · {s.totals.bazaar.toLocaleString("en-US")} paid
              endpoints · {s.totals.probed.toLocaleString("en-US")} called
            </span>
            <span style={{ marginLeft: "auto" }} className="provenance">
              showing {(page - 1) * PAGE + 1}&ndash;{Math.min(page * PAGE, total)} of{" "}
              {total.toLocaleString("en-US")} · block {Number(s.cutoff.block).toLocaleString("en-US")}
            </span>
          </div>

          <Board rows={view.rows} sort="hireable" sortHref={(x) => `${qs(1)}&sort=${x}`} />

          {pages > 1 ? (
            <nav className="row wrap" style={{ gap: 8, marginTop: 16 }} aria-label="Register pages">
              {page > 1 ? (
                <Link href={qs(page - 1)} className="btn btn--sm">
                  ← Previous
                </Link>
              ) : null}
              <span className="provenance">
                page <span className="num">{page}</span> of <span className="num">{pages}</span>
              </span>
              {page < pages ? (
                <Link href={qs(page + 1)} className="btn btn--sm">
                  Next →
                </Link>
              ) : null}
            </nav>
          ) : null}

          <Strip snapshot={s} collapsed={view.collapsed} />

          {view.collapsedByHost.length > 0 ? (
            <p className="provenance" style={{ marginTop: 10, maxWidth: "80ch", lineHeight: 1.6 }}>
              Collapsed from{" "}
              {view.collapsedByHost.slice(0, 3).map((h) => `${h.host} (${h.count})`).join(", ")}. One
              operator publishing many endpoints is not many operators, and a board ranked by count would
              put a batch registration on top.
            </p>
          ) : null}
        </section>
      </main>
      <Footer snapshot={s} />
    </>
  );
}
