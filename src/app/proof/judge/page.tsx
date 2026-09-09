import type { Metadata } from "next";
import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import { ago, blockLabel } from "@/components/instrument/HonestCount";
import { readPacket, type ItemState } from "@/lib/packet";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Judge packet · every link, in order",
  description:
    "One page for a reviewer: the films, the transactions, the comparison and the report, each showing whether the evidence currently exists.",
};

const MARK: Record<ItemState, { chip: string; label: string }> = {
  ready: { chip: "chip--pass", label: "ready" },
  stale: { chip: "chip--fail", label: "lapsed" },
  missing: { chip: "", label: "not yet" },
};

/**
 * The packet, which is also the checklist.
 *
 * Every row states whether its evidence exists at this block. Nothing is
 * asserted that a reader cannot immediately open, and where something is not
 * ready the row says so and names the step that would produce it, rather than
 * linking to a page that will disappoint.
 *
 * This is uncomfortable to publish while rows still read "not yet", and that
 * is the correct amount of uncomfortable. A submission page that claims ten of
 * ten while three links are dead is the failure this whole product is an
 * argument against.
 */
export default async function JudgePacket() {
  const p = await readPacket();

  return (
    <>
      <Header current="/proof" />
      <main className="shell" style={{ paddingBlock: "2rem", display: "flex", flexDirection: "column", gap: "1.25rem", maxWidth: "50rem" }}>
        <div>
          <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)" }}>Judge packet</h1>
          <p className="lede" style={{ fontSize: "var(--text-base)", marginTop: "0.5rem", maxWidth: "40rem" }}>
            Four minutes, in order. Each row says whether its evidence exists right now, read from
            the chain and the session index rather than typed into a list.
          </p>
          <p className="meta" style={{ marginTop: "0.5rem" }}>
            <span className="num" style={{ color: p.ready === p.total ? "var(--color-struck)" : "var(--color-touchstone)" }}>
              {p.ready}
            </span>{" "}
            of <span className="num">{p.total}</span> ready ·{" "}
            {blockLabel(p.block) ? `${blockLabel(p.block)} · ` : ""}read {ago(p.at)}
          </p>
        </div>

        <ol style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
          {p.items.map((i) => (
            <li key={i.n} className="card" style={{ padding: "1rem 1.15rem" }}>
              <div style={{ display: "flex", gap: "0.85rem", alignItems: "flex-start", flexWrap: "wrap" }}>
                <span className="num meta" style={{ paddingTop: "0.15rem", minWidth: "1.5rem" }}>
                  {String(i.n).padStart(2, "0")}
                </span>
                <div style={{ flex: 1, minWidth: "16rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span className="hd-3" style={{ fontSize: "var(--text-base)" }}>{i.title}</span>
                    <span className={`chip ${MARK[i.state].chip}`}>{MARK[i.state].label}</span>
                  </div>
                  <p className="sub" style={{ fontSize: "var(--text-sm)", marginTop: "0.3rem", lineHeight: 1.5 }}>{i.proves}</p>
                  <p className="meta" style={{ marginTop: "0.35rem", lineHeight: 1.5 }}>{i.detail}</p>
                  {i.todo ? (
                    <p className="num meta" style={{ marginTop: "0.4rem", fontSize: "var(--text-2xs)", lineHeight: 1.5 }}>
                      $ {i.todo}
                    </p>
                  ) : null}
                </div>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginLeft: "auto" }}>
                  {i.href ? (
                    <a
                      href={i.href}
                      className={`btn btn--sm ${i.state === "ready" ? "btn--primary" : ""}`}
                      {...(i.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                    >
                      Open
                    </a>
                  ) : null}
                  {i.tx ? (
                    <a href={i.tx} className="btn btn--sm" target="_blank" rel="noopener noreferrer">Tx ↗</a>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="panel" style={{ padding: "1.25rem" }}>
          <h2 className="hd-3">The sentence this is all for</h2>
          <p className="sub read" style={{ fontSize: "var(--text-sm)", marginTop: "0.4rem", lineHeight: 1.65 }}>
            There are very good shops of eight agents with a passkey on this chain. This is the hall:
            we hired another operator&rsquo;s agent from our own ticket, on a tighter leash than they
            publish for it themselves; we hired a bonded agent that can be slashed; we revoked both;
            and three hundred thousand others are on the register with an honest state next to each
            one.
          </p>
        </div>
      </main>
      <Footer note="Row states are read live: a grant that has expired reports as lapsed rather than ready, because an expired session is not evidence that hiring works." />
    </>
  );
}
