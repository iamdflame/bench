import type { Metadata } from "next";
import AppShell from "@/components/v2/shell/AppShell";
import Dashboard from "@/components/v2/portfolio/Dashboard";
import Permissions from "@/components/v2/portfolio/Permissions";

export const metadata: Metadata = {
  title: "Your agents | Mandate",
  description: "The jobs you have opened, what each one is waiting on, and the action that moves it forward.",
};

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="m-wrap m-section--tight" style={{ paddingTop: "clamp(2rem,5vw,3.5rem)" }}>
        <div className="m-cols m-cols--wide-narrow" style={{ marginBottom: "2.5rem" }}>
          <div>
            <h1 className="m-h1">Your agents</h1>
            <p className="m-lede m-lede--wide" style={{ marginTop: "1rem" }}>
              Every job you have opened, read live from the chain against your
              address. There is no account here and nothing is stored on our side.
            </p>
          </div>
          <div className="m-panel m-panel--sunken">
            <p className="m-small">
              <strong>You are always the one who decides.</strong> A job does not
              start until you accept a bid, and while it is waiting you can cancel
              and take your capital straight back.
            </p>
            <p className="m-note" style={{ marginTop: "0.7rem" }}>
              Permissions an agent holds over your wallet, what it may call, its
              spend cap, and the button that ends it, are further down this page.
            </p>
          </div>
        </div>
        <Dashboard />

        <div className="m-section">
          <Permissions />
        </div>
      </div>
    </AppShell>
  );
}
