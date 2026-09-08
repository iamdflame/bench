"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { connect, explain, listen, short, silent, available, type Connected } from "@/lib/wallet";

/**
 * One control, and a deliberately small idea of what connecting means.
 *
 * Connecting a wallet here does not unlock the site, mount a provider, or
 * re-render anything. It reads an address and puts it in the URL — `?position=`
 * on the board, `?wallet=` on the desk, `?buyer=` on a hire screen — which is
 * the same field a reader can fill in by pasting. Everything downstream is
 * server-rendered from that parameter, so the whole read path keeps working
 * with JavaScript off and any state you reach is a link you can send someone.
 *
 * That is why there is no connect gate anywhere in this product. A marketplace
 * that demands a signature before it will show you its inventory has the order
 * backwards: you connect when you have decided to act, and until then the
 * button is just a faster way to type your own address.
 *
 * The one thing it must never do is claim more than it knows. A wallet that is
 * installed but locked, or connected to a chain we do not transact on, says so.
 */

/** Where this page keeps an address. */
function paramFor(path: string): string {
  if (path.startsWith("/desk")) return "wallet";
  if (path.startsWith("/hire/")) return "buyer";
  return "position";
}

export default function Connect() {
  const [w, setW] = useState<Connected | null>(null);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(true);
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();

  /*
    The announce listener has to be installed before anything asks for a
    provider, and `eth_accounts` is the version of the question that does not
    open a dialog — so a reader who connected on a previous visit sees their
    address without being prompted, and a reader who never has is not prompted
    at all.
  */
  useEffect(() => {
    listen();
    setHasWallet(available());
    void silent().then((s) => s && setW(s));
  }, []);

  const put = useCallback(
    (address: string | null) => {
      const next = new URLSearchParams(sp.toString());
      const key = paramFor(path);
      if (address) next.set(key, address);
      else next.delete(key);
      const q = next.toString();
      router.replace(q ? `${path}?${q}` : path, { scroll: false });
    },
    [path, router, sp],
  );

  const onConnect = useCallback(async () => {
    setBusy(true);
    setWhy(null);
    try {
      const got = await connect();
      setW(got);
      put(got.address);
    } catch (e) {
      setWhy(explain(e));
    } finally {
      setBusy(false);
    }
  }, [put]);

  /*
    No wallet installed is not an error and does not get an error's treatment.
    The control simply is not there, because the address field it fills in is
    still on the page and still works.
  */
  if (!hasWallet && !w) return null;

  if (!w) {
    return (
      <span className="connect">
        <button type="button" className="btn btn--sm connect__btn" onClick={onConnect} disabled={busy}>
          {busy ? "Check your wallet" : "Connect wallet"}
        </button>
        {why ? (
          <span className="connect__why" role="status">
            {why}
          </span>
        ) : null}
      </span>
    );
  }

  const wrongChain = w.chainId !== 56 && w.chainId !== 97;
  const inUrl = sp.get(paramFor(path)) === w.address;

  return (
    <span className="connect" data-connected="">
      <button
        type="button"
        className="btn btn--sm connect__btn"
        onClick={() => put(inUrl ? null : w.address)}
        title={
          inUrl
            ? `${w.address} — click to stop reading this page as this address`
            : `${w.address} — click to read this page as this address`
        }
      >
        <span className="connect__dot" data-on={wrongChain ? undefined : ""} aria-hidden />
        <span className="num">{short(w.address)}</span>
      </button>
      {wrongChain ? (
        <span className="connect__why">
          Your wallet is on chain {w.chainId}. This marketplace transacts on 56 and 97; you will be asked to
          switch when you act.
        </span>
      ) : null}
    </span>
  );
}
