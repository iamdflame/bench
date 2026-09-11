import Link from "next/link";
import type { Metadata } from "next";
import { formatEther, keccak256, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import AppShell from "@/components/v2/shell/AppShell";
import { live } from "@/lib/data/live";
import { snapshot } from "@/lib/data/snapshots";
import { listSessions, type SessionRecord } from "@/lib/chain/session-store";
import { activeKeys, comparePolicy, readKey, KEYSTORE, type PolicyMatch } from "@/lib/chain/keystore";
import { bscClient } from "@/lib/chain/rpc";
import { RECIPIENT_BOUND, SWAP_BOUND, USDT, WBNB } from "@/lib/chain/leash";
import { readGridWindow, type GridWindow } from "@/lib/grid/window";
import { withTimeout } from "@/lib/cache";
import { PROTOCOL_LABEL } from "@/lib/config";
import { DEMO_ADDRESS, bscscanAddress, bscscanTx, passkeyRecord, recenterRecord, short } from "@/lib/demo";

export const metadata: Metadata = {
  title: "Desk | Mandate",
  description:
    "Every key that can act on the demo account, what it may do, what the Altana KeyStore says about it right now, and the control that ends it.",
};

export const dynamic = "force-dynamic";
// Room for the census slice that runs after the response (see lib/census/refresh).
export const maxDuration = 60;

const TOKEN_LABEL: Record<string, string> = { [USDT.toLowerCase()]: "USDT", [WBNB.toLowerCase()]: "WBNB" };
const target = (to: string) => PROTOCOL_LABEL[to.toLowerCase()] ?? short(to);
const fn = (sig: string) => sig.slice(0, sig.indexOf("("));

function spendOf(rec: SessionRecord): string {
  const spend = (rec.permissions as { spend?: { limit: string | number; period: string; token?: string }[] } | null)?.spend ?? [];
  if (!spend.length) return "none";
  return spend
    .map((s) => `${Number(formatEther(BigInt(String(s.limit)))).toLocaleString("en-GB", { maximumFractionDigits: 6 })} ${s.token ? TOKEN_LABEL[s.token.toLowerCase()] ?? short(s.token) : "BNB"}/${s.period}`)
    .join(", ");
}

const VERDICT_TAG: Record<PolicyMatch["verdict"], string> = {
  matches: "m-tag m-tag--verified",
  "registry says revoked": "m-tag",
  "registry says expired": "m-tag",
  "not registered": "m-tag m-tag--caution",
  "expiry differs": "m-tag m-tag--caution",
  unreadable: "m-tag m-tag--caution",
};

const when = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";

export default async function DeskPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await live(["grid-window"]);
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));

  const [sessions, keys, block] = await Promise.all([
    listSessions().catch(() => [] as SessionRecord[]),
    withTimeout(activeKeys(DEMO_ADDRESS).catch(() => null), 6_000),
    withTimeout(bscClient().getBlockNumber().catch(() => null), 4_000),
  ]);
  const rows = await Promise.all(
    sessions.map(async (s) => ({
      s,
      m: await withTimeout(
        comparePolicy({ wallet: s.walletAddress as Address, publicKey: s.publicKey as Hex, expiry: s.expiry, registered: s.registered, revoked: Boolean(s.revokedAt) }).catch(() => null),
        6_000,
      ),
    })),
  );

  const ownKey = process.env.PRIVATE_KEY
    ? keccak256(privateKeyToAccount((process.env.PRIVATE_KEY.startsWith("0x") ? process.env.PRIVATE_KEY : `0x${process.env.PRIVATE_KEY}`) as Hex).publicKey).toLowerCase()
    : null;
  const held = new Set(sessions.map((s) => s.keyId.toLowerCase()));
  const others = keys
    ? (
        await Promise.all(
          keys.filter((k) => !held.has(k.toLowerCase())).map((k) => withTimeout(readKey(DEMO_ADDRESS, k).catch(() => null), 5_000)),
        )
      ).filter((e): e is NonNullable<typeof e> => Boolean(e))
    : null;
  const unaccounted = others?.filter((e) => e.valid && e.expiry !== 0 && e.keyId.toLowerCase() !== ownKey) ?? [];
  const admins = others?.filter((e) => e.valid && (e.expiry === 0 || e.keyId.toLowerCase() === ownKey)) ?? [];

  const recenter = recenterRecord()?.latest ?? null;
  const passkey = passkeyRecord();
  const grid = snapshot<GridWindow>("grid-window")?.payload ?? (await withTimeout(readGridWindow().catch(() => null), 8_000));
  const liveRows = rows.filter((r) => !r.s.revokedAt && r.s.expiry * 1000 > Date.now());
  const pastRows = rows.filter((r) => !liveRows.includes(r));

  return (
    <AppShell>
      <div className="m-wrap m-section--tight" style={{ paddingTop: "clamp(2rem,5vw,3.5rem)" }}>
        <h1 className="m-h1">Desk</h1>
        <p className="m-lede m-lede--wide" style={{ marginTop: "1rem", maxWidth: "62ch" }}>
          Every key that can act on the demo account, exactly what it may call, and what the Altana
          KeyStore says about it, read now. Ending a key is one transaction.
        </p>
        <p className="m-small" style={{ marginTop: "0.8rem" }}>
          Account{" "}
          <a className="m-link m-mono" href={bscscanAddress(DEMO_ADDRESS)} target="_blank" rel="noreferrer">
            {DEMO_ADDRESS}
          </a>{" "}
          · KeyStore{" "}
          <a className="m-link m-mono" href={bscscanAddress(KEYSTORE)} target="_blank" rel="noreferrer">
            {short(KEYSTORE)}
          </a>
          {block ? ` · read at block ${Number(block).toLocaleString("en-GB")}` : " · the chain did not answer this time"}
        </p>

        {one("revoked") ? (
          <p className="m-callout m-small" style={{ marginTop: "1.2rem" }}>
            Revoked {one("revoked")}.{" "}
            {one("tx") ? (
              <a className="m-link m-mono" href={bscscanTx(one("tx")!)} target="_blank" rel="noreferrer">
                {short(one("tx")!)}
              </a>
            ) : null}
          </p>
        ) : null}
        {one("error") ? (
          <p className="m-callout m-small" style={{ marginTop: "1.2rem" }}>
            Not revoked:{" "}
            {one("error") === "token"
              ? "the operator token did not match."
              : one("error") === "rate"
                ? "too many attempts; wait a minute."
                : one("error") === "no-operator"
                  ? "this deployment has no operator token configured."
                  : `${one("why") ?? "the revoke failed"}.`}
          </p>
        ) : null}

        {/* ----------------------------------------------------------- live keys */}
        <section className="m-section--tight" id="keys">
          <div className="m-head">
            <h2 className="m-h2">Keys that can act right now</h2>
            <p className="m-head__note">
              The policy is what this site granted. The KeyStore column is the registry, read live. They should agree.
            </p>
          </div>
          {liveRows.length === 0 ? (
            <div className="m-absent">
              <p className="m-absent__t">No live session on the demo account.</p>
            </div>
          ) : (
            <div className="m-scroll">
              <table className="m-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>May call, and nothing else</th>
                    <th>Spend cap</th>
                    <th>Expires</th>
                    <th>KeyStore, now</th>
                    <th>End it</th>
                  </tr>
                </thead>
                <tbody>
                  {liveRows.map(({ s, m }) => (
                    <tr key={s.id} id={s.id}>
                      <td>
                        <strong>{s.label}</strong>
                        <div className="m-mono m-note">{short(s.keyId, 12, 6)}</div>
                        {s.registrationTx ? (
                          <a className="m-link m-note" href={bscscanTx(s.registrationTx)} target="_blank" rel="noreferrer">
                            registered
                          </a>
                        ) : (
                          <span className="m-note">{s.registered ? "registered" : "not registered: enforced by the account, invisible to KeyStore readers"}</span>
                        )}
                      </td>
                      <td>
                        {s.allowlist.map((c) => (
                          <div key={c.to + c.signature} className="m-mono m-note">
                            {fn(c.signature)} on {target(c.to)}
                          </div>
                        ))}
                      </td>
                      <td className="m-note">{spendOf(s)}</td>
                      <td className="m-note">{when(s.expiry)}</td>
                      <td>
                        {m ? (
                          <>
                            <span className={VERDICT_TAG[m.verdict]}>{m.verdict}</span>
                            {m.registry?.expiry ? <div className="m-note">registry expiry {when(m.registry.expiry)}</div> : null}
                          </>
                        ) : (
                          <span className="m-tag m-tag--caution">unreadable</span>
                        )}
                      </td>
                      <td>
                        <form className="m-revoke" method="post" action="/api/desk/revoke">
                          <input type="hidden" name="id" value={s.id} />
                          <input className="m-input" type="password" name="token" placeholder="operator token" aria-label="Operator token" autoComplete="off" />
                          <button className="m-btn m-btn--sm" type="submit">
                            Revoke
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="m-note" style={{ marginTop: "0.8rem", maxWidth: "70ch" }}>
            Revoking needs the operator token because it spends the account&rsquo;s gas. Nothing on this page can grant a key.
            Rebalancing keys are granted on{" "}
            <a className="m-link m-mono" href={`https://repo.sourcify.dev/56/${RECIPIENT_BOUND}`} target="_blank" rel="noreferrer">
              RecipientBound
            </a>{" "}
            and grid keys on{" "}
            <a className="m-link m-mono" href={`https://repo.sourcify.dev/56/${SWAP_BOUND}`} target="_blank" rel="noreferrer">
              SwapBound
            </a>
            , never on PancakeSwap directly: both write the principal as the recipient from immutable storage, so no key here can
            name where the money goes.
          </p>
        </section>

        {/* ----------------------------------------------------- unaccounted keys */}
        <section className="m-section--tight">
          <div className="m-head">
            <h2 className="m-h2">Keys on the account this site does not hold</h2>
            <p className="m-head__note">Read from the KeyStore, not from our records.</p>
          </div>
          {others === null ? (
            <p className="m-small">The KeyStore did not answer, so this list is unknown rather than empty.</p>
          ) : unaccounted.length === 0 ? (
            <p className="m-small">
              None. {admins.length ? `${admins.length} admin key${admins.length === 1 ? "" : "s"} (the account's own signer, no expiry). ` : ""}
              Every other valid key on the account is listed above.
            </p>
          ) : (
            <ul className="m-small">
              {unaccounted.map((e) => (
                <li key={e.keyId} className="m-mono">
                  {short(e.keyId, 14, 6)} valid until {e.expiry ? when(e.expiry) : "no expiry"}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ------------------------------------------------------------ Range-1 */}
        <section className="m-section--tight" id="range-1">
          <div className="m-head">
            <h2 className="m-h2">Range-1 used its key</h2>
            <p className="m-head__note">An out-of-range position, recentered through RecipientBound. The NFTs never left the account.</p>
          </div>
          {recenter ? (
            <div className="m-scroll">
              <table className="m-table">
                <tbody>
                  <tr>
                    <th>Before</th>
                    <td>
                      Position #{recenter.before.tokenId}, range [{recenter.before.range[0]}, {recenter.before.range[1]}), pool tick {recenter.before.tick}: out of range
                    </td>
                  </tr>
                  <tr>
                    <th>Withdraw</th>
                    <td>
                      <a className="m-link m-mono" href={bscscanTx(recenter.txs.decreaseLiquidity)} target="_blank" rel="noreferrer">{short(recenter.txs.decreaseLiquidity)}</a>
                    </td>
                  </tr>
                  <tr>
                    <th>Collect</th>
                    <td>
                      <a className="m-link m-mono" href={bscscanTx(recenter.txs.collect)} target="_blank" rel="noreferrer">{short(recenter.txs.collect)}</a>{" "}
                      <span className="m-note">to the principal; RecipientBound&rsquo;s collect has no recipient argument</span>
                    </td>
                  </tr>
                  <tr>
                    <th>Re-mint</th>
                    <td>
                      <a className="m-link m-mono" href={bscscanTx(recenter.txs.mint)} target="_blank" rel="noreferrer">{short(recenter.txs.mint)}</a>{" "}
                      <span className="m-note">
                        position #{recenter.after.tokenId}, range [{recenter.after.range[0]}, {recenter.after.range[1]}), tick {recenter.after.tick}: {recenter.after.inRange ? "in range" : "out of range"}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th>Owner</th>
                    <td>
                      {recenter.sameOwnerThroughout ? "The same account before and after: " : "Owner changed: "}
                      <span className="m-mono">{short(recenter.after.owner)}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="m-small">Not run yet.</p>
          )}
        </section>

        {/* -------------------------------------------------------------- Grid-1 */}
        <section className="m-section--tight" id="grid-1">
          <div className="m-head">
            <h2 className="m-h2">Grid-1&rsquo;s window</h2>
            <p className="m-head__note">
              Read from SwapBound&rsquo;s own Swapped events. A simulated fill emits nothing, so none can appear here.
            </p>
          </div>
          {grid ? (
            <>
              <div className="m-stats">
                <div>
                  <span className="m-label m-stat__k">Fills</span>
                  <span className="m-stat__v m-fig">{grid.fills.length}</span>
                </div>
                <div>
                  <span className="m-label m-stat__k">Win rate</span>
                  <span className="m-stat__v m-fig">
                    {grid.winRate === null ? "no round trip yet" : `${Math.round(grid.winRate * 100)}% of ${grid.roundTrips.length}`}
                  </span>
                </div>
                <div>
                  <span className="m-label m-stat__k">Against doing nothing</span>
                  <span className="m-stat__v m-fig">{grid.pnlUsd >= 0 ? "+" : "-"}${Math.abs(grid.pnlUsd).toFixed(4)}</span>
                </div>
                <div>
                  <span className="m-label m-stat__k">Worst drawdown</span>
                  <span className="m-stat__v m-fig">${grid.maxDrawdownUsd.toFixed(4)}</span>
                </div>
              </div>
              <p className="m-note" style={{ marginTop: "0.6rem" }}>
                {grid.window.start
                  ? `Window ${grid.window.start.slice(0, 16).replace("T", " ")} to ${grid.window.end?.slice(0, 16).replace("T", " ")} UTC (${(grid.window.hours ?? 0).toFixed(1)} h). `
                  : "No fill yet. "}
                Gas ${grid.gasUsd.toFixed(4)} at the chain&apos;s price, included. Read to block {grid.toBlock.toLocaleString("en-GB")}.
              </p>
              {grid.fills.length ? (
                <div className="m-scroll" style={{ marginTop: "0.8rem" }}>
                  <table className="m-table">
                    <thead>
                      <tr>
                        <th>When (UTC)</th>
                        <th>Side</th>
                        <th className="m-num">USDT</th>
                        <th className="m-num">WBNB</th>
                        <th className="m-num">Price</th>
                        <th>Transaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grid.fills.map((f) => (
                        <tr key={f.tx}>
                          <td className="m-note">{f.at ? f.at.slice(0, 19).replace("T", " ") : `block ${f.block}`}</td>
                          <td>{f.side === "buy" ? "bought BNB" : "sold BNB"}</td>
                          <td className="m-num">{f.usdt.toFixed(4)}</td>
                          <td className="m-num">{f.wbnb.toFixed(6)}</td>
                          <td className="m-num">{f.price.toFixed(2)}</td>
                          <td>
                            <a className="m-link m-mono" href={bscscanTx(f.tx)} target="_blank" rel="noreferrer">{short(f.tx)}</a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </>
          ) : (
            <p className="m-small">The window could not be read from the chain just now. That is our read failing, not a result.</p>
          )}
        </section>

        {/* ------------------------------------------------------------- passkey */}
        <section className="m-section--tight" id="passkey">
          <div className="m-head">
            <h2 className="m-h2">A passkey wallet, start to finish</h2>
            <p className="m-head__note">Grant, act, revoke, on mainnet, with the KeyStore read at each step.</p>
          </div>
          {passkey ? (
            <div className="m-scroll">
              <table className="m-table">
                <tbody>
                  <tr>
                    <th>Wallet</th>
                    <td>
                      <a className="m-link m-mono" href={bscscanAddress(passkey.wallet)} target="_blank" rel="noreferrer">{passkey.wallet}</a>
                      <div className="m-note">Admin: {passkey.admin.kind}</div>
                    </td>
                  </tr>
                  <tr>
                    <th>Policy granted</th>
                    <td className="m-note">
                      {passkey.session.calls.map((c) => `${fn(c.signature)} on ${target(c.to)}`).join(", ")}; spend{" "}
                      {passkey.session.spend.map((s) => `${Number(formatEther(BigInt(s.limit))).toString()} ${s.token ? TOKEN_LABEL[s.token.toLowerCase()] ?? short(s.token) : "BNB"}/${s.period}`).join(", ")}; expires {when(passkey.session.expiry)}
                    </td>
                  </tr>
                  {Object.entries(passkey.txs).map(([k, h]) => (
                    <tr key={k}>
                      <th>{k}</th>
                      <td>{h ? <a className="m-link m-mono" href={bscscanTx(h)} target="_blank" rel="noreferrer">{short(h)}</a> : <span className="m-note">the relay did not report a hash</span>}</td>
                    </tr>
                  ))}
                  {Object.entries(passkey.keystore).map(([k, v]) => (
                    <tr key={`ks-${k}`}>
                      <th>KeyStore {k}</th>
                      <td className="m-note">
                        session key {v.sessionValid ? "valid" : "not valid"}
                        {v.adminValid === undefined || v.adminValid === null ? "" : `, admin key ${v.adminValid ? "valid" : "not valid"}`} at block {v.block.toLocaleString("en-GB")}
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <th>Afterwards</th>
                    <td className="m-note">{passkey.discarded}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <p className="m-small">Not run yet.</p>
          )}
        </section>

        {/* -------------------------------------------------------- threat model */}
        <section className="m-section--tight" id="stolen">
          <div className="m-head">
            <h2 className="m-h2">If a key is stolen</h2>
            <p className="m-head__note">What the thief gets, by key. Written against the allowlists above and the contracts behind them.</p>
          </div>
          <div className="m-scroll">
            <table className="m-table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>The thief can</th>
                  <th>The thief cannot</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Rebalancing session</td>
                  <td>Withdraw the principal&rsquo;s positions and re-mint them, up to RecipientBound&rsquo;s remaining caps, with everything landing back on the principal. Spend a little of the account&rsquo;s BNB on gas.</td>
                  <td>Send tokens or positions to any other address. Call the position manager directly. Approve anything. Act after expiry or revoke.</td>
                </tr>
                <tr>
                  <td>Grid session</td>
                  <td>Trade USDT and WBNB in the one 0.05% pool, up to SwapBound&rsquo;s lifetime caps (3 USDT, 0.005 WBNB sold), at a price of their choosing above zero. Bad trades can lose value up to those caps.</td>
                  <td>Receive the proceeds, which go to the principal. Trade any other token or pool. Approve anything. Act after expiry or revoke.</td>
                </tr>
                <tr>
                  <td>Yield session</td>
                  <td>Move the principal&rsquo;s USDT or BNB into or out of Venus supply.</td>
                  <td>Send it anywhere else, borrow, or supply on another account&rsquo;s behalf.</td>
                </tr>
                <tr>
                  <td>Health-factor session</td>
                  <td>Repay the principal&rsquo;s own Venus debt and add collateral.</td>
                  <td>Borrow, withdraw collateral, or repay for someone else.</td>
                </tr>
                <tr>
                  <td>Operator token</td>
                  <td>Revoke sessions from this page, which stops agents working.</td>
                  <td>Grant a key, or move any funds.</td>
                </tr>
                <tr>
                  <td>Adjudicator key</td>
                  <td>Propose a false epoch result, which anyone can challenge with the observation inside the 300 second window.</td>
                  <td>Withdraw escrow, change parameters, or take the owner&rsquo;s role. It is a different key from the owner.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="m-note" style={{ marginTop: "0.8rem" }}>
            The same table, with the reasoning, is in <span className="m-mono">docs/threat-model.md</span>.{" "}
            <Link className="m-link" href="/status">
              Is the judge path up right now →
            </Link>
          </p>
        </section>

        {pastRows.length ? (
          <section className="m-section--tight">
            <div className="m-head">
              <h2 className="m-h2">Keys that have ended</h2>
            </div>
            <div className="m-scroll">
              <table className="m-table">
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Ended</th>
                    <th>KeyStore, now</th>
                  </tr>
                </thead>
                <tbody>
                  {pastRows.map(({ s, m }) => (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.label}</strong>
                        <div className="m-mono m-note">{short(s.keyId, 12, 6)}</div>
                      </td>
                      <td className="m-note">
                        {s.revokedAt ? `revoked ${s.revokedAt.slice(0, 16).replace("T", " ")} UTC` : `expired ${when(s.expiry)}`}
                        {s.revokeTx ? (
                          <>
                            {" "}
                            <a className="m-link m-mono" href={bscscanTx(s.revokeTx)} target="_blank" rel="noreferrer">{short(s.revokeTx)}</a>
                          </>
                        ) : null}
                        {s.revokedBecause ? <div>{s.revokedBecause}</div> : null}
                      </td>
                      <td>{m ? <span className={VERDICT_TAG[m.verdict]}>{m.verdict}</span> : <span className="m-tag m-tag--caution">unreadable</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}
