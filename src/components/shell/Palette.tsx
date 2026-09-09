"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Row {
  kind: "route" | "agent" | "mandate" | "command";
  label: string;
  hint?: string;
  href?: string;
  copy?: string;
}

const ROUTES: Row[] = [
  { kind: "route", label: "The register", hint: "every agent we have read", href: "/agents" },
  { kind: "route", label: "Start here", hint: "the ninety-second judge path", href: "/start" },
  { kind: "route", label: "The floor", hint: "the market, live", href: "/floor" },
  { kind: "route", label: "Authority", hint: "session scope and revocation", href: "/authority" },
  { kind: "route", label: "Evidence", hint: "including what went against us", href: "/evidence" },
  { kind: "route", label: "The method", hint: "the six tests and their weights", href: "/assay" },
  { kind: "route", label: "Public API", hint: "free, unauthenticated, open to competitors", href: "/api" },
  { kind: "route", label: "MANDATE itself", hint: "our own entry, at whatever rung we earn", href: "/agent/336161" },
  { kind: "route", label: "Restatement", hint: "we measured our own agents wrong", href: "/evidence/restatement" },
  { kind: "route", label: "The bench", hint: "assay any agent, live", href: "/bench" },
  { kind: "route", label: "List your agent", hint: "how to climb a rung", href: "/list-your-agent" },
];

const COMMANDS: Row[] = [
  { kind: "command", label: "npx mandate-verify --mandate 0 --chain 56 --deployment v1", hint: "re-derive a settlement", copy: "npx mandate-verify --mandate 0 --chain 56 --deployment v1" },
  { kind: "command", label: "npm run assay -- <tokenId>", hint: "the six tests, locally", copy: "npm run assay -- 153776" },
  { kind: "command", label: "npm run sybil -- <tokenId>", hint: "the reputation autopsy", copy: "npm run sybil -- 153776" },
  { kind: "command", label: "npm run prove-session", hint: "attack the session scope", copy: "npm run prove-session" },
  { kind: "command", label: "npm run scope-audit", hint: "granted ⊆ proven, audited", copy: "npm run scope-audit" },
];

/**
 * ⌘K across agents, mandates and commands.
 *
 * A register of three hundred thousand rows needs an address bar, not a menu.
 * Agent search runs on the server because the index is 2 MB and shipping it to
 * every visitor to support a text box would cost more than the feature is
 * worth; routes and commands are local and answer instantly.
 */
export default function Palette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [agents, setAgents] = useState<Row[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
    else {
      setQ("");
      setAgents([]);
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setAgents([]);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`/api/agents/search?q=${encodeURIComponent(term)}`);
        const j = (await r.json()) as {
          agents: { tokenId: string; name: string | null }[];
        };
        setAgents(
          j.agents.slice(0, 8).map((a) => ({
            kind: "agent" as const,
            label: a.name ?? `Agent ${a.tokenId}`,
            hint: `token ${a.tokenId}`,
            href: `/agent/${a.tokenId}`,
          })),
        );
      } catch {
        setAgents([]);
      }
    }, 140);
    return () => clearTimeout(id);
  }, [q]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const matches = (r: Row) =>
      !term || r.label.toLowerCase().includes(term) || (r.hint ?? "").toLowerCase().includes(term);

    // A bare number is a token id or a mandate id, and both are worth offering.
    const numeric: Row[] = /^\d+$/.test(term)
      ? [
          { kind: "agent", label: `Agent ${term}`, hint: "open the certificate", href: `/agent/${term}` },
          { kind: "mandate", label: `Mandate ${term}`, hint: "open the ledger", href: `/mandate/${term}` },
        ]
      : [];

    return [...numeric, ...agents, ...ROUTES.filter(matches), ...COMMANDS.filter(matches)];
  }, [q, agents]);

  useEffect(() => setActive(0), [rows.length]);

  if (!open) return null;

  const run = (row: Row) => {
    if (row.href) {
      router.push(row.href);
      setOpen(false);
      return;
    }
    if (row.copy) {
      navigator.clipboard?.writeText(row.copy).catch(() => {});
      setOpen(false);
    }
  };

  return (
    <div className="pal" role="dialog" aria-modal="true" aria-label="Command palette">
      <button className="pal__scrim" aria-label="Close" onClick={() => setOpen(false)} />
      <div className="pal__panel">
        <input
          ref={input}
          className="pal__input num"
          value={q}
          placeholder="agent, mandate, route or command"
          aria-label="Search"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, rows.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter" && rows[active]) {
              e.preventDefault();
              run(rows[active]);
            }
          }}
        />
        <ul className="pal__rows">
          {rows.length === 0 ? (
            <li className="pal__none mark-label">Nothing matches.</li>
          ) : (
            rows.map((r, i) => (
              <li key={`${r.kind}-${r.label}-${i}`}>
                <button
                  className="pal__row"
                  data-on={i === active ? "1" : undefined}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => run(r)}
                >
                  <span className="pal__kind mark-label">{r.kind}</span>
                  <span className="pal__label">{r.label}</span>
                  <span className="pal__hint mark-label">{r.hint}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <p className="pal__foot mark-label">
          ↑↓ move · ⏎ open or copy · esc close
        </p>
      </div>
    </div>
  );
}
