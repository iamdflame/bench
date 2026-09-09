"use client";

import { useEffect, useState } from "react";
import SessionScope, { type SessionView } from "@/components/ui/SessionScope";

/**
 * Every session this market has granted.
 *
 * Altana's requirement is that a principal can see what their agent may do and
 * revoke it inside the product. The authority was already rendered here — the
 * allowlist, the cap, the expiry — with a paragraph explaining what revoking
 * would do and no way to do it. A description of a control is not a control,
 * so each session now carries the button.
 */
export default function Authority() {
  const [sessions, setSessions] = useState<SessionView[] | null>(null);
  const [revocable, setRevocable] = useState(false);
  const [at, setAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/sessions");
        const j = (await r.json()) as {
          sessions: SessionView[];
          revocable: boolean;
          at: string;
        };
        if (cancelled) return;
        setSessions(j.sessions);
        setRevocable(j.revocable);
        setAt(j.at);
      } catch {
        if (!cancelled) setSessions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (sessions === null) {
    // A hairline pulse, not a spinner.
    return <p className="small dim auth__loading">Reading sessions…</p>;
  }

  if (sessions.length === 0) {
    return (
      <p className="small dim">
        No sessions have been granted. Authority appears here the moment a mandate is
        awarded, and not before.
      </p>
    );
  }

  return (
    <div className="auth">
      <p className="mark-label auth__stamp">
        {sessions.length} session{sessions.length === 1 ? "" : "s"}
        {at ? ` · read ${new Date(at).toISOString().slice(11, 19)}Z` : ""}
      </p>
      {sessions.map((s) => (
        <SessionScope key={`${s.market ?? ""}:${s.mandateId}`} session={s} revocable={revocable} />
      ))}
    </div>
  );
}
