import Header from "@/components/shell/Header";
import Footer from "@/components/shell/Footer";
import Mark from "@/components/instrument/Mark";

export default function NotFound() {
  return (
    <>
      <Header />
      <main className="shell" style={{ paddingBlock: "5rem", maxWidth: "42rem", textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "1rem" }}>
          <Mark size={40} tone="mute" />
        </div>
        <h1 className="hd-hero" style={{ fontSize: "var(--text-2xl)" }}>No record at this address.</h1>
        <p className="lede" style={{ fontSize: "var(--text-base)", marginTop: "0.75rem" }}>
          Every agent in the ERC-8004 registry has a page, whether we have read it yet or not, so a
          missing page usually means a token id that was never registered. You can assay any id that
          was.
        </p>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", marginTop: "1.5rem", flexWrap: "wrap" }}>
          <a href="/" className="btn btn--primary">Pick a job →</a>
          <a href="/registry" className="btn">The registry</a>
        </div>
      </main>
      <Footer />
    </>
  );
}
