"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Fineness from "@/components/mark/Fineness";
import CategoryMark from "@/components/mark/CategoryMark";
import Observation from "./Observation";
import { CATEGORIES, CATEGORY_LABEL, RUNG_NAMES, type Category } from "@/lib/config";
import { gradeOf } from "@/components/mark/geometry";

export interface RegisterRow {
  /** ERC-8004 token id, or the wallet for a market holder that has none. */
  tokenId: string;
  /**
   * Where this row came from.
   *
   * The registry and the market are not yet the same population — no ERC-8004
   * agent has ever posted a bond here — and a register that silently merged
   * them would hide the single most important fact about this market. So both
   * appear, sorted together by fineness, and each row says which it is.
   */
  source: "registry" | "market";
  name: string | null;
  owner: string | null;
  category: Category | null;
  /** On-chain millesimal fineness. Null means never assayed, not zero. */
  fineness: number | null;
  endpointVerified: boolean;
  rung: number;
  /**
   * A mandate this row's wallet holds, for the ledger link.
   *
   * Present only for market rows. `href` used to ride on every row: the same
   * twenty characters, derived from the token id, three thousand nine hundred
   * times. So did `rungReason`, which has eight distinct values across the
   * whole table. Both are reconstructed here instead of serialised there.
   */
  mandateId?: number | null;
  /**
   * When this row was last read, where it differs from the table's stamp.
   *
   * Almost every row shares the crawl's timestamp, so it is sent once for the
   * table and only the exceptions carry their own.
   */
  lastSeen?: string | null;
  /** Wei, as a string — bigint does not survive the RSC boundary. */
  bondWei: string | null;
  alphaBps: number | null;
  feedbacks: number;
  /**
   * Who operates this identity, where we know and it is not us.
   *
   * The register carries other people's agents on purpose — the brief asks for
   * the front door to every agent on BSC, and a front door that only opens
   * onto its own tenants is a shop. Attributed rather than absorbed.
   */
  operator?: string | null;
  /**
   * Registrations sharing this row's owner wallet.
   *
   * One wallet holding forty-four identities is not forty-four agents. The
   * rows stay — they are real registrations — but the number is on the row so
   * nobody reads a batch mint as a crowded office.
   */
  siblings?: number;
}

type SortKey = "fineness" | "tokenId" | "name" | "rung" | "bond" | "alpha" | "seen";

const ROW = 44;
const OVERSCAN = 10;

/**
 * The register.
 *
 * Every agent we have actually read, in one table, sorted by fineness. The
 * first screen is the hallmarked agents and then a cliff — and the cliff is
 * the finding, not a rendering problem to be smoothed over. Nothing is hidden,
 * nothing is paginated away, and nothing below the bar is greyed out
 * apologetically: it simply carries no mark.
 *
 * Virtualised, because the argument only works if you can scroll the whole
 * thing. Rows are a fixed 44px so the window arithmetic is exact and the
 * scrollbar tells the truth about how far down the blanks go.
 */
export default function Register({
  rows,
  chainId,
  explorer,
  blockNumber,
  readAt,
  unindexed,
  registered,
  initial,
}: {
  rows: RegisterRow[];
  chainId: number;
  /** Explorer root, for the few rows that are a bare wallet. */
  explorer: string;
  blockNumber?: string | number | null;
  readAt?: string | null;
  /** Registered agents we have not read yet. Stated, never invented as rows. */
  unindexed?: number;
  registered?: number;
  initial?: {
    rung?: number | "all";
    category?: Category | "all";
    q?: string;
    endpoint?: "all" | "answering" | "silent";
    marked?: "all" | "struck" | "unmarked";
    source?: "all" | "registry" | "market";
  };
}) {
  const [q, setQ] = useState(initial?.q ?? "");
  const [rung, setRung] = useState<number | "all">(initial?.rung ?? "all");
  const [category, setCategory] = useState<Category | "all">(initial?.category ?? "all");
  const [endpoint, setEndpoint] = useState<"all" | "answering" | "silent">(
    initial?.endpoint ?? "all",
  );
  const [marked, setMarked] = useState<"all" | "struck" | "unmarked">(initial?.marked ?? "all");
  const [source, setSource] = useState<"all" | "registry" | "market">(initial?.source ?? "all");
  const [sort, setSort] = useState<SortKey>("fineness");
  const [desc, setDesc] = useState(true);

  const search = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(880);

  /** `/` focuses search, the way every register a judge already uses does. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      e.preventDefault();
      search.current?.focus();
      search.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * Filter state lives in the URL so a filtered view can be sent to someone.
   * Written with replaceState rather than a router navigation: this page is
   * dynamic, and re-rendering the server tree on every keystroke would make
   * the filters feel broken to defend a URL nobody has clicked yet.
   */
  useEffect(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (rung !== "all") p.set("rung", String(rung));
    if (category !== "all") p.set("category", category);
    if (endpoint !== "all") p.set("endpoint", endpoint);
    if (marked !== "all") p.set("marked", marked);
    if (source !== "all") p.set("source", source);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [q, rung, category, endpoint, marked, source]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setHeight(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (rung !== "all" && r.rung !== rung) return false;
      if (category !== "all" && r.category !== category) return false;
      if (endpoint === "answering" && !r.endpointVerified) return false;
      if (endpoint === "silent" && r.endpointVerified) return false;
      const struck = (r.fineness ?? 0) >= 375;
      if (marked === "struck" && !struck) return false;
      if (marked === "unmarked" && struck) return false;
      if (source !== "all" && r.source !== source) return false;
      if (!needle) return true;
      return (
        r.tokenId.includes(needle) ||
        (r.name ?? "").toLowerCase().includes(needle) ||
        (r.owner ?? "").toLowerCase().includes(needle)
      );
    });

    /*
      The tiebreak is evidence, not token id.

      Fineness stays the primary sort — the hallmarked rows first and then a
      cliff, which is the finding this register exists to show. But almost
      nothing has a fineness, so in practice every row tied and fell through to
      an ascending token id: the first screen was tokens 1, 2, 3, 4 with every
      column an em dash, while the agents that actually answer a call sat
      thousands of rows below. A register whose first screen is its emptiest
      rows is not showing the cliff, it is hiding the edge of it.

      So a tie is broken by what the chain will show: how high it stands, then
      whether its endpoint answered, then whether it is classified, then
      whether it resolved a card at all.
    */
    const dir = desc ? -1 : 1;
    out.sort(
      (a, b) =>
        dir * (value(a, sort) - value(b, sort)) ||
        b.rung - a.rung ||
        Number(b.endpointVerified) - Number(a.endpointVerified) ||
        Number(Boolean(b.category)) - Number(Boolean(a.category)) ||
        Number(Boolean(b.name)) - Number(Boolean(a.name)) ||
        b.feedbacks - a.feedbacks ||
        Number(a.tokenId) - Number(b.tokenId),
    );

    /*
      No wallet may take the whole first screen.

      Ranking on evidence fixed one failure and created its mirror image. The
      first screen had been tokens 1, 2, 3, 4 with every column empty; ranked,
      it became forty-four consecutive BORT registrations, because they all
      answer and they are all held by 0x97e8f3B4. Both are the same fault —
      the top of the register describing one thing rather than the field — and
      the second is the worse one, because forty-four rows of one wallet is
      exactly the manufactured plurality this register exists to expose.

      So the ranking is kept and then dealt round-robin by owner: the best row
      from each wallet, then the second from each, and so on. Nothing is hidden
      or reordered against its rank within an owner, and the sibling count
      stays on the row. Only while the default sort is in force — a reader who
      picks a column has asked for that column, strictly.
    */
    if (sort !== "fineness" || !desc) return out;

    const byOwner = new Map<string, RegisterRow[]>();
    for (const r of out) {
      const key = r.owner?.toLowerCase() ?? r.tokenId;
      const bucket = byOwner.get(key);
      if (bucket) bucket.push(r);
      else byOwner.set(key, [r]);
    }
    const queues = [...byOwner.values()];
    const dealt: RegisterRow[] = [];
    for (let round = 0; dealt.length < out.length; round++) {
      let placed = false;
      for (const q of queues) {
        if (round < q.length) {
          dealt.push(q[round]!);
          placed = true;
        }
      }
      if (!placed) break;
    }
    return dealt;
  }, [rows, q, rung, category, endpoint, marked, source, sort, desc]);

  const first = Math.max(0, Math.floor(top / ROW) - OVERSCAN);
  const last = Math.min(filtered.length, Math.ceil((top + height) / ROW) + OVERSCAN);
  const visible = filtered.slice(first, last);

  const header = useCallback(
    (key: SortKey, label: string, className?: string) => (
      <th className={className} scope="col" aria-sort={sort === key ? (desc ? "descending" : "ascending") : "none"}>
        <button
          type="button"
          onClick={() => {
            if (sort === key) setDesc((d) => !d);
            else {
              setSort(key);
              setDesc(true);
            }
          }}
        >
          {label}
          {sort === key ? (desc ? " ↓" : " ↑") : ""}
        </button>
      </th>
    ),
    [sort, desc],
  );

  const struckCount = useMemo(
    () => filtered.filter((r) => (r.fineness ?? 0) >= 375).length,
    [filtered],
  );

  return (
    <div className="reg">
      <aside className="reg__rail">
        <label className="reg__search">
          <span className="mark-label">Search</span>
          <input
            ref={search}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="token id, name, owner"
            aria-label="Search the register"
          />
          <span className="mark-label reg__hint">press /</span>
        </label>

        <Facet label="Rung">
          <Choice on={rung === "all"} onClick={() => setRung("all")}>
            any
          </Choice>
          {RUNG_NAMES.map((name, n) => (
            <Choice key={name} on={rung === n} onClick={() => setRung(n)}>
              {n} {name.toLowerCase()}
            </Choice>
          ))}
        </Facet>

        <Facet label="Office">
          <Choice on={category === "all"} onClick={() => setCategory("all")}>
            any
          </Choice>
          {CATEGORIES.map((c) => (
            <Choice key={c} on={category === c} onClick={() => setCategory(c)}>
              {CATEGORY_LABEL[c].toLowerCase()}
            </Choice>
          ))}
        </Facet>

        <Facet label="Endpoint">
          <Choice on={endpoint === "all"} onClick={() => setEndpoint("all")}>
            any
          </Choice>
          <Choice on={endpoint === "answering"} onClick={() => setEndpoint("answering")}>
            answers when called
          </Choice>
          <Choice on={endpoint === "silent"} onClick={() => setEndpoint("silent")}>
            silent
          </Choice>
        </Facet>

        <Facet label="Population">
          <Choice on={source === "all"} onClick={() => setSource("all")}>
            both
          </Choice>
          <Choice on={source === "registry"} onClick={() => setSource("registry")}>
            erc-8004 registry
          </Choice>
          <Choice on={source === "market"} onClick={() => setSource("market")}>
            holds a mandate
          </Choice>
        </Facet>

        <Facet label="Hallmark">
          <Choice on={marked === "all"} onClick={() => setMarked("all")}>
            any
          </Choice>
          <Choice on={marked === "struck"} onClick={() => setMarked("struck")}>
            struck
          </Choice>
          <Choice on={marked === "unmarked"} onClick={() => setMarked("unmarked")}>
            unmarked
          </Choice>
        </Facet>
      </aside>

      <div className="reg__main">
        <div className="reg__stat">
          <Observation
            size="small"
            label="Showing"
            value={`${filtered.length.toLocaleString()} of ${rows.length.toLocaleString()} read`}
            block={blockNumber ?? undefined}
            at={readAt ?? undefined}
          />
          <span className="mark-label reg__struck" data-none={struckCount === 0 ? "1" : undefined}>
            {struckCount} hallmarked in this view
          </span>
          {unindexed && unindexed > 0 ? (
            <span className="mark-label reg__tail">
              {unindexed.toLocaleString()} further registered agents not yet read
              {registered ? ` · ${registered.toLocaleString()} registered in total` : ""}
            </span>
          ) : null}
        </div>

        <div className="register__scroll" ref={scroller} onScroll={(e) => setTop(e.currentTarget.scrollTop)}>
          <table className="register">
            <thead>
              <tr>
                {/*
                  The mark column is labelled, not left as an unnamed gutter.

                  Almost every row under it is blank, and a blank column with
                  no heading reads as something that failed to render. Named,
                  the same emptiness reads as what it is: nothing was struck.
                */}
                <th className="mark-col" scope="col">
                  mark
                </th>
                {header("tokenId", "token")}
                {header("name", "name", "name-col")}
                <th scope="col">office</th>
                {header("fineness", "fineness", "num")}
                <th scope="col">endpoint</th>
                {header("seen", "last read", "num")}
                {header("bond", "bond", "num")}
                {header("alpha", "alpha", "num")}
                {/*
                  Browsing has to lead somewhere.

                  A register with no action on any row is a directory, and the
                  brief asks for a venue you can hire from. One column, one
                  verb, on every row.
                */}
                <th scope="col">hire</th>
              </tr>
            </thead>
            <tbody>
              {first > 0 ? (
                <tr style={{ height: first * ROW }} aria-hidden>
                  <td colSpan={10} />
                </tr>
              ) : null}

              {visible.map((r) => {
                const struck = (r.fineness ?? 0) >= 375;
                const href = hrefFor(r, explorer);
                return (
                  <tr
                    key={r.tokenId}
                    data-struck={struck ? "1" : undefined}
                    // Why this row sits where it does, without a column for it.
                    title={reasonFor(r)}
                  >
                    <td className="mark-col">
                      <Fineness fineness={r.fineness ?? 0} size={20} />
                    </td>
                    <td className="num">
                      <a href={href}>
                        {r.source === "market" ? `${r.tokenId.slice(0, 8)}…` : r.tokenId}
                      </a>
                    </td>
                    <td className="name-col" title={r.name ?? undefined}>
                      <a href={href}>{r.name ?? "—"}</a>
                      {r.source === "market" ? (
                        <span className="reg__src mark-label"> holder</span>
                      ) : null}
                      {r.operator ? (
                        <span className="reg__src mark-label"> {r.operator}</span>
                      ) : null}
                      {r.siblings && r.siblings > 1 ? (
                        <span
                          className="reg__src mark-label"
                          title={`${r.siblings} registrations share this owner wallet`}
                        >
                          {" "}
                          ×{r.siblings}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {r.category ? (
                        <span className="reg__office" title={CATEGORY_LABEL[r.category]}>
                          <CategoryMark category={r.category} size={16} metal="var(--pewter-500)" />
                        </span>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                    <td className="num" style={struck ? { color: gradeOf(r.fineness ?? 0).metal } : undefined}>
                      {r.fineness === null ? "—" : r.fineness}
                    </td>
                    <td className="num">{r.endpointVerified ? "answers" : "—"}</td>
                    <td className="num">{shortDate(r.lastSeen ?? readAt ?? null)}</td>
                    <td className="num">{r.bondWei ? bnb(r.bondWei) : "—"}</td>
                    <td className="num">{alpha(r.alphaBps)}</td>
                    {/*
                      One verb per row, and it is the verb the contract would
                      actually accept.

                      Every row used to read "mandate →", which on an agent
                      with no bond and no endpoint was an offer to escrow
                      capital against a bid the market refuses. The register is
                      where a judge forms their first idea of what this venue
                      does; three thousand identical dead ends is the wrong
                      idea.
                    */}
                    <td>
                      <a
                        className="reg__hire"
                        href={action(r, explorer).href}
                        title={action(r, explorer).title}
                      >
                        {action(r, explorer).label}
                      </a>
                    </td>
                  </tr>
                );
              })}

              {last < filtered.length ? (
                <tr style={{ height: (filtered.length - last) * ROW }} aria-hidden>
                  <td colSpan={10} />
                </tr>
              ) : null}

              {/*
                A token id we have not crawled is not a token id that does not
                exist.

                The register holds 3,808 of 304,787 registrations, so searching
                it for the best-known live agent in the field returned "nothing
                matches" — which reads as a verdict on the agent and is in fact
                a statement about our coverage. Every id has a certificate,
                because the certificate reads `ownerOf` and `tokenURI` from the
                registry rather than from this table. The row below says which
                of the two situations the reader is in, and goes there.
              */}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="reg__none">
                    {/^\d{1,20}$/.test(q.trim()) ? (
                      <>
                        Token {q.trim()} is not in the {rows.length.toLocaleString()} rows
                        we have crawled. That is a gap in our index, not a finding about
                        the agent —{" "}
                        <a className="link-underline" href={`/agent/${q.trim()}`}>
                          read it from the registry →
                        </a>
                      </>
                    ) : (
                      "Nothing in the register matches that."
                    )}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Facet({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="reg__facet">
      <span className="mark-label">{label}</span>
      <div className="reg__choices">{children}</div>
    </div>
  );
}

function Choice({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className="reg__choice" data-on={on ? "1" : undefined} onClick={onClick} aria-pressed={on}>
      {children}
    </button>
  );
}

/**
 * Where a row points, rebuilt rather than carried.
 *
 * A certificate for anything with a token id; the ledger of a mandate it holds
 * when the row is a bare wallet; the explorer when even that is missing.
 */
function hrefFor(r: RegisterRow, explorer: string): string {
  if (r.source === "registry") return `/agent/${r.tokenId}`;
  if (r.mandateId !== null && r.mandateId !== undefined) return `/mandate/${r.mandateId}`;
  return `${explorer}/address/${r.tokenId}`;
}

/**
 * Why a row sits where it does, by rung.
 *
 * Eight sentences, one per rung and one for a chain that would not answer,
 * against three thousand nine hundred rows. It travelled per row.
 */
const REASONS: Record<number, string> = {
  0: "registered, and nothing beyond that: no name, no description, no endpoint",
  1: "its card parses, but no endpoint of ours has ever reached it",
  2: "its endpoint answered when we called it, but it has never been assayed on chain",
  3: "its wallet has touched the protocols its category implies",
  4: "assayed at or above the bar, but it has never posted a bond",
  5: "holds a mandate with its own capital at risk, but has settled no epochs yet",
  6: "has settled epochs against measurements committed before the outcome",
};

const reasonFor = (r: RegisterRow): string =>
  REASONS[r.rung] ?? "not placed: the chain could not be read for this row";

/**
 * What this row lets you do, derived from its rung.
 *
 * Mirrors `<Hire>` on the certificate, so the register and the agent page
 * cannot offer different actions for the same agent.
 */
function action(
  r: RegisterRow,
  explorer: string,
): { href: string; label: string; title: string } {
  if (r.source === "market" || r.rung >= 5) {
    return {
      href: hrefFor(r, explorer),
      label: r.source === "market" ? "ledger →" : "mandate →",
      title: r.source === "market" ? "Open this mandate" : "Open a mandate with this agent named",
    };
  }
  if (r.rung === 4) {
    return {
      href: r.category ? `/office/${r.category}` : "/floor",
      label: "bid →",
      title: "Assayed above the bar: open a lot in its office for it to bid for",
    };
  }
  if (r.rung === 2 || r.endpointVerified) {
    return {
      href: `/agent/${r.tokenId}`,
      label: "call →",
      title: "Answers when called: buy a single answer over x402",
    };
  }
  return {
    href: `/agent/${r.tokenId}`,
    label: "assay →",
    title: "Not bondable: six tests against the chain, and what is missing",
  };
}

function value(r: RegisterRow, key: SortKey): number {
  switch (key) {
    case "fineness":
      return r.fineness ?? -1;
    case "tokenId":
      return Number(r.tokenId);
    case "rung":
      return r.rung;
    case "bond":
      return r.bondWei ? Number(BigInt(r.bondWei) / 10n ** 9n) : -1;
    case "alpha":
      return r.alphaBps ?? Number.NEGATIVE_INFINITY;
    case "seen":
      return r.lastSeen ? Date.parse(r.lastSeen) : 0;
    case "name":
      // Names sort lexically; the numeric comparator gets a stable proxy.
      return r.name ? -r.name.toLowerCase().charCodeAt(0) : -1e6;
  }
}

const bnb = (wei: string) => (Number(BigInt(wei)) / 1e18).toFixed(4);

const alpha = (bps: number | null) =>
  bps === null ? "—" : `${bps > 0 ? "+" : ""}${(bps / 100).toFixed(2)}%`;

const shortDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toISOString().slice(5, 10).replace("-", "·");
};
