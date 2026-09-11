"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { parseEther } from "viem";
import CategoryMark from "@/components/v2/marks/CategoryMark";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "@/lib/config";
import { marketChain } from "@/lib/chain/market";
import { useWallet, sendMarketTx, type TxState } from "@/lib/chain/wallet";

/**
 * Hiring an agent, in four steps, with nothing hidden in any of them.
 *
 * The old route asked for one number and a category on a single screen, then
 * put a signature in front of a stranger who had not been told what the
 * signature did. Everything else, the tolerance, the term, the strike count,
 * the slash, was hardcoded out of sight and never named.
 *
 * Here every one of those is a choice, phrased as a question about the job
 * rather than as a contract parameter, and step three restates the whole
 * arrangement in English with the worst case in money before anything is
 * signed. That last screen is the point of the flow. A person should never
 * find out what they agreed to by reading a block explorer afterwards.
 *
 * The contract's real constraints are enforced here rather than discovered at
 * the revert: an epoch has to outlast the challenge window, strikes cannot be
 * zero, the catastrophic threshold has to be negative, and a mandate under
 * 0.0002 BNB has a bond floor beneath the market's minimum, so no agent could
 * bid on it even if it opened.
 */

const NATIVE = "0x0000000000000000000000000000000000000000" as const;

/** Which price series each category is measured against. */
const BENCHMARK: Record<Category, number> = {
  rebalancing: 0,
  "grid-trading": 0,
  "yield-optimisation": 1,
  "health-factor": 2,
};

const BENCHMARK_PLAIN: Record<Category, string> = {
  rebalancing: "simply holding the same assets and doing nothing",
  "grid-trading": "simply holding the same assets and doing nothing",
  "yield-optimisation": "leaving the money in a standard lending pool",
  "health-factor": "the protocol's own borrow rate on your position",
};

const TERMS = [
  { id: "day", label: "One day", epochs: 24, note: "24 hourly checkpoints. Good for a first try." },
  { id: "three", label: "Three days", epochs: 72, note: "Long enough for a strategy to show its shape." },
  { id: "week", label: "One week", epochs: 168, note: "A real term. Your capital is locked for all of it." },
] as const;

const STRICTNESS = [
  {
    id: "forgiving",
    label: "Forgiving",
    toleranceBps: 500,
    strikes: 5,
    note: "The agent may trail the benchmark by 5% in an hour before it counts against it, and it gets five of those.",
  },
  {
    id: "standard",
    label: "Standard",
    toleranceBps: 200,
    strikes: 3,
    note: "2% behind in an hour is a strike. Three strikes ends the job and the agent forfeits part of its bond.",
  },
  {
    id: "strict",
    label: "Strict",
    toleranceBps: 100,
    strikes: 2,
    note: "1% behind is a strike and two ends it. Fewer agents will bid on this.",
  },
] as const;

const SHARES = [
  { bps: 1_000, label: "10%" },
  { bps: 2_000, label: "20%" },
  { bps: 3_000, label: "30%" },
] as const;

const STEPS = ["The job", "Your limits", "Read it back", "Sign"] as const;

interface Props {
  tokenId: string;
  name: string;
  category: Category | null;
  what: string | null;
}

const bnb = (n: number) => `${n.toFixed(n < 0.01 ? 5 : 4)} BNB`;

/**
 * The id of the mandate just opened.
 *
 * `openMandate` returns it, but a receipt does not carry a return value, so it
 * is read back as `mandateCount() - 1`. That is only safe because the read
 * happens after the transaction is mined and two mandates opening in the same
 * block would be a busier market than this one has ever been. If that stops
 * being true this has to read the `MandateOpened` log instead.
 */
async function newestMandateId(): Promise<number | null> {
  try {
    const res = await fetch("/api/market/state", { cache: "no-store" });
    const body = (await res.json()) as { mandates?: { id: number; canonical: boolean }[] };
    const ids = (body.mandates ?? []).filter((m) => m.canonical).map((m) => m.id);
    return ids.length ? Math.max(...ids) : null;
  } catch {
    return null;
  }
}

export default function HireFlow({ tokenId, name, category, what }: Props) {
  const { address, ready, available, connect, switchChain, balanceWei } = useWallet();

  const [step, setStep] = useState(0);
  const [cat, setCat] = useState<Category>(category ?? "rebalancing");
  const [capital, setCapital] = useState("0.01");
  const [capitalTouched, setCapitalTouched] = useState(false);

  /*
    The default fits the wallet in front of it.

    A flat 0.01 default is above what plenty of wallets hold, so the first
    screen of the hire flow opened with its own primary button already refused.
    The reason was stated, which is better than a silent grey button, and it is
    still a wall in the place a person is most likely to give up. This proposes
    something they can actually afford and gets out of the way the moment they
    type their own number.
  */
  useEffect(() => {
    if (capitalTouched || balanceWei === null) return;
    const held = Number(balanceWei) / 1e18;
    if (held <= 0) return;
    // Leave room for gas, and never propose below the market's own floor.
    const usable = Math.max(0.0002, Math.min(0.01, (held - 0.0005) * 0.6));
    if (usable < 0.0002) return;
    const proposed = usable >= 0.001 ? usable.toFixed(3) : usable.toFixed(4);
    setCapital(proposed);
  }, [balanceWei, capitalTouched]);
  const [term, setTerm] = useState<(typeof TERMS)[number]["id"]>("day");
  const [strict, setStrict] = useState<(typeof STRICTNESS)[number]["id"]>("standard");
  const [shareBps, setShareBps] = useState<number>(2_000);
  const [tx, setTx] = useState<TxState>({ phase: "idle" });
  const [openedId, setOpenedId] = useState<number | null>(null);
  const [keeper, setKeeper] = useState<
    { at: "idle" } | { at: "asking" } | { at: "bid"; hash: string } | { at: "none"; why: string }
  >({ at: "idle" });

  const termSpec = TERMS.find((t) => t.id === term)!;
  const strictSpec = STRICTNESS.find((s) => s.id === strict)!;
  const capitalNum = Number(capital);

  /*
    The refusal is named next to the thing that caused it, and the button that
    would fail is never offered. A transaction refused by the contract costs
    gas and explains nothing; a sentence costs neither.
  */
  const refusal = useMemo(() => {
    if (!capital.trim()) return "Enter how much capital this job is for.";
    if (!Number.isFinite(capitalNum) || capitalNum <= 0) return "That is not an amount.";
    if (capitalNum < 0.0002)
      return "Below 0.0002 BNB the bond an agent would have to post falls under the market's minimum, so nobody could bid on it.";
    if (balanceWei !== null && parseEther(capital as `${number}`) > balanceWei)
      return `This wallet holds ${(Number(balanceWei) / 1e18).toFixed(5)} BNB, which is less than the job. Gas is on top.`;
    return null;
  }, [capital, capitalNum, balanceWei]);

  const bond = capitalNum > 0 ? capitalNum * 0.2 : 0;

  const submit = async () => {
    if (!address || refusal) return;
    try {
      await sendMarketTx(
        address,
        "openMandate",
        [
          CATEGORIES.indexOf(cat),
          NATIVE, // native BNB: the contract reads msg.value and ignores `amount`
          0n,
          BENCHMARK[cat],
          strictSpec.toleranceBps,
          shareBps,
          2_500, // a quarter of the bond is forfeited per strike
          3_600, // one hour; must outlast the 300s challenge window
          termSpec.epochs,
          strictSpec.strikes, // zero is refused by the contract
          -1_000, // catastrophic: -10% in one hour ends it outright. Must be negative.
          2_000, // the agent posts at least a fifth of the capital
        ],
        parseEther(capital as `${number}`),
        setTx,
      );

      /*
        Ask the keeper to bid, immediately.

        A job nobody bids on is where this product used to end: capital
        committed, an empty book, and no way to tell whether that is a bad job
        or a young market. Our own agent takes the other side on the same terms
        as anyone else, with a real bond at the contract's floor, and the panel
        below says it was us rather than implying a stranger arrived.

        A failure here is not a failure of the hire. The mandate is open and
        agents can still bid from /jobs, so this reports and does not throw.
      */
      const id = await newestMandateId();
      setOpenedId(id);
      if (id !== null) {
        setKeeper({ at: "asking" });
        try {
          const res = await fetch("/api/keeper/bid", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ mandateId: id }),
          });
          const body = (await res.json()) as
            | { ok: true; hash: string }
            | { ok: false; why?: string; error?: string };
          setKeeper(
            body.ok
              ? { at: "bid", hash: body.hash }
              : { at: "none", why: body.why ?? body.error ?? "The keeper did not bid." },
          );
        } catch {
          setKeeper({ at: "none", why: "The keeper could not be reached." });
        }
      }
    } catch {
      /* the phase already carries the reason */
    }
  };

  /* ------------------------------------------------------------- done -- */
  if (tx.phase === "confirmed") {
    return (
      <div className="m-panel" style={{ borderColor: "var(--verified)" }}>
        <p className="m-label" style={{ color: "var(--verified)" }}>
          The job is open
        </p>
        <h2 className="m-h2" style={{ marginTop: "0.75rem" }}>
          Your capital is escrowed and agents can now bid.
        </h2>
        <p className="m-body" style={{ marginTop: "1rem" }}>
          Nothing has been handed to anyone. {bnb(capitalNum)} sits in the market
          contract in your name. An agent that wants the job has to post a bond of
          at least {bnb(bond)} of its own money to bid on it, and you choose which
          bid to accept.
        </p>
        <p className="m-body" style={{ marginTop: "1rem" }}>
          Until you accept one you can cancel and take the capital straight back.
        </p>

        {keeper.at === "asking" ? (
          <p className="m-small" style={{ marginTop: "1rem" }}>
            Asking our own agent to bid…
          </p>
        ) : null}

        {keeper.at === "bid" ? (
          <div className="m-ok" style={{ marginTop: "1rem" }}>
            <strong>Our own agent has bid on it.</strong> Not a stranger: this is a
            wallet we operate, taking the other side at the contract&rsquo;s own bond
            floor on the same slashing terms as anybody else. It is there so the
            book is never empty, and you are free to wait for another bid or
            cancel instead.{" "}
            <a
              className="m-link m-mono"
              href={`${marketChain.blockExplorers?.default.url}/tx/${keeper.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              {keeper.hash.slice(0, 14)}…{keeper.hash.slice(-8)}
            </a>
          </div>
        ) : null}

        {keeper.at === "none" ? (
          <p className="m-small" style={{ marginTop: "1rem" }}>
            No bid yet. {keeper.why} Any agent can still bid on this job from the
            open jobs board.
          </p>
        ) : null}
        <dl className="m-kv" style={{ marginTop: "1.5rem" }}>
          <div>
            <dt>Transaction</dt>
            <dd className="m-mono">
              <a
                className="m-link"
                href={`${marketChain.blockExplorers?.default.url}/tx/${tx.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                {tx.hash?.slice(0, 18)}…{tx.hash?.slice(-8)}
              </a>
            </dd>
          </div>
        </dl>
        <div className="m-btns" style={{ marginTop: "1.5rem" }}>
          <Link className="m-btn m-btn--primary" href="/dashboard">
            {keeper.at === "bid" ? "Accept the bid →" : "Go to your dashboard →"}
          </Link>
          {openedId !== null ? (
            <Link className="m-btn" href={`/receipts/${openedId}`}>
              Open the receipt
            </Link>
          ) : null}
          <Link className="m-btn m-btn--quiet" href="/activity">
            Watch the market
          </Link>
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------ gates -- */
  const gate = !available ? (
    <div className="m-gate">
      <p className="m-gate__why">
        There is no wallet in this browser, so nothing can be signed. A wallet is
        what holds the capital and gives the permission, we never hold either.
      </p>
      <a
        className="m-btn"
        href="https://www.bnbchain.org/en/wallets"
        target="_blank"
        rel="noreferrer"
      >
        Get a wallet for BNB Chain →
      </a>
    </div>
  ) : !address ? (
    <div className="m-gate">
      <p className="m-gate__why">
        Connect a wallet to open this job. Connecting reveals your address and
        nothing else, it moves no money and grants no permission.
      </p>
      <button className="m-btn m-btn--primary" type="button" onClick={() => void connect()}>
        Connect wallet →
      </button>
    </div>
  ) : !ready ? (
    <div className="m-gate">
      <p className="m-gate__why">
        Your wallet is on a different network. This market lives on{" "}
        {marketChain.name}.
      </p>
      <button className="m-btn m-btn--primary" type="button" onClick={() => void switchChain()}>
        Switch to {marketChain.name} →
      </button>
    </div>
  ) : null;

  return (
    <div>
      <ol className="m-steps">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={`m-step${i === step ? " m-step--now" : i < step ? " m-step--done" : ""}`}
          >
            <span className="m-step__n">{i < step ? "✓" : i + 1}</span>
            <span className="m-step__t">{s}</span>
          </li>
        ))}
      </ol>

      {/* ---------------------------------------------------- step one -- */}
      {step === 0 ? (
        <div className="m-stack m-stack--lg">
          <div>
            <h2 className="m-h2">What is {name} being hired to do?</h2>
            <p className="m-body" style={{ marginTop: "0.75rem" }}>
              {what ?? "This agent published no description, so choose the job yourself."}
            </p>
          </div>

          <div>
            <span className="m-label" style={{ marginBottom: "0.6rem" }}>
              The job
            </span>
            <div className="m-pick">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`m-pick__opt${cat === c ? " m-pick__opt--on" : ""}`}
                  onClick={() => setCat(c)}
                >
                  <CategoryMark category={c} size={28} />
                  <span className="m-pick__t">{CATEGORY_LABEL[c]}</span>
                  {category === c ? <span className="m-note">what this agent says it does</span> : null}
                </button>
              ))}
            </div>
            {cat !== category && category ? (
              <p className="m-note" style={{ marginTop: "0.7rem" }}>
                You are hiring it for something other than what it describes itself
                as doing. That is allowed, and it is worth knowing.
              </p>
            ) : null}
          </div>

          <div style={{ maxWidth: "320px" }}>
            <label className="m-field">
              <span className="m-label m-field__label">How much capital</span>
              <input
                className="m-input m-input--fig"
                inputMode="decimal"
                value={capital}
                onChange={(e) => {
                  setCapitalTouched(true);
                  setCapital(e.target.value);
                }}
              />
            </label>
            <p className="m-field__hint">
              In BNB. It stays in the market contract; the agent can never move it.
              {!capitalTouched && balanceWei !== null
                ? " Suggested to fit what this wallet holds, with room for gas."
                : ""}
            </p>
            {refusal ? (
              <p className="m-error" id="hire-refusal" style={{ marginTop: "0.6rem" }}>
                {refusal}
              </p>
            ) : null}
          </div>

          <div className="m-btns">
            <button
              className="m-btn m-btn--primary m-btn--lg"
              type="button"
              disabled={Boolean(refusal)}
              aria-describedby={refusal ? "hire-refusal" : undefined}
              title={refusal ?? undefined}
              onClick={() => setStep(1)}
            >
              Set the limits →
            </button>
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------- step two -- */}
      {step === 1 ? (
        <div className="m-stack m-stack--lg">
          <div>
            <h2 className="m-h2">Your limits</h2>
            <p className="m-body" style={{ marginTop: "0.75rem" }}>
              These are written into the contract when you open the job, and they
              cannot be changed afterwards by us, by the agent, or by you.
            </p>
          </div>

          <div>
            <span className="m-label" style={{ marginBottom: "0.6rem" }}>
              How long it runs
            </span>
            <div className="m-pick">
              {TERMS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`m-pick__opt${term === t.id ? " m-pick__opt--on" : ""}`}
                  onClick={() => setTerm(t.id)}
                >
                  <span className="m-pick__t">{t.label}</span>
                  <span className="m-note">{t.note}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="m-label" style={{ marginBottom: "0.6rem" }}>
              How much slack the agent gets
            </span>
            <div className="m-pick">
              {STRICTNESS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`m-pick__opt${strict === s.id ? " m-pick__opt--on" : ""}`}
                  onClick={() => setStrict(s.id)}
                >
                  <span className="m-pick__t">{s.label}</span>
                  <span className="m-note">{s.note}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="m-label" style={{ marginBottom: "0.6rem" }}>
              The agent&rsquo;s share of what it makes above the benchmark
            </span>
            <div className="m-pick m-pick--row">
              {SHARES.map((s) => (
                <button
                  key={s.bps}
                  type="button"
                  className={`m-pick__opt${shareBps === s.bps ? " m-pick__opt--on" : ""}`}
                  onClick={() => setShareBps(s.bps)}
                >
                  <span className="m-pick__t">{s.label}</span>
                </button>
              ))}
            </div>
            <p className="m-field__hint">
              Paid only out of gains above the benchmark. A lower share means fewer
              agents will want the job.
            </p>
          </div>

          <div className="m-btns">
            <button className="m-btn m-btn--quiet" type="button" onClick={() => setStep(0)}>
              ← Back
            </button>
            <button className="m-btn m-btn--primary m-btn--lg" type="button" onClick={() => setStep(2)}>
              Read it back to me →
            </button>
          </div>
        </div>
      ) : null}

      {/* -------------------------------------------------- step three -- */}
      {step === 2 ? (
        <div className="m-stack m-stack--lg">
          <div>
            <h2 className="m-h2">Here is what you are about to agree to</h2>
          </div>

          <div className="m-panel">
            <p className="m-body" style={{ maxWidth: "none" }}>
              You are committing <strong>{bnb(capitalNum)}</strong> to a{" "}
              <strong>{CATEGORY_LABEL[cat].toLowerCase()}</strong> job lasting{" "}
              <strong>{termSpec.label.toLowerCase()}</strong>. It will be compared,
              every hour, against {BENCHMARK_PLAIN[cat]}.
            </p>
            <p className="m-body" style={{ marginTop: "1rem", maxWidth: "none" }}>
              If the agent falls more than{" "}
              <strong>{strictSpec.toleranceBps / 100}%</strong> behind that in any
              hour, it takes a strike and forfeits a quarter of its bond.{" "}
              <strong>{strictSpec.strikes} strikes</strong> ends the job. So does a
              single hour worse than <strong>−10%</strong>.
            </p>
            <p className="m-body" style={{ marginTop: "1rem", maxWidth: "none" }}>
              If it does beat the benchmark, it keeps{" "}
              <strong>{shareBps / 100}%</strong> of the amount by which it did. You
              keep the rest.
            </p>
          </div>

          <div className="m-cols m-cols--2">
            <div className="m-panel m-panel--sunken">
              <p className="m-label">The worst that can happen to you</p>
              <p className="m-small" style={{ marginTop: "0.7rem" }}>
                The agent never touches your capital. It stays in the market
                contract and comes back to you when the term ends. Money only
                leaves it as the agent&rsquo;s share, and that is charged only on
                gains.
              </p>
              <p className="m-small" style={{ marginTop: "0.7rem" }}>
                Your real cost is that <strong>{bnb(capitalNum)}</strong> is locked
                for {termSpec.label.toLowerCase()} once you accept a bid. Before you
                accept one, you can cancel and take it back immediately.
              </p>
            </div>
            <div className="m-panel m-panel--sunken">
              <p className="m-label">The worst that can happen to the agent</p>
              <p className="m-small" style={{ marginTop: "0.7rem" }}>
                It has to post at least <strong>{bnb(bond)}</strong> of its own
                money to bid. Each strike costs it a quarter of that, and it never
                gets that part back.
              </p>
              <p className="m-small" style={{ marginTop: "0.7rem" }}>
                That is the entire reason to trust a bid: the agent is the one with
                something to lose.
              </p>
            </div>
          </div>

          <details className="m-disclose">
            <summary>What this becomes on chain</summary>
            <div className="m-disclose__body">
              <dl className="m-kv">
                <div><dt>Function</dt><dd className="m-mono">openMandate</dd></div>
                <div><dt>Category</dt><dd className="m-mono">{CATEGORIES.indexOf(cat)}</dd></div>
                <div><dt>Asset</dt><dd className="m-mono">native BNB</dd></div>
                <div><dt>Benchmark</dt><dd className="m-mono">{BENCHMARK[cat]}</dd></div>
                <div><dt>toleranceBps</dt><dd className="m-mono">{strictSpec.toleranceBps}</dd></div>
                <div><dt>feeBps</dt><dd className="m-mono">{shareBps}</dd></div>
                <div><dt>slashBps</dt><dd className="m-mono">2500</dd></div>
                <div><dt>epochLength</dt><dd className="m-mono">3600</dd></div>
                <div><dt>epochsTotal</dt><dd className="m-mono">{termSpec.epochs}</dd></div>
                <div><dt>strikes</dt><dd className="m-mono">{strictSpec.strikes}</dd></div>
                <div><dt>catastrophic</dt><dd className="m-mono">-1000</dd></div>
                <div><dt>bondFloorBps</dt><dd className="m-mono">2000</dd></div>
                <div><dt>value</dt><dd className="m-mono">{capital} BNB</dd></div>
              </dl>
            </div>
          </details>

          <div className="m-btns">
            <button className="m-btn m-btn--quiet" type="button" onClick={() => setStep(1)}>
              ← Change something
            </button>
            <button className="m-btn m-btn--primary m-btn--lg" type="button" onClick={() => setStep(3)}>
              That is right, continue →
            </button>
          </div>
        </div>
      ) : null}

      {/* --------------------------------------------------- step four -- */}
      {step === 3 ? (
        <div className="m-stack m-stack--lg">
          <div>
            <h2 className="m-h2">Sign it</h2>
            <p className="m-body" style={{ marginTop: "0.75rem" }}>
              One transaction. It moves {bnb(capitalNum)} from your wallet into the
              market contract and records the terms you chose. Your wallet will
              show you the amount before you approve it.
            </p>
          </div>

          {gate ?? (
            <>
              {refusal ? (
                <p className="m-error" id="hire-refusal-confirm">
                  {refusal}
                </p>
              ) : null}
              <div className="m-btns">
                <button className="m-btn m-btn--quiet" type="button" onClick={() => setStep(2)}>
                  ← Back
                </button>
                <button
                  className="m-btn m-btn--primary m-btn--lg"
                  type="button"
                  disabled={Boolean(refusal) || tx.phase === "signing" || tx.phase === "pending"}
                  aria-describedby={refusal ? "hire-refusal-confirm" : undefined}
                  title={refusal ?? undefined}
                  onClick={() => void submit()}
                >
                  {tx.phase === "signing"
                    ? "Waiting for your wallet…"
                    : tx.phase === "pending"
                      ? "Opening the job…"
                      : `Open the job with ${bnb(capitalNum)} →`}
                </button>
              </div>
              {tx.phase === "failed" ? (
                <p className="m-error">{tx.error}</p>
              ) : null}
              {tx.phase === "pending" ? (
                <p className="m-small">
                  Sent. Waiting for BNB Smart Chain to include it, which usually
                  takes a few seconds.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
