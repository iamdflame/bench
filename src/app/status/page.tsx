import Link from "next/link";
import type { Metadata } from "next";
import AppShell from "@/components/v2/shell/AppShell";
import { live } from "@/lib/data/live";
import { judgePathChecks } from "@/lib/ops/status";
import { health } from "@/lib/chain/rpc";
import { readHeartbeats } from "@/lib/heartbeat";
import { getProbes } from "@/lib/data/probes";
import { ageOf } from "@/lib/data/snapshots";
import { roles } from "@/lib/chain/marketV2";
import { withTimeout } from "@/lib/cache";
import { bscscanAddress, short } from "@/lib/demo";

export const metadata: Metadata = {
  title: "Status | Mandate",
  description: "Whether the judge path works right now, checked from the inside, with the providers, clocks and roles behind it.",
};

export const dynamic = "force-dynamic";
// Room for the census slice that runs after the response (see lib/census/refresh).
export const maxDuration = 60;

export default async function StatusPage() {
  await live();
  const [checks, rpcs, beats, who] = await Promise.all([
    judgePathChecks(),
    health(),
    readHeartbeats().catch(() => null),
    withTimeout(roles().catch(() => null), 6_000),
  ]);
  const probes = getProbes();
  const ok = checks.every((c) => c.ok);
  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local build";

  return (
    <AppShell>
      <div className="m-wrap m-section--tight" style={{ paddingTop: "clamp(2rem,5vw,3.5rem)" }}>
        <h1 className="m-h1">{ok ? "Everything a judge touches is working" : "Something on the judge path is broken"}</h1>
        <p className="m-lede m-lede--wide" style={{ marginTop: "1rem", maxWidth: "62ch" }}>
          Each beat on the{" "}
          <Link className="m-link" href="/judges">
            judge walk
          </Link>{" "}
          depends on a read. This page runs those reads now. The same checks answer at{" "}
          <a className="m-link m-mono" href="/api/status">
            /api/status
          </a>{" "}
          with 200 or 503, for an uptime monitor.
        </p>
        <p className="m-note" style={{ marginTop: "0.6rem" }}>
          Commit {commit} · checked {new Date().toISOString().slice(0, 19).replace("T", " ")} UTC
        </p>

        <section className="m-section--tight">
          <div className="m-head">
            <h2 className="m-h2">The six beats</h2>
          </div>
          <div className="m-scroll">
            <table className="m-table">
              <thead>
                <tr>
                  <th>Beat</th>
                  <th>What must be true</th>
                  <th>Result</th>
                  <th className="m-num">Took</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.beat}>
                    <td className="m-fig">{c.beat}</td>
                    <td>
                      {c.name}
                      <div className="m-note">{c.detail}</div>
                    </td>
                    <td>
                      <span className={c.ok ? "m-tag m-tag--verified" : "m-tag m-tag--caution"}>{c.ok ? "working" : "broken"}</span>
                    </td>
                    <td className="m-num m-note">{(c.ms / 1000).toFixed(1)} s</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="m-section--tight">
          <div className="m-head">
            <h2 className="m-h2">Chain providers</h2>
            <p className="m-head__note">
              Every read rotates across these. A provider that fails is skipped for a minute, so one dead node costs one failed call.
            </p>
          </div>
          <div className="m-scroll">
            <table className="m-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Answered</th>
                  <th className="m-num">Block</th>
                  <th className="m-num">Time</th>
                </tr>
              </thead>
              <tbody>
                {rpcs.map((r) => (
                  <tr key={r.url}>
                    <td className="m-mono m-note">{new URL(r.url).host}</td>
                    <td>
                      <span className={r.ok ? "m-tag m-tag--verified" : "m-tag m-tag--caution"}>{r.ok ? "yes" : "no"}</span>
                      {r.error ? <div className="m-note">{r.error}</div> : null}
                    </td>
                    <td className="m-num m-note">{r.block ? r.block.toLocaleString("en-GB") : "-"}</td>
                    <td className="m-num m-note">{r.ms} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="m-section--tight">
          <div className="m-head">
            <h2 className="m-h2">Clocks</h2>
            <p className="m-head__note">How old each reading behind the site is. The census refreshes from visitors&rsquo; own requests when it is older than fifteen minutes.</p>
          </div>
          <div className="m-scroll">
            <table className="m-table">
              <tbody>
                <tr>
                  <th>Agent census</th>
                  <td className="m-note">
                    {probes.answered} of {probes.probed} answered · taken {ageOf(probes.at)}
                  </td>
                </tr>
                {beats
                  ? (Object.entries(beats) as [string, { at: string; alive: boolean } | null][]).map(([k, v]) => (
                      <tr key={k}>
                        <th>{k} heartbeat</th>
                        <td className="m-note">{v ? `${ageOf(v.at)}${v.alive ? "" : " (overdue)"}` : "never written"}</td>
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="m-section--tight">
          <div className="m-head">
            <h2 className="m-h2">Who holds which role</h2>
            <p className="m-head__note">Read from the market contract now.</p>
          </div>
          {who ? (
            <div className="m-scroll">
              <table className="m-table">
                <tbody>
                  <tr>
                    <th>Owner</th>
                    <td>
                      <a className="m-link m-mono" href={bscscanAddress(who.owner)} target="_blank" rel="noreferrer">{short(who.owner)}</a>{" "}
                      <span className="m-note">an EOA; a Safe transfer is prepared and not run</span>
                    </td>
                  </tr>
                  <tr>
                    <th>Adjudicator</th>
                    <td>
                      <a className="m-link m-mono" href={bscscanAddress(who.adjudicator)} target="_blank" rel="noreferrer">{short(who.adjudicator)}</a>{" "}
                      <span className="m-note">{who.adjudicator.toLowerCase() === who.owner.toLowerCase() ? "the same key as the owner" : "a different key from the owner"}</span>
                    </td>
                  </tr>
                  <tr>
                    <th>Read at</th>
                    <td className="m-note">block {who.block.toLocaleString("en-GB")}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="m-small">The market did not answer just now.</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
