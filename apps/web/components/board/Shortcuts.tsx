"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The four keys the plan names, and nothing else.
 *
 *   /        focus the board search
 *   ⌘K       open the command palette
 *   j / k    move down and up the board
 *   Enter    open the selected row
 *
 * It is a client component because keyboard handling has to be, and it is the
 * only one on the read path: everything it accelerates is reachable without
 * it. With JavaScript off the search is still a form, the rows are still
 * links, and nothing on this page depends on any of it.
 *
 * The palette does not fetch. It searches what the server already rendered —
 * the row links in the document — so it is instant, it has no loading state,
 * and it cannot disagree with the board it is sitting on top of.
 */

interface Target {
  href: string;
  label: string;
  hint: string;
}

/** The rooms, always available. Rows are read from the rendered board. */
const ROOMS: Target[] = [
  { href: "/", label: "The board", hint: "every listing" },
  { href: "/j/rebalancing", label: "Keep an LP in range", hint: "job" },
  { href: "/j/grid", label: "Run a grid", hint: "job" },
  { href: "/j/yield", label: "Chase yield", hint: "job" },
  { href: "/j/health", label: "Protect a loan", hint: "job" },
  { href: "/register", label: "The register", hint: "everything read" },
  { href: "/desk", label: "The desk", hint: "your engagements" },
  { href: "/data", label: "Data", hint: "where the numbers come from" },
  { href: "/list", label: "List your agent", hint: "self-serve" },
];

function rowsInDocument(): Target[] {
  if (typeof document === "undefined") return [];
  const out: Target[] = [];
  for (const el of Array.from(document.querySelectorAll<HTMLAnchorElement>("tbody a.board__name"))) {
    const sub = el.closest(".board__idtext")?.querySelector(".board__sub")?.textContent ?? "";
    out.push({ href: el.getAttribute("href") ?? "", label: el.textContent ?? "", hint: sub.trim() });
  }
  return out;
}

export default function Shortcuts() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  /* ------------------------------------------------------ global keys */
  useEffect(() => {
    const typingIn = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };

    function onKey(e: KeyboardEvent) {
      // The palette owns every key while it is open.
      if (open) {
        if (e.key === "Escape") {
          e.preventDefault();
          setOpen(false);
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuery("");
        setCursor(0);
        setOpen(true);
        return;
      }

      if (typingIn(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "/") {
        const search = document.getElementById("board-search") as HTMLInputElement | null;
        if (search) {
          e.preventDefault();
          search.focus();
          search.select();
        }
        return;
      }

      /*
        j and k move a selection down the board and Enter opens it. The
        selection is a real focus rather than a painted highlight, so the
        browser scrolls it into view and a screen reader announces it.
      */
      if (e.key === "j" || e.key === "k") {
        const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("tbody a.board__name"));
        if (links.length === 0) return;
        e.preventDefault();
        const at = links.findIndex((l) => l === document.activeElement);
        const next =
          e.key === "j"
            ? at < 0
              ? 0
              : Math.min(at + 1, links.length - 1)
            : at < 0
              ? 0
              : Math.max(at - 1, 0);
        links[next]?.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const all = [...ROOMS, ...rowsInDocument()];
  const q = query.trim().toLowerCase();
  const hits = (q ? all.filter((t) => `${t.label} ${t.hint}`.toLowerCase().includes(q)) : all).slice(0, 12);
  const active = hits[Math.min(cursor, hits.length - 1)];

  return (
    <div
      className="palette"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="palette__box">
        <input
          ref={inputRef}
          className="palette__input num"
          value={query}
          placeholder="Jump to a job, a room, or a row on this board"
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === "Enter" && active) {
              e.preventDefault();
              window.location.href = active.href;
            }
          }}
        />
        <ul className="palette__list">
          {hits.length === 0 ? (
            <li className="palette__empty">
              Nothing on this page matches. The register searches everything read, including ids this
              board is not showing.
            </li>
          ) : (
            hits.map((t, i) => (
              <li key={`${t.href}-${t.label}`}>
                <a href={t.href} className="palette__row" {...(i === cursor ? { "data-active": "" } : {})}>
                  <span>{t.label}</span>
                  <span className="ticker__label">{t.hint}</span>
                </a>
              </li>
            ))
          )}
        </ul>
        <div className="palette__foot">
          <span className="kbd">↑</span>
          <span className="kbd">↓</span>
          <span className="ticker__label">move</span>
          <span className="kbd">enter</span>
          <span className="ticker__label">open</span>
          <span className="kbd">esc</span>
          <span className="ticker__label">close</span>
          <span className="ticker__label" style={{ marginLeft: "auto" }}>
            j / k moves the board
          </span>
        </div>
      </div>
    </div>
  );
}
