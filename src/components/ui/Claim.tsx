import Command from "./Command";
import { EXPLORER } from "@/lib/config";

export interface Artifact {
  label: string;
  /** A transaction hash, a block number, or a bare value. */
  value: string;
  kind?: "tx" | "block" | "address" | "note";
}

/**
 * A claim, with the thing that would falsify it.
 *
 * The rule this component exists to enforce: nothing on this site asserts a
 * number without shipping the check beside it. Not a link to documentation
 * explaining how one might verify — the exact line, copyable, that re-derives
 * the figure printed above it.
 *
 * Four parts, and the fourth is the one nobody else has. A claim with a bond
 * behind it can be taken from us: if the mark is wrong, the challenger keeps
 * the money. That converts the assertion from an opinion into a position.
 */
export default function Claim({
  claim,
  command,
  artifacts = [],
  backing,
  note,
}: {
  claim: string;
  /** What re-derives it, from a clean checkout. */
  command: string;
  /** Where the evidence already sits on chain. */
  artifacts?: Artifact[];
  /** Bond standing behind the claim, in BNB, when there is one. */
  backing?: { bnb: string; href: string } | null;
  note?: string;
}) {
  return (
    <section className="claim">
      <div className="claim__row">
        <span className="mark-label">Claim</span>
        <p className="claim__text">{claim}</p>
      </div>

      <div className="claim__row">
        <span className="mark-label">Command</span>
        <Command note={note}>{command}</Command>
      </div>

      {artifacts.length ? (
        <div className="claim__row">
          <span className="mark-label">Artifact</span>
          <ul className="claim__artifacts">
            {artifacts.map((a) => (
              <li key={`${a.label}-${a.value}`}>
                <span className="mark-label">{a.label}</span>
                {a.kind === "tx" || a.kind === "block" || a.kind === "address" ? (
                  <a
                    className="link-underline num"
                    href={`${EXPLORER}/${a.kind === "tx" ? "tx" : a.kind === "block" ? "block" : "address"}/${a.value}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {a.value.length > 24 ? `${a.value.slice(0, 12)}…${a.value.slice(-8)}` : a.value}
                  </a>
                ) : (
                  <span className="num">{a.value}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="claim__row">
        <span className="mark-label">Challenge</span>
        {backing ? (
          <p className="claim__backing">
            <a className="link-underline" href={backing.href} target="_blank" rel="noreferrer">
              backed by {backing.bnb} BNB — take it if this is wrong
            </a>
          </p>
        ) : (
          /*
            No bond is stated as no bond. The office's own contract is written
            and tested but not deployed, and rendering a backing that does not
            exist would be precisely the unearned claim this card is for.
          */
          <p className="claim__backing dim">
            No bond stands behind this yet. `AssayBond` is written and tested; nothing is
            escrowed until it is deployed, and until then this claim rests on the command
            above and nothing else.
          </p>
        )}
      </div>
    </section>
  );
}
