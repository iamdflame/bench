import type { Metadata } from "next";
import { Suspense } from "react";
import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import LiveTape from "@/components/instrument/LiveTape";
import SessionControls from "@/components/instrument/SessionControls";
import { readPublicIndex } from "@/lib/chain/session";
import { readBook } from "@/lib/chain/book";
import { houseByWallet } from "@/lib/house";
import { CATEGORY_LABEL } from "@/lib/config";
import { bps } from "@/lib/chain/market";
import { ago } from "@/components/instrument/HonestCount";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your agents",
  description: "The agents you have hired, what they have done, their permissions, and one-tap revoke.",
};

function countdown(expiry: number): string {
  const s = expiry - Math.floor(Date.now() / 1000);
  if (s <= 0) return "expired";
  const d = Math.floor(s / 86_400);
  if (d >= 2) return `expires in ${d}d`;
  const h = Math.floor(s / 3600);
  return `expires in ${h}h`;
}

async function Agents() {
  const [index, book] = await Promise.all([Promise.resolve(readPublicIndex()), readBook()]);
  const sessions = Object.entries(index)
    .map(([id, s]) => ({ id: Number(id), ...s }))
    .sort((a, b) => a.id - b.id);

  if (sessions.length === 0) {
    return (
      <div className="panel" style={{ padding: "2rem" }}>
        <h2 className="hd-2" style={{ fontSize: "var(--text-lg)" }}>No agents hired yet.</h2>
        <p className="sub read" style={{ marginTop: "0.5rem" }}>
          When you hire an agent it appears here with everything it may do, everything it has done,
          and a button that ends its authority on chain. Pick a job to start.
        </p>
        <a href="/" className="btn btn--primary" style={{ marginTop: "1.25rem" }}>Pick a job →</a>
      </div>
    );
  }

  return (
    <ul style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      {sessions.map((s) => {
        const revoked = Boolean((s as { revokedAt?: string }).revokedAt);
        const expired = s.expiry <= Math.floor(Date.now() / 1000);
        const house = houseByWallet(s.walletAddress);
        const row = book.rows.find(
          (r) => r.id === s.mandateId && (!s.market || r.deployment.address.toLowerCase() === s.market.toLowerCase()),
        );
        const status = revoked ? "revoked" : expired ? "expired" : "live";
        const statusChip = revoked ? "chip--fail" : expired ? "" : "chip--live";
        const cap = (Number(s.capWei) / 1e18).toFixed(3);

        return (
          <li key={s.id} className="card" style={{ padding: "1.15rem 1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: "18rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                  <span className="hd-3" style={{ fontSize: "var(--text-base)" }}>
                    {house?.name ?? CATEGORY_LABEL[s.category]}
                  </span>
                  <span className={`chip ${statusChip}`}>
                    <span className={`dot ${status === "live" ? "dot--live" : status === "revoked" ? "dot--fail" : ""}`} />
                    {status}
                  </span>
                  {house ? <span className="chip chip--struck">ours</span> : null}
                </div>

                {/* what it did */}
                <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.4rem" }}>
                  {row && row.epochsSettled > 0 ? (
                    <>Last settled {row.epochsSettled} epoch{row.epochsSettled === 1 ? "" : "s"} · running{" "}
                      <span className="num" style={{ color: "var(--color-touchstone)" }}>{bps(row.cumulativeAlphaBps)}</span> alpha
                      {row.strikes > 0 ? <> · slashed {row.strikes}×, on the tape</> : null}</>
                  ) : row ? (
                    <>Bonded on {row.deployment.label}, awaiting its first settled epoch.</>
                  ) : (
                    <>Session granted; no on-chain mandate correlated at this block.</>
                  )}
                </p>

                {/* the leash, plainly */}
                <p className="meta" style={{ marginTop: "0.5rem", lineHeight: 1.5 }}>
                  Permission: {CATEGORY_LABEL[s.category].toLowerCase()} calls only ·{" "}
                  {s.allowlist.length} call{s.allowlist.length === 1 ? "" : "s"} on {(s.provenProtocols ?? []).length || "its proven"} protocol{(s.provenProtocols ?? []).length === 1 ? "" : "s"} ·{" "}
                  cap <span className="num">{cap}</span> BNB · {countdown(s.expiry)}
                  {s.registered && s.registrationTx ? (
                    <> · <a className="link-accent" href={`https://bscscan.com/tx/${s.registrationTx}`} target="_blank" rel="noopener noreferrer">KeyStore-registered ↗</a></>
                  ) : s.registered ? " · KeyStore-registered" : " · ephemeral"}
                </p>
                {revoked && (s as { revokedBecause?: string }).revokedBecause ? (
                  <p className="meta" style={{ marginTop: "0.35rem" }}>Revoked: {(s as { revokedBecause?: string }).revokedBecause} · {ago((s as { revokedAt?: string }).revokedAt)}</p>
                ) : null}
              </div>

              <SessionControls mandateId={s.mandateId} revoked={revoked} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default function Dashboard() {
  return (
    <>
      <Header current="/dashboard" />
      <main className="shell" style={{ paddingBlock: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div>
          <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)" }}>Your agents</h1>
          <p className="sub" style={{ marginTop: "0.4rem" }}>
            Every session with authority on chain right now: what it may do, what it has done, and the
            kill switch. Revoking is one transaction, and it is instant.
          </p>
        </div>

        <Suspense fallback={<div className="panel" style={{ padding: "2rem" }} aria-busy><span className="sub">Reading sessions…</span></div>}>
          <Agents />
        </Suspense>

        <Suspense fallback={null}>
          <LiveTape />
        </Suspense>
      </main>
      <Footer note="Sessions read from the committed public index (their public halves are already on chain); mandate state read live from MandateMarket. The signer never appears here." />
    </>
  );
}
