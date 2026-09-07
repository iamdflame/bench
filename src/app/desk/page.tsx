import type { Metadata } from "next";
import { Suspense } from "react";
import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import LiveTape from "@/components/instrument/LiveTape";
import SessionControls from "@/components/instrument/SessionControls";
import { readPublicIndex } from "@/lib/chain/session";
import { readBook } from "@/lib/chain/book";
import { houseByWallet, houseByTokenId } from "@/lib/house";
import { shopByTokenId } from "@/lib/shops";
import { CATEGORY_LABEL } from "@/lib/config";
import { bps } from "@/lib/chain/market";
import { ago } from "@/components/instrument/HonestCount";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "The desk · every agent you have hired",
  description:
    "Live sessions, what each one may do, what it has done, and a revoke that ends its authority on chain in one transaction.",
};

function countdown(expiry: number): string {
  const s = expiry - Math.floor(Date.now() / 1000);
  if (s <= 0) return "expired";
  const d = Math.floor(s / 86_400);
  if (d >= 2) return `expires in ${d}d`;
  const h = Math.floor(s / 3600);
  if (h >= 1) return `expires in ${h}h`;
  return `expires in ${Math.max(1, Math.floor(s / 60))}m`;
}

async function Sessions() {
  const [index, book] = await Promise.all([Promise.resolve(readPublicIndex()), readBook()]);
  const sessions = Object.entries(index)
    .map(([id, s]) => ({ id: Number(id), ...s }))
    .sort((a, b) => {
      // Live first, then most recently granted. A dead row is history; a live
      // one is authority somebody currently holds over money.
      const liveA = !a.revokedAt && a.expiry > Date.now() / 1000;
      const liveB = !b.revokedAt && b.expiry > Date.now() / 1000;
      return Number(liveB) - Number(liveA) || b.id - a.id;
    });

  const live = sessions.filter((s) => !s.revokedAt && s.expiry > Date.now() / 1000).length;

  if (sessions.length === 0) {
    return (
      <div className="panel" style={{ padding: "2rem" }}>
        <h2 className="hd-2" style={{ fontSize: "var(--text-lg)" }}>Nothing is hired.</h2>
        <p className="sub read" style={{ marginTop: "0.5rem" }}>
          When you hire an agent it appears here with everything it may do, everything it has done,
          and a button that ends its authority on chain. Pick a job to start.
        </p>
        <a href="/" className="btn btn--primary" style={{ marginTop: "1.25rem" }}>Pick a job →</a>
      </div>
    );
  }

  return (
    <>
      <p className="meta" style={{ marginBottom: "0.75rem" }}>
        <span className="num" style={{ color: live > 0 ? "var(--color-assay-ink)" : "var(--color-ink-3)" }}>{live}</span> live ·{" "}
        <span className="num">{sessions.length - live}</span> ended · every row is a key that exists on chain
      </p>
      <ul style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        {sessions.map((s) => {
          const revoked = Boolean(s.revokedAt);
          const expired = s.expiry <= Math.floor(Date.now() / 1000);
          /*
            Named by the token the hire was for, and only then by the wallet.

            A session's `walletAddress` is the delegated account the key acts
            through, which is the principal's, not the agent's: matching a house
            agent on it never succeeded, and every row fell back to its category
            name. The token id is what a person chose on the ticket, so it is
            what the row is named after.
          */
          const shop = s.tokenId ? shopByTokenId(s.tokenId) : null;
          const house =
            (s.tokenId ? houseByTokenId(s.tokenId) : null) ?? houseByWallet(s.walletAddress);
          const row = book.rows.find(
            (r) => r.id === s.mandateId && (!s.market || r.deployment.address.toLowerCase() === s.market.toLowerCase()),
          );
          const status = revoked ? "revoked" : expired ? "expired" : "live";
          const statusChip = revoked ? "chip--fail" : expired ? "" : "chip--live";
          const cap = (Number(s.capWei) / 1e18).toFixed(4);

          return (
            <li key={s.id} className="card" style={{ padding: "1.15rem 1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "18rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                    <span className="hd-3" style={{ fontSize: "var(--text-base)" }}>
                      {house?.name ?? shop?.name ?? CATEGORY_LABEL[s.category]}
                    </span>
                    <span className={`chip ${statusChip}`}>
                      <span className={`dot ${status === "live" ? "dot--live" : status === "revoked" ? "dot--fail" : ""}`} />
                      {status}
                    </span>
                    {house ? (
                      <span className="chip chip--struck">MANDATE · bonded</span>
                    ) : shop ? (
                      <span className="chip">{shop.operator.name} · shop · unbonded</span>
                    ) : null}
                  </div>

                  <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.4rem" }}>
                    {row && row.epochsSettled > 0 ? (
                      <>Settled {row.epochsSettled} epoch{row.epochsSettled === 1 ? "" : "s"} · running{" "}
                        <span className="num" style={{ color: "var(--color-touchstone)" }}>{bps(row.cumulativeAlphaBps)}</span> alpha
                        {row.strikes > 0 ? <> · slashed {row.strikes}×, and it stays on the tape</> : null}</>
                    ) : row ? (
                      <>Bonded on {row.deployment.label}, awaiting its first settled epoch.</>
                    ) : shop ? (
                      <>Hired from {shop.operator.name}. No bond posted here, so there is nothing for us to cut: revoke is your remedy.</>
                    ) : (
                      <>Session granted; no on-chain mandate correlated at this block.</>
                    )}
                  </p>

                  <p className="meta" style={{ marginTop: "0.5rem", lineHeight: 1.5 }}>
                    May: {CATEGORY_LABEL[s.category].toLowerCase()} calls only ·{" "}
                    {s.allowlist.length} call{s.allowlist.length === 1 ? "" : "s"} on{" "}
                    {(s.provenProtocols ?? []).length || "its proven"} protocol{(s.provenProtocols ?? []).length === 1 ? "" : "s"} ·{" "}
                    cap <span className="num">{cap}</span> BNB · {countdown(s.expiry)}
                    {s.registered && s.registrationTx ? (
                      <>
                        {" · "}
                        <a className="link-accent" href={`https://bscscan.com/tx/${s.registrationTx}`} target="_blank" rel="noopener noreferrer">KeyStore ↗</a>
                        {" · "}
                        <a className="link-accent" href={`https://explorer.altana.network/address/${s.walletAddress}`} target="_blank" rel="noopener noreferrer">Altana ↗</a>
                      </>
                    ) : s.registered ? " · KeyStore-registered" : " · ephemeral"}
                  </p>

                  {s.withheld && s.withheld.length ? (
                    <p className="meta" style={{ marginTop: "0.3rem", lineHeight: 1.5 }}>
                      Withheld: {s.withheld.length} call{s.withheld.length === 1 ? "" : "s"} the job permits that this
                      agent has not been shown doing. The narrowing is on the record, not on trust.
                    </p>
                  ) : null}

                  {s.committed === false ? (
                    <p className="meta" style={{ marginTop: "0.3rem", lineHeight: 1.5 }}>
                      Granted by this instance and not yet committed to the public index. The chain is
                      the record; this row is our copy of it.
                    </p>
                  ) : null}

                  {revoked && s.revokedBecause ? (
                    <p className="meta" style={{ marginTop: "0.35rem" }}>Revoked: {s.revokedBecause} · {ago(s.revokedAt)}</p>
                  ) : revoked ? (
                    <p className="meta" style={{ marginTop: "0.35rem" }}>Revoked {ago(s.revokedAt)}. The key no longer signs anything.</p>
                  ) : null}
                </div>

                <SessionControls mandateId={s.mandateId} revoked={revoked} paused={Boolean(s.pausedAt)} />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export default function Desk() {
  return (
    <>
      <Header current="/desk" />
      <main className="shell" style={{ paddingBlock: "2rem", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div>
          <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)" }}>The desk</h1>
          <p className="sub" style={{ marginTop: "0.4rem" }}>
            Every session with authority on chain right now: what it may do, what it has done, and
            the kill switch. Revoking is one transaction, and it is instant.
          </p>
        </div>

        <Suspense fallback={<div className="panel" style={{ padding: "2rem" }} aria-busy><span className="sub">Reading sessions…</span></div>}>
          <Sessions />
        </Suspense>

        <Suspense fallback={null}>
          <LiveTape />
        </Suspense>
      </main>
      <Footer note="Sessions read from the committed public index, whose public halves are already on chain; mandate state read live from MandateMarket. The signer never appears here." />
    </>
  );
}
