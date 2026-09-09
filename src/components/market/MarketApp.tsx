"use client";

/**
 * The market, as an application.
 *
 * An earlier version put everything in absolutely-positioned overlays on a
 * full-screen canvas, which left the page with no document flow and therefore
 * no layout: a dark field with a few unlabelled dots on it, the agent records
 * hidden behind a corner button, and no way to browse anything. The brief asks
 * for browse, see how they performed, and put them to work; none of those were
 * legible.
 *
 * So this is ordinary flow, with real sections and real tables. The canvas is
 * one band inside the page rather than the page itself.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import FloorCanvas, { type FloorBody, type FloorState } from "@/components/floor/FloorCanvas";
import { BidPanel, OpenMandatePanel, WithdrawButton } from "@/components/floor/Actions";
import { bnb, columnPlaces, useMarket, type TapeEntry } from "@/lib/useMarket";
import type { FloorSnapshot } from "@/app/api/floor/route";
import type { FloorMandate } from "@/app/api/floor/route";
import AgentStandings from "./AgentStandings";
import OperatedAgents from "@/components/agents/OperatedAgents";
import Legend from "@/components/floor/Legend";
import SiteHeader from "@/components/shell/SiteHeader";
import Roll from "@/components/ui/Roll";
import { CANONICAL, addressUrl } from "@/lib/chain/deployments";

const CATEGORIES = ["Rebalancing", "Grid Trading", "Yield Optimisation", "Health Factor"];
const STATES = ["Open", "Active", "Closed", "Abandoned"];
const ZERO = "0x0000000000000000000000000000000000000000";

const short = (a?: string | null) =>
  a && a !== ZERO ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
const pct = (bps: number) => `${bps > 0 ? "+" : ""}${(bps / 100).toFixed(2)}%`;

export default function MarketApp({
  explorer,
  initial,
}: {
  explorer: string;
  /** The book, read on the server, so this renders populated without JS. */
  initial?: FloorSnapshot | null;
}) {
  const { snapshot, tape, connected, signals } = useMarket(initial);
  const [filter, setFilter] = useState<number | null>(null);
  const [sheet, setSheet] = useState<{ kind: "open" } | { kind: "bid"; m: FloorMandate } | null>(
    null,
  );
  /** Set when arriving from an agent page via "put to work". */
  const [hiring, setHiring] = useState<string | null>(null);

  // Completes the journey the brief asks for: land, find an agent by category,
  // put it to work. Arriving with ?agent= opens the mandate sheet directly
  // rather than dropping the visitor on a table with no idea what to do next.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("agent");
    if (!id) return;
    setHiring(id);
    setSheet({ kind: "open" });
  }, []);

  const mandates = snapshot?.mandates ?? [];
  const shown = filter === null ? mandates : mandates.filter((m) => m.category === filter);
  const totals = snapshot?.totals;

  /*
    One precision for the whole book.

    Read from every row rather than per cell, so the capital and bond columns
    stop running 0.0000600, 0.00015, 0.00250 down a single column with the
    decimal points out of line. Taken from the smallest non-zero figure
    present, so nothing rounds away to zero.
  */
  const bookPlaces = columnPlaces([
    ...shown.map((m) => m.capitalWei),
    ...shown.map((m) => m.bondWei),
  ]);

  // ---- feed the canvas band without re-rendering it
  const stateRef = useRef<FloorState>({
    bodies: [],
    stress: 0,
    flow: 0,
    settlementTick: 0,
    ruptures: [],
  });

  const bodies = useMemo<FloorBody[]>(() => {
    if (!mandates.length) return [];
    const max = Math.max(...mandates.map((m) => Number(BigInt(m.capitalWei)) / 1e18), 1e-9);
    return mandates.map((m, i) => {
      const capital = Number(BigInt(m.capitalWei)) / 1e18;
      const perEpoch = m.epochsSettled > 0 ? m.cumulativeAlphaBps / m.epochsSettled : 0;
      const span = mandates.length > 1 ? i / (mandates.length - 1) : 0.5;
      return {
        id: m.id,
        x: -0.74 + span * 1.48,
        y: 0,
        radius: 0.16 + 0.2 * Math.sqrt(capital / max),
        bond: Math.max(0, Math.min(1, m.bondFraction)),
        alpha: Math.max(-1, Math.min(1, perEpoch / 400)),
        strikes: Math.min(1, m.strikes / 3),
      };
    });
  }, [mandates]);

  stateRef.current.bodies = bodies;
  stateRef.current.ruptures = signals.current.ruptures;
  stateRef.current.settlementTick = signals.current.settlementTick;
  if (snapshot) {
    const losing = mandates.filter((m) => m.cumulativeAlphaBps < 0).length;
    const total = Math.max(mandates.length, 1);
    stateRef.current.stress = Math.min(1, losing / total);
    stateRef.current.flow = Math.min(1, (totals?.active ?? 0) / total);
  }

  return (
    <div className="app">
      <SiteHeader
        wallet
        current="/floor"
        live={connected}
        status={`${connected ? "live" : "connecting"}${snapshot ? ` · ${snapshot.blockNumber}` : ""}`}
      />

      {/* -------------------------------------------------------------- hero */}
      <section className="hero shell">
        <div className="hero__copy">
          <h1 className="display">Agents bid for your capital with their own.</h1>
          <p className="prose hero__lede">
            An agent here does not have a profile. It has a bond. To manage a
            mandate it escrows its own capital, and that capital is slashed when
            it trails the benchmark it agreed to beat. Fail badly enough and it
            is dismissed on-chain, with the next bidder promoted in the same
            transaction.
          </p>
          <div className="hero__actions">
            <button className="btn btn--primary" onClick={() => setSheet({ kind: "open" })}>
              Open a mandate
            </button>
            {/*
              Never a bare explorer root.

              This was `${explorer}/address/${snapshot?.market ?? ""}`, and
              snapshot was null until the stream connected, so the link a
              visitor arrived at read `bscscan.com/address/` with no address on
              it — a "verify this yourself" button that verified nothing, on the
              site whose whole argument is that claims must be checkable. The
              canonical address is known at build time and does not depend on a
              network read completing.
            */}
            <a
              className="btn"
              href={addressUrl(snapshot?.market ?? CANONICAL.address, CANONICAL.chainId)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Verify on BscScan ↗
            </a>
            <WithdrawButton />
          </div>
        </div>

        {/*
          The floor, with the legend that turns it from art into an instrument.

          Everything moving on the canvas is a field of a mandate. Without the
          legend it reads as a generative background; with it, a viewer can name
          what they are looking at and check it against the table below — which
          is the whole difference between decoration and a reading.
        */}
        <figure className="hero__viz floorwin">
          <FloorCanvas state={stateRef} className="floorwin__canvas" />
          <Legend compact />
          <figcaption className="mark-label floorwin__status">
            <span className={`pulse ${connected ? "pulse--on" : ""}`} aria-hidden />
            {connected ? "live" : "reconnecting"}
          </figcaption>
        </figure>
      </section>

      {/* ------------------------------------------------------- stat strip */}
      <section className="stats shell">
        <Stat label="under mandate" value={`${bnb(totals?.underMandate)} BNB`} />
        <Stat label="bonded by agents" value={`${bnb(totals?.bonded)} BNB`} accent />
        <Stat label="mandates active" value={String(totals?.active ?? 0)} />
        <Stat label="opened all-time" value={String(totals?.everOpened ?? 0)} />
        <Stat
          label="chain"
          value={snapshot?.chainId === 56 ? "BNB mainnet" : `chain ${snapshot?.chainId ?? "—"}`}
        />
      </section>

      {/* --------------------------------------------------- agents we run */}
      <section id="ours" className="section shell">
        <div className="section__head">
          <div>
            <div className="label">agents we operate</div>
            <h2 className="display section__title">Four strategies, live on BNB Smart Chain</h2>
          </div>
          <p className="section__note">
            One per required category. Each is evaluated against the chain when
            this page loads, and each holds a bounded ERC-8183 session rather
            than anybody&apos;s private key.
          </p>
        </div>
        <OperatedAgents explorer={explorer} />
      </section>

      {/* ----------------------------------------------------------- market */}
      <section id="market" className="section shell">
        <div className="section__head">
          <div>
            <div className="label">the market</div>
            <h2 className="display section__title">Mandates open for contest</h2>
          </div>
          <div className="chips">
            <button
              className={`chip ${filter === null ? "chip--on" : ""}`}
              onClick={() => setFilter(null)}
            >
              All
            </button>
            {CATEGORIES.map((c, i) => (
              <button
                key={c}
                className={`chip ${filter === i ? "chip--on" : ""}`}
                onClick={() => setFilter(i)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>function</th>
                <th className="r">capital</th>
                <th>holder</th>
                <th className="r">bond at risk</th>
                <th className="r">alpha</th>
                <th className="r">epochs</th>
                <th className="r">strikes</th>
                <th>successor</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr>
                  <td colSpan={10} className="empty">
                    {snapshot ? "No mandates in this category." : "Reading the chain…"}
                  </td>
                </tr>
              ) : (
                shown.map((m) => (
                  <MandateRow
                    key={`${m.deployment ?? "v2"}-${m.id}`}
                    m={m}
                    dp={bookPlaces}
                    onBid={() => setSheet({ kind: "bid", m })}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ----------------------------------------------------------- agents */}
      <section id="agents" className="section shell">
        <div className="section__head">
          <div>
            <div className="label">the book</div>
            <h2 className="display section__title">What each agent has cost itself</h2>
          </div>
          <p className="section__note">
            Reconstructed from contract logs, not reported by the agents. The
            last two columns cannot be faked.
          </p>
        </div>
        <AgentStandings explorer={explorer} />
      </section>

      {/* ------------------------------------------------------------- tape */}
      <section className="section shell">
        <div className="section__head">
          <div>
            <div className="label">the tape</div>
            <h2 className="display section__title">Settlements as they land</h2>
          </div>
        </div>
        <ol className="tape">
          {tape.length === 0 ? (
            <li className="tape__idle">
              Waiting for the next settlement. Epochs are hourly on the standing
              mandates, so the tape is deliberately quiet between them.
            </li>
          ) : (
            tape.slice(0, 14).map((t) => <TapeRow key={t.key} t={t} />)
          )}
        </ol>
      </section>

      {/* ----------------------------------------------------------- footer */}
      <footer className="foot shell">
        <span className="fig">MANDATE</span>
        <span className="label">
          {snapshot ? (
            <>
              {snapshot.market} · chain {snapshot.chainId} · block {snapshot.blockNumber}
            </>
          ) : (
            "connecting"
          )}
        </span>
      </footer>

      {/* ------------------------------------------------------------ sheet */}
      {sheet ? (
        <div className="sheet" role="dialog" aria-modal="true">
          <button className="sheet__scrim" aria-label="Close" onClick={() => setSheet(null)} />
          <div className="sheet__panel">
            <div className="sheet__head">
              <div>
                <div className="label">
                  {sheet.kind === "open" ? "open a mandate" : `mandate ${sheet.m.id}`}
                </div>
                <h3 className="display sheet__title">
                  {sheet.kind === "open"
                    ? hiring
                      ? `Put agent ${hiring} to work.`
                      : "Put capital on the floor."
                    : `Bid for ${CATEGORIES[sheet.m.category]}`}
                </h3>
              </div>
              <button className="btn btn--ghost" onClick={() => setSheet(null)}>
                Close
              </button>
            </div>
            {sheet.kind === "open" ? (
              <>
                {hiring ? (
                  <p className="sheet__note">
                    You are opening a mandate agent{" "}
                    <a href={`/agent/${hiring}`} className="link-underline num">
                      {hiring}
                    </a>{" "}
                    can bid for. Escrow the capital here; the agent then posts
                    its own bond against it, and loses that bond if it trails
                    the benchmark.
                  </p>
                ) : null}
                <OpenMandatePanel onDone={() => setSheet(null)} />
              </>
            ) : (
              <>
                <dl className="kv">
                  <Kv k="state" v={STATES[sheet.m.state]} />
                  <Kv k="capital" v={`${bnb(sheet.m.capitalWei)} BNB`} />
                  <Kv k="holder" v={short(sheet.m.agent)} />
                  <Kv k="bond at risk" v={`${bnb(sheet.m.bondWei)} BNB`} />
                  <Kv k="epochs" v={`${sheet.m.epochsSettled}/${sheet.m.epochsTotal}`} />
                  <Kv k="successor" v={short(sheet.m.successor)} />
                </dl>
                <BidPanel mandate={sheet.m} onDone={() => setSheet(null)} />
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MandateRow({
  m,
  dp,
  onBid,
}: {
  m: FloorMandate;
  /** Decimals for the money columns, fixed across the whole book. */
  dp: number;
  onBid: () => void;
}) {
  const alphaPerEpoch = m.epochsSettled > 0 ? m.cumulativeAlphaBps / m.epochsSettled : 0;
  return (
    <tr>
      {/*
        The id alone is ambiguous: mandate 0 exists on all three deployments
        and means a different mandate on each. The label says which book the
        row is from, so two rows numbered 0 are legible as two mandates rather
        than as a duplicate.
      */}
      <td className="num dim">
        {m.id}
        {m.deployment && m.deployment !== "v2" ? (
          <span className="mandate-row__dep" title="An earlier deployment. Its mandates are still live and still counted.">
            {" "}
            {m.deployment}
          </span>
        ) : null}
      </td>
      <td>{CATEGORIES[m.category]}</td>
      <td className="num r">{bnb(m.capitalWei, dp)}</td>
      <td className="num">{short(m.agent)}</td>
      <td className="num r">
        {bnb(m.bondWei, dp)}
        {m.bondFraction < 1 && m.bondFraction > 0 ? (
          <span className="dim"> · {Math.round(m.bondFraction * 100)}%</span>
        ) : null}
      </td>
      <td className={`num r ${m.cumulativeAlphaBps > 0 ? "up" : m.cumulativeAlphaBps < 0 ? "down" : "dim"}`}>
        {m.epochsSettled === 0 ? "—" : pct(alphaPerEpoch)}
      </td>
      <td className="num r dim">
        {m.epochsSettled}/{m.epochsTotal}
      </td>
      <td className={`num r ${m.strikes > 0 ? "warn" : "dim"}`}>{m.strikes}/3</td>
      <td className="num dim">{short(m.successor)}</td>
      <td className="r">
        <button className="btn btn--sm" onClick={onBid}>
          {m.state === 1 ? "Queue" : "Bid"}
        </button>
      </td>
    </tr>
  );
}

function TapeRow({ t }: { t: TapeEntry }) {
  const mark =
    t.tone === "dismissal" ? "✕" : t.tone === "slash" ? "▼" : t.tone === "gain" ? "▲" : "·";
  return (
    <li className={`tape__row tape__row--${t.tone}`}>
      <span className="tape__mark" aria-hidden>
        {mark}
      </span>
      <span className="tape__id num">#{t.mandateId}</span>
      <span className="tape__text">{t.text}</span>
      {/*
        The block, not the clock.

        The tape is built by diffing consecutive readings of the market, so a
        wall-clock time is when this page looked rather than when the chain
        moved — and a keeper run that changes thirteen mandates at once made
        thirteen rows all claiming the same second. The block is what can be
        checked: the state had changed by then, and the number is the same one
        every other figure on this site is stamped with.
      */}
      <span className="label tape__time num" title={`observed at ${t.at}`}>
        block {Number(t.blockNumber).toLocaleString()}
      </span>
    </li>
  );
}

/**
 * A total on the floor.
 *
 * The four figures at the head of this page are the only ones on it that move
 * when a settlement lands, and they were rendered as plain text — so a slash
 * or an epoch closing changed the number with no indication that anything had
 * happened. `BRAND.md` sanctions exactly one motion for this: a value updated
 * from the chain rolls the character that changed, vertically, for 180ms.
 * Nothing rolls on a re-render, and nothing rolls on load.
 */
function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="stat">
      <div className={`fig stat__value ${accent ? "up" : ""}`}>
        <Roll value={value} />
      </div>
      <div className="label">{label}</div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="kv__row">
      <dt className="label">{k}</dt>
      <dd className="num">{v}</dd>
    </div>
  );
}
