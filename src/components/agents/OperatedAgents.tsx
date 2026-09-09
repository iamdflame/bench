"use client";

/**
 * The agents we operate.
 *
 * Four strategies, one per required category, evaluated against BNB Smart
 * Chain when this loads. Each shows what it observed just now rather than a
 * status badge, because "healthy" tells a visitor nothing and "Venus pays
 * 0.06% APR and moving this capital would earn less than the gas" tells them
 * the agent is actually reasoning.
 *
 * Below each one is the authority it holds: the exact calls its session key
 * may make, the spend cap, the expiry, and a control to revoke it. Revoking is
 * the same act as dismissal — it ends the agent's ability to do anything at
 * all, not merely its claim on the mandate.
 */

import { useEffect, useState } from "react";
import { CATEGORY_LABEL, type Category } from "@/lib/config";

interface OperatedAgent {
  category: Category;
  label: string;
  name: string;
  describes: string;
  mandateId: number;
  wallet: string;
  managingBnb: number | null;
  priceUsd: number | null;
  observed: string;
  actions: { kind: string; reason: string; expect: string; to: string; call: string }[];
  session: {
    key: string;
    allowlist: { to: string; signature: string }[];
    capBnb: number;
    expiresIn: number;
    registered: boolean;
    revoked: boolean;
  } | null;
  benchmark: { openBnb: number; epochs: number } | null;
}

const short = (a: string) => (a?.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const dur = (s: number) =>
  s <= 0 ? "expired" : s > 3600 ? `${Math.round(s / 3600)}h` : `${Math.round(s / 60)}min`;

export default function OperatedAgents({ explorer }: { explorer: string }) {
  const [agents, setAgents] = useState<OperatedAgent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const res = await fetch("/api/agents/ours", { cache: "no-store" });
        const json = (await res.json()) as { agents: OperatedAgent[] };
        if (live) setAgents(json.agents);
      } catch (e) {
        if (live) setError(String(e).slice(0, 160));
      }
    };
    void load();
    // Each refresh re-evaluates four strategies against the chain, so this is
    // deliberately slower than the market feed.
    const t = setInterval(load, 45_000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, []);

  if (error) return <p className="empty-note">{error}</p>;
  if (!agents)
    return <p className="empty-note">Evaluating four strategies against BNB Smart Chain…</p>;

  return (
    <div className="ops">
      {agents.map((a) => (
        <article key={a.category} className="op">
          <header className="op__head">
            <div>
              <div className="label">{CATEGORY_LABEL[a.category]}</div>
              <h3 className="op__name">{a.name}</h3>
            </div>
            <div className="op__nums">
              {a.managingBnb !== null ? (
                <>
                  <span className="fig op__bnb">{a.managingBnb.toFixed(6)}</span>
                  <span className="label">BNB managed</span>
                </>
              ) : (
                <span className="label">unreachable</span>
              )}
            </div>
          </header>

          <p className="op__desc">{a.describes}</p>

          <div className="op__observed">
            <div className="label">observed just now</div>
            <p>{a.observed}</p>
          </div>

          {a.actions.length > 0 ? (
            <ul className="op__actions">
              {a.actions.map((act, i) => (
                <li key={i}>
                  <span className="label">{act.kind}</span>
                  <span>{act.reason}</span>
                  <span className="num dim">
                    {act.call} → {short(act.to)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="op__noop label">no action this epoch</p>
          )}

          <SessionBlock agent={a} explorer={explorer} />
        </article>
      ))}
    </div>
  );
}

function SessionBlock({ agent, explorer }: { agent: OperatedAgent; explorer: string }) {
  const s = agent.session;

  if (!s) {
    return (
      <div className="op__session op__session--none">
        <div className="label">authority</div>
        <p>
          No session granted. This strategy is observing only — it can read the
          chain and decide, but holds no key and can spend nothing.
        </p>
      </div>
    );
  }

  const dead = s.revoked || s.expiresIn <= 0;

  return (
    <div className={`op__session ${dead ? "op__session--dead" : ""}`}>
      <div className="op__session-head">
        <div className="label">authority · ERC-8183 session</div>
        <span className={`op__badge ${dead ? "op__badge--dead" : ""}`}>
          {s.revoked ? "revoked" : s.expiresIn <= 0 ? "expired" : `live · ${dur(s.expiresIn)} left`}
        </span>
      </div>

      <dl className="op__kv">
        <div>
          <dt className="label">session key</dt>
          <dd className="num op__val">
            <a
              href={`${explorer}/address/${s.key}`}
              target="_blank"
              rel="noopener noreferrer"
              className="link-underline"
            >
              {short(s.key)}
            </a>
          </dd>
        </div>
        <div>
          <dt className="label">spend cap</dt>
          <dd className="num op__val">{s.capBnb.toFixed(6)} BNB</dd>
        </div>
        <div>
          <dt className="label">keystore</dt>
          <dd className="num op__val">{s.registered ? "registered" : "ephemeral"}</dd>
        </div>
        <div>
          <dt className="label">mandate</dt>
          <dd className="num op__val">#{agent.mandateId}</dd>
        </div>
      </dl>

      <div className="op__allow">
        <div className="label">may call, and nothing else</div>
        <ul>
          {s.allowlist.map((c, i) => (
            <li key={i} className="num op__call">
              <span className="dim">{short(c.to)}</span> {c.signature.split("(")[0]}
            </li>
          ))}
        </ul>
      </div>

      <p className="op__revoke-note">
        Revoking ends this agent&apos;s ability to act at all — the same event as
        being dismissed from the mandate. The principal never surrendered its
        keys; only this bounded authority existed, and it stops.
      </p>
    </div>
  );
}
